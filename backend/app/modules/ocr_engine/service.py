import base64
import io
import logging
import math
import os
import pathlib
import sys
import threading
import time
import json
import re
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime, timezone
from sqlalchemy.orm import Session
import numpy as np
from PIL import Image, ImageOps

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

logger = logging.getLogger(__name__)

_DOCALIGNER_LOCK = threading.Lock()
_DOCALIGNER_MODEL: Any = None
_DOCALIGNER_MODEL_CFG_LOADED: Optional[str] = None
_DOCALIGNER_INIT_FAILED: bool = False
_RAPIDOCR_LOCK = threading.Lock()
_RAPIDOCR_DET: Any = None
_RAPIDOCR_INIT_FAILED: bool = False
_VIETOCR_LOCK = threading.Lock()
_VIETOCR_PREDICTOR: Any = None
_VIETOCR_INIT_FAILED: bool = False

from app.core.config import settings
from app.core.exceptions import (
    BadRequestException, ForbiddenException, EntityNotFoundException
)
from app.common.models.users import User
from app.common.models.licenses import License
from app.common.models.usage import UsageBalance, UsageRecord, UsageLedger
from app.common.models.credentials import APICredential
from app.common.enums import LicenseStatus, CredentialStatus, LedgerEntryType, QuotaType
from app.common.schemas.ocr_engine import OCRExtractionResponse, SegmentationMetadata, VLMModelOption
from app.modules.ocr_engine.prompts import (
    SYSTEM_PROMPT_IDENTITY_OCR,
    SYSTEM_PROMPT_IDENTITY_OCR_CROPPED,
    SYSTEM_PROMPT_HYBRID_OCR_JSON_MAPPER,
)

OLLAMA_API_URL = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
DEFAULT_MODEL = settings.OLLAMA_MODEL
MAX_IMAGE_DIMENSION = 1600
PREVIEW_MAX_DIMENSION = 900

RECOMMENDED_VLM_MODELS: List[Dict[str, str]] = [
    {
        "name": "qwen2.5:3b",
        "label": "Hybrid: Qwen2.5 3B Text (Khuyên dùng - Nhanh & chuẩn tiếng Việt)",
        "vram_estimate": "~1.9 GB",
        "tier": "hybrid_recommended",
        "mode": "hybrid",
    },
    {
        "name": "qwen2.5:1.5b",
        "label": "Hybrid: Qwen2.5 1.5B Text (Siêu nhẹ - 100% VRAM)",
        "vram_estimate": "~1.0 GB",
        "tier": "hybrid_fast",
        "mode": "hybrid",
    },
    {
        "name": "qwen3:1.7b",
        "label": "Hybrid: Qwen3 1.7B Text (Nhẹ - Chuẩn hóa JSON)",
        "vram_estimate": "~1.4 GB",
        "tier": "hybrid_fast",
        "mode": "hybrid",
    },
    {
        "name": "paddleocr-vl-vi",
        "label": "PaddleOCR-VL 1.6 Vi (GGUF GPU Recognizer - Đọc CMND cũ/ảnh mờ vượt trội)",
        "vram_estimate": "~0.9 GB",
        "tier": "hybrid_paddle_vl",
        "mode": "hybrid_paddle_vl",
    },
    {
        "name": "qwen3-vl:2b-instruct",
        "label": "Qwen3-VL 2B Instruct (Nhẹ nhất - Chạy gọn trong 4GB VRAM)",
        "vram_estimate": "~1.9 GB",
        "tier": "4gb_vram",
        "mode": "both",
    },
    {
        "name": "qwen2.5vl:3b",
        "label": "Pure VLM: Qwen2.5-VL 3B (Đọc ảnh trực tiếp - 4GB VRAM)",
        "vram_estimate": "~3.2 GB",
        "tier": "4gb_vram",
        "mode": "vlm",
    },
    {
        "name": "qwen3-vl:4b-instruct",
        "label": "Pure VLM: Qwen3-VL 4B Instruct (Độ chính xác cao hơn - 4GB VRAM + RAM)",
        "vram_estimate": "~3.3 GB",
        "tier": "hybrid_4gb",
        "mode": "vlm",
    },
    {
        "name": "qwen2.5vl:7b",
        "label": "Pure VLM: Qwen2.5-VL 7B (Độ chính xác cao - Cần >=6GB VRAM)",
        "vram_estimate": "~6.0 GB",
        "tier": "high_vram",
        "mode": "vlm",
    },
]


def utc_now():
    return datetime.now(timezone.utc)


def normalize_image_bytes(image_bytes: bytes) -> bytes:
    """
    Validate and normalize image bytes to standard RGB JPEG using Pillow.
    Fixes WebP/AVIF/CMYK/RGBA/EXIF issues and resizes excessively large images
    so Ollama's vision encoder never returns HTTP 400 Bad Request.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode != "RGBA":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[3])
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            if max(img.size) > MAX_IMAGE_DIMENSION:
                img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

            out_buf = io.BytesIO()
            img.save(out_buf, format="JPEG", quality=92)
            return out_buf.getvalue()
    except Exception:
        return image_bytes


def _qwen2vl_smart_resize_dims(width: int, height: int, factor: int = 28, min_pixels: int = 3136, max_pixels: int = 12845056) -> Tuple[int, int]:
    """
    Compute the exact internal image dimensions used by Qwen2.5-VL's processor (smart_resize),
    allowing exact conversion from Qwen2.5-VL's bbox_2d coordinates back to original image pixels.
    """
    h_bar = max(factor, round(height / factor) * factor)
    w_bar = max(factor, round(width / factor) * factor)
    if h_bar * w_bar > max_pixels:
        beta = math.sqrt((height * width) / max_pixels)
        h_bar = max(factor, math.floor(height / beta / factor) * factor)
        w_bar = max(factor, math.floor(width / beta / factor) * factor)
    elif h_bar * w_bar < min_pixels:
        beta = math.sqrt(min_pixels / (height * width))
        h_bar = math.ceil(height * beta / factor) * factor
        w_bar = math.ceil(width * beta / factor) * factor
    return int(w_bar), int(h_bar)


def _ensure_windows_turbojpeg_path() -> None:
    """Ensure conda's Library/bin (containing turbojpeg.dll) is on PATH before importing docaligner/capybara."""
    if sys.platform != "win32":
        return
    candidates = [
        pathlib.Path(sys.executable).parent / "Library" / "bin",
        pathlib.Path(sys.prefix) / "Library" / "bin",
    ]
    current_path = os.environ.get("PATH", "")
    for c in candidates:
        if c.exists() and (c / "turbojpeg.dll").exists():
            c_str = str(c)
            if c_str not in current_path:
                os.environ["PATH"] = c_str + os.pathsep + current_path
                current_path = os.environ["PATH"]
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(c_str)
                except Exception:
                    pass


def _get_docaligner_model() -> Any:
    """Lazy-load thread-safe singleton DocAligner ONNX model running on CPU."""
    global _DOCALIGNER_MODEL, _DOCALIGNER_MODEL_CFG_LOADED, _DOCALIGNER_INIT_FAILED
    if not getattr(settings, "DOCALIGNER_ENABLED", True) or cv2 is None:
        return None
    desired_cfg = getattr(settings, "DOCALIGNER_MODEL_CFG", "fastvit_sa24") or "fastvit_sa24"
    if _DOCALIGNER_MODEL is not None and _DOCALIGNER_MODEL_CFG_LOADED == desired_cfg:
        return _DOCALIGNER_MODEL
    if _DOCALIGNER_INIT_FAILED:
        return None

    with _DOCALIGNER_LOCK:
        if _DOCALIGNER_MODEL is not None and _DOCALIGNER_MODEL_CFG_LOADED == desired_cfg:
            return _DOCALIGNER_MODEL
        if _DOCALIGNER_INIT_FAILED:
            return None
        try:
            _ensure_windows_turbojpeg_path()
            from docaligner import DocAligner, ModelType

            _DOCALIGNER_MODEL = DocAligner(model_type=ModelType.heatmap, model_cfg=desired_cfg)
            _DOCALIGNER_MODEL_CFG_LOADED = desired_cfg
            logger.info("Loaded DocAligner model '%s' on CPU", desired_cfg)
            return _DOCALIGNER_MODEL
        except Exception as exc:
            logger.warning("DocAligner initialization failed, falling back to OpenCV/CV crop: %s", exc)
            _DOCALIGNER_INIT_FAILED = True
            return None


def _order_quad_points(pts: np.ndarray) -> np.ndarray:
    """
    Order 4 corner coordinates clockwise starting from top-left: [TL, TR, BR, BL].
    Uses centroid-angle sorting so tilted and rotated quadrilaterals never self-intersect.
    """
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    cx, cy = np.mean(pts, axis=0)
    angles = np.arctan2(pts[:, 1] - cy, pts[:, 0] - cx)
    ordered = pts[np.argsort(angles)]
    # Rotate cyclic list so top-left (smallest x + y) is index 0
    tl_idx = int(np.argmin(ordered[:, 0] + ordered[:, 1]))
    return np.roll(ordered, -tl_idx, axis=0).astype(np.float32)


def _complete_4th_corner(pts: np.ndarray) -> Optional[np.ndarray]:
    """Reconstruct the 4th parallelogram corner when exactly 3 card corners are detected."""
    if len(pts) != 3:
        return None
    p0, p1, p2 = pts[0], pts[1], pts[2]
    d01 = np.linalg.norm(p0 - p1)
    d12 = np.linalg.norm(p1 - p2)
    d02 = np.linalg.norm(p0 - p2)
    # Opposite corners form the longest diagonal of the triangle
    if d02 >= d01 and d02 >= d12:
        p3 = p0 + p2 - p1
    elif d01 >= d12 and d01 >= d02:
        p3 = p0 + p1 - p2
    else:
        p3 = p1 + p2 - p0
    return np.vstack([pts, p3]).astype(np.float32)


def _expand_quad_points(pts: np.ndarray, margin_ratio: float, w: int, h: int) -> np.ndarray:
    """Expand quadrilateral slightly outward from its centroid so laminated borders/digits are never clipped."""
    if margin_ratio <= 0:
        return pts
    center = np.mean(pts, axis=0)
    expanded = center + (pts - center) * (1.0 + margin_ratio)
    expanded[:, 0] = np.clip(expanded[:, 0], 0.0, float(max(0, w - 1)))
    expanded[:, 1] = np.clip(expanded[:, 1], 0.0, float(max(0, h - 1)))
    return expanded.astype(np.float32)


def _validate_card_quad(pts: np.ndarray, w: int, h: int) -> bool:
    """Verify detected 4 corners form a convex, plausible ID/passport/card quadrilateral."""
    if cv2 is None or len(pts) != 4:
        return False
    ordered = _order_quad_points(pts)
    contour = ordered.reshape(-1, 1, 2).astype(np.float32)
    if not cv2.isContourConvex(contour):
        return False

    area = float(cv2.contourArea(contour))
    area_ratio = area / float(max(1, w * h))
    if not (0.06 <= area_ratio <= 0.99):
        return False

    tl, tr, br, bl = ordered
    w1 = float(np.linalg.norm(tr - tl))
    w2 = float(np.linalg.norm(br - bl))
    h1 = float(np.linalg.norm(bl - tl))
    h2 = float(np.linalg.norm(br - tr))

    min_side = min(w1, w2, h1, h2)
    if min_side < max(20.0, min(w, h) * 0.08):
        return False

    est_w = max(w1, w2)
    est_h = max(h1, h2)
    aspect = max(est_w, est_h) / max(1.0, min(est_w, est_h))
    if not (1.12 <= aspect <= 2.40):
        return False

    return True


def _warp_card_perspective(img_rgb: np.ndarray, quad_pts: np.ndarray) -> Tuple[Image.Image, List[int]]:
    """Apply 4-point OpenCV warpPerspective to deskew and crop the card cleanly from background."""
    ordered = _order_quad_points(quad_pts)
    tl, tr, br, bl = ordered

    width_a = float(np.linalg.norm(br - bl))
    width_b = float(np.linalg.norm(tr - tl))
    max_w = max(20, int(round(max(width_a, width_b))))

    height_a = float(np.linalg.norm(tr - br))
    height_b = float(np.linalg.norm(tl - bl))
    max_h = max(20, int(round(max(height_a, height_b))))

    dst_pts = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(ordered, dst_pts)
    warped_rgb = cv2.warpPerspective(
        img_rgb,
        matrix,
        (max_w, max_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )

    xmin = max(0, int(math.floor(float(np.min(ordered[:, 0])))))
    ymin = max(0, int(math.floor(float(np.min(ordered[:, 1])))))
    xmax = min(img_rgb.shape[1], int(math.ceil(float(np.max(ordered[:, 0])))))
    ymax = min(img_rgb.shape[0], int(math.ceil(float(np.max(ordered[:, 1])))))
    return Image.fromarray(warped_rgb), [xmin, ymin, xmax, ymax]


def _detect_card_docaligner_warp(img: Image.Image) -> Tuple[Optional[Image.Image], Optional[List[int]], str]:
    """
    Primary ID localization stage using DocAligner ONNX + border-padded inference + OpenCV warpPerspective.
    Border padding (14%) ensures edge-flush cards still yield all 4 corners cleanly.
    """
    model = _get_docaligner_model()
    if model is None or cv2 is None:
        return None, None, "unavailable"

    w, h = img.size
    if w < 60 or h < 60:
        return None, None, "too_small"

    rgb_arr = np.asarray(img, dtype=np.uint8)
    bgr_arr = rgb_arr[:, :, ::-1].copy()
    cfg_name = _DOCALIGNER_MODEL_CFG_LOADED or "fastvit_sa24"

    # Stage A: 14% median-border padded inference (prevents missed corners when card touches frame border)
    pad = max(16, int(max(h, w) * 0.14))
    border_px = np.concatenate([bgr_arr[0], bgr_arr[-1], bgr_arr[:, 0], bgr_arr[:, -1]], axis=0)
    fill = tuple(int(v) for v in np.median(border_px, axis=0))
    padded_bgr = cv2.copyMakeBorder(bgr_arr, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=fill)

    candidates: List[Tuple[np.ndarray, str]] = []
    try:
        poly_pad = model(padded_bgr)
        if poly_pad is not None and len(poly_pad) > 0:
            pts = np.asarray(poly_pad, dtype=np.float32) - np.array([pad, pad], dtype=np.float32)
            pts[:, 0] = np.clip(pts[:, 0], 0.0, float(w))
            pts[:, 1] = np.clip(pts[:, 1], 0.0, float(h))
            if len(pts) == 3:
                completed = _complete_4th_corner(pts)
                if completed is not None:
                    pts = completed
            if len(pts) == 4:
                candidates.append((pts, f"docaligner_{cfg_name}_warp"))
    except Exception as exc:
        logger.debug("DocAligner padded inference error: %s", exc)

    # Stage B: unpadded fallback if padded failed validation
    if not any(_validate_card_quad(c[0], w, h) for c in candidates):
        try:
            poly_raw = model(bgr_arr)
            if poly_raw is not None and len(poly_raw) > 0:
                pts = np.asarray(poly_raw, dtype=np.float32)
                if len(pts) == 3:
                    completed = _complete_4th_corner(pts)
                    if completed is not None:
                        pts = completed
                if len(pts) == 4:
                    candidates.append((pts, f"docaligner_{cfg_name}_raw_warp"))
        except Exception as exc:
            logger.debug("DocAligner raw inference error: %s", exc)

    for quad, method_name in candidates:
        if _validate_card_quad(quad, w, h):
            expanded = _expand_quad_points(quad, margin_ratio=0.015, w=w, h=h)
            warped_img, bbox = _warp_card_perspective(rgb_arr, expanded)
            return warped_img, bbox, method_name

    return None, None, "docaligner_miss"


def _detect_card_contour_opencv(img: Image.Image) -> Tuple[Optional[Image.Image], Optional[List[int]], str]:
    """OpenCV Canny/Contour 4-corner perspective fallback for clean/synthetic or high-contrast cards."""
    if cv2 is None:
        return None, None, "unavailable"
    w, h = img.size
    if w < 60 or h < 60:
        return None, None, "too_small"

    rgb_arr = np.asarray(img, dtype=np.uint8)
    gray = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 140)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:6]
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.025 * peri, True)
        if len(approx) == 4:
            quad = approx.reshape(4, 2).astype(np.float32)
            if _validate_card_quad(quad, w, h):
                warped_img, bbox = _warp_card_perspective(rgb_arr, quad)
                return warped_img, bbox, "opencv_contour_warp"
    return None, None, "contour_miss"


