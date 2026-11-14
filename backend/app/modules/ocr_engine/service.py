import base64
import hmac
import io
import logging
import math
import os
import pathlib
import secrets
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

from app.core.config import settings
from app.core.exceptions import (
    BadRequestException, ForbiddenException, EntityNotFoundException, UnauthorizedException
)
from app.common.models.users import User
from app.common.models.licenses import License
from app.common.models.usage import UsageBalance, UsageRecord, UsageLedger
from app.common.models.credentials import APICredential
from app.common.models.ocr_jobs import OCRJobRecord
from app.common.enums import LicenseStatus, CredentialStatus, LedgerEntryType, QuotaType, UserRole
from app.common.schemas.ocr_engine import OCRExtractionResponse, OCRJobHistoryItem, SegmentationMetadata, VLMModelOption
from app.modules.ocr_engine.prompts import SYSTEM_PROMPT_HYBRID_OCR_JSON_MAPPER


def _get_ollama_base_url() -> str:
    """Normalize localhost -> 127.0.0.1 to avoid ~2s Windows IPv6 [::1] fallback delay per urllib call."""
    base = (settings.OLLAMA_BASE_URL or "http://127.0.0.1:11434").strip().rstrip("/")
    return re.sub(r"^(https?://)localhost(?=(?::\d+)?(?:/|$))", r"\g<1>127.0.0.1", base, flags=re.IGNORECASE)


OLLAMA_API_URL = f"{_get_ollama_base_url()}/api/chat"
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
        "name": "paddleocr-vl-vi",
        "label": "PaddleOCR-VL 1.6 Vi (GGUF GPU Recognizer - Đọc CMND cũ/ảnh mờ vượt trội)",
        "vram_estimate": "~0.9 GB",
        "tier": "hybrid_paddle_vl",
        "mode": "hybrid_paddle_vl",
    },
]


def utc_now():
    return datetime.now(timezone.utc)


def _format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / (1024 * 1024):.2f} MB"


def _decode_data_url_bytes(data_url: Optional[str]) -> Optional[bytes]:
    if not data_url or not isinstance(data_url, str):
        return None
    if data_url.startswith("data:") and "," in data_url:
        try:
            _, b64 = data_url.split(",", 1)
            return base64.b64decode(b64)
        except Exception:
            return None
    return None


def _generate_unique_job_id(db: Session) -> str:
    for attempt in range(8):
        suffix = "" if attempt == 0 else f"-{secrets.token_hex(2).upper()}"
        candidate = f"JOB-{int(time.time() * 1000) % 1000000:06d}{suffix}"
        exists = db.query(OCRJobRecord.id).filter(OCRJobRecord.job_id == candidate).first()
        if not exists:
            return candidate
    return f"JOB-{secrets.token_hex(4).upper()}"


def _persist_job_images_to_disk(
    job_id: str,
    orig_url: Optional[str],
    cropped_url: Optional[str],
    orig_fallback: Optional[bytes] = None,
    cropped_fallback: Optional[bytes] = None,
) -> Tuple[Optional[str], Optional[str]]:
    storage_root = pathlib.Path(settings.OCR_STORAGE_DIR).resolve()
    job_dir = (storage_root / job_id).resolve()
    job_dir.relative_to(storage_root)
    job_dir.mkdir(parents=True, exist_ok=True)

    orig_bytes = _decode_data_url_bytes(orig_url) or orig_fallback
    crop_bytes = _decode_data_url_bytes(cropped_url) or cropped_fallback or orig_bytes

    orig_rel: Optional[str] = None
    crop_rel: Optional[str] = None
    if orig_bytes:
        (job_dir / "original.jpg").write_bytes(orig_bytes)
        orig_rel = f"{job_id}/original.jpg"
    if crop_bytes:
        (job_dir / "cropped.jpg").write_bytes(crop_bytes)
        crop_rel = f"{job_id}/cropped.jpg"
    return orig_rel, crop_rel


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
    max_gb = np.maximum(g, b)
    redness = r - max_gb
    gb_diff = np.abs(g - b)
    strong_red_mask = (
        (redness > 24.0)
        & (r > 95.0)
        & ((redness / np.maximum(r, 1.0)) > 0.24)
        & (gb_diff <= np.maximum(18.0, redness * 0.55))
    )
    return float(np.mean(strong_red_mask) * 1000.0 + np.percentile(redness, 97) * 0.08)


