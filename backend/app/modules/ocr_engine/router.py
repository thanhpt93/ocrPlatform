from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, Header, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import security_scheme
from app.core.security import decode_token, hash_secret
from app.common.models.users import User
from app.common.models.credentials import APICredential
from app.common.enums import UserStatus, CredentialStatus
from app.common.schemas.ocr_engine import OCRExtractionResponse, OCRJobHistoryItem, VLMHealthResponse
from app.modules.ocr_engine.service import OCREngineService

router = APIRouter(prefix="/ocr", tags=["OCR Engine"])


def get_auth_context(
    credentials = Depends(security_scheme),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
):
    """Support both Web JWT Token and External X-API-Key Header."""
    user = None
    api_key_hash = None

    if x_api_key:
        api_key_hash = hash_secret(x_api_key.strip())
        cred = db.query(APICredential).filter(
            APICredential.secret_hash == api_key_hash,
            APICredential.status == CredentialStatus.ACTIVE
        ).first()
        if not cred:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Khóa API (X-API-Key) không hợp lệ hoặc đã bị thu hồi"
            )
        user = cred.user
        if not user or user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tài khoản sở hữu khóa API đã bị vô hiệu hóa"
            )
        return user, api_key_hash

    if credentials and credentials.credentials:
        token = credentials.credentials
        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.status == UserStatus.ACTIVE:
                return user, None

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Yêu cầu xác thực: Vui lòng đăng nhập (Bearer JWT) hoặc cung cấp Header 'X-API-Key'"
    )


def get_optional_auth_user(
    credentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if credentials and credentials.credentials:
        payload = decode_token(credentials.credentials)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.status == UserStatus.ACTIVE:
                return user
    return None


@router.get("/health", response_model=VLMHealthResponse)
def check_vlm_health():
    is_up, status_str = OCREngineService.check_ollama_health()
    installed_models = OCREngineService.get_installed_models() if is_up else []
    available_models = OCREngineService.build_available_models(installed_models)
    det_ready = OCREngineService.check_rapidocr_ready()
    paddleocr_vl_model = getattr(settings, "PADDLEOCR_VL_MODEL", "paddleocr-vl-vi")
    paddleocr_vl_ready = OCREngineService.check_paddleocr_vl_ready(installed_models)
    pipeline_mode = "hybrid_paddle_vl"
    hybrid_llm_model = getattr(settings, "OLLAMA_TEXT_MODEL", "qwen2.5:3b")
    return VLMHealthResponse(
        ollama_status=status_str,
        active_model=hybrid_llm_model,
        pipeline_mode=pipeline_mode,
        hybrid_llm_model=hybrid_llm_model,
        paddleocr_vl_model=paddleocr_vl_model,
        paddleocr_vl_ready=paddleocr_vl_ready,
        rapidocr_ready=det_ready,
        gpu_accelerated=True,
        ollama_base_url=settings.OLLAMA_BASE_URL,
        installed_models=installed_models,
        available_models=available_models,
    )


@router.post("/process-identity", response_model=OCRExtractionResponse)
async def process_identity_document(
    file: UploadFile = File(..., description="File ảnh tài liệu (PNG, JPG, JPEG, WEBP)"),
    license_id: Optional[str] = Form(None, description="Mã License cụ thể (tùy chọn)"),
    model_name: Optional[str] = Form(None, description="Tên mô hình Text LLM chuẩn hóa JSON (tùy chọn)"),
    auth_ctx = Depends(get_auth_context),
    db: Session = Depends(get_db)
):
    user, api_key_hash = auth_ctx

    # Validate file type
    content_type = file.content_type or ""
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp", "application/pdf"]
    if not any(t in content_type.lower() for t in allowed_types) and not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.pdf')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng tệp không được hỗ trợ. Vui lòng tải lên ảnh PNG, JPG, JPEG, WEBP hoặc tài liệu PDF."
        )

    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng tệp vượt quá giới hạn 20MB."
        )

    return OCREngineService.process_identity_document(
        db=db,
        image_bytes=file_bytes,
        file_name=file.filename or "uploaded_identity_doc.jpg",
        user=user,
        license_id=license_id,
        api_key_secret_hash=api_key_hash,
        model_name=model_name,
    )


@router.get("/jobs", response_model=List[OCRJobHistoryItem])
def list_ocr_jobs(
    limit: int = Query(100, ge=1, le=500),
    auth_ctx = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    user, _ = auth_ctx
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không xác định được người dùng cho lịch sử OCR.",
        )
    return OCREngineService.list_user_jobs(db=db, user_id=user.id, limit=limit)


@router.get("/jobs/{job_id}/image/{kind}")
def get_ocr_job_image(
    job_id: str,
    kind: str,
    t: Optional[str] = Query(None, description="Per-job signed image access token"),
    user: Optional[User] = Depends(get_optional_auth_user),
    db: Session = Depends(get_db),
):
    image_path = OCREngineService.resolve_job_image_path(
        db=db,
        job_id=job_id,
        kind=kind,
        access_token=t,
        user=user,
    )
    return FileResponse(
        path=str(image_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )
