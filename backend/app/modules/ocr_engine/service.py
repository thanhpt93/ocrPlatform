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
import unicodedata
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
_RAPIDOCR_REC_LOCK = threading.Lock()
_RAPIDOCR_REC: Any = None
_RAPIDOCR_REC_INIT_FAILED: bool = False

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
from app.modules.ocr_engine.vn_address_normalizer import normalize_vietnamese_address


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
    Validate and normalize image bytes to lossless RGB PNG using Pillow.
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
            img.save(out_buf, format="PNG")
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
    """Encode cropped/upright card image to lossless PNG bytes sized appropriately for VLM VRAM budget."""
    vlm_img = img.copy()
    if max_width and max_height:
        if vlm_img.size[0] > max_width or vlm_img.size[1] > max_height:
            vlm_img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    elif max_dimension > 0 and max(vlm_img.size) > max_dimension:
        vlm_img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    vlm_img.save(buf, format="PNG")
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


def _get_rapidocr_rec() -> Any:
    """Lazy-load thread-safe singleton RapidOCR text recognizer (CPU ONNX) for MRZ lines."""
    global _RAPIDOCR_REC, _RAPIDOCR_REC_INIT_FAILED
    if _RAPIDOCR_REC is not None:
        return _RAPIDOCR_REC
    if _RAPIDOCR_REC_INIT_FAILED:
        return None
    with _RAPIDOCR_REC_LOCK:
        if _RAPIDOCR_REC is not None:
            return _RAPIDOCR_REC
        if _RAPIDOCR_REC_INIT_FAILED:
            return None
        try:
            from rapidocr_onnxruntime import RapidOCR

            _RAPIDOCR_REC = RapidOCR(use_det=False, use_cls=False, use_rec=True)
            logger.info("Loaded RapidOCR TextRec ONNX model on CPU")
            return _RAPIDOCR_REC
        except Exception as exc:
            logger.warning("RapidOCR TextRec initialization failed: %s", exc)
            _RAPIDOCR_REC_INIT_FAILED = True
            return None


def _mrz_char_value(ch: str) -> int:
    if "0" <= ch <= "9":
        return ord(ch) - ord("0")
    if "A" <= ch <= "Z":
        return ord(ch) - ord("A") + 10
    return 0


def _mrz_check_digit(field: str) -> str:
    weights = (7, 3, 1)
    total = sum(_mrz_char_value(ch) * weights[idx % 3] for idx, ch in enumerate(field))
    return str(total % 10)


def _clean_mrz_line1(raw: str) -> Optional[str]:
    """Normalize ICAO 9303 TD3 MRZ line 1 (e.g., strip PaddleOCR-VL CJK '<' hallucinations and pad to 44)."""
    if not raw or not isinstance(raw, str):
        return None
    text = raw.strip().upper()
    m_start = re.search(r"[PVIAC]<[A-Z]{3}[A-Z0-9<]+", text)
    if not m_start:
        m_start = re.search(r"[A-Z]{3}[A-Z]+<<[A-Z0-9<]*", text)
    if not m_start:
        return None
    cand = m_start.group(0)
    m_valid = re.match(r"^[A-Z0-9<]+", cand)
    if not m_valid:
        return None
    core = m_valid.group(0).rstrip("<")
    if "<<" not in core or len(core) < 8:
        return None
    if re.match(r"^[PVIAC]<[A-Z]{3}", core):
        return core.ljust(44, "<")[:44]
    return core.ljust(max(len(core), 42), "<")[:44]


def _clean_mrz_line2(raw: str) -> Optional[str]:
    """Normalize ICAO 9303 TD3 MRZ line 2 and repair missing filler '<' chars using fixed-width structure."""
    if not raw or not isinstance(raw, str):
        return None
    compact = re.sub(r"\s+", "", raw.strip().upper())
    m_prefix = re.match(r"^[A-Z0-9<]+", compact)
    if not m_prefix:
        return None
    cand = m_prefix.group(0)
    m_td3 = re.match(
        r"^([A-Z0-9<]{6,10}?)([0-9O])([A-Z]{3})([0-9OI]{6})([0-9O])([MF<])([0-9OI]{6})([0-9O])([A-Z0-9<]*)$",
        cand,
    )
    if not m_td3:
        return cand if len(cand) >= 36 and re.search(r"[A-Z]{3}\d{6}", cand) else None

    pp_field, chk1, country, dob, chk2, sex, exp, chk3, tail = m_td3.groups()
    fix_num = lambda s: s.replace("O", "0").replace("I", "1")
    chk1 = fix_num(chk1)
    dob = fix_num(dob)
    chk2 = fix_num(chk2)
    exp = fix_num(exp)
    chk3 = fix_num(chk3)

    if len(pp_field) < 9:
        padded_pp = pp_field.ljust(9, "<")
        if _mrz_check_digit(padded_pp) == chk1 or pp_field[0].isalpha():
            pp_field = padded_pp
    elif len(pp_field) > 9:
        pp_field = pp_field[:9]

    if len(pp_field) == 9 and len(tail) >= 2 and re.fullmatch(r"[0-9OI]{2}", tail[-2:]):
        tail_chk = fix_num(tail[-2:])
        tail_body = tail[:-2]
        if len(tail_body) <= 14:
            tail = tail_body.ljust(14, "<") + tail_chk
        else:
            tail = tail_body[:14] + tail_chk

    return f"{pp_field}{chk1}{country}{dob}{chk2}{sex}{exp}{chk3}{tail}"


def _parse_mrz_fields(mrz1: Optional[str], mrz2: Optional[str]) -> Dict[str, Any]:
    """Extract validated fields from TD3 MRZ lines."""
    out: Dict[str, Any] = {}
    if mrz1:
        m1 = re.match(r"^([PVIAC])<([A-Z]{3})", mrz1)
        if m1:
            out["passport_type"] = m1.group(1)
            out["country_code"] = m1.group(2)
            name_raw = m1.string[m1.end():]
            name_trimmed = name_raw.rstrip("<")
            parts = [p.replace("<", " ").strip() for p in name_trimmed.split("<<") if p.replace("<", " ").strip()]
            name_tokens = [tok for part in parts for tok in part.split() if tok]
            if len(name_tokens) >= 2:
                out["full_name_tokens"] = name_tokens
                out["full_name_truncated"] = not mrz1.endswith("<")
    if mrz2:
        m2 = re.match(
            r"^([A-Z0-9<]{7,9})([0-9])([A-Z]{3})(\d{6})(\d)([MF<])(\d{6})(\d)([A-Z0-9<]{0,14})(\d)?(\d)?$",
            mrz2,
        )
        if m2:
            pp_raw, chk1, country, dob, chk2, sex, exp, chk3, opt, _chk4, _chk5 = m2.groups()
            pp_clean = pp_raw.replace("<", "").strip()
            if pp_clean and (
                (len(pp_raw) == 9 and _mrz_check_digit(pp_raw) == chk1)
                or re.match(r"^[A-Z]{1,2}\d{6,8}$", pp_clean)
            ):
                out["passport_number"] = pp_clean
            out["country_code"] = country
            if sex == "M":
                out["gender"] = "Nam"
            elif sex == "F":
                out["gender"] = "Nữ"
            out["dob_yymmdd"] = dob
            out["exp_yymmdd"] = exp
            opt_clean = (opt or "").replace("<", "").strip()
            if opt_clean and opt_clean.isdigit() and len(opt_clean) >= 9:
                out["id_card_number"] = opt_clean
    return out