def _detect_text_orientation_vote(img: Image.Image) -> Tuple[float, float, int]:
    """
    Use RapidOCR TextDet + TextCls (0° vs 180°) on horizontal text lines to determine
    whether a landscape card image is upright (0°) or upside down (180°).
    Returns (score_0, score_180, valid_box_count).
    """
    det = _get_rapidocr_det()
    if det is None or cv2 is None or not hasattr(det, "text_det") or not hasattr(det, "text_cls"):
        return 0.0, 0.0, 0

    try:
        rgb = np.asarray(img.convert("RGB"), dtype=np.uint8)
        bgr = rgb[:, :, ::-1].copy()
        h, w = bgr.shape[:2]
        if w < 40 or h < 20:
            return 0.0, 0.0, 0

        if max(w, h) > 800:
            scale = 800.0 / float(max(w, h))
            bgr = cv2.resize(bgr, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)
        elif w < 500:
            scale = 700.0 / float(w)
            bgr = cv2.resize(bgr, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))), interpolation=cv2.INTER_CUBIC)

        pad = 16
        border_px = np.concatenate([bgr[0], bgr[-1], bgr[:, 0], bgr[:, -1]], axis=0)
        fill = tuple(int(v) for v in np.median(border_px, axis=0))
        padded = cv2.copyMakeBorder(bgr, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=fill)
        ph, pw = padded.shape[:2]

        dt_boxes, _ = det.text_det(padded)
        if dt_boxes is None or len(dt_boxes) == 0:
            return 0.0, 0.0, 0

        crops: List[np.ndarray] = []
        widths: List[int] = []
        for b in dt_boxes:
            pts = np.asarray(b, dtype=np.float32)
            x1 = max(0, int(pts[:, 0].min()) - 2)
            y1 = max(0, int(pts[:, 1].min()) - 2)
            x2 = min(pw, int(pts[:, 0].max()) + 2)
            y2 = min(ph, int(pts[:, 1].max()) + 2)
            bw = x2 - x1
            bh = y2 - y1
            if bw >= 18 and bh >= 6 and bw >= bh * 1.15:
                crops.append(padded[y1:y2, x1:x2])
                widths.append(bw)

        if not crops:
            return 0.0, 0.0, 0

        _, cls_res, _ = det.text_cls(crops)
        score_0 = 0.0
        score_180 = 0.0
        valid_count = 0
        for (lbl, conf), bw in zip(cls_res, widths):
            conf_f = float(conf)
            if conf_f < 0.55:
                continue
            weight = conf_f * math.sqrt(float(bw))
            if str(lbl) == "0":
                score_0 += weight
                valid_count += 1
            elif str(lbl) == "180":
                score_180 += weight
                valid_count += 1
        return score_0, score_180, valid_count
    except Exception as exc:
        logger.debug("Text orientation vote skipped: %s", exc)
        return 0.0, 0.0, 0


def _auto_upright_cropped_card(cropped_img: Image.Image, vlm_angle: Optional[Any] = None) -> Tuple[Image.Image, int]:
    """
    Ensure the cropped ID card is rotated to upright horizontal landscape orientation.
    Uses RapidOCR 0°/180° text-line orientation classification as primary signal,
    falling back to crimson header heuristic / VLM angle when no text lines exist.
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

        s0, s180, cnt = _detect_text_orientation_vote(rot_90_cw)
        if cnt >= 2:
            if s0 > s180 * 1.15:
                return rot_90_cw, 90
            if s180 > s0 * 1.15:
                return rot_270_cw, 270

        score_90 = _score_red_header_top(rot_90_cw)
        score_270 = _score_red_header_top(rot_270_cw)

        if parsed_vlm_angle in (90, 270):
            return (rot_90_cw, 90) if parsed_vlm_angle == 90 else (rot_270_cw, 270)

        if abs(score_90 - score_270) > 1.2:
            if score_90 > score_270:
                return rot_90_cw, 90
            else:
                return rot_270_cw, 270

        return (rot_270_cw, 270) if score_270 >= score_90 else (rot_90_cw, 90)

    # Case 2: Cropped card is already horizontal (landscape) -> Check if upside down (180°)
    rot_180 = cropped_img.transpose(Image.Transpose.ROTATE_180)
    s0, s180, cnt = _detect_text_orientation_vote(cropped_img)
    if cnt >= 2:
        if s180 > s0 * 1.25:
            return rot_180, 180
        if s0 >= s180:
            return cropped_img, 0

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
                use_cls=True,
                use_rec=False,
                det_thresh=float(getattr(settings, "RAPIDOCR_DET_THRESH", 0.25)),
                det_box_thresh=float(getattr(settings, "RAPIDOCR_DET_BOX_THRESH", 0.40)),
                det_unclip_ratio=float(getattr(settings, "RAPIDOCR_DET_UNCLIP_RATIO", 1.55)),
                cls_thresh=0.6,
            )
            logger.info("Loaded RapidOCR TextDet + TextCls ONNX models on CPU")
            return _RAPIDOCR_DET
        except Exception as exc:
            logger.warning("RapidOCR TextDet initialization failed: %s", exc)
            _RAPIDOCR_INIT_FAILED = True
            return None


def _group_ocr_rows_y_center(lines: List[Dict[str, Any]], row_tolerance_px: float = 14.0) -> List[List[Dict[str, Any]]]:
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


def _sort_ocr_lines_y_center(
    lines: List[Dict[str, Any]],
    row_tolerance_px: float = 14.0,
    img_width: Optional[int] = None,
    img_height: Optional[int] = None,
) -> List[List[Dict[str, Any]]]:
    """
    Group OCR boxes into horizontal visual rows by y-center and sort left-to-right.
    When card dimensions are provided and a 2-column portrait-sidebar layout is detected
    (e.g., CCCD/CMND/GPLX with 'Có giá trị đến / Date of expiry' tucked under the left portrait
    alongside bottom-right 'Nơi thường trú' lines), keep that bottom-left sidebar block as a
    separate trailing column so it neither interleaves nor stitches onto residence lines.
    """
    if not lines:
        return []
    if not img_width or not img_height or img_width <= 0 or img_height <= 0:
        return _group_ocr_rows_y_center(lines, row_tolerance_px=row_tolerance_px)

    w = float(img_width)
    h = float(img_height)
    right_col_items = [it for it in lines if it["bbox"][0] >= 0.23 * w]
    has_right_main_col = sum(1 for it in right_col_items if it["bbox"][0] <= 0.45 * w) >= 4
    if not has_right_main_col:
        return _group_ocr_rows_y_center(lines, row_tolerance_px=row_tolerance_px)

    main_items: List[Dict[str, Any]] = []
    left_sidebar_items: List[Dict[str, Any]] = []
    for it in lines:
        x1, y1, x2, y2 = it["bbox"]
        yc = (y1 + y2) / 2.0
        in_bottom_left = (x1 <= 0.16 * w) and (x2 <= 0.28 * w) and (yc > 0.50 * h)
        if in_bottom_left:
            has_adjacent_right = any(
                abs(((r["bbox"][1] + r["bbox"][3]) / 2.0) - yc) <= row_tolerance_px * 1.5
                and (r["bbox"][0] - x2) < 0.05 * w
                for r in right_col_items
            )
            if not has_adjacent_right:
                left_sidebar_items.append(it)
                continue
        main_items.append(it)

    if not left_sidebar_items:
        return _group_ocr_rows_y_center(lines, row_tolerance_px=row_tolerance_px)
    return _group_ocr_rows_y_center(main_items, row_tolerance_px=row_tolerance_px) + _group_ocr_rows_y_center(
        left_sidebar_items, row_tolerance_px=row_tolerance_px
    )


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
    chat_url = f"{_get_ollama_base_url()}/api/chat"
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
    h, w = img_bgr.shape[:2]
    rows = _sort_ocr_lines_y_center(raw_items, img_width=w, img_height=h)

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
                    r"^(?:(?:quê\s*qu[aáảà]n|nguy[eê]n\s*qu[aáảà]n|n[ơo]i\s*đkhk\s*th[ưư][ơờ]ng\s*tr[uúủù]|n[ơo]i\s*th[ưư][ơờ]ng\s*tr[uúủù]|n[ơo]i\s*c[ưư]\s*tr[uúủù])(?:\s*/\s*place\s*of\s*(?:origin|residence))?|/?\s*place\s*of\s*(?:origin|residence))\s*[:;,\-]?\s*",
                    "",
                    addr_val.strip(),
                    flags=re.IGNORECASE,
                ).strip()
                data[addr_field] = cleaned_addr or None

    return data


class OCREngineService:
    @staticmethod
    def check_rapidocr_ready() -> bool:
        """Check whether RapidOCR TextDet can be loaded."""
        return _get_rapidocr_det() is not None

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
        base_url = _get_ollama_base_url()
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
        base_url = _get_ollama_base_url()
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
        base_url = _get_ollama_base_url()
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
        """Merge active Hybrid OCR model presets with locally installed Ollama models."""
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

        for name in installed_models:
            base_name = name[:-7] if name.endswith(":latest") else name
            if name not in seen and base_name not in seen:
                options.append(
                    VLMModelOption(
                        name=name,
                        label=f"{name} (Đã cài trên Ollama)",
                        vram_estimate="Local",
                        tier="installed",
                        mode="hybrid",
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

        if lic.expires_at:
            exp = lic.expires_at.replace(tzinfo=timezone.utc) if lic.expires_at.tzinfo is None else lic.expires_at
            if exp < utc_now():
                raise BadRequestException(f"License '{lic.masked_key}' has expired.")

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
    ) -> OCRExtractionResponse:
        """
        Execute Hybrid Identity OCR pipeline:
          1. Resolve license & verify quota.
          2. Normalize image bytes.
          3. CV crop & upright rotation via DocAligner + OpenCV warpPerspective.
          4. RapidOCR TextDet + PaddleOCR-VL-Vi (Ollama GPU) -> Text-only LLM JSON mapping.
          5. Apply deterministic post-processing guardrails.
          6. Deduct quota & record usage ledger.
        """
        requested_model = (model_name or "").strip()
        is_paddle_vl_model = requested_model.lower().startswith("paddleocr-vl")
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

        ocr_lines: List[Dict[str, Any]] = []

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

        if requested_model and not is_paddle_vl_model:
            effective_model = requested_model
        else:
            effective_model = getattr(settings, "OLLAMA_TEXT_MODEL", "qwen2.5:3b")

        rows_text = _format_paddle_ocr_lines_for_llm(ocr_lines)
        payload = {
            "model": effective_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT_HYBRID_OCR_JSON_MAPPER},
                {
                    "role": "user",
                    "content": (
                        f"Kích thước ảnh thẻ: {seg_meta.cropped_dimensions}\n"
                        f"Các dòng PaddleOCR-VL:\n{rows_text if rows_text else '(Không phát hiện được dòng chữ)'}"
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

        chat_url = f"{_get_ollama_base_url()}/api/chat"
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
        stage_timings_ms["llm_map_ms"] = llm_ms
        execution_time_ms = int(round(sum(stage_timings_ms.values())))
        raw_content = resp_data.get("message", {}).get("content", "")
        extracted_data = extract_json_from_text(raw_content)
        extracted_data = _postprocess_hybrid_extracted_data(extracted_data, ocr_lines)
        extracted_data.pop("bbox_2d", None)
        extracted_data.pop("document_bbox", None)
        extracted_data.pop("orientation_angle", None)

        seg_meta.pipeline_mode = "hybrid_paddle_vl"
        seg_meta.ocr_lines_count = len(ocr_lines)
        seg_meta.stage_timings_ms = stage_timings_ms

        detected_type = extracted_data.get("document_type", "identity_document")
        job_id = _generate_unique_job_id(db)
        now = utc_now()
        service_name = lic.service.name if lic.service else "ID Document & Passport OCR"
        owner_user_id = user.id if user else lic.user_id
        orig_rel_path, cropped_rel_path = _persist_job_images_to_disk(
            job_id,
            orig_url,
            cropped_url,
            orig_fallback=normalized_bytes,
            cropped_fallback=vlm_input_bytes,
        )
        image_access_token = secrets.token_urlsafe(24)

        # 6. Atomic Quota Deduction & Ledger Logging
        balance.used_quota += 1
        balance.remaining_quota = max(0, balance.total_quota - balance.used_quota)
        balance.updated_at = now

        rec = UsageRecord(
            license_id=lic.id,
            user_id=lic.user_id,
            service_id=lic.service_id,
            job_id=job_id,
            amount=1,
            quota_type=balance.quota_type or QuotaType.PAGE,
            unit_cost=1.0,
            created_at=now
        )
        db.add(rec)

        ledger = UsageLedger(
            license_id=lic.id,
            delta=-1,
            balance_after=balance.remaining_quota,
            entry_type=LedgerEntryType.DEBIT_USAGE,
            reference_type="job",
            reference_id=job_id,
            created_at=now
        )
        db.add(ledger)

        ext_lower = (file_name or "").lower()
        file_type = "PDF" if ext_lower.endswith(".pdf") else "IMAGE"
        job_record = OCRJobRecord(
            job_id=job_id,
            user_id=owner_user_id,
            license_id=lic.id,
            service_id=lic.service_id,
            service_name=service_name,
            file_name=file_name,
            file_size_bytes=len(image_bytes or b""),
            file_type=file_type,
            detected_type=detected_type,
            status="completed",
            confidence_score=99.2,
            execution_time_ms=execution_time_ms,
            extracted_data_json=json.dumps(extracted_data, ensure_ascii=False),
            segmentation_info_json=seg_meta.model_dump_json(),
            original_image_path=orig_rel_path,
            cropped_image_path=cropped_rel_path,
            image_access_token=image_access_token,
            created_at=now,
        )
        db.add(job_record)

        if api_key_secret_hash:
            used_cred = db.query(APICredential).filter(
                APICredential.secret_hash == api_key_secret_hash,
                APICredential.status == CredentialStatus.ACTIVE,
            ).first()
            if used_cred:
                used_cred.last_used_at = now

        db.commit()
        db.refresh(balance)

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
            created_at=now.isoformat()
        )

    @staticmethod
    def list_user_jobs(db: Session, user_id: str, limit: int = 100) -> List[OCRJobHistoryItem]:
        rows = (
            db.query(OCRJobRecord)
            .filter(OCRJobRecord.user_id == user_id)
            .order_by(OCRJobRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        storage_root = pathlib.Path(settings.OCR_STORAGE_DIR).resolve()
        items: List[OCRJobHistoryItem] = []
        for row in rows:
            extracted_data: Dict[str, Any] = {}
            if row.extracted_data_json:
                try:
                    parsed = json.loads(row.extracted_data_json)
                    if isinstance(parsed, dict):
                        extracted_data = parsed
                except Exception:
                    extracted_data = {}

            seg_info: Optional[SegmentationMetadata] = None
            if row.segmentation_info_json:
                try:
                    seg_info = SegmentationMetadata(**json.loads(row.segmentation_info_json))
                except Exception:
                    seg_info = None

            orig_url: Optional[str] = None
            if row.original_image_path:
                try:
                    p = (storage_root / row.original_image_path).resolve()
                    p.relative_to(storage_root)
                    if p.is_file():
                        orig_url = f"/api/v1/ocr/jobs/{row.job_id}/image/original?t={row.image_access_token}"
                except Exception:
                    orig_url = None

            cropped_url: Optional[str] = None
            if row.cropped_image_path:
                try:
                    p = (storage_root / row.cropped_image_path).resolve()
                    p.relative_to(storage_root)
                    if p.is_file():
                        cropped_url = f"/api/v1/ocr/jobs/{row.job_id}/image/cropped?t={row.image_access_token}"
                except Exception:
                    cropped_url = None

            items.append(
                OCRJobHistoryItem(
                    job_id=row.job_id,
                    status=row.status,
                    file_name=row.file_name,
                    file_size=_format_file_size(row.file_size_bytes or 0),
                    file_type=row.file_type or "IMAGE",
                    detected_type=row.detected_type or "identity_document",
                    service_id=row.service_id,
                    service_name=row.service_name or "ID Document & Passport OCR",
                    license_id=row.license_id,
                    confidence_score=row.confidence_score if row.confidence_score is not None else 99.2,
                    execution_time_ms=row.execution_time_ms or 0,
                    extracted_data=extracted_data,
                    original_image_url=orig_url,
                    cropped_image_url=cropped_url,
                    segmentation_info=seg_info,
                    created_at=row.created_at.isoformat() if row.created_at else utc_now().isoformat(),
                )
            )
        return items

    @staticmethod
    def resolve_job_image_path(
        db: Session,
        job_id: str,
        kind: str,
        access_token: Optional[str] = None,
        user: Optional[User] = None,
    ) -> pathlib.Path:
        if kind not in ("original", "cropped"):
            raise BadRequestException("Loại ảnh không hợp lệ (chỉ hỗ trợ 'original' hoặc 'cropped').")

        job = db.query(OCRJobRecord).filter(OCRJobRecord.job_id == job_id).first()
        if not job:
            raise EntityNotFoundException("OCRJob", job_id)

        token_ok = bool(
            access_token
            and job.image_access_token
            and hmac.compare_digest(access_token, job.image_access_token)
        )
        user_ok = bool(user and (user.id == job.user_id or user.role == UserRole.PLATFORM_ADMIN))
        if not (token_ok or user_ok):
            if user is None and not access_token:
                raise UnauthorizedException("Yêu cầu xác thực để truy cập hình ảnh OCR.")
            raise ForbiddenException("Bạn không có quyền truy cập hình ảnh của job này.")

        rel_path = job.original_image_path if kind == "original" else job.cropped_image_path
        if not rel_path:
            raise EntityNotFoundException("OCRJobImage", f"{job_id}/{kind}")

        storage_root = pathlib.Path(settings.OCR_STORAGE_DIR).resolve()
        target = (storage_root / rel_path).resolve()
        try:
            target.relative_to(storage_root)
        except ValueError:
            raise ForbiddenException("Đường dẫn ảnh không hợp lệ.")

        if not target.is_file():
            raise EntityNotFoundException("OCRJobImage", f"{job_id}/{kind}")
        return target