def _detect_card_bbox_cv(img: Image.Image) -> Tuple[Optional[List[int]], str]:
    """
    Automatic background border & saturation/chromaticity detection using NumPy
    to segment an ID card from uniform or textured (e.g. granite/wood) backgrounds.
    Returns ([xmin, ymin, xmax, ymax], method_name) or (None, "full_frame").
    """
    w, h = img.size
    if w < 60 or h < 60:
        return None, "full_frame"

    arr = np.asarray(img, dtype=np.float32)

    # 1. Border color & chromaticity difference segmentation
    border_pad = max(3, min(w, h) // 25)
    top = arr[:border_pad, :, :].reshape(-1, 3)
    bottom = arr[h - border_pad:, :, :].reshape(-1, 3)
    left = arr[:, :border_pad, :].reshape(-1, 3)
    right = arr[:, w - border_pad:, :].reshape(-1, 3)
    border_pixels = np.concatenate([top, bottom, left, right], axis=0)
    bg_median = np.median(border_pixels, axis=0)
    bg_std = float(np.mean(np.std(border_pixels, axis=0)))

    # Chromaticity (R-G, G-B) is invariant to granite/speckle brightness noise
    chroma_arr = np.stack([arr[:, :, 0] - arr[:, :, 1], arr[:, :, 1] - arr[:, :, 2]], axis=2)
    chroma_border = np.stack([border_pixels[:, 0] - border_pixels[:, 1], border_pixels[:, 1] - border_pixels[:, 2]], axis=1)
    bg_chroma_median = np.median(chroma_border, axis=0)
    bg_chroma_std = float(np.mean(np.std(chroma_border, axis=0)))
    chroma_diff = np.linalg.norm(chroma_arr - bg_chroma_median, axis=2)

    rgb_diff = np.linalg.norm(arr - bg_median, axis=2)
    fg_mask = (rgb_diff > max(28.0, bg_std * 2.2)) | (chroma_diff > max(14.0, bg_chroma_std * 2.5))

    # Ignore 2% outer frame border
    margin_x, margin_y = max(2, int(w * 0.02)), max(2, int(h * 0.02))
    fg_mask[:margin_y, :] = False
    fg_mask[h - margin_y:, :] = False
    fg_mask[:, :margin_x] = False
    fg_mask[:, w - margin_x:] = False

    row_fg_ratio = np.mean(fg_mask, axis=1)
    col_fg_ratio = np.mean(fg_mask, axis=0)
    active_rows = np.where(row_fg_ratio > 0.14)[0]
    active_cols = np.where(col_fg_ratio > 0.14)[0]

    if len(active_rows) > 10 and len(active_cols) > 10:
        ymin, ymax = int(active_rows[0]), int(active_rows[-1])
        xmin, xmax = int(active_cols[0]), int(active_cols[-1])
        bw = xmax - xmin
        bh = ymax - ymin
        area_ratio = (bw * bh) / float(w * h)
        if 0.10 <= area_ratio <= 0.96 and bw > w * 0.25 and bh > h * 0.18:
            pad_x = int(w * 0.015)
            pad_y = int(h * 0.015)
            return [
                max(0, xmin - pad_x),
                max(0, ymin - pad_y),
                min(w, xmax + pad_x),
                min(h, ymax + pad_y),
            ], "cv_background_contrast"

    # 2. Sobel-like spatial gradient energy segmentation
    gray = np.mean(arr, axis=2)
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    grad = gx + gy
    grad_thresh = np.percentile(grad, 85)
    edge_mask = grad > max(20.0, float(grad_thresh))

    edge_mask[:margin_y, :] = False
    edge_mask[h - margin_y:, :] = False
    edge_mask[:, :margin_x] = False
    edge_mask[:, w - margin_x:] = False

    e_rows = np.where(np.mean(edge_mask, axis=1) > 0.10)[0]
    e_cols = np.where(np.mean(edge_mask, axis=0) > 0.10)[0]

    if len(e_rows) > 10 and len(e_cols) > 10:
        ymin, ymax = int(e_rows[0]), int(e_rows[-1])
        xmin, xmax = int(e_cols[0]), int(e_cols[-1])
        bw = xmax - xmin
        bh = ymax - ymin
        area_ratio = (bw * bh) / float(w * h)
        if 0.12 <= area_ratio <= 0.96 and bw > w * 0.3 and bh > h * 0.20:
            pad_x = int(w * 0.015)
            pad_y = int(h * 0.015)
            return [
                max(0, xmin - pad_x),
                max(0, ymin - pad_y),
                min(w, xmax + pad_x),
                min(h, ymax + pad_y),
            ], "cv_edge_gradient"

    return None, "full_frame"


def _encode_preview_data_url(img: Image.Image) -> str:
    preview = img.copy()
    if max(preview.size) > PREVIEW_MAX_DIMENSION:
        preview.thumbnail((PREVIEW_MAX_DIMENSION, PREVIEW_MAX_DIMENSION), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    preview.save(buf, format="JPEG", quality=86)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def _encode_vlm_image_bytes(
    img: Image.Image,
    max_dimension: int,
    max_width: Optional[int] = None,
    max_height: Optional[int] = None,
) -> bytes:
    """Encode cropped/upright card image to JPEG bytes sized appropriately for VLM VRAM budget."""
    vlm_img = img.copy()
    if max_width and max_height:
        if vlm_img.size[0] > max_width or vlm_img.size[1] > max_height:
            vlm_img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    elif max_dimension > 0 and max(vlm_img.size) > max_dimension:
        vlm_img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    vlm_img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _parse_vlm_bbox_to_pixels(raw_bbox: Any, w: int, h: int) -> Optional[List[int]]:
    """
    Convert Qwen2.5-VL's bbox output [xmin, ymin, xmax, ymax] into exact image pixel coordinates.
    Handles:
      1. Native Qwen2.5-VL smart_resize pixel coordinates (when image >= 560px)
      2. Normalized 0..1000 coordinates (when image < 560px or model outputs normalized scale)
    """
    if not isinstance(raw_bbox, (list, tuple)) or len(raw_bbox) != 4:
        return None
    try:
        vals = [float(v) for v in raw_bbox]
    except Exception:
        return None

    x1, y1, x2, y2 = vals
    if x1 > x2:
        x1, x2 = x2, x1
    if y1 > y2:
        y1, y2 = y2, y1

    smart_w, smart_h = _qwen2vl_smart_resize_dims(w, h)

    fits_pixel_space = (x2 <= max(w, smart_w) * 1.05) and (y2 <= max(h, smart_h) * 1.05)
    exceeds_pixel_space = (x2 > w * 1.04) or (y2 > h * 1.04)

    if exceeds_pixel_space and max(vals) <= 1005:
        xmin = int(round((x1 / 1000.0) * w))
        ymin = int(round((y1 / 1000.0) * h))
        xmax = int(round((x2 / 1000.0) * w))
        ymax = int(round((y2 / 1000.0) * h))
    elif fits_pixel_space:
        scale_x = w / float(smart_w) if abs(smart_w - w) <= 32 else 1.0
        scale_y = h / float(smart_h) if abs(smart_h - h) <= 32 else 1.0
        xmin = int(round(x1 * scale_x))
        ymin = int(round(y1 * scale_y))
        xmax = int(round(x2 * scale_x))
        ymax = int(round(y2 * scale_y))
    else:
        xmin = int(round((x1 / 1000.0) * w))
        ymin = int(round((y1 / 1000.0) * h))
        xmax = int(round((x2 / 1000.0) * w))
        ymax = int(round((y2 / 1000.0) * h))

    xmin = max(0, min(w, xmin))
    ymin = max(0, min(h, ymin))
    xmax = max(0, min(w, xmax))
    ymax = max(0, min(h, ymax))

    bw = xmax - xmin
    bh = ymax - ymin
    area_ratio = (bw * bh) / float(w * h)
    if bw > w * 0.18 and bh > h * 0.12 and 0.06 <= area_ratio <= 0.99:
        pad_x = int(w * 0.012)
        pad_y = int(h * 0.012)
        return [
            max(0, xmin - pad_x),
            max(0, ymin - pad_y),
            min(w, xmax + pad_x),
            min(h, ymax + pad_y),
        ]
    return None


def _score_red_header_top(img: Image.Image) -> float:
    """
    Compute the red chromaticity score (red national emblem + red 'CĂN CƯỚC CÔNG DÂN' / 'GIẤY PHÉP LÁI XE' header)
    in the top 38% strip of a landscape card image.
    """
    arr = np.asarray(img, dtype=np.float32)
    h, w, _ = arr.shape
    top_strip = arr[:max(1, int(h * 0.38)), :, :]
    r = top_strip[:, :, 0]
    g = top_strip[:, :, 1]
    b = top_strip[:, :, 2]
    redness = r - np.maximum(g, b)
    strong_red_mask = (redness > 26.0) & (r > 105.0)
    return float(np.mean(strong_red_mask) * 1000.0 + np.percentile(redness, 97) * 0.08)


def _auto_upright_cropped_card(cropped_img: Image.Image, vlm_angle: Optional[Any] = None) -> Tuple[Image.Image, int]:
    """
    Ensure the cropped ID card is rotated to upright horizontal landscape orientation.
    Returns (upright_image, clockwise_rotation_degrees).
    """
    cw, ch = cropped_img.size
    parsed_vlm_angle: Optional[int] = None
    if vlm_angle is not None:
        try:
            ang = int(float(vlm_angle)) % 360
            if ang in (0, 90, 180, 270):
                parsed_vlm_angle = ang
        except Exception:
            pass

    # Case 1: Cropped card is vertical (portrait: height > width * 1.06) -> Must rotate to landscape (90° CW or 270° CW)
    if ch > cw * 1.06:
        rot_90_cw = cropped_img.transpose(Image.Transpose.ROTATE_270)   # 90 deg clockwise
        rot_270_cw = cropped_img.transpose(Image.Transpose.ROTATE_90)   # 270 deg clockwise (90 deg counter-clockwise)

        score_90 = _score_red_header_top(rot_90_cw)
        score_270 = _score_red_header_top(rot_270_cw)

        if abs(score_90 - score_270) > 1.2:
            if score_90 > score_270:
                return rot_90_cw, 90
            else:
                return rot_270_cw, 270

        if parsed_vlm_angle in (90, 270):
            return (rot_90_cw, 90) if parsed_vlm_angle == 90 else (rot_270_cw, 270)

        return (rot_270_cw, 270) if score_270 >= score_90 else (rot_90_cw, 90)

    # Case 2: Cropped card is already horizontal (landscape) -> Check if upside down (180°)
    rot_180 = cropped_img.transpose(Image.Transpose.ROTATE_180)
    score_0 = _score_red_header_top(cropped_img)
    score_180 = _score_red_header_top(rot_180)

    if parsed_vlm_angle == 180 and score_180 >= score_0 * 0.8:
        return rot_180, 180
    if score_180 > score_0 + 4.5 and score_180 > 6.0:
        return rot_180, 180

    return cropped_img, 0


def preprocess_identity_document_cv(
    normalized_bytes: bytes,
    max_vlm_dimension: int = 1280,
    cropped_max_width: Optional[int] = None,
    cropped_max_height: Optional[int] = None,
) -> Tuple[Optional[str], Optional[str], bytes, SegmentationMetadata, bool]:
    """
    Pre-VLM Computer Vision stage:
      1. Detect 4 card corners via DocAligner ONNX (CPU) and deskew with OpenCV warpPerspective.
      2. Fallback cleanly to OpenCV 4-corner contour warp and chromaticity/gradient bbox if needed.
      3. Auto-rotate the cropped card to upright horizontal orientation.
      4. Return (original_data_url, cropped_data_url, vlm_input_bytes, segmentation_metadata, cv_cropped).
    """
    try:
        with Image.open(io.BytesIO(normalized_bytes)) as img:
            img = img.convert("RGB")
            w, h = img.size
            orig_dims = f"{w}x{h}"
            original_data_url = _encode_preview_data_url(img)

            cropped_img, chosen_bbox, method = _detect_card_docaligner_warp(img)
            if cropped_img is None or chosen_bbox is None:
                cropped_img, chosen_bbox, method = _detect_card_contour_opencv(img)

            if cropped_img is not None and chosen_bbox is not None:
                xmin, ymin, xmax, ymax = chosen_bbox
                crop_ratio = ((xmax - xmin) * (ymax - ymin)) / float(max(1, w * h))
                cv_cropped = crop_ratio < 0.98
            else:
                cv_bbox, cv_method = _detect_card_bbox_cv(img)
                if cv_bbox is not None:
                    xmin, ymin, xmax, ymax = cv_bbox
                    cropped_img = img.crop((xmin, ymin, xmax, ymax))
                    crop_ratio = ((xmax - xmin) * (ymax - ymin)) / float(max(1, w * h))
                    cv_cropped = crop_ratio < 0.98
                    chosen_bbox = cv_bbox
                    method = cv_method
                else:
                    chosen_bbox = [0, 0, w, h]
                    cropped_img = img.copy()
                    cv_cropped = False
                    method = "full_frame"

            raw_cw, raw_ch = cropped_img.size
            area_ratio = round((raw_cw * raw_ch) / float(w * h), 3)

            cropped_img, rotation_deg = _auto_upright_cropped_card(cropped_img, vlm_angle=None)
            cw, ch = cropped_img.size
            cropped_data_url = _encode_preview_data_url(cropped_img)
            if cv_cropped:
                eff_w = cropped_max_width if cropped_max_width is not None else getattr(settings, "VLM_CROPPED_MAX_WIDTH", 800)
                eff_h = cropped_max_height if cropped_max_height is not None else getattr(settings, "VLM_CROPPED_MAX_HEIGHT", 500)
                vlm_input_bytes = _encode_vlm_image_bytes(
                    cropped_img,
                    max_vlm_dimension,
                    max_width=eff_w,
                    max_height=eff_h,
                )
            else:
                vlm_input_bytes = _encode_vlm_image_bytes(cropped_img, max_vlm_dimension)

            meta = SegmentationMetadata(
                detected=cv_cropped or (rotation_deg != 0),
                method=f"{method}+rot{rotation_deg}" if rotation_deg != 0 else method,
                bbox=chosen_bbox,
                original_dimensions=orig_dims,
                cropped_dimensions=f"{cw}x{ch}",
                crop_area_ratio=area_ratio,
                rotation_applied_deg=rotation_deg,
            )
            return original_data_url, cropped_data_url, vlm_input_bytes, meta, cv_cropped
    except Exception:
        dummy_b64 = base64.b64encode(normalized_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{dummy_b64}"
        meta = SegmentationMetadata(
            detected=False,
            method="fallback",
            bbox=[0, 0, 0, 0],
            original_dimensions="N/A",
            cropped_dimensions="N/A",
            crop_area_ratio=1.0,
            rotation_applied_deg=0,
        )
        return data_url, data_url, normalized_bytes, meta, False


def segment_identity_document(
    normalized_bytes: bytes,
    vlm_bbox: Optional[Any] = None,
    vlm_orientation: Optional[Any] = None
) -> Tuple[Optional[str], Optional[str], SegmentationMetadata]:
    """
    Fallback segmentation using VLM bbox_2d / orientation_angle combined with CV refinement.
    Returns (original_data_url, cropped_data_url, segmentation_metadata).
    """
    try:
        with Image.open(io.BytesIO(normalized_bytes)) as img:
            img = img.convert("RGB")
            w, h = img.size
            orig_dims = f"{w}x{h}"
            original_data_url = _encode_preview_data_url(img)

            chosen_bbox = _parse_vlm_bbox_to_pixels(vlm_bbox, w, h)
            method = "vlm_grounding_bbox" if chosen_bbox is not None else "full_frame"

            cv_bbox, cv_method = _detect_card_bbox_cv(img)
            if chosen_bbox is None and cv_bbox is not None:
                chosen_bbox = cv_bbox
                method = cv_method
            elif chosen_bbox is not None and cv_bbox is not None:
                vlm_area = ((chosen_bbox[2] - chosen_bbox[0]) * (chosen_bbox[3] - chosen_bbox[1])) / float(w * h)
                cv_area = ((cv_bbox[2] - cv_bbox[0]) * (cv_bbox[3] - cv_bbox[1])) / float(w * h)
                if vlm_area > 0.94 and 0.12 <= cv_area < 0.90:
                    chosen_bbox = cv_bbox
                    method = f"hybrid_{cv_method}"

            if chosen_bbox is None:
                chosen_bbox = [0, 0, w, h]
                cropped_img = img.copy()
                detected = False
            else:
                xmin, ymin, xmax, ymax = chosen_bbox
                cropped_img = img.crop((xmin, ymin, xmax, ymax))
                crop_ratio = ((xmax - xmin) * (ymax - ymin)) / float(w * h)
                detected = crop_ratio < 0.98

            raw_cw, raw_ch = cropped_img.size
            area_ratio = round((raw_cw * raw_ch) / float(w * h), 3)

            cropped_img, rotation_deg = _auto_upright_cropped_card(cropped_img, vlm_orientation)
            cw, ch = cropped_img.size
            cropped_data_url = _encode_preview_data_url(cropped_img)

            meta = SegmentationMetadata(
                detected=detected or (rotation_deg != 0),
                method=f"{method}+rot{rotation_deg}" if rotation_deg != 0 else method,
                bbox=chosen_bbox,
                original_dimensions=orig_dims,
                cropped_dimensions=f"{cw}x{ch}",
                crop_area_ratio=area_ratio,
                rotation_applied_deg=rotation_deg,
            )
            return original_data_url, cropped_data_url, meta
    except Exception:
        dummy_b64 = base64.b64encode(normalized_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{dummy_b64}"
        meta = SegmentationMetadata(
            detected=False,
            method="fallback",
            bbox=[0, 0, 0, 0],
            original_dimensions="N/A",
            cropped_dimensions="N/A",
            crop_area_ratio=1.0,
            rotation_applied_deg=0,
        )
        return data_url, data_url, meta


def extract_json_from_text(text: str) -> Dict[str, Any]:
    """Parse JSON from model response, handling markdown blocks if present."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        brace_match = re.search(r"(\{[\s\S]*\})", text)
        if brace_match:
            try:
                return json.loads(brace_match.group(1))
            except json.JSONDecodeError:
                pass
        return {"raw_text": text, "error": "Could not parse structured JSON"}


def _is_text_only_model(model_name: str) -> bool:
    """Return True if the Ollama model tag is a text-only LLM (cannot accept image inputs)."""
    low = (model_name or "").strip().lower()
    if not low:
        return False
    vision_markers = ("-vl", "vl:", "vision", "llava", "minicpm-v", "internvl", "moondream", "bakllava")
    return not any(marker in low for marker in vision_markers)


def _get_rapidocr_det() -> Any:
    """Lazy-load thread-safe singleton RapidOCR DBNet text detector (CPU ONNX)."""
    global _RAPIDOCR_DET, _RAPIDOCR_INIT_FAILED
    if _RAPIDOCR_DET is not None:
        return _RAPIDOCR_DET
    if _RAPIDOCR_INIT_FAILED:
        return None
    with _RAPIDOCR_LOCK:
        if _RAPIDOCR_DET is not None:
            return _RAPIDOCR_DET
        if _RAPIDOCR_INIT_FAILED:
            return None
        try:
            from rapidocr_onnxruntime import RapidOCR

            _RAPIDOCR_DET = RapidOCR(
                use_det=True,
                use_cls=False,
                use_rec=False,
                det_thresh=float(getattr(settings, "RAPIDOCR_DET_THRESH", 0.25)),
                det_box_thresh=float(getattr(settings, "RAPIDOCR_DET_BOX_THRESH", 0.40)),
                det_unclip_ratio=float(getattr(settings, "RAPIDOCR_DET_UNCLIP_RATIO", 1.55)),
            )
            logger.info("Loaded RapidOCR TextDet ONNX model on CPU")
            return _RAPIDOCR_DET
        except Exception as exc:
            logger.warning("RapidOCR TextDet initialization failed: %s", exc)
            _RAPIDOCR_INIT_FAILED = True
            return None


def _get_vietocr_predictor() -> Any:
    """Lazy-load thread-safe singleton VietOCR predictor (CPU)."""
    global _VIETOCR_PREDICTOR, _VIETOCR_INIT_FAILED
    if _VIETOCR_PREDICTOR is not None:
        return _VIETOCR_PREDICTOR
    if _VIETOCR_INIT_FAILED:
        return None
    with _VIETOCR_LOCK:
        if _VIETOCR_PREDICTOR is not None:
            return _VIETOCR_PREDICTOR
        if _VIETOCR_INIT_FAILED:
            return None
        try:
            if not hasattr(Image, "ANTIALIAS"):
                Image.ANTIALIAS = Image.Resampling.LANCZOS  # type: ignore[attr-defined]
            from vietocr.tool.config import Cfg
            from vietocr.tool.predictor import Predictor

            model_cfg = getattr(settings, "VIETOCR_MODEL_NAME", "vgg_transformer") or "vgg_transformer"
            cfg = Cfg.load_config_from_name(model_cfg)
            cfg["device"] = "cpu"
            cfg["cnn"]["pretrained"] = False
            cfg["predictor"]["beamsearch"] = False
            _VIETOCR_PREDICTOR = Predictor(cfg)
            logger.info("Loaded VietOCR '%s' predictor on CPU", model_cfg)
            return _VIETOCR_PREDICTOR
        except Exception as exc:
            logger.warning("VietOCR initialization failed: %s", exc)
            _VIETOCR_INIT_FAILED = True
            return None


def _sort_ocr_lines_y_center(lines: List[Dict[str, Any]], row_tolerance_px: float = 14.0) -> List[List[Dict[str, Any]]]:
    """Group OCR boxes into horizontal visual rows by y-center and sort left-to-right."""
    if not lines:
        return []
    indexed = []
    for item in lines:
        x1, y1, x2, y2 = item["bbox"]
        yc = (y1 + y2) / 2.0
        indexed.append((yc, x1, item))
    indexed.sort(key=lambda t: t[0])

    rows: List[Tuple[float, List[Tuple[int, Dict[str, Any]]]]] = []
    for yc, x1, item in indexed:
        if not rows or abs(yc - rows[-1][0]) > row_tolerance_px:
            rows.append((yc, [(x1, item)]))
        else:
            row_items = rows[-1][1]
            row_items.append((x1, item))
            avg_yc = sum((it[1]["bbox"][1] + it[1]["bbox"][3]) / 2.0 for it in row_items) / len(row_items)
            rows[-1] = (avg_yc, row_items)

    grouped_rows: List[List[Dict[str, Any]]] = []
    for _, row_items in rows:
        row_items.sort(key=lambda t: t[0])
        grouped_rows.append([it[1] for it in row_items])
    return grouped_rows


def _format_ocr_rows_for_llm(lines: List[Dict[str, Any]]) -> str:
    """Format y-center grouped VietOCR lines with horizontal coordinates for text-only LLM mapping."""
    grouped_rows = _sort_ocr_lines_y_center(lines)
    formatted = []
    for idx, row in enumerate(grouped_rows, 1):
        yc = int(round(sum((it["bbox"][1] + it["bbox"][3]) / 2.0 for it in row) / len(row)))
        segs = " | ".join(f"[x={it['bbox'][0]}..{it['bbox'][2]}] {it['text']}" for it in row)
        formatted.append(f"L{idx:02d}(y={yc}): {segs}")
    return "\n".join(formatted)


def _format_paddle_ocr_lines_for_llm(lines: List[Dict[str, Any]]) -> str:
    """Format PaddleOCR-VL recognized lines cleanly for text-only LLM JSON mapping."""
    return "\n".join(f"L{idx:02d}: {it['text']}" for idx, it in enumerate(lines, 1) if it.get("text"))


def _detect_text_boxes_bgr(image_bytes: bytes, box_pad_px: int = 2) -> Tuple[np.ndarray, List[Dict[str, Any]], float]:
    """Decode cropped card image, upscale small cards to >=750px wide, and run RapidOCR TextDet."""
    det = _get_rapidocr_det()
    if det is None or cv2 is None:
        raise RuntimeError("RapidOCR hoặc OpenCV chưa sẵn sàng")

    with Image.open(io.BytesIO(image_bytes)) as img_pil:
        img_pil = img_pil.convert("RGB")
        img_bgr = np.asarray(img_pil)[:, :, ::-1].copy()

    h, w = img_bgr.shape[:2]
    if 0 < w < 500:
        scale = 750.0 / float(w)
        img_bgr = cv2.resize(
            img_bgr,
            (int(round(w * scale)), int(round(h * scale))),
            interpolation=cv2.INTER_CUBIC,
        )
        h, w = img_bgr.shape[:2]

    pad = 20
    border_px = np.concatenate([img_bgr[0], img_bgr[-1], img_bgr[:, 0], img_bgr[:, -1]], axis=0)
    fill = tuple(int(v) for v in np.median(border_px, axis=0))
    padded = cv2.copyMakeBorder(img_bgr, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=fill)

    t_det0 = time.perf_counter()
    boxes, _ = det(padded)
    det_ms = round((time.perf_counter() - t_det0) * 1000.0, 1)

    raw_items: List[Dict[str, Any]] = []
    for b in (boxes or []):
        pts = np.asarray(b, dtype=np.float32) - pad
        x1 = max(0, int(pts[:, 0].min()) - box_pad_px)
        y1 = max(0, int(pts[:, 1].min()) - box_pad_px)
        x2 = min(w, int(pts[:, 0].max()) + box_pad_px)
        y2 = min(h, int(pts[:, 1].max()) + box_pad_px)
        if x2 - x1 < 4 or y2 - y1 < 4:
            continue
        raw_items.append({"bbox": [x1, y1, x2, y2], "crop_rgb": img_bgr[y1:y2, x1:x2, ::-1]})
    return img_bgr, raw_items, det_ms


def _extract_text_lines_vietocr(image_bytes: bytes) -> Tuple[List[Dict[str, Any]], float, float]:
    """
    Run RapidOCR DBNet text detection + VietOCR recognition on the cropped/upright card image.
    Returns (sorted_lines, det_ms, vietocr_ms).
    """
    vietocr = _get_vietocr_predictor()
    if vietocr is None or cv2 is None:
        raise RuntimeError("RapidOCR hoặc VietOCR chưa sẵn sàng")

    _, raw_items, det_ms = _detect_text_boxes_bgr(image_bytes, box_pad_px=2)

    t_viet0 = time.perf_counter()
    recognized_items: List[Dict[str, Any]] = []
    for item in raw_items:
        crop_pil = Image.fromarray(item["crop_rgb"])
        txt = vietocr.predict(crop_pil)
        if isinstance(txt, str) and txt.strip():
            recognized_items.append({"bbox": item["bbox"], "text": txt.strip()})
    vietocr_ms = round((time.perf_counter() - t_viet0) * 1000.0, 1)

    grouped = _sort_ocr_lines_y_center(recognized_items)
    sorted_lines = [item for row in grouped for item in row]
    return sorted_lines, det_ms, vietocr_ms


def _build_paddleocr_vl_row_canvas(row: List[Dict[str, Any]], min_row_height: int = 48, gap_x: int = 14) -> np.ndarray:
    """Concatenate horizontal boxes in one row onto a clean white canvas and upscale if tiny."""
    rh = max(it["crop_rgb"].shape[0] for it in row)
    rw = sum(it["crop_rgb"].shape[1] for it in row) + gap_x * (len(row) - 1)
    canvas = np.full((rh, rw, 3), 255, dtype=np.uint8)
    cx = 0
    for it in row:
        c = it["crop_rgb"]
        ch, cw = c.shape[:2]
        y_off = (rh - ch) // 2
        canvas[y_off:y_off + ch, cx:cx + cw] = c
        cx += cw + gap_x
    if 0 < rh < min_row_height:
        scale = float(min_row_height) / float(rh)
        canvas = cv2.resize(
            canvas,
            (max(1, int(round(rw * scale))), min_row_height),
            interpolation=cv2.INTER_CUBIC,
        )
    return canvas


def _build_paddleocr_vl_strip_image(rows: List[List[Dict[str, Any]]], min_row_height: int = 48) -> Image.Image:
    """Stack sorted RapidOCR rows vertically onto one clean white-background composite image."""
    row_imgs = [_build_paddleocr_vl_row_canvas(row, min_row_height=min_row_height) for row in rows if row]
    max_rw = max(r.shape[1] for r in row_imgs)
    margin = 16
    gap_y = 12
    total_h = margin * 2 + sum(r.shape[0] for r in row_imgs) + gap_y * max(0, len(row_imgs) - 1)
    total_w = margin * 2 + max_rw
    strip = np.full((total_h, total_w, 3), 255, dtype=np.uint8)
    cy = margin
    for r in row_imgs:
        strip[cy:cy + r.shape[0], margin:margin + r.shape[1]] = r
        cy += r.shape[0] + gap_y
    return Image.fromarray(strip)


def _call_paddleocr_vl_ollama(img_pil: Image.Image, model_name: str, num_predict: int = 256) -> str:
    """Invoke PaddleOCR-VL-Vi model via Ollama /api/chat with deterministic OCR decoding."""
    buf = io.BytesIO()
    img_pil.save(buf, format="JPEG", quality=95)
    b64_img = base64.b64encode(buf.getvalue()).decode("utf-8")

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": "OCR:", "images": [b64_img]}],
        "stream": False,
        "options": {
            "temperature": 0.0,
            "top_k": 1,
            "top_p": 1.0,
            "repeat_penalty": 1.08,
            "num_ctx": settings.OLLAMA_NUM_CTX,
            "num_predict": num_predict,
        },
    }
    chat_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
    req = urllib.request.Request(
        chat_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=settings.OLLAMA_TIMEOUT_SECONDS) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return str(data.get("message", {}).get("content", "") or "").strip()


def _find_suspicious_id_line_index(lines: List[str]) -> Optional[int]:
    """
    Detect whether the strip output already contains a clean 9-digit or 12-digit ID number,
    or whether an ID line in the top region looks corrupted (e.g. '3520228/6' or 8 digits)
    so a targeted 1-row retry can recover the exact digit sequence.
    """
    top_lines = lines[:6]
    for ln in top_lines:
        if re.search(r"(?<!\d)(?:\d{9}|\d{12})(?!\d)", ln):
            return None

    for idx, ln in enumerate(top_lines):
        low = ln.lower()
        has_so_cue = bool(re.search(r"\b(?:s[ốo]|no\.?)\b", low))
        # Match noisy digit runs like "3520228/6" or 7-11 digits while ignoring standard DD/MM/YYYY dates
        has_corrupt_num = bool(re.search(r"\d{4,}[/\-?s]\d+|\b\d{7,11}\b", ln))
        if has_so_cue or has_corrupt_num:
            return idx
    return None


def _extract_text_lines_paddleocr_vl(
    image_bytes: bytes,
    paddle_model: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], float, float]:
    """
    Run RapidOCR DBNet text detection + single-pass stacked strip recognition with
    Vietnamese fine-tuned PaddleOCR-VL (Ollama). Automatically performs a single-row
    refinement ONLY if the card ID line appears noisy/corrupted.
    Returns (lines, det_ms, paddleocr_vl_ms).
    """
    effective_paddle_model = (paddle_model or getattr(settings, "PADDLEOCR_VL_MODEL", "paddleocr-vl-vi")).strip()
    min_row_h = int(getattr(settings, "PADDLEOCR_VL_STRIP_MIN_ROW_HEIGHT", 48) or 48)

    img_bgr, raw_items, det_ms = _detect_text_boxes_bgr(image_bytes, box_pad_px=3)
    h = img_bgr.shape[0]
    rows = _sort_ocr_lines_y_center(raw_items)

    t_ocr0 = time.perf_counter()
    if rows:
        strip_pil = _build_paddleocr_vl_strip_image(rows, min_row_height=min_row_h)
        raw_text = _call_paddleocr_vl_ollama(strip_pil, effective_paddle_model, num_predict=256)
    else:
        full_pil = Image.fromarray(img_bgr[:, :, ::-1])
        raw_text = _call_paddleocr_vl_ollama(full_pil, effective_paddle_model, num_predict=256)

    parsed_lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

    # Targeted 1-row retry ONLY if ID line on CMND/CCCD looks corrupted (e.g., red watermark '3520228/6')
    suspect_idx = _find_suspicious_id_line_index(parsed_lines)
    if suspect_idx is not None and rows:
        candidate_row: Optional[List[Dict[str, Any]]] = None
        if len(parsed_lines) == len(rows) and suspect_idx < len(rows):
            candidate_row = rows[suspect_idx]
        else:
            # Locate the row in upper-middle band (18%..48% height) matching suspect position
            upper_rows = [
                r for r in rows
                if 0.18 * h <= sum((it["bbox"][1] + it["bbox"][3]) / 2.0 for it in r) / len(r) <= 0.48 * h
            ]
            if upper_rows:
                # Prefer row at suspect_idx if in upper_rows, else the row after title
                if suspect_idx < len(rows) and rows[suspect_idx] in upper_rows:
                    candidate_row = rows[suspect_idx]
                else:
                    candidate_row = upper_rows[-1]

        if candidate_row:
            try:
                row_canvas = _build_paddleocr_vl_row_canvas(candidate_row, min_row_height=max(56, min_row_h))
                margin = 14
                padded_row = np.full(
                    (row_canvas.shape[0] + margin * 2, row_canvas.shape[1] + margin * 2, 3),
                    255,
                    dtype=np.uint8,
                )
                padded_row[margin:margin + row_canvas.shape[0], margin:margin + row_canvas.shape[1]] = row_canvas
                refined_txt = _call_paddleocr_vl_ollama(Image.fromarray(padded_row), effective_paddle_model, num_predict=64)
                refined_clean = " ".join(refined_txt.splitlines()).strip()
                if re.search(r"(?<!\d)(?:\d{9}|\d{12})(?!\d)", refined_clean):
                    parsed_lines[suspect_idx] = refined_clean
            except Exception as exc:
                logger.debug("PaddleOCR-VL ID-row refinement skipped: %s", exc)

    paddleocr_vl_ms = round((time.perf_counter() - t_ocr0) * 1000.0, 1)

    ocr_lines = [
        {"bbox": [0, idx * 20, 100, idx * 20 + 18], "text": ln}
        for idx, ln in enumerate(parsed_lines)
    ]
    return ocr_lines, det_ms, paddleocr_vl_ms


def _postprocess_hybrid_extracted_data(data: Dict[str, Any], lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Deterministic guardrails over Hybrid LLM JSON output when raw OCR lines are available:
      - Prevent hallucinated issue_place / issue_date on front-side ID cards.
      - Recover 'Không thời hạn' if present in OCR lines.
      - Normalize ISO YYYY-MM-DD back to DD/MM/YYYY when matching raw OCR date.
      - Avoid mapping CMND 'Dân tộc: Kinh' into nationality='Kinh'.
    """
    if not isinstance(data, dict) or not lines:
        return data

    full_text = "\n".join(it["text"] for it in lines)
    low_text = full_text.lower()
    doc_type = str(data.get("document_type") or "").strip().lower()

    if doc_type in ("id_card", "cccd", "cmnd", ""):
        has_issue_place_cue = any(
            cue in low_text
            for cue in ("nơi cấp", "cục cảnh sát", "giám đốc", "công an tỉnh", "công an tp")
        )
        if not has_issue_place_cue:
            data["issue_place"] = None

        has_issue_date_cue = any(
            cue in low_text
            for cue in ("ngày cấp", "ngày, tháng, năm cấp", "date of issue")
        )
        if not has_issue_date_cue:
            data["issue_date"] = None

        if ("không thời" in low_text or "vô thời hạn" in low_text) and not data.get("expiry_date"):
            data["expiry_date"] = "Không thời hạn"

        for date_field in ("date_of_birth", "expiry_date", "issue_date"):
            val = data.get(date_field)
            if isinstance(val, str):
                iso_m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", val.strip())
                if iso_m:
                    dmy = f"{iso_m.group(3)}/{iso_m.group(2)}/{iso_m.group(1)}"
                    dmy_dash = f"{iso_m.group(3)}-{iso_m.group(2)}-{iso_m.group(1)}"
                    if dmy in full_text:
                        data[date_field] = dmy
                    elif dmy_dash in full_text:
                        data[date_field] = dmy_dash

        nat = data.get("nationality")
        if isinstance(nat, str) and nat.strip().lower() == "kinh" and "dân tộc" in low_text:
            data["nationality"] = "Việt Nam" if "việt nam" in low_text else None

        for addr_field in ("origin_address", "residence_address"):
            addr_val = data.get(addr_field)
            if isinstance(addr_val, str):
                cleaned_addr = re.sub(
                    r"^(?:quê\s*qu[aáả]n|nguy[eê]n\s*qu[aáả]n|n[ơo]i\s*đkhk\s*th[ưư][ơờ]ng\s*tr[uúủ]|n[ơo]i\s*th[ưư][ơờ]ng\s*tr[uúủ]|n[ơo]i\s*c[ưư]\s*tr[uúủ])\s*[:;,\-]?\s*",
                    "",
                    addr_val.strip(),
                    flags=re.IGNORECASE,
                ).strip()
                data[addr_field] = cleaned_addr or None

    return data


class OCREngineService:
    @staticmethod
    def check_hybrid_components_ready() -> Tuple[bool, bool]:
        """Check whether RapidOCR TextDet and VietOCR can be loaded."""
        det_ok = _get_rapidocr_det() is not None
        viet_ok = _get_vietocr_predictor() is not None
        return det_ok, viet_ok

    @staticmethod
    def check_paddleocr_vl_ready(installed_models: Optional[List[str]] = None) -> bool:
        """Check whether the Vietnamese fine-tuned PaddleOCR-VL model is available in Ollama."""
        models = installed_models if installed_models is not None else OCREngineService.get_installed_models()
        target = getattr(settings, "PADDLEOCR_VL_MODEL", "paddleocr-vl-vi").strip().lower()
        for m in models:
            low = m.strip().lower()
            if low == target or low == f"{target}:latest" or low.startswith("paddleocr-vl"):
                return True
        return False

    @staticmethod
    def check_ollama_health() -> Tuple[bool, str]:
        """Check if Ollama server is up and responsive."""
        base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        try:
            req = urllib.request.Request(f"{base_url}/")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    return True, "running"
        except Exception:
            pass
        return False, "offline"

    @staticmethod
    def get_installed_models() -> List[str]:
        """Query Ollama /api/tags for locally installed models."""
        base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        try:
            req = urllib.request.Request(f"{base_url}/api/tags")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    raw = resp.read()
                    if isinstance(raw, (bytes, bytearray)):
                        data = json.loads(raw.decode("utf-8"))
                        models = data.get("models", [])
                        if isinstance(models, list):
                            return [
                                str(m.get("name"))
                                for m in models
                                if isinstance(m, dict) and m.get("name")
                            ]
        except Exception:
            pass
        return []

    @staticmethod
    def get_loaded_models() -> List[Dict[str, Any]]:
        """Query Ollama /api/ps for models currently loaded in VRAM/RAM."""
        base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        try:
            req = urllib.request.Request(f"{base_url}/api/ps")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    raw = resp.read()
                    if isinstance(raw, (bytes, bytearray)):
                        data = json.loads(raw.decode("utf-8"))
                        models = data.get("models", [])
                        if isinstance(models, list):
                            return [
                                m for m in models if isinstance(m, dict)
                            ]
        except Exception:
            pass
        return []

    @staticmethod
    def build_available_models(installed_models: List[str]) -> List[VLMModelOption]:
        """Merge recommended 4GB/standard VLM presets with locally installed Ollama models."""
        installed_set = set(installed_models)
        options: List[VLMModelOption] = []
        seen = set()

        for preset in RECOMMENDED_VLM_MODELS:
            name = preset["name"]
            seen.add(name)
            options.append(
                VLMModelOption(
                    name=name,
                    label=preset["label"],
                    vram_estimate=preset["vram_estimate"],
                    tier=preset["tier"],
                    installed=(name in installed_set or f"{name}:latest" in installed_set),
                    mode=preset.get("mode", "hybrid"),
                )
            )

        if settings.OLLAMA_TEXT_MODEL not in seen:
            options.insert(
                0,
                VLMModelOption(
                    name=settings.OLLAMA_TEXT_MODEL,
                    label=f"Hybrid: {settings.OLLAMA_TEXT_MODEL} (Cấu hình mặc định)",
                    vram_estimate="Custom",
                    tier="custom",
                    mode="hybrid",
                    installed=(settings.OLLAMA_TEXT_MODEL in installed_set),
                ),
            )
            seen.add(settings.OLLAMA_TEXT_MODEL)

        if settings.OLLAMA_MODEL not in seen:
            options.insert(
                0,
                VLMModelOption(
                    name=settings.OLLAMA_MODEL,
                    label=f"{settings.OLLAMA_MODEL} (Cấu hình mặc định)",
                    vram_estimate="Custom",
                    tier="custom",
                    mode="vlm",
                    installed=(settings.OLLAMA_MODEL in installed_set),
                ),
            )
            seen.add(settings.OLLAMA_MODEL)

        for name in installed_models:
            base_name = name[:-7] if name.endswith(":latest") else name
            if name not in seen and base_name not in seen:
                options.append(
                    VLMModelOption(
                        name=name,
                        label=f"{name} (Đã cài trên Ollama)",
                        vram_estimate="Local",
                        tier="installed",
                        mode="hybrid" if _is_text_only_model(name) else "both",
                        installed=True,
                    )
                )
                seen.add(name)

        return options

    @staticmethod
    def resolve_license_and_balance(
        db: Session,
        user: Optional[User] = None,
        license_id: Optional[str] = None,
        api_key_secret_hash: Optional[str] = None
    ) -> Tuple[License, UsageBalance]:
        """Resolve valid license and usage balance from user or API credential."""
        lic: Optional[License] = None

        if api_key_secret_hash:
            cred = db.query(APICredential).filter(
                APICredential.secret_hash == api_key_secret_hash,
                APICredential.status == CredentialStatus.ACTIVE
            ).first()
            if not cred:
                raise ForbiddenException("Invalid or revoked API Key")
            lic = cred.license
        elif license_id:
            lic = db.query(License).filter(License.id == license_id).first()
            if lic and user and lic.user_id != user.id:
                lic = None
            if not lic and user:
                lic = db.query(License).filter(
                    License.user_id == user.id,
                    License.status == LicenseStatus.ACTIVE
                ).first()
            if not lic:
                raise EntityNotFoundException("License", license_id)
        elif user:
            lic = db.query(License).filter(
                License.user_id == user.id,
                License.status == LicenseStatus.ACTIVE
            ).first()

        if not lic:
            raise BadRequestException("No active OCR License found for processing. Please acquire a license first.")

        if lic.status != LicenseStatus.ACTIVE:
            raise BadRequestException(f"License '{lic.id}' is currently {lic.status}. Cannot execute OCR jobs.")

        balance = db.query(UsageBalance).filter(UsageBalance.license_id == lic.id).first()
        if not balance:
            raise BadRequestException(f"No quota balance provisioned for License '{lic.id}'")

        if balance.remaining_quota < 1:
            raise BadRequestException(
                f"Hạn ngạch (Quota) của License {lic.masked_key} đã hết (Còn lại: 0). Vui lòng gia hạn hoặc mua thêm gói cước."
            )

        return lic, balance

    @staticmethod
    def process_identity_document(
        db: Session,
        image_bytes: bytes,
        file_name: str,
        user: Optional[User] = None,
        license_id: Optional[str] = None,
        api_key_secret_hash: Optional[str] = None,
        model_name: Optional[str] = None,
        pipeline_mode: Optional[str] = None,
    ) -> OCRExtractionResponse:
        """
        Execute identity OCR pipeline (Hybrid VietOCR, Hybrid PaddleOCR-VL-Vi, or Pure VLM):
          1. Resolve license & verify quota.
          2. Normalize image bytes.
          3. CV crop & upright rotation via DocAligner + OpenCV warpPerspective.
          4a. Hybrid mode (default): RapidOCR TextDet + VietOCR (CPU) -> Text-only LLM JSON mapping.
          4b. Hybrid PaddleOCR-VL mode: RapidOCR TextDet + PaddleOCR-VL-Vi (Ollama GPU) -> Text-only LLM JSON mapping.
          4c. VLM mode: Send cropped image to Ollama VLM for direct extraction.
          5. Apply deterministic post-processing guardrails (in hybrid modes) or VLM bbox fallback.
          6. Deduct quota & record usage ledger.
        """
        raw_mode = (pipeline_mode or getattr(settings, "OCR_PIPELINE_MODE", "hybrid") or "hybrid").strip().lower()
        if raw_mode in ("hybrid_paddle_vl", "paddleocr_vl", "paddle_vl", "hybrid-paddle-vl"):
            requested_mode = "hybrid_paddle_vl"
        elif raw_mode in ("hybrid", "vlm"):
            requested_mode = raw_mode
        else:
            requested_mode = "hybrid"

        requested_model = (model_name or "").strip()
        is_paddle_vl_model = requested_model.lower().startswith("paddleocr-vl")
        if requested_model:
            if is_paddle_vl_model:
                requested_mode = "hybrid_paddle_vl"
            elif _is_text_only_model(requested_model):
                if requested_mode == "vlm":
                    requested_mode = "hybrid"
            elif pipeline_mode is None:
                requested_mode = "vlm"

        # 1. Resolve license & verify quota
        lic, balance = OCREngineService.resolve_license_and_balance(
            db=db,
            user=user,
            license_id=license_id,
            api_key_secret_hash=api_key_secret_hash
        )

        # 2. Normalize image to standard RGB JPEG
        normalized_bytes = normalize_image_bytes(image_bytes)

        # 3. Pre-VLM CV Crop & Auto-Upright Rotation
        t_doc0 = time.perf_counter()
        orig_url, cropped_url, vlm_input_bytes, seg_meta, cv_cropped = preprocess_identity_document_cv(
            normalized_bytes,
            max_vlm_dimension=settings.VLM_MAX_IMAGE_DIMENSION,
            cropped_max_width=settings.VLM_CROPPED_MAX_WIDTH,
            cropped_max_height=settings.VLM_CROPPED_MAX_HEIGHT,
        )
        docaligner_ms = round((time.perf_counter() - t_doc0) * 1000.0, 1)
        stage_timings_ms: Dict[str, float] = {"docaligner_ms": docaligner_ms}

        use_hybrid = requested_mode in ("hybrid", "hybrid_paddle_vl")
        use_paddle_vl = requested_mode == "hybrid_paddle_vl"
        ocr_lines: List[Dict[str, Any]] = []

        if use_paddle_vl:
            effective_paddle_model = requested_model if is_paddle_vl_model else getattr(settings, "PADDLEOCR_VL_MODEL", "paddleocr-vl-vi")
            try:
                ocr_lines, det_ms, paddle_ms = _extract_text_lines_paddleocr_vl(
                    vlm_input_bytes,
                    paddle_model=effective_paddle_model,
                )
                stage_timings_ms["text_det_ms"] = det_ms
                stage_timings_ms["paddleocr_vl_ms"] = paddle_ms
            except urllib.error.HTTPError as e:
                err_detail = ""
                try:
                    err_body = e.read().decode("utf-8", errors="ignore")
                    err_json = json.loads(err_body)
                    err_detail = err_json.get("error", err_body)
                except Exception:
                    err_detail = str(e)
                raise BadRequestException(
                    f"Ollama PaddleOCR-VL báo lỗi xử lý ảnh (HTTP {e.code}, model='{effective_paddle_model}'): {err_detail}."
                )
            except urllib.error.URLError as e:
                raise BadRequestException(
                    f"Không thể kết nối đến Ollama Server tại {settings.OLLAMA_BASE_URL} ({e}). Hãy đảm bảo Ollama đang chạy."
                )
            except Exception as exc:
                raise BadRequestException(f"Lỗi thực thi PaddleOCR-VL ({effective_paddle_model}): {exc}")
        elif use_hybrid:
            try:
                ocr_lines, det_ms, vietocr_ms = _extract_text_lines_vietocr(vlm_input_bytes)
                stage_timings_ms["text_det_ms"] = det_ms
                stage_timings_ms["vietocr_ms"] = vietocr_ms
            except Exception as exc:
                if requested_model and _is_text_only_model(requested_model):
                    raise BadRequestException(f"Lỗi khởi tạo hoặc thực thi VietOCR/TextDet: {exc}")
                logger.warning("Hybrid VietOCR stage unavailable (%s), falling back to Pure VLM mode", exc)
                use_hybrid = False

        if use_hybrid:
            if requested_model and not is_paddle_vl_model and (
                _is_text_only_model(requested_model) or not use_paddle_vl
            ):
                effective_model = requested_model
            else:
                effective_model = getattr(settings, "OLLAMA_TEXT_MODEL", "qwen2.5:3b")

            rows_text = (
                _format_paddle_ocr_lines_for_llm(ocr_lines)
                if use_paddle_vl
                else _format_ocr_rows_for_llm(ocr_lines)
            )
            source_label = "Các dòng PaddleOCR-VL" if use_paddle_vl else "Các dòng VietOCR"
            payload = {
                "model": effective_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT_HYBRID_OCR_JSON_MAPPER},
                    {
                        "role": "user",
                        "content": (
                            f"Kích thước ảnh thẻ: {seg_meta.cropped_dimensions}\n"
                            f"{source_label}:\n{rows_text if rows_text else '(Không phát hiện được dòng chữ)'}"
                        ),
                    },
                ],
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.0,
                    "num_ctx": min(settings.OLLAMA_NUM_CTX, 2048),
                    "num_predict": min(settings.OLLAMA_NUM_PREDICT, 768),
                },
            }
        else:
            effective_model = requested_model or settings.OLLAMA_MODEL
            b64_image = base64.b64encode(vlm_input_bytes).decode("utf-8")
            if cv_cropped:
                system_prompt = SYSTEM_PROMPT_IDENTITY_OCR_CROPPED
                user_prompt = (
                    "Ảnh đã được cắt sát vùng thẻ và xoay thẳng chiều đọc chuẩn. "
                    "Hãy nhận diện loại giấy tờ và trích xuất toàn bộ thông tin theo đúng định dạng JSON yêu cầu."
                )
            else:
                system_prompt = SYSTEM_PROMPT_IDENTITY_OCR
                user_prompt = (
                    "Hãy định vị vùng chứa thẻ giấy tờ tùy thân (bbox_2d: [xmin, ymin, xmax, ymax]), "
                    "xác định góc xoay (orientation_angle) và trích xuất toàn bộ thông tin theo đúng định dạng JSON yêu cầu."
                )
            payload = {
                "model": effective_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt, "images": [b64_image]},
                ],
                "stream": False,
                "options": {
                    "temperature": 0.0,
                    "num_ctx": settings.OLLAMA_NUM_CTX,
                    "num_predict": settings.OLLAMA_NUM_PREDICT,
                },
            }

        chat_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
        t_llm0 = time.perf_counter()
        try:
            req = urllib.request.Request(
                chat_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=settings.OLLAMA_TIMEOUT_SECONDS) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_detail = ""
            try:
                err_body = e.read().decode("utf-8", errors="ignore")
                err_json = json.loads(err_body)
                err_detail = err_json.get("error", err_body)
            except Exception:
                err_detail = str(e)
            raise BadRequestException(
                f"Ollama VLM báo lỗi xử lý ảnh (HTTP {e.code}, model='{effective_model}'): {err_detail}. Vui lòng kiểm tra model đã pull và định dạng tệp ảnh."
            )
        except urllib.error.URLError as e:
            raise BadRequestException(
                f"Không thể kết nối đến Ollama VLM Server tại {settings.OLLAMA_BASE_URL} ({e}). Hãy đảm bảo Ollama đang chạy."
            )
        except Exception as e:
            raise BadRequestException(f"Lỗi khi thực thi mô hình VLM '{effective_model}': {str(e)}")

        llm_ms = round((time.perf_counter() - t_llm0) * 1000.0, 1)
        stage_timings_ms["llm_map_ms" if use_hybrid else "vlm_ms"] = llm_ms
        execution_time_ms = int(round(sum(stage_timings_ms.values())))
        raw_content = resp_data.get("message", {}).get("content", "")
        extracted_data = extract_json_from_text(raw_content)
        if use_hybrid:
            extracted_data = _postprocess_hybrid_extracted_data(extracted_data, ocr_lines)

        # 5. Remove coordinate/orientation helper keys from extracted fields;
        #    only apply VLM bbox fallback in VLM mode when CV fell back to full_frame.
        vlm_bbox = extracted_data.pop("bbox_2d", None) or extracted_data.pop("document_bbox", None)
        vlm_orientation = extracted_data.pop("orientation_angle", None)
        if (
            not use_hybrid
            and not cv_cropped
            and seg_meta.method != "fallback"
            and (vlm_bbox is not None or vlm_orientation is not None)
        ):
            orig_url, cropped_url, seg_meta = segment_identity_document(
                normalized_bytes,
                vlm_bbox,
                vlm_orientation,
            )

        seg_meta.pipeline_mode = "hybrid_paddle_vl" if use_paddle_vl else ("hybrid" if use_hybrid else "vlm")
        seg_meta.ocr_lines_count = len(ocr_lines)
        seg_meta.stage_timings_ms = stage_timings_ms

        detected_type = extracted_data.get("document_type", "identity_document")
        job_id = f"JOB-{int(time.time() * 1000) % 1000000:06d}"

        # 6. Atomic Quota Deduction & Ledger Logging
        balance.used_quota += 1
        balance.remaining_quota = max(0, balance.total_quota - balance.used_quota)
        balance.updated_at = utc_now()

        rec = UsageRecord(
            license_id=lic.id,
            user_id=lic.user_id,
            service_id=lic.service_id,
            job_id=job_id,
            amount=1,
            quota_type=balance.quota_type or QuotaType.PAGE,
            unit_cost=1.0,
            created_at=utc_now()
        )
        db.add(rec)

        ledger = UsageLedger(
            license_id=lic.id,
            delta=-1,
            balance_after=balance.remaining_quota,
            entry_type=LedgerEntryType.DEBIT_USAGE,
            reference_type="job",
            reference_id=job_id,
            created_at=utc_now()
        )
        db.add(ledger)

        db.commit()
        db.refresh(balance)

        service_name = lic.service.name if lic.service else "ID Document & Passport OCR"

        return OCRExtractionResponse(
            job_id=job_id,
            status="completed",
            file_name=file_name,
            detected_type=detected_type,
            service_id=lic.service_id,
            service_name=service_name,
            license_id=lic.id,
            confidence_score=99.2,
            execution_time_ms=execution_time_ms,
            extracted_data=extracted_data,
            original_image_url=orig_url,
            cropped_image_url=cropped_url,
            segmentation_info=seg_meta,
            quota_used=1,
            remaining_quota=balance.remaining_quota,
            created_at=utc_now().isoformat()
        )
