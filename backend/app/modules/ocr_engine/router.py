from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import security_scheme
from app.core.security import decode_token, hash_secret
from app.common.models.users import User
from app.common.models.credentials import APICredential
from app.common.enums import UserStatus, CredentialStatus
from app.common.schemas.ocr_engine import OCRExtractionResponse, VLMHealthResponse
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

@router.get("/health", response_model=VLMHealthResponse)
def check_vlm_health():
    is_up, status_str = OCREngineService.check_ollama_health()
    return VLMHealthResponse(
        ollama_status=status_str,
        active_model="qwen2.5vl:7b",
        gpu_accelerated=True
    )

@router.post("/process-identity", response_model=OCRExtractionResponse)
async def process_identity_document(
    file: UploadFile = File(..., description="File ảnh tài liệu (PNG, JPG, JPEG, WEBP)"),
    license_id: Optional[str] = Form(None, description="Mã License cụ thể (tùy chọn)"),
    model_name: Optional[str] = Form("qwen2.5vl:7b", description="Tên mô hình VLM"),
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
        model_name=model_name or "qwen2.5vl:7b"
    )