def _group_ocr_rows_y_center(lines: List[Dict[str, Any]], row_tolerance_px: float = 14.0) -> List[List[Dict[str, Any]]]:
    """Group OCR boxes into horizontal visual rows by y-center and sort left-to-right."""
    if not lines:
        return []
    heights = sorted(max(1, int(it["bbox"][3]) - int(it["bbox"][1])) for it in lines)
    median_h = heights[len(heights) // 2] if heights else 24
    eff_tol = min(float(row_tolerance_px), max(7.0, 0.44 * float(median_h)))

    indexed = []
    for item in lines:
        x1, y1, x2, y2 = item["bbox"]
        yc = (y1 + y2) / 2.0
        indexed.append((yc, x1, item))
    indexed.sort(key=lambda t: t[0])

    rows: List[Tuple[float, List[Tuple[int, Dict[str, Any]]]]] = []
    for yc, x1, item in indexed:
        ix1, iy1, ix2, iy2 = item["bbox"]
        iw = max(1, ix2 - ix1)
        ih = max(1, iy2 - iy1)
        placed = False
        for r_idx in range(len(rows) - 1, -1, -1):
            r_yc, row_items = rows[r_idx]
            if abs(yc - r_yc) > eff_tol:
                if r_yc < yc - eff_tol * 1.5:
                    break
                continue
            conflict = False
            for _, existing_it in row_items:
                rx1, ry1, rx2, ry2 = existing_it["bbox"]
                rw = max(1, rx2 - rx1)
                rh = max(1, ry2 - ry1)
                ryc = (ry1 + ry2) / 2.0
                overlap_x = min(ix2, rx2) - max(ix1, rx1)
                if overlap_x >= 0.35 * min(iw, rw) and abs(yc - ryc) >= 0.45 * min(ih, rh):
                    conflict = True
                    break
            if not conflict:
                row_items.append((x1, item))
                avg_yc = sum((it[1]["bbox"][1] + it[1]["bbox"][3]) / 2.0 for it in row_items) / len(row_items)
                rows[r_idx] = (avg_yc, row_items)
                placed = True
                break
        if not placed:
            rows.append((yc, [(x1, item)]))

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
        box_h = max(1, int(round(float(pts[:, 1].max() - pts[:, 1].min()))))
        pad_x = max(3, box_pad_px)
        pad_y = min(10, max(5, int(round(box_h * 0.14))))
        x1 = max(0, int(pts[:, 0].min()) - pad_x)
        y1 = max(0, int(pts[:, 1].min()) - pad_y)
        x2 = min(w, int(pts[:, 0].max()) + pad_x)
        y2 = min(h, int(pts[:, 1].max()) + pad_y)
        if x2 - x1 < 4 or y2 - y1 < 4:
            continue
        raw_items.append({"bbox": [x1, y1, x2, y2], "crop_rgb": img_bgr[y1:y2, x1:x2, ::-1]})
    return img_bgr, raw_items, det_ms


def _enhance_row_for_ocr(
    canvas_rgb: np.ndarray,
    orig_row_height: int,
    force_enhance: bool = False,
    lap_var: Optional[float] = None,
) -> Tuple[np.ndarray, float, bool]:
    """
    Detect blurry or low-resolution row images via Laplacian variance / row height
    and apply adaptive CLAHE luminance contrast + Unsharp Masking for sharper glyphs.
    Returns (processed_rgb, laplacian_variance, enhanced_applied).
    """
    if cv2 is None or canvas_rgb is None or canvas_rgb.size == 0:
        return canvas_rgb, 0.0, False

    gray = cv2.cvtColor(canvas_rgb, cv2.COLOR_RGB2GRAY)
    measured_lap = float(lap_var) if lap_var is not None else float(cv2.Laplacian(gray, cv2.CV_64F).var())
    needs_enhance = bool(force_enhance or orig_row_height < 32 or measured_lap < 220.0)
    if not needs_enhance or float(np.std(gray)) <= 2.0:
        return canvas_rgb, round(measured_lap, 2), False

    lab = cv2.cvtColor(canvas_rgb, cv2.COLOR_RGB2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(
        clipLimit=2.2 if force_enhance else 1.8,
        tileGridSize=(8, 4),
    )
    l_clahe = clahe.apply(l_chan)
    l_out = cv2.addWeighted(l_clahe, 0.70, l_chan, 0.30, 0)
    enhanced = cv2.cvtColor(cv2.merge((l_out, a_chan, b_chan)), cv2.COLOR_LAB2RGB)

    sigma = 1.2 if (force_enhance or measured_lap < 120.0) else 0.9
    amount = 1.55 if force_enhance else (1.45 if measured_lap < 140.0 else 1.25)
    blurred = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=sigma)
    sharpened = cv2.addWeighted(enhanced, 1.0 + amount, blurred, -amount, 0)
    return sharpened, round(measured_lap, 2), True


def _build_paddleocr_vl_row_canvas(
    row: List[Dict[str, Any]],
    min_row_height: int = 48,
    gap_x: int = 14,
    force_enhance: bool = False,
) -> np.ndarray:
    """Concatenate horizontal boxes in one row onto a white canvas, upscale small/blurry rows, and enhance."""
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

    lap_var: Optional[float] = None
    if cv2 is not None and canvas.size > 0:
        gray_orig = cv2.cvtColor(canvas, cv2.COLOR_RGB2GRAY)
        lap_var = float(cv2.Laplacian(gray_orig, cv2.CV_64F).var())

    target_h = min_row_height
    if rh < 32 or force_enhance or (lap_var is not None and lap_var < 220.0):
        target_h = max(target_h, 56)

    if 0 < rh < target_h:
        scale = float(target_h) / float(rh)
        new_w = max(1, int(round(rw * scale)))
        if cv2 is not None:
            canvas = cv2.resize(canvas, (new_w, target_h), interpolation=cv2.INTER_CUBIC)
        else:
            canvas = np.asarray(
                Image.fromarray(canvas).resize((new_w, target_h), Image.Resampling.BICUBIC),
                dtype=np.uint8,
            )

    canvas, _, _ = _enhance_row_for_ocr(
        canvas,
        orig_row_height=rh,
        force_enhance=force_enhance,
        lap_var=lap_var,
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


def _extract_token_probs(logprobs: Any) -> List[Tuple[str, float]]:
    """Extract list of (token_text, probability_percent) from Ollama logprobs."""
    if not isinstance(logprobs, list) or not logprobs:
        return []
    out: List[Tuple[str, float]] = []
    for entry in logprobs:
        if not isinstance(entry, dict):
            continue
        lp = entry.get("logprob")
        if lp is None or isinstance(lp, bool):
            continue
        try:
            lp_f = float(lp)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(lp_f):
            continue
        prob_pct = min(1.0, max(0.0, math.exp(min(0.0, lp_f)))) * 100.0
        out.append((str(entry.get("token") or ""), prob_pct))
    return out


def _compute_confidence_from_logprobs(
    logprobs: Any,
    ignore_newline_only: bool = True,
) -> Tuple[Optional[float], int]:
    """
    Compute mean token probability (%) in [0.0, 100.0] from Ollama logprobs array.
    Returns (confidence_percent_or_None, token_count).
    """
    if not isinstance(logprobs, list) or not logprobs:
        return None, 0

    probs: List[float] = []
    for entry in logprobs:
        if not isinstance(entry, dict):
            continue
        lp = entry.get("logprob")
        if lp is None or isinstance(lp, bool):
            continue
        try:
            lp_f = float(lp)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(lp_f):
            continue
        tok = str(entry.get("token") or "")
        if ignore_newline_only and tok and tok.strip("\r\n") == "":
            continue
        prob = min(1.0, max(0.0, math.exp(min(0.0, lp_f))))
        probs.append(prob)

    if not probs:
        return None, 0
    return round((sum(probs) / len(probs)) * 100.0, 2), len(probs)


def _split_logprobs_by_nonempty_lines(logprobs: Any) -> List[Tuple[float, int]]:
    """
    Group Ollama token logprobs into non-empty text lines (matching `[ln.strip() for ln in raw.splitlines() if ln.strip()]`).
    Returns list of (mean_line_confidence_pct, token_count) per non-empty line.
    """
    if not isinstance(logprobs, list) or not logprobs:
        return []

    lines_probs: List[List[float]] = []
    cur_probs: List[float] = []
    cur_has_text = False

    for entry in logprobs:
        if not isinstance(entry, dict):
            continue
        lp = entry.get("logprob")
        if lp is None or isinstance(lp, bool):
            continue
        try:
            lp_f = float(lp)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(lp_f):
            continue
        prob = min(1.0, max(0.0, math.exp(min(0.0, lp_f))))
        tok = str(entry.get("token") or "")

        if "\n" in tok:
            parts = tok.split("\n")
            for i, part in enumerate(parts):
                if part.strip():
                    cur_probs.append(prob)
                    cur_has_text = True
                if i < len(parts) - 1:
                    if cur_has_text and cur_probs:
                        lines_probs.append(cur_probs)
                    cur_probs = []
                    cur_has_text = False
        else:
            if tok.strip():
                cur_has_text = True
            cur_probs.append(prob)

    if cur_has_text and cur_probs:
        lines_probs.append(cur_probs)

    return [
        (round((sum(p) / len(p)) * 100.0, 2), len(p))
        for p in lines_probs
        if p
    ]


def _split_token_probs_by_nonempty_lines(logprobs: Any) -> List[List[Tuple[str, float]]]:
    """
    Group (token_text, prob_pct) pairs into non-empty lines matching
    `[ln.strip() for ln in raw.splitlines() if ln.strip()]`.
    """
    tok_probs = _extract_token_probs(logprobs)
    if not tok_probs:
        return []

    lines_tokens: List[List[Tuple[str, float]]] = []
    cur_tokens: List[Tuple[str, float]] = []
    cur_has_text = False

    for tok, prob_pct in tok_probs:
        if "\n" in tok:
            parts = tok.split("\n")
            for i, part in enumerate(parts):
                clean_part = part.replace("\r", "")
                if clean_part:
                    cur_tokens.append((clean_part, prob_pct))
                    if clean_part.strip():
                        cur_has_text = True
                if i < len(parts) - 1:
                    if cur_has_text and cur_tokens:
                        lines_tokens.append(cur_tokens)
                    cur_tokens = []
                    cur_has_text = False
        else:
            clean_tok = tok.replace("\r", "")
            if clean_tok:
                cur_tokens.append((clean_tok, prob_pct))
                if clean_tok.strip():
                    cur_has_text = True

    if cur_has_text and cur_tokens:
        lines_tokens.append(cur_tokens)

    return lines_tokens


def _strip_accents_lower(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "d")
    decomposed = unicodedata.normalize("NFD", text.casefold())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _build_ocr_char_prob_map(ocr_lines: List[Dict[str, Any]]) -> Tuple[str, List[Optional[float]]]:
    """
    Build concatenated OCR text and aligned per-character probability (%) list
    from PaddleOCR-VL lines (`tokens` preferred, line `confidence` fallback).
    """
    full_chars: List[str] = []
    full_probs: List[Optional[float]] = []

    for line_idx, it in enumerate(ocr_lines):
        if not isinstance(it, dict):
            continue
        line_text = str(it.get("text") or "")
        if not line_text:
            continue
        if full_chars:
            full_chars.append("\n")
            full_probs.append(None)

        tok_list = it.get("tokens")
        matched_tokens = False
        if isinstance(tok_list, list) and tok_list:
            raw_chars: List[str] = []
            raw_probs: List[float] = []
            for tok_item in tok_list:
                if isinstance(tok_item, (tuple, list)) and len(tok_item) == 2:
                    t_str, p_val = str(tok_item[0]), float(tok_item[1])
                    for ch in t_str:
                        raw_chars.append(ch)
                        raw_probs.append(p_val)
            joined = "".join(raw_chars)
            l_trim = len(joined) - len(joined.lstrip())
            r_trim = len(joined.rstrip())
            if joined[l_trim:r_trim] == line_text:
                full_chars.extend(raw_chars[l_trim:r_trim])
                full_probs.extend(raw_probs[l_trim:r_trim])
                matched_tokens = True

        if not matched_tokens:
            line_conf = it.get("confidence")
            c_val = float(line_conf) if line_conf is not None else None
            for ch in line_text:
                full_chars.append(ch)
                full_probs.append(c_val)

    return "".join(full_chars), full_probs


def _collapse_ws_with_map(text: str, strip_accents: bool = False) -> Tuple[str, List[int]]:
    """Collapse whitespace runs to single space and keep index mapping back to `text`."""
    out_chars: List[str] = []
    idx_map: List[int] = []
    in_ws = False
    for orig_idx, ch in enumerate(text):
        if ch.isspace():
            if out_chars and not in_ws:
                out_chars.append(" ")
                idx_map.append(orig_idx)
            in_ws = True
        else:
            in_ws = False
            norm_ch = _strip_accents_lower(ch) if strip_accents else ch.casefold()
            for nc in norm_ch:
                out_chars.append(nc)
                idx_map.append(orig_idx)
    if out_chars and out_chars[-1] == " ":
        out_chars.pop()
        idx_map.pop()
    return "".join(out_chars), idx_map


def _match_value_ocr_confidence(
    val_str: str,
    norm_text: str,
    norm_map: List[int],
    ascii_text: str,
    ascii_map: List[int],
    full_probs: List[Optional[float]],
) -> Optional[float]:
    """Locate `val_str` (exact -> comma chunks -> word tokens) in OCR text and average char probabilities."""
    def _span_probs(start: int, length: int, idx_map: List[int]) -> List[float]:
        seen_orig = set()
        vals: List[float] = []
        for pos in range(start, start + length):
            if pos < len(idx_map):
                oi = idx_map[pos]
                if oi not in seen_orig:
                    seen_orig.add(oi)
                    p = full_probs[oi] if oi < len(full_probs) else None
                    if p is not None:
                        vals.append(p)
        return vals

    def _find_query(query: str, text_buf: str, idx_map: List[int]) -> List[float]:
        if not query or not text_buf:
            return []
        pattern = r"(?:^|(?<=[\s:;,/\-\"'(]))" + re.escape(query) + r"(?=$|[\s:;,/\-\"')\.])"
        m = re.search(pattern, text_buf)
        if m:
            return _span_probs(m.start(), len(query), idx_map)
        pos = text_buf.find(query)
        if pos != -1:
            return _span_probs(pos, len(query), idx_map)
        return []

    q_norm = " ".join(val_str.split()).casefold()
    if not q_norm:
        return None

    direct = _find_query(q_norm, norm_text, norm_map)
    if direct:
        return round(sum(direct) / len(direct), 2)

    # Multi-line / comma-joined values (e.g., residence_address across 2 lines)
    chunks = [c.strip() for c in re.split(r"[,;]+", val_str) if c.strip()]
    collected: List[float] = []
    for ch in chunks:
        ch_norm = " ".join(ch.split()).casefold()
        res = _find_query(ch_norm, norm_text, norm_map)
        if not res:
            for word in ch_norm.split():
                if len(word) >= 2 or word.isdigit():
                    w_res = _find_query(word, norm_text, norm_map)
                    if not w_res:
                        w_ascii = _strip_accents_lower(word)
                        w_res = _find_query(w_ascii, ascii_text, ascii_map)
                    collected.extend(w_res)
        else:
            collected.extend(res)

    if not collected:
        q_ascii = _strip_accents_lower(" ".join(val_str.split()))
        collected = _find_query(q_ascii, ascii_text, ascii_map)

    if not collected:
        return None
    return round(sum(collected) / len(collected), 2)


def _extract_llm_field_confidences(logprobs: Any) -> Dict[str, float]:
    """
    Parse JSON key-value spans from Ollama LLM logprobs and return mean token
    probability (%) per extracted field value (excluding JSON punctuation/keys).
    """
    tok_probs = _extract_token_probs(logprobs)
    if not tok_probs:
        return {}

    concat = "".join(t for t, _ in tok_probs)
    char_probs: List[float] = []
    for t, p in tok_probs:
        if t:
            char_probs.extend([p] * len(t))

    start_brace = concat.find("{")
    if start_brace == -1 or len(char_probs) != len(concat):
        return {}

    decoder = json.JSONDecoder()
    pos = start_brace + 1
    n = len(concat)
    field_confs: Dict[str, float] = {}
    try:
        while pos < n:
            while pos < n and concat[pos] in " \t\r\n,":
                pos += 1
            if pos >= n or concat[pos] == "}":
                break
            if concat[pos] != '"':
                break
            key, pos = decoder.raw_decode(concat, pos)
            while pos < n and concat[pos] in " \t\r\n:":
                pos += 1
            if pos >= n:
                break
            val_start = pos
            val_obj, val_end = decoder.raw_decode(concat, pos)
            pos = val_end
            if val_obj is None or val_obj == "" or val_obj == []:
                continue
            span_start, span_end = val_start, val_end
            if isinstance(val_obj, str) and val_end - val_start >= 2 and concat[val_start] == '"' and concat[val_end - 1] == '"':
                span_start += 1
                span_end -= 1
            span = char_probs[span_start:span_end]
            if span:
                field_confs[str(key)] = round(sum(span) / len(span), 2)
    except (ValueError, json.JSONDecodeError):
        return field_confs
    return field_confs


def _call_paddleocr_vl_ollama(
    img_pil: Image.Image,
    model_name: str,
    num_predict: int = 256,
    _meta_out: Optional[Dict[str, Any]] = None,
    repeat_penalty: float = 1.08,
) -> str:
    """Invoke PaddleOCR-VL-Vi model via Ollama /api/chat with lossless PNG and deterministic OCR decoding."""
    buf = io.BytesIO()
    img_pil.save(buf, format="PNG")
    b64_img = base64.b64encode(buf.getvalue()).decode("utf-8")

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": "OCR:", "images": [b64_img]}],
        "stream": False,
        "logprobs": True,
        "options": {
            "temperature": 0.0,
            "top_k": 1,
            "top_p": 1.0,
            "repeat_penalty": repeat_penalty,
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
    if isinstance(_meta_out, dict):
        conf, tok_cnt = _compute_confidence_from_logprobs(data.get("logprobs"))
        _meta_out["confidence"] = conf
        _meta_out["token_count"] = tok_cnt
        _meta_out["logprobs"] = data.get("logprobs")
    return str(data.get("message", {}).get("content", "") or "").strip()


def _find_suspicious_id_line_index(lines: List[str]) -> Optional[int]:
    """
    Detect whether the strip output already contains a clean 9-digit or 12-digit ID number,
    or whether an ID line in the top region looks corrupted (e.g. '3520228/6' or 8 digits)
    so a targeted 1-row retry can recover the exact digit sequence.
    """
    top_lines = lines[:6]
    top_joined = "\n".join(top_lines).lower()
    if any(cue in top_joined for cue in ("hộ chiếu", "hồ chiêu", "passport", "mã số / code")):
        return None

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


def _has_ocr_repetition_collapse(lines: List[str]) -> bool:
    """
    Detect VLM decoding collapse where a phrase/token repeats continuously on one line
    (e.g. 'Thanh Hóa, Thành Hóa, Thành Hóa, ...') until hitting num_predict.
    """
    for ln in lines:
        if len(ln) < 60:
            continue
        chunks = [c.strip().casefold() for c in ln.split(",") if c.strip()]
        if len(chunks) >= 5:
            from collections import Counter
            most_common_cnt = Counter(chunks).most_common(1)[0][1]
            if most_common_cnt >= 4:
                return True
        words = [w.casefold() for w in re.findall(r"[0-9A-Za-zÀ-ỹ]+", ln)]
        if len(words) >= 12 and (len(set(words)) / float(len(words))) < 0.45:
            return True
    return False


def _ocr_single_row_paddleocr_vl(
    row: List[Dict[str, Any]],
    model_name: str,
    min_row_height: int,
    num_predict: int = 96,
    repeat_penalty: float = 1.08,
) -> Tuple[str, Optional[float], int, Optional[List[Tuple[str, float]]]]:
    """Run enhanced single-row PaddleOCR-VL recognition and return (text, conf, tok_cnt, tokens)."""
    row_canvas = _build_paddleocr_vl_row_canvas(
        row,
        min_row_height=min_row_height,
        force_enhance=True,
    )
    margin = 14
    padded_row = np.full(
        (row_canvas.shape[0] + margin * 2, row_canvas.shape[1] + margin * 2, 3),
        255,
        dtype=np.uint8,
    )
    padded_row[margin:margin + row_canvas.shape[0], margin:margin + row_canvas.shape[1]] = row_canvas
    meta: Dict[str, Any] = {}
    txt = _call_paddleocr_vl_ollama(
        Image.fromarray(padded_row),
        model_name,
        num_predict=num_predict,
        _meta_out=meta,
        repeat_penalty=repeat_penalty,
    )
    clean = " ".join(txt.splitlines()).strip()
    conf = meta.get("confidence")
    tok_cnt = int(meta.get("token_count") or (1 if conf is not None else 0))
    tokens = _extract_token_probs(meta.get("logprobs")) or None
    return clean, (float(conf) if conf is not None else None), tok_cnt, tokens


def _recognize_mrz_line2_row(
    row: List[Dict[str, Any]],
    paddle_model: str,
    min_row_height: int,
) -> Tuple[Optional[str], Optional[float], int, Optional[List[Tuple[str, float]]]]:
    """
    Recognize bottom passport MRZ line 2 cleanly via RapidOCR TextRec (~30ms CPU),
    falling back to PaddleOCR-VL (repeat_penalty=1.0) only if needed.
    """
    rec = _get_rapidocr_rec()
    if rec is not None:
        try:
            canvas = _build_paddleocr_vl_row_canvas(row, min_row_height=48, force_enhance=False)
            res, _ = rec(canvas[:, :, ::-1])
            if res and isinstance(res, list) and len(res[0]) >= 2:
                raw_txt = str(res[0][0] or "").strip()
                score_pct = round(min(1.0, max(0.0, float(res[0][1]))) * 100.0, 2)
                cleaned = _clean_mrz_line2(raw_txt)
                if cleaned and len(cleaned) >= 36:
                    tok_cnt = max(1, len(cleaned) // 3)
                    return cleaned, score_pct, tok_cnt, [(cleaned, score_pct)]
        except Exception as exc:
            logger.debug("RapidOCR MRZ line 2 recognition error: %s", exc)

    try:
        p_txt, p_conf, p_cnt, p_toks = _ocr_single_row_paddleocr_vl(
            row,
            paddle_model,
            min_row_height=max(64, min_row_height),
            num_predict=128,
            repeat_penalty=1.0,
        )
        cleaned = _clean_mrz_line2(p_txt)
        if cleaned:
            return cleaned, p_conf, p_cnt, p_toks
        if p_txt:
            return p_txt, p_conf, p_cnt, p_toks
    except Exception as exc:
        logger.debug("PaddleOCR-VL MRZ line 2 fallback error: %s", exc)
    return None, None, 0, None


def _extract_text_lines_paddleocr_vl(
    image_bytes: bytes,
    paddle_model: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], float, float]:
    """
    Run RapidOCR DBNet text detection + stacked strip recognition (auto-chunked when >9 rows
    to prevent VLM repetition collapse) with Vietnamese fine-tuned PaddleOCR-VL (Ollama).
    Automatically falls back per-row on chunk collapse and refines corrupted ID / low-confidence rows.
    Returns (lines, det_ms, paddleocr_vl_ms).
    """
    effective_paddle_model = (paddle_model or getattr(settings, "PADDLEOCR_VL_MODEL", "paddleocr-vl-vi")).strip()
    min_row_h = int(getattr(settings, "PADDLEOCR_VL_STRIP_MIN_ROW_HEIGHT", 48) or 48)

    img_bgr, raw_items, det_ms = _detect_text_boxes_bgr(image_bytes, box_pad_px=3)
    h, w = img_bgr.shape[:2]
    rows = _sort_ocr_lines_y_center(raw_items, img_width=w, img_height=h)

    t_ocr0 = time.perf_counter()
    parsed_lines: List[str] = []
    line_confs: List[Optional[float]] = []
    line_tok_counts: List[int] = []
    line_tokens: List[Optional[List[Tuple[str, float]]]] = []
    line_source_rows: List[Optional[List[Dict[str, Any]]]] = []

    if rows:
        if len(rows) <= 9:
            row_chunks = [rows]
        else:
            num_chunks = math.ceil(len(rows) / 8)
            chunk_size = math.ceil(len(rows) / num_chunks)
            row_chunks = [rows[i:i + chunk_size] for i in range(0, len(rows), chunk_size)]

        for chunk_rows in row_chunks:
            chunk_meta: Dict[str, Any] = {}
            strip_pil = _build_paddleocr_vl_strip_image(chunk_rows, min_row_height=min_row_h)
            raw_text = _call_paddleocr_vl_ollama(
                strip_pil,
                effective_paddle_model,
                num_predict=256,
                _meta_out=chunk_meta,
            )
            c_lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

            # Detect repetition collapse or severe line drop in chunk -> recover row-by-row
            collapsed = _has_ocr_repetition_collapse(c_lines) or (
                len(chunk_rows) >= 4 and len(c_lines) <= len(chunk_rows) - 3
            )
            if collapsed:
                for single_row in chunk_rows:
                    try:
                        s_txt, s_conf, s_cnt, s_toks = _ocr_single_row_paddleocr_vl(
                            single_row,
                            effective_paddle_model,
                            min_row_height=max(64, min_row_h),
                            num_predict=96,
                        )
                        if s_txt:
                            parsed_lines.append(s_txt)
                            line_confs.append(s_conf)
                            line_tok_counts.append(s_cnt)
                            line_tokens.append(s_toks)
                            line_source_rows.append(single_row)
                    except Exception as exc:
                        logger.debug("PaddleOCR-VL collapse per-row fallback error: %s", exc)
                continue

            c_overall_conf: Optional[float] = chunk_meta.get("confidence")
            c_overall_tok: int = int(chunk_meta.get("token_count") or 0)
            c_confs: List[Optional[float]] = [c_overall_conf] * len(c_lines)
            c_tok_counts: List[int] = (
                [max(1, c_overall_tok // max(1, len(c_lines)))] * len(c_lines)
                if c_overall_conf is not None
                else [0] * len(c_lines)
            )
            split_stats = _split_logprobs_by_nonempty_lines(chunk_meta.get("logprobs"))
            if c_lines and len(split_stats) == len(c_lines):
                c_confs = [c for c, _ in split_stats]
                c_tok_counts = [cnt for _, cnt in split_stats]

            c_tokens: List[Optional[List[Tuple[str, float]]]] = [None] * len(c_lines)
            split_toks = _split_token_probs_by_nonempty_lines(chunk_meta.get("logprobs"))
            if c_lines and len(split_toks) == len(c_lines):
                c_tokens = split_toks

            aligned = len(c_lines) == len(chunk_rows)
            for idx_in_chunk, ln in enumerate(c_lines):
                parsed_lines.append(ln)
                line_confs.append(c_confs[idx_in_chunk])
                line_tok_counts.append(c_tok_counts[idx_in_chunk])
                line_tokens.append(c_tokens[idx_in_chunk])
                line_source_rows.append(chunk_rows[idx_in_chunk] if aligned else None)
    else:
        ocr_meta: Dict[str, Any] = {}
        full_pil = Image.fromarray(img_bgr[:, :, ::-1])
        raw_text = _call_paddleocr_vl_ollama(full_pil, effective_paddle_model, num_predict=256, _meta_out=ocr_meta)
        parsed_lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
        overall_conf: Optional[float] = ocr_meta.get("confidence")
        overall_tok_cnt: int = int(ocr_meta.get("token_count") or 0)
        line_confs = [overall_conf] * len(parsed_lines)
        line_tok_counts = (
            [max(1, overall_tok_cnt // max(1, len(parsed_lines)))] * len(parsed_lines)
            if overall_conf is not None
            else [0] * len(parsed_lines)
        )
        split_line_stats = _split_logprobs_by_nonempty_lines(ocr_meta.get("logprobs"))
        if parsed_lines and len(split_line_stats) == len(parsed_lines):
            line_confs = [c for c, _ in split_line_stats]
            line_tok_counts = [cnt for _, cnt in split_line_stats]
        line_tokens = [None] * len(parsed_lines)
        split_tokens = _split_token_probs_by_nonempty_lines(ocr_meta.get("logprobs"))
        if parsed_lines and len(split_tokens) == len(parsed_lines):
            line_tokens = split_tokens
        line_source_rows = [None] * len(parsed_lines)

    # Targeted 1-row retry ONLY if ID line on CMND/CCCD looks corrupted (e.g., red watermark '3520228/6')
    suspect_idx = _find_suspicious_id_line_index(parsed_lines)
    if suspect_idx is not None and rows:
        candidate_row: Optional[List[Dict[str, Any]]] = (
            line_source_rows[suspect_idx] if suspect_idx < len(line_source_rows) else None
        )
        if candidate_row is None:
            # Locate the row in upper-middle band (18%..48% height) matching suspect position
            upper_rows = [
                r for r in rows
                if 0.18 * h <= sum((it["bbox"][1] + it["bbox"][3]) / 2.0 for it in r) / len(r) <= 0.48 * h
            ]
            if upper_rows:
                if suspect_idx < len(rows) and rows[suspect_idx] in upper_rows:
                    candidate_row = rows[suspect_idx]
                else:
                    candidate_row = upper_rows[-1]

        if candidate_row:
            try:
                refined_clean, refine_conf, refine_tok_cnt, refine_toks = _ocr_single_row_paddleocr_vl(
                    candidate_row,
                    effective_paddle_model,
                    min_row_height=max(72, min_row_h),
                    num_predict=64,
                )
                if re.search(r"(?<!\d)(?:\d{9}|\d{12})(?!\d)", refined_clean):
                    parsed_lines[suspect_idx] = refined_clean
                    if refine_conf is not None:
                        line_confs[suspect_idx] = refine_conf
                        line_tok_counts[suspect_idx] = refine_tok_cnt
                        line_tokens[suspect_idx] = refine_toks
            except Exception as exc:
                logger.debug("PaddleOCR-VL ID-row refinement skipped: %s", exc)

    # Passport MRZ recovery: PaddleOCR-VL multi-row strips with repeat_penalty=1.08 often
    # turn trailing '<<<' into CJK chars and drop MRZ line 2 completely. Recover & normalize
    # both MRZ lines cleanly when passport/MRZ cues + bottom 2 wide rows are present.
    mrz_protected_indices = set()
    if rows and len(rows) >= 8 and parsed_lines:
        joined_low = "\n".join(parsed_lines).lower()
        has_passport_or_mrz_cue = any(
            cue in joined_low
            for cue in ("passport", "hộ chiếu", "hồ chiêu", "hộ chiêu", "xuất nhập cảnh", "p<", "<<")
        )
        r_mrz1, r_mrz2 = rows[-2], rows[-1]
        x1_1 = min(it["bbox"][0] for it in r_mrz1)
        y1_1 = min(it["bbox"][1] for it in r_mrz1)
        x2_1 = max(it["bbox"][2] for it in r_mrz1)
        y2_1 = max(it["bbox"][3] for it in r_mrz1)
        x1_2 = min(it["bbox"][0] for it in r_mrz2)
        y1_2 = min(it["bbox"][1] for it in r_mrz2)
        x2_2 = max(it["bbox"][2] for it in r_mrz2)
        y2_2 = max(it["bbox"][3] for it in r_mrz2)
        yc_1 = (y1_1 + y2_1) / 2.0
        yc_2 = (y1_2 + y2_2) / 2.0
        is_bottom_wide_pair = (
            yc_1 >= 0.60 * h
            and yc_2 > yc_1
            and (yc_2 - yc_1) <= 0.18 * h
            and (x2_1 - x1_1) >= 0.40 * w
            and (x2_2 - x1_2) >= 0.40 * w
        )
        if has_passport_or_mrz_cue and is_bottom_wide_pair:
            mrz1_idx: Optional[int] = None
            mrz2_idx: Optional[int] = None
            for idx in range(max(0, len(parsed_lines) - 3), len(parsed_lines)):
                ln = parsed_lines[idx]
                if _clean_mrz_line2(ln):
                    mrz2_idx = idx
                elif _clean_mrz_line1(ln) or "<<" in ln or ln.upper().startswith("P<"):
                    mrz1_idx = idx

            # Ensure MRZ line 1 is clean 44-char ICAO string
            cleaned_mrz1 = _clean_mrz_line1(parsed_lines[mrz1_idx]) if mrz1_idx is not None else None
            if cleaned_mrz1 and mrz1_idx is not None:
                parsed_lines[mrz1_idx] = cleaned_mrz1
                mrz_protected_indices.add(mrz1_idx)
            else:
                try:
                    m1_txt, m1_conf, m1_cnt, m1_toks = _ocr_single_row_paddleocr_vl(
                        r_mrz1,
                        effective_paddle_model,
                        min_row_height=max(64, min_row_h),
                        num_predict=128,
                        repeat_penalty=1.0,
                    )
                    m1_norm = _clean_mrz_line1(m1_txt) or m1_txt
                    if m1_norm:
                        if mrz1_idx is not None:
                            parsed_lines[mrz1_idx] = m1_norm
                            line_confs[mrz1_idx] = m1_conf
                            line_tok_counts[mrz1_idx] = m1_cnt
                            line_tokens[mrz1_idx] = m1_toks
                            mrz_protected_indices.add(mrz1_idx)
                        else:
                            parsed_lines.append(m1_norm)
                            line_confs.append(m1_conf)
                            line_tok_counts.append(m1_cnt)
                            line_tokens.append(m1_toks)
                            line_source_rows.append(r_mrz1)
                            mrz_protected_indices.add(len(parsed_lines) - 1)
                except Exception as exc:
                    logger.debug("MRZ line 1 recovery skipped: %s", exc)

            # Ensure MRZ line 2 is present and clean
            existing_mrz2 = _clean_mrz_line2(parsed_lines[mrz2_idx]) if mrz2_idx is not None else None
            if existing_mrz2 and len(existing_mrz2) == 44 and mrz2_idx is not None:
                parsed_lines[mrz2_idx] = existing_mrz2
                mrz_protected_indices.add(mrz2_idx)
            else:
                m2_norm, m2_conf, m2_cnt, m2_toks = _recognize_mrz_line2_row(
                    r_mrz2, effective_paddle_model, min_row_h
                )
                if m2_norm:
                    if mrz2_idx is not None:
                        parsed_lines[mrz2_idx] = m2_norm
                        line_confs[mrz2_idx] = m2_conf
                        line_tok_counts[mrz2_idx] = m2_cnt
                        line_tokens[mrz2_idx] = m2_toks
                        mrz_protected_indices.add(mrz2_idx)
                    else:
                        parsed_lines.append(m2_norm)
                        line_confs.append(m2_conf)
                        line_tok_counts.append(m2_cnt)
                        line_tokens.append(m2_toks)
                        line_source_rows.append(r_mrz2)
                        mrz_protected_indices.add(len(parsed_lines) - 1)

    # Adaptive low-confidence 1-row retry (up to 2 uncertain non-ID rows when real logprobs exist)
    if rows and any(c is not None for c in line_confs):
        low_conf_indices = sorted(
            (
                idx
                for idx, conf_val in enumerate(line_confs)
                if idx != suspect_idx
                and idx not in mrz_protected_indices
                and idx < len(line_source_rows)
                and line_source_rows[idx] is not None
                and conf_val is not None
                and float(conf_val) < 88.0
                and len(parsed_lines[idx]) >= 3
            ),
            key=lambda i: float(line_confs[i]),  # type: ignore[arg-type]
        )[:2]
        for row_idx in low_conf_indices:
            src_row = line_source_rows[row_idx]
            if not src_row:
                continue
            try:
                retry_clean, retry_conf, retry_tok_cnt, retry_toks = _ocr_single_row_paddleocr_vl(
                    src_row,
                    effective_paddle_model,
                    min_row_height=max(72, min_row_h),
                    num_predict=96,
                )
                old_conf = line_confs[row_idx]
                if retry_clean and retry_conf is not None and old_conf is not None and float(retry_conf) > float(old_conf):
                    parsed_lines[row_idx] = retry_clean
                    line_confs[row_idx] = float(retry_conf)
                    line_tok_counts[row_idx] = retry_tok_cnt
                    line_tokens[row_idx] = retry_toks
            except Exception as exc:
                logger.debug("PaddleOCR-VL low-confidence row retry skipped (row=%s): %s", row_idx, exc)

    paddleocr_vl_ms = round((time.perf_counter() - t_ocr0) * 1000.0, 1)

    ocr_lines = []
    for idx, ln in enumerate(parsed_lines):
        item: Dict[str, Any] = {"bbox": [0, idx * 20, 100, idx * 20 + 18], "text": ln}
        if idx < len(line_confs) and line_confs[idx] is not None:
            item["confidence"] = line_confs[idx]
            item["token_count"] = line_tok_counts[idx]
        if idx < len(line_tokens) and line_tokens[idx]:
            item["tokens"] = line_tokens[idx]
        ocr_lines.append(item)
    return ocr_lines, det_ms, paddleocr_vl_ms


def _clean_passport_place_of_birth(raw_line: str) -> Optional[str]:
    """Extract clean birthplace string from a passport value row (stripping dates, gender, and leaked labels)."""
    if not raw_line or not isinstance(raw_line, str):
        return None
    s = raw_line.strip()
    # Remove DD/MM/YYYY and DD MMM YYYY dates
    s = re.sub(r"\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{4}", " ", s)
    s = re.sub(r"\b\d{1,2}\s+[A-Z]{3}\s+\d{4}\b", " ", s, flags=re.IGNORECASE)
    # Remove leaked bilingual labels
    s = re.sub(
        r"(?:ngày\s*sinh|date\s*of\s*birth|n[ơo]i\s*sinh|place\s*of\s*birth|gi[ơớ]i\s*t[ií]nh|sex|"
        r"s[ốo]\s*gcmnd|id\s*card\s*n[o°ơứ]*|id\s*card|personal\s*no\.?)",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    # Remove gender tokens when mixed on the same row (e.g., 'M MANIKGANJ', 'NỮA TUYỀN QUANG')
    s = re.sub(r"\b(?:NAM/M|N[ỮU]/F|N[ỮU]A|NAM|N[ỮU]|M|F)\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\b\d{6,12}\b", " ", s)
    s = re.sub(r"[/,:;\-]+", " ", s)
    s = " ".join(s.split()).strip()
    s = re.sub(r"^(?:[N]?[ỮU]A|N[O°])\b\s*", "", s, flags=re.IGNORECASE).strip()
    if len(s) < 2:
        return None
    normalized = normalize_vietnamese_address(s) or s
    return normalized


def _ascii_alpha_words(text: str) -> List[str]:
    if not text or not isinstance(text, str):
        return []
    folded = _strip_accents_lower(text).upper()
    return [w for w in re.findall(r"[A-Z]+", folded) if w]


def _recover_passport_full_name(
    raw_full_name: Any,
    raw_texts: List[str],
    mrz_parsed: Dict[str, Any],
) -> Optional[str]:
    """
    Guardrail against LLM name hallucinations (e.g., merging 'Quốc tịch' / 'Tuyên Quang'
    into full_name) by validating against MRZ line 1 name tokens and recovering the
    exact accented OCR span when available.
    """
    name_val = str(raw_full_name or "").strip()
    if name_val:
        name_val = re.sub(
            r"(?:h[ọo]\s*v[àa]\s*t[êe]n|full\s*name|qu[ốo]c\s*t[ịi]ch|nationality|vi[ệe]t\s*nam|vietnamese)",
            " ",
            name_val,
            flags=re.IGNORECASE,
        )
        name_val = re.sub(r"[/,:;]+", " ", name_val)
        name_val = " ".join(name_val.split()).strip()
    clean_llm: Optional[str] = name_val if len(name_val) >= 2 else None

    mrz_tokens: List[str] = list(mrz_parsed.get("full_name_tokens") or [])
    mrz_truncated = bool(mrz_parsed.get("full_name_truncated"))
    if not mrz_tokens:
        return clean_llm

    llm_words = _ascii_alpha_words(clean_llm or "")
    if llm_words:
        if llm_words == mrz_tokens:
            return clean_llm
        if mrz_truncated and len(llm_words) >= len(mrz_tokens) and llm_words[: len(mrz_tokens)] == mrz_tokens:
            return clean_llm

    # Search non-MRZ OCR lines for a contiguous span matching MRZ name tokens (preserving accents)
    n_tok = len(mrz_tokens)
    for ln in raw_texts[:10]:
        if "<<" in ln or ln.upper().startswith("P<"):
            continue
        raw_words = [re.sub(r"^[^\wÀ-ỹ]+|[^\wÀ-ỹ]+$", "", w, flags=re.UNICODE) for w in ln.split()]
        raw_words = [w for w in raw_words if w]
        if len(raw_words) < n_tok:
            continue
        ascii_words = [_strip_accents_lower(w).upper() for w in raw_words]
        for start in range(0, len(raw_words) - n_tok + 1):
            if ascii_words[start:start + n_tok] == mrz_tokens:
                return " ".join(raw_words[start:start + n_tok])

    # If LLM appended hallucinated prefix words before the MRZ name (e.g., 'QUAN QUANG TRAN ANH TUAN'),
    # extract only the suffix matching mrz_tokens
    if clean_llm and len(llm_words) > n_tok:
        for start in range(1, len(llm_words) - n_tok + 1):
            if llm_words[start:start + n_tok] == mrz_tokens:
                raw_llm_words = clean_llm.split()
                if len(raw_llm_words) == len(llm_words):
                    return " ".join(raw_llm_words[start:start + n_tok])
                return " ".join(mrz_tokens)

    if clean_llm and len(llm_words) == n_tok:
        # Keep accented OCR/LLM name if token count matches and share most tokens with MRZ
        matches = sum(1 for a, b in zip(llm_words, mrz_tokens) if a == b)
        if matches >= max(1, n_tok - 1):
            return clean_llm

    return " ".join(mrz_tokens)


def _postprocess_passport_extracted_data(data: Dict[str, Any], lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Deterministic normalization & cross-checking for Passport OCR:
      - Extract & normalize 44-char ICAO MRZ line 1 and line 2.
      - Split 'P VNM C4665287' cleanly into passport_type, country_code, passport_number.
      - Cross-check passport_number and id_card_number against MRZ check digits.
      - Extract & normalize place_of_birth ('Nơi sinh') even if LLM omitted it.
    """
    raw_texts = [str(it.get("text") or "").strip() for it in lines if isinstance(it, dict) and it.get("text")]
    full_text = "\n".join(raw_texts)

    # 1. Recover / normalize MRZ lines from OCR lines (bottom-up) or LLM output
    mrz1: Optional[str] = None
    mrz2: Optional[str] = None
    for ln in reversed(raw_texts):
        if mrz2 is None:
            c2 = _clean_mrz_line2(ln)
            if c2:
                mrz2 = c2
                continue
        if mrz1 is None:
            c1 = _clean_mrz_line1(ln)
            if c1:
                mrz1 = c1

    if not mrz1 and isinstance(data.get("mrz_line1"), str):
        mrz1 = _clean_mrz_line1(data["mrz_line1"]) or data["mrz_line1"].strip() or None
    if not mrz2 and isinstance(data.get("mrz_line2"), str):
        mrz2 = _clean_mrz_line2(data["mrz_line2"]) or data["mrz_line2"].strip() or None

    mrz_parsed = _parse_mrz_fields(mrz1, mrz2)

    # 2. Scan top rows for 'P VNM C4665287' header value line
    row_type: Optional[str] = None
    row_country: Optional[str] = None
    row_pp_no: Optional[str] = None
    for ln in raw_texts[:6]:
        m_hdr = re.match(r"^\s*([PDSO])\s+([A-Z]{3})(?:\s+([A-Z0-9]{6,10}))?\s*$", ln.strip().upper())
        if m_hdr:
            row_type = m_hdr.group(1)
            row_country = m_hdr.group(2)
            row_pp_no = m_hdr.group(3)
            break

    # 3. Clean LLM passport_number if it accidentally merged 'P VNM C4665287'
    llm_type: Optional[str] = None
    llm_country: Optional[str] = None
    llm_pp_no: Optional[str] = None
    raw_pp_val = data.get("passport_number")
    if isinstance(raw_pp_val, str) and raw_pp_val.strip():
        tokens = [t for t in re.split(r"[\s,;/]+", raw_pp_val.strip().upper()) if t]
        for tok in tokens:
            if len(tok) == 1 and tok in ("P", "D", "S", "O") and llm_type is None:
                llm_type = tok
            elif re.fullmatch(r"[A-Z]{3}", tok) and llm_country is None:
                llm_country = tok
            elif re.fullmatch(r"[A-Z0-9]{6,10}", tok) and any(ch.isdigit() for ch in tok):
                llm_pp_no = tok

    # Resolve passport_type
    cur_type = str(data.get("passport_type") or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{1,2}", cur_type):
        cur_type = ""
    passport_type = cur_type or row_type or llm_type or mrz_parsed.get("passport_type") or "P"

    # Resolve country_code
    cur_country = str(data.get("country_code") or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", cur_country):
        cur_country = ""
    country_code = cur_country or row_country or llm_country or mrz_parsed.get("country_code")

    # Resolve & cross-check passport_number
    mrz_pp = mrz_parsed.get("passport_number")
    passport_number = llm_pp_no or row_pp_no or mrz_pp
    if row_pp_no and mrz_pp:
        if row_pp_no.endswith(mrz_pp) and len(row_pp_no) > len(mrz_pp):
            passport_number = row_pp_no
        else:
            passport_number = mrz_pp
    elif mrz_pp and (not passport_number or passport_number != mrz_pp):
        # Trust valid ICAO check-digit passport number from MRZ line 2
        passport_number = mrz_pp

    # 4. Resolve place_of_birth ('Nơi sinh / Place of birth')
    pob_val = data.get("place_of_birth")
    clean_pob: Optional[str] = None
    if isinstance(pob_val, str) and pob_val.strip():
        clean_pob = _clean_passport_place_of_birth(pob_val)
    if not clean_pob:
        for idx, ln in enumerate(raw_texts):
            low_ln = ln.lower()
            if ("nơi sinh" in low_ln or "noi sinh" in low_ln or "place of birth" in low_ln) and idx + 1 < len(raw_texts):
                cand_line = raw_texts[idx + 1]
                if "<<" not in cand_line and "ngày cấp" not in cand_line.lower():
                    clean_pob = _clean_passport_place_of_birth(cand_line)
                    if clean_pob:
                        break

    # 5. Resolve id_card_number (Số GCMND / Personal No.)
    id_card_val = data.get("id_card_number")
    clean_id_card: Optional[str] = None
    if isinstance(id_card_val, str):
        digits = re.sub(r"\D", "", id_card_val)
        if len(digits) >= 9:
            clean_id_card = digits
    if not clean_id_card and mrz_parsed.get("id_card_number"):
        clean_id_card = mrz_parsed["id_card_number"]
    if not clean_id_card:
        for idx, ln in enumerate(raw_texts):
            low_ln = ln.lower()
            if ("gcmnd" in low_ln or "personal no" in low_ln or "giới tính" in low_ln) and idx + 1 < len(raw_texts):
                m_num = re.search(r"\b(\d{9,12})\b", raw_texts[idx + 1])
                if m_num:
                    clean_id_card = m_num.group(1)
                    break

    # 6. Normalize gender, nationality, dates, issue_place
    gender_val = str(data.get("gender") or "").strip()
    g_low = gender_val.lower()
    if g_low in ("nữ", "nu", "nữ/f", "nu/f", "f", "female"):
        norm_gender: Optional[str] = "Nữ"
    elif g_low in ("nam", "nam/m", "m", "male"):
        norm_gender = "Nam"
    else:
        norm_gender = mrz_parsed.get("gender") or (gender_val or None)
    if mrz_parsed.get("gender") in ("Nam", "Nữ"):
        norm_gender = mrz_parsed["gender"]

    nat_val = data.get("nationality")
    if isinstance(nat_val, str) and nat_val.strip():
        nat_clean = re.sub(r"\s*/\s*vietnamese\b", "", nat_val.strip(), flags=re.IGNORECASE).strip()
        if nat_clean.lower() in ("viet nam", "việt nam"):
            nat_clean = "VIỆT NAM"
    else:
        nat_clean = "VIỆT NAM" if "việt nam" in full_text.lower() else None

    issue_place_val = data.get("issue_place") or data.get("issue_authority")
    if isinstance(issue_place_val, str):
        issue_place_val = issue_place_val.strip() or None
    if not issue_place_val and "cục quản lý xuất nhập cảnh" in full_text.lower():
        issue_place_val = "Cục Quản lý xuất nhập cảnh"

    for date_field in ("date_of_birth", "issue_date", "expiry_date"):
        val = data.get(date_field)
        if isinstance(val, str):
            val_s = re.sub(r"\s*/\s*", "/", val.strip())
            iso_m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", val_s)
            if iso_m:
                dmy = f"{iso_m.group(3)}/{iso_m.group(2)}/{iso_m.group(1)}"
                if dmy in re.sub(r"\s*/\s*", "/", full_text):
                    val_s = dmy
            data[date_field] = val_s or None

    # Deterministic recovery of passport issue_date & expiry_date when LLM drops them
    _date_pat = re.compile(r"\b(\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{4}|\d{1,2}\s+[A-Z]{3}\s+\d{4})\b", re.IGNORECASE)
    def _norm_d(d_str: str) -> str:
        return re.sub(r"\s*([/\-])\s*", r"\1", " ".join(d_str.split()))
    def _to_yymmdd(d_str: str) -> Optional[str]:
        m_num = re.fullmatch(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", d_str)
        if m_num:
            return f"{m_num.group(3)[2:]}{int(m_num.group(2)):02d}{int(m_num.group(1)):02d}"
        months = {"JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
                  "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"}
        m_txt = re.fullmatch(r"(\d{1,2})\s+([A-Z]{3})\s+(\d{4})", d_str.upper())
        if m_txt and m_txt.group(2) in months:
            return f"{m_txt.group(3)[2:]}{months[m_txt.group(2)]}{int(m_txt.group(1)):02d}"
        return None

    mrz_dob_yymmdd = mrz_parsed.get("dob_yymmdd")
    if not data.get("date_of_birth"):
        for idx, ln in enumerate(raw_texts):
            for dm in _date_pat.findall(ln):
                cd = _norm_d(dm)
                if mrz_dob_yymmdd and _to_yymmdd(cd) == mrz_dob_yymmdd:
                    data["date_of_birth"] = cd
                    break
            if data.get("date_of_birth"):
                break
        if not data.get("date_of_birth") and mrz_dob_yymmdd:
            yy = int(mrz_dob_yymmdd[0:2])
            cur_yy = datetime.now(timezone.utc).year % 100
            century = "19" if yy > cur_yy else "20"
            data["date_of_birth"] = f"{mrz_dob_yymmdd[4:6]}/{mrz_dob_yymmdd[2:4]}/{century}{mrz_dob_yymmdd[0:2]}"

    mrz_exp_yymmdd = mrz_parsed.get("exp_yymmdd")
    if not data.get("issue_date") or not data.get("expiry_date"):
        for idx, ln in enumerate(raw_texts):
            low_ln = ln.lower()
            has_issue_hdr = ("ngày cấp" in low_ln or "date of issue" in low_ln or "reading author" in low_ln)
            has_exp_hdr = ("có giá trị đến" in low_ln or "date of expiry" in low_ln)
            if has_issue_hdr or has_exp_hdr:
                cand_dates: List[str] = []
                for off in (0, 1, 2):
                    if idx + off < len(raw_texts):
                        for dm in _date_pat.findall(raw_texts[idx + off]):
                            cand_dates.append(_norm_d(dm))
                        if cand_dates and has_issue_hdr and has_exp_hdr:
                            break
                if has_issue_hdr and has_exp_hdr and len(cand_dates) >= 2:
                    if not data.get("issue_date"):
                        data["issue_date"] = cand_dates[0]
                    if not data.get("expiry_date"):
                        data["expiry_date"] = cand_dates[1]
                    break
                for cd in cand_dates:
                    if mrz_exp_yymmdd and _to_yymmdd(cd) == mrz_exp_yymmdd:
                        if not data.get("expiry_date"):
                            data["expiry_date"] = cd
                    elif has_issue_hdr and not data.get("issue_date"):
                        data["issue_date"] = cd
                    elif has_exp_hdr and not data.get("expiry_date"):
                        data["expiry_date"] = cd
    if not data.get("expiry_date") and mrz_exp_yymmdd:
        data["expiry_date"] = f"{mrz_exp_yymmdd[4:6]}/{mrz_exp_yymmdd[2:4]}/20{mrz_exp_yymmdd[0:2]}"

    clean_full_name = _recover_passport_full_name(data.get("full_name"), raw_texts, mrz_parsed)

    result: Dict[str, Any] = {
        "document_type": "passport",
        "passport_type": passport_type,
        "country_code": country_code,
        "passport_number": passport_number,
        "full_name": clean_full_name,
        "date_of_birth": data.get("date_of_birth"),
        "place_of_birth": clean_pob,
        "gender": norm_gender,
        "nationality": nat_clean,
        "id_card_number": clean_id_card,
        "issue_date": data.get("issue_date"),
        "expiry_date": data.get("expiry_date"),
        "issue_place": issue_place_val,
        "mrz_line1": mrz1,
        "mrz_line2": mrz2,
    }
    return result


def _postprocess_hybrid_extracted_data(data: Dict[str, Any], lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Deterministic guardrails over Hybrid LLM JSON output when raw OCR lines are available:
      - Prevent hallucinated issue_place / issue_date on front-side ID cards.
      - Recover 'Không thời hạn' if present in OCR lines.
      - Normalize ISO YYYY-MM-DD back to DD/MM/YYYY when matching raw OCR date.
      - Avoid mapping CMND 'Dân tộc: Kinh' into nationality='Kinh'.
      - Clean address label prefixes and normalize Vietnamese administrative divisions via GSO/NSO datasets.
      - Normalize & cross-check Passport fields (passport_number, passport_type, country_code, place_of_birth, id_card_number, mrz_line1, mrz_line2).
    """
    if not isinstance(data, dict) or not lines:
        return data

    full_text = "\n".join(it["text"] for it in lines)
    low_text = full_text.lower()
    doc_type = str(data.get("document_type") or "").strip().lower()
    has_passport_cues = (
        doc_type in ("passport", "hộ chiếu")
        or (
            any(cue in low_text for cue in ("hộ chiếu", "hồ chiêu", "passport", "p<"))
            and not any(cue in low_text for cue in ("căn cước", "chứng minh", "giấy phép lái xe"))
        )
    )

    if has_passport_cues:
        return _postprocess_passport_extracted_data(data, lines)

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
            if cleaned_addr:
                cleaned_addr = normalize_vietnamese_address(cleaned_addr) or cleaned_addr
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
            "logprobs": True,
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
        raw_llm_extracted = dict(extracted_data) if isinstance(extracted_data, dict) else {}
        extracted_data = _postprocess_hybrid_extracted_data(extracted_data, ocr_lines)
        extracted_data.pop("bbox_2d", None)
        extracted_data.pop("document_bbox", None)
        extracted_data.pop("orientation_angle", None)

        # Compute real confidence score from PaddleOCR-VL + Text LLM token logprobs
        line_conf_pairs = [
            (float(it["confidence"]), max(1, int(it.get("token_count") or 1)))
            for it in ocr_lines
            if isinstance(it, dict) and it.get("confidence") is not None
        ]
        if line_conf_pairs:
            total_tok = sum(cnt for _, cnt in line_conf_pairs)
            ocr_confidence: Optional[float] = round(
                sum(c * cnt for c, cnt in line_conf_pairs) / max(1, total_tok), 2
            )
        else:
            ocr_confidence = None

        llm_confidence, _ = _compute_confidence_from_logprobs(resp_data.get("logprobs"))

        if "error" in extracted_data or not ocr_lines:
            confidence_score = 0.0
            confidence_source = "no_ocr_text_or_parse_error"
        elif ocr_confidence is not None and llm_confidence is not None:
            confidence_score = round(0.80 * ocr_confidence + 0.20 * llm_confidence, 2)
            confidence_source = "model_logprobs"
        elif ocr_confidence is not None:
            confidence_score = round(ocr_confidence, 2)
            confidence_source = "paddleocr_vl_logprobs"
        elif llm_confidence is not None:
            confidence_score = round(llm_confidence, 2)
            confidence_source = "llm_logprobs"
        else:
            # Fallback only when mocked/legacy Ollama responses omit logprobs
            field_keys = [k for k in extracted_data.keys() if k != "document_type"]
            non_empty = sum(1 for k in field_keys if extracted_data.get(k) not in (None, "", []))
            ratio = non_empty / max(1, len(field_keys))
            confidence_score = round(50.0 + 45.0 * ratio, 2)
            confidence_source = "heuristic_fallback"

        # Compute per-field confidence scores from PaddleOCR-VL token spans + LLM value logprobs
        field_confidences: Dict[str, float] = {}
        if "error" not in extracted_data and ocr_lines:
            full_ocr_text, full_char_probs = _build_ocr_char_prob_map(ocr_lines)
            norm_ocr, norm_map = _collapse_ws_with_map(full_ocr_text, strip_accents=False)
            ascii_ocr, ascii_map = _collapse_ws_with_map(full_ocr_text, strip_accents=True)
            llm_field_confs = _extract_llm_field_confidences(resp_data.get("logprobs"))

            for key, val in extracted_data.items():
                if val is None or val == "" or val == []:
                    continue
                val_str = str(val).strip()
                raw_llm_val = raw_llm_extracted.get(key)
                llm_matches_final = (
                    isinstance(raw_llm_val, str)
                    and _strip_accents_lower(" ".join(raw_llm_val.split()))
                    == _strip_accents_lower(" ".join(val_str.split()))
                )
                llm_f = llm_field_confs.get(key) if (llm_matches_final or key in ("document_type", "card_subtype")) else None
                if key in ("document_type", "card_subtype"):
                    if llm_f is not None:
                        field_confidences[key] = round(llm_f, 2)
                    continue
                ocr_f = _match_value_ocr_confidence(
                    val_str, norm_ocr, norm_map, ascii_ocr, ascii_map, full_char_probs
                )
                # For 1-char passport_type ('P'), a single start-of-line token prob is noisy;
                # corroborate against the full header anchor ('P VNM') and MRZ prefix ('P<VNM') when they agree.
                if key == "passport_type" and extracted_data.get("document_type") == "passport" and len(val_str) == 1:
                    mrz1_val = str(extracted_data.get("mrz_line1") or "").strip().upper()
                    cc_val = str(extracted_data.get("country_code") or "").strip().upper()
                    ctx_scores: List[float] = [ocr_f] if ocr_f is not None else []
                    if cc_val:
                        hdr_ctx = _match_value_ocr_confidence(
                            f"{val_str} {cc_val}", norm_ocr, norm_map, ascii_ocr, ascii_map, full_char_probs
                        )
                        if hdr_ctx is not None:
                            ctx_scores.append(hdr_ctx)
                    if mrz1_val.startswith(f"{val_str.upper()}<"):
                        mrz_anchor = f"{val_str.upper()}<{cc_val}" if cc_val else f"{val_str.upper()}<"
                        mrz_ctx = _match_value_ocr_confidence(
                            mrz_anchor, norm_ocr, norm_map, ascii_ocr, ascii_map, full_char_probs
                        )
                        if mrz_ctx is not None:
                            ctx_scores.append(mrz_ctx)
                    if ctx_scores:
                        ocr_f = round(max(ctx_scores), 2)
                if ocr_f is not None and llm_f is not None:
                    field_confidences[key] = round(0.80 * ocr_f + 0.20 * llm_f, 2)
                elif ocr_f is not None:
                    field_confidences[key] = round(ocr_f, 2)
                elif llm_f is not None:
                    field_confidences[key] = round(llm_f, 2)

        seg_meta.pipeline_mode = "hybrid_paddle_vl"
        seg_meta.ocr_lines_count = len(ocr_lines)
        seg_meta.stage_timings_ms = stage_timings_ms
        seg_meta.ocr_confidence = ocr_confidence
        seg_meta.llm_confidence = llm_confidence
        seg_meta.confidence_source = confidence_source
        seg_meta.field_confidences = field_confidences

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
            confidence_score=confidence_score,
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
            confidence_score=confidence_score,
            field_confidences=field_confidences,
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
                    confidence_score=row.confidence_score if row.confidence_score is not None else 0.0,
                    field_confidences=seg_info.field_confidences if seg_info and seg_info.field_confidences else {},
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
