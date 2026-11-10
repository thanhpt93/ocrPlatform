from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.common.models.packages import Package, PackageVersion, CreditRate
from app.common.schemas.packages import (
    PackageCreate, PackageUpdate, PackageResponse, PackageVersionCreate,
    PackageVersionResponse, CreditRateResponse
)
from app.core.exceptions import EntityNotFoundException, EntityAlreadyExistsException, BadRequestException

class PackageService:
    @staticmethod
    def get_package_by_id(db: Session, package_id: str) -> PackageResponse:
        pkg = db.query(Package).filter(or_(Package.id == package_id, Package.code == package_id)).first()
        if not pkg:
            raise EntityNotFoundException("Package", package_id)

        current_ver = next((v for v in pkg.versions if v.is_current), None)
        current_ver_res = PackageVersionResponse.model_validate(current_ver) if current_ver else None

        return PackageResponse(
            id=pkg.id,
            code=pkg.code,
            name=pkg.name,
            tier=pkg.tier,
            service_id=pkg.service_id,
            service_name=pkg.service.name if pkg.service else None,
            status=pkg.status,
            created_at=pkg.created_at,
            updated_at=pkg.updated_at,
            current_version=current_ver_res,
            versions=[PackageVersionResponse.model_validate(v) for v in pkg.versions]
        )

    @staticmethod
    def get_all_packages(db: Session) -> List[PackageResponse]:
        packages = db.query(Package).all()
        result = []
        for pkg in packages:
            current_ver = next((v for v in pkg.versions if v.is_current), None)
            current_ver_res = PackageVersionResponse.model_validate(current_ver) if current_ver else None
            result.append(
                PackageResponse(
                    id=pkg.id,
                    code=pkg.code,
                    name=pkg.name,
                    tier=pkg.tier,
                    service_id=pkg.service_id,
                    service_name=pkg.service.name if pkg.service else None,
                    status=pkg.status,
                    created_at=pkg.created_at,
                    updated_at=pkg.updated_at,
                    current_version=current_ver_res,
                    versions=[PackageVersionResponse.model_validate(v) for v in pkg.versions]
                )
            )
        return result

    @staticmethod
    def create_package(db: Session, req: PackageCreate) -> PackageResponse:
        existing = db.query(Package).filter(Package.code == req.code).first()
        if existing:
            raise EntityAlreadyExistsException("Package", "code")

        pkg = Package(
            code=req.code,
            name=req.name,
            tier=req.tier,
            service_id=req.service_id,
            status=req.status
        )
        db.add(pkg)
        db.flush()

        # Create version 1
        v_req = req.initial_version
        version = PackageVersion(
            package_id=pkg.id,
            version_number=1,
            price=v_req.price,
            currency=v_req.currency,
            quota_type=v_req.quota_type,
            quota_amount=v_req.quota_amount,
            duration=v_req.duration,
            billing_type=v_req.billing_type,
            api_access=v_req.api_access,
            batch_processing=v_req.batch_processing,
            priority_processing=v_req.priority_processing,
            auto_renewal=v_req.auto_renewal,
            overage_policy=v_req.overage_policy,
            features=v_req.features,
            is_current=True
        )
        db.add(version)
        db.commit()
        db.refresh(pkg)

        return PackageService.get_package_by_id(db, pkg.id)

    @staticmethod
    def update_package(db: Session, package_id: str, req: PackageUpdate) -> PackageResponse:
        pkg = db.query(Package).filter(or_(Package.id == package_id, Package.code == package_id)).first()
        if not pkg:
            raise EntityNotFoundException("Package", package_id)

        update_data = req.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            setattr(pkg, key, val)

        db.commit()
        db.refresh(pkg)
        return PackageService.get_package_by_id(db, pkg.id)

    @staticmethod
    def create_package_version(db: Session, package_id: str, req: PackageVersionCreate) -> PackageVersionResponse:
        pkg = db.query(Package).filter(or_(Package.id == package_id, Package.code == package_id)).first()
        if not pkg:
            raise EntityNotFoundException("Package", package_id)

        # Mark previous versions as not current
        db.query(PackageVersion).filter(PackageVersion.package_id == pkg.id).update({"is_current": False})

        # Find latest version number
        latest_version = max([v.version_number for v in pkg.versions], default=0)
        new_version_number = latest_version + 1

        new_version = PackageVersion(
            package_id=pkg.id,
            version_number=new_version_number,
            price=req.price,
            currency=req.currency,
            quota_type=req.quota_type,
            quota_amount=req.quota_amount,
            duration=req.duration,
            billing_type=req.billing_type,
            api_access=req.api_access,
            batch_processing=req.batch_processing,
            priority_processing=req.priority_processing,
            auto_renewal=req.auto_renewal,
            overage_policy=req.overage_policy,
            features=req.features,
            is_current=True
        )
        db.add(new_version)
        db.commit()
        db.refresh(new_version)

        return PackageVersionResponse.model_validate(new_version)

    @staticmethod
    def toggle_package_active(db: Session, package_id: str, active: bool = True) -> PackageResponse:
        pkg = db.query(Package).filter(or_(Package.id == package_id, Package.code == package_id)).first()
        if not pkg:
            raise EntityNotFoundException("Package", package_id)
        
        pkg.status = "active" if active else "inactive"
        db.commit()
        db.refresh(pkg)
        return PackageService.get_package_by_id(db, pkg.id)

    @staticmethod
    def get_credit_rates(db: Session) -> List[CreditRateResponse]:
        rates = db.query(CreditRate).all()
        return [CreditRateResponse.model_validate(r) for r in rates]
