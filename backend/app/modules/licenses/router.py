from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.common.models.users import User
from app.common.schemas.licenses import (
    LicenseResponse, LicenseDetailResponse, LicenseActivateRequest,
    APICredentialCreate, APICredentialResponse, APICredentialCreatedResponse
)
from app.modules.licenses.service import LicenseService

router = APIRouter(prefix="/licenses", tags=["Licenses"])

@router.get("", response_model=List[LicenseResponse])
def get_user_licenses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return LicenseService.get_user_licenses(db, current_user.id)

@router.get("/{license_id}", response_model=LicenseDetailResponse)
def get_license_by_id(
    license_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return LicenseService.get_license_by_id(db, license_id, current_user.id)

@router.post("/activate", response_model=LicenseResponse)
def activate_license(
    req: LicenseActivateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return LicenseService.activate_license(db, current_user, req)

# API Credentials sub-routes
@router.post("/{license_id}/credentials", response_model=APICredentialCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_api_credential(
    license_id: str,
    req: APICredentialCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return LicenseService.create_api_credential(db, current_user, license_id, req)

@router.get("/{license_id}/credentials", response_model=List[APICredentialResponse])
def get_license_credentials(
    license_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return LicenseService.get_license_credentials(db, current_user, license_id)

@router.delete("/{license_id}/credentials/{credential_id}", status_code=status.HTTP_200_OK)
def revoke_api_credential(
    license_id: str,
    credential_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    LicenseService.revoke_api_credential(db, current_user, license_id, credential_id)
    return {"message": "API Credential revoked successfully"}
