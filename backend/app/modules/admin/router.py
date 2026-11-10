from typing import List, Optional
from fastapi import APIRouter, Depends, status, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_admin
from app.common.models.users import User
from app.common.models.licenses import License
from app.common.enums import UserRole
from app.common.schemas.ocr_catalog import (
    OCRServiceCreate, OCRServiceUpdate, OCRServiceResponse, OCRServiceDetailResponse,
    DocumentTypeCreate, DocumentTypeUpdate, DocumentTypeResponse
)
from app.common.schemas.packages import (
    PackageCreate, PackageUpdate, PackageResponse, PackageVersionCreate, PackageVersionResponse
)
from app.common.schemas.licenses import LicenseResponse, LicenseGenerateRequest
from app.common.schemas.auth import UserResponse
from app.modules.ocr_catalog.service import CatalogService
from app.modules.packages.service import PackageService
from app.modules.licenses.service import LicenseService

router = APIRouter(prefix="/admin", tags=["Admin Portal Management"])

# --- OCR Services ---
@router.get("/ocr-services", response_model=List[OCRServiceResponse])
def admin_get_services(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_get_all_services(db)

@router.post("/ocr-services", response_model=OCRServiceResponse, status_code=status.HTTP_201_CREATED)
def admin_create_service(
    req: OCRServiceCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_create_service(db, req)

@router.put("/ocr-services/{service_id}", response_model=OCRServiceResponse)
def admin_update_service(
    service_id: str,
    req: OCRServiceUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_update_service(db, service_id, req)

@router.post("/ocr-services/{service_id}/publish", response_model=OCRServiceResponse)
def admin_publish_service(
    service_id: str,
    publish: bool = Body(..., embed=True),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_publish_service(db, service_id, publish)

# --- Document Types ---
@router.get("/document-types", response_model=List[DocumentTypeResponse])
def admin_get_document_types(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_get_all_document_types(db)

@router.post("/document-types", response_model=DocumentTypeResponse, status_code=status.HTTP_201_CREATED)
def admin_create_document_type(
    req: DocumentTypeCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_create_document_type(db, req)

@router.put("/document-types/{doc_type_id}", response_model=DocumentTypeResponse)
def admin_update_document_type(
    doc_type_id: str,
    req: DocumentTypeUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return CatalogService.admin_update_document_type(db, doc_type_id, req)

# --- Packages & Versions ---
@router.get("/packages", response_model=List[PackageResponse])
def admin_get_packages(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return PackageService.get_all_packages(db)

@router.post("/packages", response_model=PackageResponse, status_code=status.HTTP_201_CREATED)
def admin_create_package(
    req: PackageCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return PackageService.create_package(db, req)

@router.put("/packages/{package_id}", response_model=PackageResponse)
def admin_update_package(
    package_id: str,
    req: PackageUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return PackageService.update_package(db, package_id, req)

@router.post("/packages/{package_id}/versions", response_model=PackageVersionResponse, status_code=status.HTTP_201_CREATED)
def admin_create_package_version(
    package_id: str,
    req: PackageVersionCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return PackageService.create_package_version(db, package_id, req)

@router.post("/packages/{package_id}/activate", response_model=PackageResponse)
def admin_toggle_package_active(
    package_id: str,
    active: bool = Body(..., embed=True),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return PackageService.toggle_package_active(db, package_id, active)

# --- License Management & Complimentary Grants ---
@router.post("/licenses/generate")
def admin_generate_license(
    req: LicenseGenerateRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    lic_res, raw_key = LicenseService.admin_generate_license(db, req, admin.id)
    return {
        "license": lic_res,
        "license_key": raw_key  # Returned ONLY at generation response
    }

@router.get("/licenses", response_model=List[LicenseResponse])
def admin_get_all_licenses(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    licenses = db.query(License).order_by(License.created_at.desc()).all()
    return [LicenseService._to_response(l) for l in licenses]

# --- Customer Accounts ---
@router.get("/customers", response_model=List[UserResponse])
def admin_get_customers(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    customers = db.query(User).filter(User.role == UserRole.CUSTOMER).order_by(User.created_at.desc()).all()
    return [
        UserResponse(
            id=c.id,
            email=c.email,
            full_name=c.full_name,
            role=c.role,
            status=c.status,
            created_at=c.created_at,
            profile=None
        )
        for c in customers
    ]
