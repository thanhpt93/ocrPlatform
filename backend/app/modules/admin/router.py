from typing import List
from fastapi import APIRouter, Depends, Request, status, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_admin
from app.common.models.users import User
from app.common.models.licenses import License
from app.common.enums import UserRole
from app.common.schemas.ocr_catalog import (
    OCRServiceCreate, OCRServiceUpdate, OCRServiceResponse,
    DocumentTypeCreate, DocumentTypeUpdate, DocumentTypeResponse
)
from app.common.schemas.packages import (
    PackageCreate, PackageUpdate, PackageResponse, PackageVersionCreate, PackageVersionResponse
)
from app.common.schemas.licenses import LicenseResponse, LicenseGenerateRequest
from app.common.schemas.auth import UserResponse, UserProfileResponse
from app.common.schemas.admin import (
    AdminDashboardStatsResponse,
    AdminCustomerSummary,
    AdminCustomerStatusUpdateRequest,
    AdminCustomerDetailResponse,
    AdminSubscriptionResponse,
    AdminOrderResponse,
    AdminPaymentResponse,
    AdminLicenseResponse,
    AdminLicenseStatusUpdateRequest,
    AdminUsageRecordResponse,
    AdminMonitoringResponse,
    AdminOperatorResponse,
    AdminOperatorCreateRequest,
    AuditLogResponse,
    AdminSystemConfigResponse,
)
from app.modules.ocr_catalog.service import CatalogService
from app.modules.packages.service import PackageService
from app.modules.licenses.service import LicenseService
from app.modules.admin.service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin Portal Management"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# --- Dashboard ---
@router.get("/dashboard", response_model=AdminDashboardStatsResponse)
def admin_get_dashboard(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_dashboard_stats(db)


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
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = CatalogService.admin_create_service(db, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "OCR_SERVICE_CREATED", "ocr_service", res.id,
        details=f"Created OCR service {res.name} ({res.code})", ip_address=_client_ip(request)
    )
    return res


@router.put("/ocr-services/{service_id}", response_model=OCRServiceResponse)
def admin_update_service(
    service_id: str,
    req: OCRServiceUpdate,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = CatalogService.admin_update_service(db, service_id, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "OCR_SERVICE_UPDATED", "ocr_service", res.id,
        details=f"Updated OCR service {res.name} ({res.code})", ip_address=_client_ip(request)
    )
    return res


@router.post("/ocr-services/{service_id}/publish", response_model=OCRServiceResponse)
def admin_publish_service(
    service_id: str,
    request: Request,
    publish: bool = Body(..., embed=True),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = CatalogService.admin_publish_service(db, service_id, publish)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "OCR_SERVICE_PUBLISHED" if publish else "OCR_SERVICE_UNPUBLISHED",
        "ocr_service", res.id, details=f"Set service {res.name} status to {res.status.value}",
        ip_address=_client_ip(request)
    )
    return res


@router.delete("/ocr-services/{service_id}")
def admin_delete_service(
    service_id: str,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    CatalogService.admin_delete_service(db, service_id)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "OCR_SERVICE_DELETED", "ocr_service", service_id,
        details=f"Deleted OCR service {service_id}", severity="warning", ip_address=_client_ip(request)
    )
    return {"deleted": True, "id": service_id}


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
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = CatalogService.admin_create_document_type(db, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "DOCUMENT_TYPE_CREATED", "document_type", res.id,
        details=f"Created document type {res.name} ({res.code})", ip_address=_client_ip(request)
    )
    return res


@router.put("/document-types/{doc_type_id}", response_model=DocumentTypeResponse)
def admin_update_document_type(
    doc_type_id: str,
    req: DocumentTypeUpdate,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = CatalogService.admin_update_document_type(db, doc_type_id, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "DOCUMENT_TYPE_UPDATED", "document_type", res.id,
        details=f"Updated document type {res.name} ({res.code})", ip_address=_client_ip(request)
    )
    return res


@router.delete("/document-types/{doc_type_id}")
def admin_delete_document_type(
    doc_type_id: str,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    CatalogService.admin_delete_document_type(db, doc_type_id)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "DOCUMENT_TYPE_DELETED", "document_type", doc_type_id,
        details=f"Deleted document type {doc_type_id}", severity="warning", ip_address=_client_ip(request)
    )
    return {"deleted": True, "id": doc_type_id}


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
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = PackageService.create_package(db, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "PACKAGE_CREATED", "package", res.id,
        details=f"Created package {res.name} ({res.code})", ip_address=_client_ip(request)
    )
    return res


@router.put("/packages/{package_id}", response_model=PackageResponse)
def admin_update_package(
    package_id: str,
    req: PackageUpdate,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = PackageService.update_package(db, package_id, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "PACKAGE_UPDATED", "package", res.id,
        details=f"Updated package {res.name} ({res.code})", ip_address=_client_ip(request)
    )
    return res


@router.post("/packages/{package_id}/versions", response_model=PackageVersionResponse, status_code=status.HTTP_201_CREATED)
def admin_create_package_version(
    package_id: str,
    req: PackageVersionCreate,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = PackageService.create_package_version(db, package_id, req)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "PACKAGE_VERSION_CREATED", "package", package_id,
        details=f"Published version v{res.version_number} (${res.price}, {res.quota_amount} {res.quota_type.value})",
        ip_address=_client_ip(request)
    )
    return res


@router.post("/packages/{package_id}/activate", response_model=PackageResponse)
def admin_toggle_package_active(
    package_id: str,
    request: Request,
    active: bool = Body(..., embed=True),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = PackageService.toggle_package_active(db, package_id, active)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "PACKAGE_STATUS_CHANGED", "package", res.id,
        details=f"Set package {res.name} status to {res.status}", ip_address=_client_ip(request)
    )
    return res


@router.delete("/packages/{package_id}")
def admin_delete_package(
    package_id: str,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    res = PackageService.delete_package(db, package_id)
    AdminService.record_audit_log(
        db, admin.id, admin.email,
        "PACKAGE_DELETED" if res.get("deleted") else "PACKAGE_ARCHIVED",
        "package", package_id,
        details=f"{'Deleted' if res.get('deleted') else 'Archived (referenced by orders/subscriptions)'} package {package_id}",
        severity="warning", ip_address=_client_ip(request)
    )
    return res


# --- License Management & Complimentary Grants ---
@router.post("/licenses/generate")
def admin_generate_license(
    req: LicenseGenerateRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    lic_res, raw_key = LicenseService.admin_generate_license(db, req, admin.id)
    AdminService.record_audit_log(
        db, admin.id, admin.email, "LICENSE_GENERATED", "license", lic_res.id,
        details=f"Granted complimentary license {lic_res.masked_key} to user {lic_res.user_id}",
        ip_address=_client_ip(request)
    )
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


@router.get("/licenses/overview", response_model=List[AdminLicenseResponse])
def admin_get_licenses_overview(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_all_licenses_overview(db)


@router.patch("/licenses/{license_id}/status", response_model=AdminLicenseResponse)
def admin_update_license_status(
    license_id: str,
    req: AdminLicenseStatusUpdateRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.update_license_status(db, license_id, req.status, req.notes, admin, _client_ip(request))


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
            profile=UserProfileResponse(
                phone=c.profile.phone,
                address=c.profile.address,
                tax_id=c.profile.tax_id,
                company_name=c.profile.company_name,
                avatar_url=c.profile.avatar_url,
            ) if c.profile else None,
        )
        for c in customers
    ]


@router.get("/customers/overview", response_model=List[AdminCustomerSummary])
def admin_get_customers_overview(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_customers_overview(db)


@router.get("/customers/{customer_id}", response_model=AdminCustomerDetailResponse)
def admin_get_customer_detail(
    customer_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_customer_detail(db, customer_id)


@router.patch("/customers/{customer_id}/status", response_model=AdminCustomerSummary)
def admin_update_customer_status(
    customer_id: str,
    req: AdminCustomerStatusUpdateRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.update_customer_status(db, customer_id, req.status, admin, _client_ip(request))


# --- Subscriptions, Orders, Payments & Usage ---
@router.get("/subscriptions", response_model=List[AdminSubscriptionResponse])
def admin_get_subscriptions(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_all_subscriptions(db)


@router.get("/orders", response_model=List[AdminOrderResponse])
def admin_get_orders(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_all_orders(db)


@router.get("/payments", response_model=List[AdminPaymentResponse])
def admin_get_payments(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_all_payments(db)


@router.get("/usage-records", response_model=List[AdminUsageRecordResponse])
def admin_get_usage_records(
    limit: int = 100,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_usage_records(db, limit=limit)


# --- Monitoring & System Governance ---
@router.get("/monitoring", response_model=AdminMonitoringResponse)
def admin_get_monitoring(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_monitoring(db)


@router.get("/operators", response_model=List[AdminOperatorResponse])
def admin_get_operators(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_operators(db)


@router.post("/operators", response_model=AdminOperatorResponse, status_code=status.HTTP_201_CREATED)
def admin_create_operator(
    req: AdminOperatorCreateRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.create_operator(db, req, admin, _client_ip(request))


@router.get("/audit-logs", response_model=List[AuditLogResponse])
def admin_get_audit_logs(
    limit: int = 100,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return AdminService.get_audit_logs(db, limit=limit)


@router.get("/system/config", response_model=AdminSystemConfigResponse)
def admin_get_system_config(
    admin: User = Depends(get_current_admin),
):
    return AdminService.get_system_config()
