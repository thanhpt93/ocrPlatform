import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from app.common.models.users import User
from app.common.models.packages import PackageVersion
from app.common.models.licenses import License, LicenseEntitlement, LicenseEvent
from app.common.models.credentials import APICredential
from app.common.models.usage import UsageBalance, UsageLedger
from app.common.schemas.licenses import (
    LicenseResponse, LicenseDetailResponse, LicenseEntitlementResponse,
    LicenseEventResponse, LicenseActivateRequest, LicenseGenerateRequest,
    APICredentialCreate, APICredentialResponse, APICredentialCreatedResponse
)
from app.common.enums import (
    LicenseStatus, CredentialStatus, LedgerEntryType, Duration, QuotaType
)
from app.core.exceptions import EntityNotFoundException, ForbiddenException, BadRequestException
from app.core.security import generate_license_key, generate_api_key, hash_secret

def utc_now():
    return datetime.now(timezone.utc)

class LicenseService:
    @staticmethod
    def get_user_licenses(db: Session, user_id: str) -> List[LicenseResponse]:
        licenses = db.query(License).filter(License.user_id == user_id).order_by(License.created_at.desc()).all()
        return [LicenseService._to_response(l) for l in licenses]

    @staticmethod
    def get_license_by_id(db: Session, license_id: str, user_id: str, is_admin: bool = False) -> LicenseDetailResponse:
        lic = db.query(License).filter(License.id == license_id).first()
        if not lic:
            raise EntityNotFoundException("License", license_id)
        if not is_admin and lic.user_id != user_id:
            raise ForbiddenException("You do not have access to this license")

        events = [
            LicenseEventResponse(
                id=e.id,
                action=e.action,
                actor_id=e.actor_id,
                notes=e.notes,
                created_at=e.created_at
            )
            for e in lic.events
        ]

        res = LicenseService._to_response(lic)
        return LicenseDetailResponse(**res.model_dump(), events=events)

    @staticmethod
    def activate_license(db: Session, user: User, req: LicenseActivateRequest) -> LicenseResponse:
        raw_key = req.license_key.strip()
        key_hash = hash_secret(raw_key)

        lic = db.query(License).filter(License.key_hash == key_hash).first()
        if not lic:
            raise EntityNotFoundException("License with provided key was")

        if lic.user_id != user.id:
            raise ForbiddenException("This license does not belong to your account")

        if lic.status == LicenseStatus.REVOKED:
            raise BadRequestException("Cannot activate a revoked license")

        if lic.status == LicenseStatus.EXPIRED or lic.expires_at < utc_now():
            raise BadRequestException("License has expired")

        lic.status = LicenseStatus.ACTIVE
        lic.updated_at = utc_now()

        event = LicenseEvent(
            license_id=lic.id,
            action="MANUAL_ACTIVATION",
            actor_id=user.id,
            notes="Activated manually by user with license key"
        )
        db.add(event)
        db.commit()
        db.refresh(lic)

        return LicenseService._to_response(lic)

    # API Credentials Management
    @staticmethod
    def create_api_credential(db: Session, user: User, license_id: str, req: APICredentialCreate) -> APICredentialCreatedResponse:
        lic = db.query(License).filter(License.id == license_id).first()
        if not lic:
            raise EntityNotFoundException("License", license_id)
        if lic.user_id != user.id:
            raise ForbiddenException("You do not own this license")
        if lic.status != LicenseStatus.ACTIVE:
            raise BadRequestException("Cannot create API credential for an inactive license")

        raw_secret, key_prefix, secret_hash, masked_key = generate_api_key(req.name)
        cred = APICredential(
            name=req.name,
            key_prefix=key_prefix,
            secret_hash=secret_hash,
            user_id=user.id,
            license_id=lic.id,
            status=CredentialStatus.ACTIVE
        )
        db.add(cred)
        db.commit()
        db.refresh(cred)

        return APICredentialCreatedResponse(
            id=cred.id,
            name=cred.name,
            key_prefix=cred.key_prefix,
            masked_key=masked_key,
            license_id=cred.license_id,
            status=cred.status,
            last_used_at=cred.last_used_at,
            created_at=cred.created_at,
            api_key=raw_secret  # Return raw secret ONCE upon creation
        )

    @staticmethod
    def get_license_credentials(db: Session, user: User, license_id: str) -> List[APICredentialResponse]:
        lic = db.query(License).filter(License.id == license_id).first()
        if not lic:
            raise EntityNotFoundException("License", license_id)
        if lic.user_id != user.id:
            raise ForbiddenException("You do not own this license")

        creds = db.query(APICredential).filter(APICredential.license_id == license_id).order_by(APICredential.created_at.desc()).all()
        return [
            APICredentialResponse(
                id=c.id,
                name=c.name,
                key_prefix=c.key_prefix,
                masked_key=f"{c.key_prefix}...****",
                license_id=c.license_id,
                status=c.status,
                last_used_at=c.last_used_at,
                created_at=c.created_at
            )
            for c in creds
        ]

    @staticmethod
    def revoke_api_credential(db: Session, user: User, license_id: str, credential_id: str):
        cred = db.query(APICredential).filter(
            APICredential.id == credential_id,
            APICredential.license_id == license_id
        ).first()
        if not cred:
            raise EntityNotFoundException("API Credential", credential_id)
        if cred.user_id != user.id:
            raise ForbiddenException("You do not own this credential")

        cred.status = CredentialStatus.REVOKED
        cred.revoked_at = utc_now()
        db.commit()

    # Admin complimentary license issuance
    @staticmethod
    def admin_generate_license(db: Session, req: LicenseGenerateRequest, admin_id: str) -> tuple[LicenseResponse, str]:
        pkg_version = db.query(PackageVersion).filter(PackageVersion.id == req.package_version_id).first()
        if not pkg_version:
            raise EntityNotFoundException("PackageVersion", req.package_version_id)

        target_user = db.query(User).filter(User.id == req.user_id).first()
        if not target_user:
            raise EntityNotFoundException("User", req.user_id)

        start_date = utc_now()
        end_date = start_date + timedelta(days=365)
        service_id = pkg_version.package.service_id

        raw_key, key_hash, masked_key = generate_license_key()
        license_obj = License(
            key_hash=key_hash,
            masked_key=masked_key,
            user_id=target_user.id,
            package_version_id=pkg_version.id,
            service_id=service_id,
            status=LicenseStatus.ACTIVE,
            issued_at=start_date,
            expires_at=end_date
        )
        db.add(license_obj)
        db.flush()

        entitlement = LicenseEntitlement(
            license_id=license_obj.id,
            quota_type=pkg_version.quota_type,
            initial_quota=pkg_version.quota_amount,
            api_access=pkg_version.api_access,
            batch_processing=pkg_version.batch_processing,
            priority_processing=pkg_version.priority_processing,
            features=pkg_version.features
        )
        db.add(entitlement)

        event = LicenseEvent(
            license_id=license_obj.id,
            action="COMPLIMENTARY_GRANT",
            actor_id=admin_id,
            notes=req.notes or "Admin complimentary license grant"
        )
        db.add(event)

        usage_balance = UsageBalance(
            license_id=license_obj.id,
            user_id=target_user.id,
            quota_type=pkg_version.quota_type,
            total_quota=pkg_version.quota_amount,
            used_quota=0,
            reserved_quota=0,
            remaining_quota=pkg_version.quota_amount
        )
        db.add(usage_balance)

        ledger_entry = UsageLedger(
            license_id=license_obj.id,
            delta=pkg_version.quota_amount,
            balance_after=pkg_version.quota_amount,
            entry_type=LedgerEntryType.CREDIT_INITIAL,
            reference_type="admin_grant",
            reference_id=license_obj.id
        )
        db.add(ledger_entry)

        db.commit()
        db.refresh(license_obj)

        return LicenseService._to_response(license_obj), raw_key

    @staticmethod
    def _to_response(lic: License) -> LicenseResponse:
        srv_name = lic.service.name if lic.service else None
        pkg_name = lic.package_version.package.name if lic.package_version and lic.package_version.package else None
        pkg_id = lic.package_version.package_id if lic.package_version else None

        total_q = lic.usage_balance.total_quota if lic.usage_balance else 0
        used_q = lic.usage_balance.used_quota if lic.usage_balance else 0
        rem_q = lic.usage_balance.remaining_quota if lic.usage_balance else 0

        ent_res = None
        if lic.entitlement:
            ent_res = LicenseEntitlementResponse(
                quota_type=lic.entitlement.quota_type,
                initial_quota=lic.entitlement.initial_quota,
                api_access=lic.entitlement.api_access,
                batch_processing=lic.entitlement.batch_processing,
                priority_processing=lic.entitlement.priority_processing,
                features=lic.entitlement.features
            )

        return LicenseResponse(
            id=lic.id,
            masked_key=lic.masked_key,
            user_id=lic.user_id,
            service_id=lic.service_id,
            service_name=srv_name,
            package_id=pkg_id,
            package_name=pkg_name,
            subscription_id=lic.subscription_id,
            status=lic.status,
            quota=total_q,
            used_quota=used_q,
            remaining_quota=rem_q,
            issued_at=lic.issued_at,
            expires_at=lic.expires_at,
            created_at=lic.created_at,
            entitlement=ent_res
        )
