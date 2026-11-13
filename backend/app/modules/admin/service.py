from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import EntityNotFoundException, EntityAlreadyExistsException, BadRequestException
from app.core.security import get_password_hash
from app.common.enums import (
    UserRole, UserStatus, ServiceStatus, SubscriptionStatus,
    LicenseStatus, OrderStatus, CredentialStatus
)
from app.common.models.users import User
from app.common.models.ocr_catalog import OCRService
from app.common.models.packages import Package, PackageVersion
from app.common.models.orders import Order, Payment
from app.common.models.subscriptions import Subscription
from app.common.models.licenses import License, LicenseEvent
from app.common.models.usage import UsageBalance, UsageRecord
from app.common.models.credentials import APICredential
from app.common.models.audit import AuditLog
from app.common.schemas.auth import UserProfileResponse
from app.common.schemas.licenses import LicenseEntitlementResponse, LicenseEventResponse
from app.common.schemas.admin import (
    AdminDashboardStatsResponse,
    MonthlyRevenuePoint,
    ServicePopularityPoint,
    DailyUsagePoint,
    CustomerGrowthPoint,
    AdminCustomerSummary,
    AdminCustomerDetailResponse,
    AdminSubscriptionResponse,
    AdminOrderResponse,
    AdminPaymentResponse,
    AdminLicenseResponse,
    AdminUsageRecordResponse,
    AdminMonitoringResponse,
    AdminOperatorResponse,
    AdminOperatorCreateRequest,
    AuditLogResponse,
    AdminSystemConfigResponse,
)
from app.modules.ocr_engine.service import OCREngineService


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _month_keys(num_months: int = 6) -> List[tuple[str, str]]:
    """Return list of (YYYY-MM, Label e.g. 'Nov') for the last `num_months` months."""
    now = utc_now()
    year = now.year
    month = now.month
    pairs: List[tuple[int, int]] = []
    for _ in range(num_months):
        pairs.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    pairs.reverse()
    out: List[tuple[str, str]] = []
    for y, m in pairs:
        dt = datetime(y, m, 1)
        out.append((f"{y:04d}-{m:02d}", dt.strftime("%b %Y")))
    return out


class AdminService:
    @staticmethod
    def record_audit_log(
        db: Session,
        actor_id: str,
        actor_email: str,
        action: str,
        resource_type: str,
        resource_id: str,
        details: Optional[str] = None,
        severity: str = "info",
        ip_address: Optional[str] = None,
        commit: bool = True,
    ) -> AuditLog:
        log = AuditLog(
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            severity=severity,
            ip_address=ip_address,
            created_at=utc_now(),
        )
        db.add(log)
        if commit:
            db.commit()
            db.refresh(log)
        return log

    @staticmethod
    def _derive_customer_tier(db: Session, user_id: str) -> str:
        subs = (
            db.query(Subscription)
            .filter(Subscription.user_id == user_id)
            .order_by(Subscription.created_at.desc())
            .all()
        )
        if not subs:
            return "Standard"
        # Prefer active subscription tier
        active_sub = next((s for s in subs if s.status == SubscriptionStatus.ACTIVE), subs[0])
        if active_sub.package_version and active_sub.package_version.package:
            return active_sub.package_version.package.tier.value
        return "Standard"

    @staticmethod
    def build_customer_summary(db: Session, user: User) -> AdminCustomerSummary:
        profile_res = None
        if user.profile:
            profile_res = UserProfileResponse(
                phone=user.profile.phone,
                address=user.profile.address,
                tax_id=user.profile.tax_id,
                company_name=user.profile.company_name,
                avatar_url=user.profile.avatar_url,
            )

        active_subs_count = (
            db.query(Subscription)
            .filter(Subscription.user_id == user.id, Subscription.status == SubscriptionStatus.ACTIVE)
            .count()
        )
        active_lics_count = (
            db.query(License)
            .filter(License.user_id == user.id, License.status == LicenseStatus.ACTIVE)
            .count()
        )
        usage_records_sum = (
            db.query(func.coalesce(func.sum(UsageRecord.amount), 0))
            .filter(UsageRecord.user_id == user.id)
            .scalar()
        ) or 0
        balance_used_sum = (
            db.query(func.coalesce(func.sum(UsageBalance.used_quota), 0))
            .filter(UsageBalance.user_id == user.id)
            .scalar()
        ) or 0
        total_usage = int(max(usage_records_sum, balance_used_sum))

        total_spend = float(
            (
                db.query(func.coalesce(func.sum(Order.amount), 0.0))
                .filter(Order.user_id == user.id, Order.status == OrderStatus.COMPLETED)
                .scalar()
            )
            or 0.0
        )

        thirty_days_ago = utc_now() - timedelta(days=30)
        monthly_spend = float(
            (
                db.query(func.coalesce(func.sum(Order.amount), 0.0))
                .filter(
                    Order.user_id == user.id,
                    Order.status == OrderStatus.COMPLETED,
                    Order.created_at >= thirty_days_ago,
                )
                .scalar()
            )
            or 0.0
        )

        return AdminCustomerSummary(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            status=user.status,
            created_at=user.created_at,
            profile=profile_res,
            tier=AdminService._derive_customer_tier(db, user.id),
            active_subscriptions_count=active_subs_count,
            active_licenses_count=active_lics_count,
            total_usage=total_usage,
            total_spend=total_spend,
            monthly_spend=monthly_spend,
        )

    @staticmethod
    def get_customers_overview(db: Session) -> List[AdminCustomerSummary]:
        customers = (
            db.query(User)
            .filter(User.role == UserRole.CUSTOMER)
            .order_by(User.created_at.desc())
            .all()
        )
        return [AdminService.build_customer_summary(db, c) for c in customers]

    @staticmethod
    def _to_admin_subscription(s: Subscription) -> AdminSubscriptionResponse:
        user = s.user
        srv = s.service
        pkg_ver = s.package_version
        pkg = pkg_ver.package if pkg_ver else None
        lic = next((l for l in (s.licenses or []) if l.usage_balance is not None), None)
        if lic is None and s.licenses:
            lic = s.licenses[0]

        bal = lic.usage_balance if lic else None
        total_q = bal.total_quota if bal else (pkg_ver.quota_amount if pkg_ver else 0)
        used_q = bal.used_quota if bal else 0
        rem_q = bal.remaining_quota if bal else total_q

        customer_name = (
            (user.profile.company_name if user and user.profile and user.profile.company_name else None)
            or (user.full_name if user else None)
            or (user.email if user else "Unknown")
        )
        return AdminSubscriptionResponse(
            id=s.id,
            user_id=s.user_id,
            customer_name=customer_name,
            customer_email=user.email if user else "",
            service_id=s.service_id,
            service_name=srv.name if srv else None,
            package_id=pkg.id if pkg else None,
            package_name=pkg.name if pkg else None,
            package_version_id=s.package_version_id,
            version_number=pkg_ver.version_number if pkg_ver else 1,
            order_id=s.order_id,
            start_date=s.start_date,
            end_date=s.end_date,
            auto_renew=s.auto_renew,
            status=s.status,
            total_quota=total_q,
            used_quota=used_q,
            remaining_quota=rem_q,
            price=float(pkg_ver.price) if pkg_ver else 0.0,
            currency=pkg_ver.currency if pkg_ver else "USD",
            billing_cycle=pkg_ver.duration.value if pkg_ver and pkg_ver.duration else "monthly",
            created_at=s.created_at,
        )

    @staticmethod
    def _to_admin_order(o: Order) -> AdminOrderResponse:
        user = o.user
        pkg_ver = o.package_version
        pkg = pkg_ver.package if pkg_ver else None
        srv = pkg.service if pkg else None
        customer_name = (
            (user.profile.company_name if user and user.profile and user.profile.company_name else None)
            or (user.full_name if user else None)
            or (user.email if user else "Unknown")
        )
        first_payment = o.payments[0] if o.payments else None
        return AdminOrderResponse(
            id=o.id,
            order_number=o.order_number,
            user_id=o.user_id,
            customer_name=customer_name,
            customer_email=user.email if user else "",
            package_version_id=o.package_version_id,
            service_name=srv.name if srv else None,
            package_name=pkg.name if pkg else None,
            amount=float(o.amount),
            currency=o.currency,
            status=o.status,
            payment_method=first_payment.method if first_payment else None,
            created_at=o.created_at,
            updated_at=o.updated_at,
        )

    @staticmethod
    def _to_admin_payment(p: Payment) -> AdminPaymentResponse:
        user = p.user
        customer_name = (
            (user.profile.company_name if user and user.profile and user.profile.company_name else None)
            or (user.full_name if user else None)
            or (user.email if user else "Unknown")
        )
        return AdminPaymentResponse(
            id=p.id,
            payment_number=p.payment_number,
            order_id=p.order_id,
            order_number=p.order.order_number if p.order else None,
            user_id=p.user_id,
            customer_name=customer_name,
            customer_email=user.email if user else "",
            amount=float(p.amount),
            currency=p.currency,
            method=p.method,
            status=p.status,
            transaction_reference=p.transaction_reference,
            failure_reason=p.failure_reason,
            created_at=p.created_at,
        )

    @staticmethod
    def _to_admin_license(lic: License) -> AdminLicenseResponse:
        user = lic.user
        srv = lic.service
        pkg_ver = lic.package_version
        pkg = pkg_ver.package if pkg_ver else None
        bal = lic.usage_balance
        customer_name = (
            (user.profile.company_name if user and user.profile and user.profile.company_name else None)
            or (user.full_name if user else None)
            or (user.email if user else "Unknown")
        )
        ent_res = None
        if lic.entitlement:
            ent_res = LicenseEntitlementResponse.model_validate(lic.entitlement)
        events_res = [
            LicenseEventResponse.model_validate(ev)
            for ev in sorted(lic.events or [], key=lambda e: e.created_at, reverse=True)
        ]
        return AdminLicenseResponse(
            id=lic.id,
            masked_key=lic.masked_key,
            user_id=lic.user_id,
            customer_name=customer_name,
            customer_email=user.email if user else "",
            service_id=lic.service_id,
            service_name=srv.name if srv else None,
            package_id=pkg.id if pkg else None,
            package_name=pkg.name if pkg else None,
            subscription_id=lic.subscription_id,
            status=lic.status,
            quota=bal.total_quota if bal else 0,
            used_quota=bal.used_quota if bal else 0,
            remaining_quota=bal.remaining_quota if bal else 0,
            issued_at=lic.issued_at,
            expires_at=lic.expires_at,
            created_at=lic.created_at,
            entitlement=ent_res,
            events=events_res,
        )

    @staticmethod
    def _to_admin_usage_record(r: UsageRecord) -> AdminUsageRecordResponse:
        user = r.user
        customer_name = (
            (user.profile.company_name if user and user.profile and user.profile.company_name else None)
            or (user.full_name if user else None)
            or (user.email if user else "Unknown")
        )
        return AdminUsageRecordResponse(
            id=r.id,
            job_id=r.job_id,
            user_id=r.user_id,
            customer_name=customer_name,
            customer_email=user.email if user else "",
            license_id=r.license_id,
            masked_key=r.license.masked_key if r.license else None,
            service_id=r.service_id,
            service_name=r.service.name if r.service else None,
            amount=r.amount,
            quota_type=r.quota_type.value if r.quota_type else "Page",
            unit_cost=float(r.unit_cost),
            created_at=r.created_at,
        )

    @staticmethod
    def _to_audit_log_response(db: Session, log: AuditLog, user_cache: Dict[str, str]) -> AuditLogResponse:
        actor_name = user_cache.get(log.actor_id)
        if actor_name is None:
            actor = db.query(User).filter(User.id == log.actor_id).first()
            actor_name = actor.full_name if actor else log.actor_email
            user_cache[log.actor_id] = actor_name
        return AuditLogResponse(
            id=log.id,
            actor_id=log.actor_id,
            actor_name=actor_name,
            actor_email=log.actor_email,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            ip_address=log.ip_address,
            details=log.details,
            severity=log.severity,
            created_at=log.created_at,
        )

    @staticmethod
    def get_dashboard_stats(db: Session) -> AdminDashboardStatsResponse:
        customers = db.query(User).filter(User.role == UserRole.CUSTOMER).all()
        services = db.query(OCRService).all()
        subs = db.query(Subscription).all()
        licenses = db.query(License).all()
        completed_orders = db.query(Order).filter(Order.status == OrderStatus.COMPLETED).all()
        usage_records = db.query(UsageRecord).all()

        total_customers = len(customers)
        total_services = len(services)
        active_services = sum(1 for s in services if s.status == ServiceStatus.PUBLISHED)
        active_subscriptions = sum(1 for s in subs if s.status == SubscriptionStatus.ACTIVE)
        active_licenses = sum(1 for l in licenses if l.status == LicenseStatus.ACTIVE)
        total_ocr_jobs = len(usage_records)

        records_units = sum(r.amount for r in usage_records)
        balances_used = int(db.query(func.coalesce(func.sum(UsageBalance.used_quota), 0)).scalar() or 0)
        total_usage_units = max(records_units, balances_used)

        total_revenue = float(sum(o.amount for o in completed_orders))

        # 1. Monthly Revenue & Volume (last 6 months)
        months = _month_keys(6)
        rev_by_month: Dict[str, float] = {m_key: 0.0 for m_key, _ in months}
        ord_by_month: Dict[str, int] = {m_key: 0 for m_key, _ in months}
        vol_by_month: Dict[str, int] = {m_key: 0 for m_key, _ in months}

        for o in completed_orders:
            mk = o.created_at.strftime("%Y-%m")
            if mk in rev_by_month:
                rev_by_month[mk] += float(o.amount)
                ord_by_month[mk] += 1

        for r in usage_records:
            mk = r.created_at.strftime("%Y-%m")
            if mk in vol_by_month:
                vol_by_month[mk] += int(r.amount)

        monthly_revenue = [
            MonthlyRevenuePoint(
                month=label,
                revenue=round(rev_by_month[m_key], 2),
                orders=ord_by_month[m_key],
                volume=vol_by_month[m_key],
            )
            for m_key, label in months
        ]

        # 2. Service Popularity (real subscriptions & usage)
        srv_map: Dict[str, Dict] = {
            s.id: {"name": s.name, "subs": 0, "units": 0}
            for s in services
        }
        for sub in subs:
            if sub.service_id in srv_map:
                srv_map[sub.service_id]["subs"] += 1
        for rec in usage_records:
            if rec.service_id in srv_map:
                srv_map[rec.service_id]["units"] += int(rec.amount)

        # Weight popularity by usage units if any, else by subscription count
        total_weight = sum((v["units"] if v["units"] > 0 else v["subs"]) for v in srv_map.values())
        service_popularity: List[ServicePopularityPoint] = []
        for sid, data in srv_map.items():
            if data["subs"] == 0 and data["units"] == 0:
                continue
            weight = data["units"] if data["units"] > 0 else data["subs"]
            pct = round((weight / total_weight) * 100.0, 1) if total_weight > 0 else 0.0
            service_popularity.append(
                ServicePopularityPoint(
                    service_id=sid,
                    name=data["name"],
                    subscriptions=data["subs"],
                    usage_units=data["units"],
                    percentage=pct,
                )
            )
        service_popularity.sort(key=lambda x: (x.usage_units, x.subscriptions), reverse=True)

        # 3. Daily Usage (last 30 days)
        today = utc_now().date()
        daily_units: Dict[str, int] = {}
        daily_jobs: Dict[str, int] = {}
        for i in range(29, -1, -1):
            d_str = (today - timedelta(days=i)).isoformat()
            daily_units[d_str] = 0
            daily_jobs[d_str] = 0

        for r in usage_records:
            d_str = r.created_at.date().isoformat()
            if d_str in daily_units:
                daily_units[d_str] += int(r.amount)
                daily_jobs[d_str] += 1

        daily_usage = [
            DailyUsagePoint(date=d_str, units=daily_units[d_str], jobs=daily_jobs[d_str])
            for d_str in daily_units
        ]

        # 4. Customer Growth (last 6 months cumulative + new)
        first_month_key = months[0][0]
        baseline_customers = sum(1 for c in customers if c.created_at.strftime("%Y-%m") < first_month_key)
        new_by_month: Dict[str, int] = {m_key: 0 for m_key, _ in months}
        for c in customers:
            mk = c.created_at.strftime("%Y-%m")
            if mk in new_by_month:
                new_by_month[mk] += 1

        customer_growth: List[CustomerGrowthPoint] = []
        running_total = baseline_customers
        for m_key, label in months:
            new_c = new_by_month[m_key]
            running_total += new_c
            customer_growth.append(
                CustomerGrowthPoint(month=label, total=running_total, new_customers=new_c)
            )

        return AdminDashboardStatsResponse(
            total_customers=total_customers,
            active_services=active_services,
            total_services=total_services,
            active_subscriptions=active_subscriptions,
            active_licenses=active_licenses,
            total_usage_units=total_usage_units,
            total_ocr_jobs=total_ocr_jobs,
            total_revenue=round(total_revenue, 2),
            monthly_revenue=monthly_revenue,
            service_popularity=service_popularity,
            daily_usage=daily_usage,
            customer_growth=customer_growth,
        )

    @staticmethod
    def get_customer_detail(db: Session, customer_id: str) -> AdminCustomerDetailResponse:
        user = db.query(User).filter(User.id == customer_id, User.role == UserRole.CUSTOMER).first()
        if not user:
            raise EntityNotFoundException("Customer", customer_id)

        summary = AdminService.build_customer_summary(db, user)
        subs = (
            db.query(Subscription)
            .filter(Subscription.user_id == customer_id)
            .order_by(Subscription.created_at.desc())
            .all()
        )
        lics = (
            db.query(License)
            .filter(License.user_id == customer_id)
            .order_by(License.created_at.desc())
            .all()
        )
        orders = (
            db.query(Order)
            .filter(Order.user_id == customer_id)
            .order_by(Order.created_at.desc())
            .all()
        )
        payments = (
            db.query(Payment)
            .filter(Payment.user_id == customer_id)
            .order_by(Payment.created_at.desc())
            .all()
        )
        usage_recs = (
            db.query(UsageRecord)
            .filter(UsageRecord.user_id == customer_id)
            .order_by(UsageRecord.created_at.desc())
            .limit(100)
            .all()
        )
        logs = (
            db.query(AuditLog)
            .filter((AuditLog.resource_id == customer_id) | (AuditLog.actor_id == customer_id))
            .order_by(AuditLog.created_at.desc())
            .limit(50)
            .all()
        )
        user_cache: Dict[str, str] = {}
        return AdminCustomerDetailResponse(
            customer=summary,
            subscriptions=[AdminService._to_admin_subscription(s) for s in subs],
            licenses=[AdminService._to_admin_license(l) for l in lics],
            orders=[AdminService._to_admin_order(o) for o in orders],
            payments=[AdminService._to_admin_payment(p) for p in payments],
            usage_records=[AdminService._to_admin_usage_record(r) for r in usage_recs],
            audit_logs=[AdminService._to_audit_log_response(db, log, user_cache) for log in logs],
        )

    @staticmethod
    def update_customer_status(
        db: Session,
        customer_id: str,
        new_status: UserStatus,
        admin: User,
        ip_address: Optional[str] = None,
    ) -> AdminCustomerSummary:
        user = db.query(User).filter(User.id == customer_id, User.role == UserRole.CUSTOMER).first()
        if not user:
            raise EntityNotFoundException("Customer", customer_id)

        old_status = user.status
        user.status = new_status
        user.updated_at = utc_now()
        AdminService.record_audit_log(
            db,
            actor_id=admin.id,
            actor_email=admin.email,
            action="CUSTOMER_STATUS_UPDATED",
            resource_type="customer",
            resource_id=user.id,
            details=f"Changed customer {user.email} status from {old_status.value} to {new_status.value}",
            severity="warning" if new_status == UserStatus.SUSPENDED else "info",
            ip_address=ip_address,
            commit=False,
        )
        db.commit()
        db.refresh(user)
        return AdminService.build_customer_summary(db, user)

    @staticmethod
    def get_all_subscriptions(db: Session) -> List[AdminSubscriptionResponse]:
        subs = db.query(Subscription).order_by(Subscription.created_at.desc()).all()
        return [AdminService._to_admin_subscription(s) for s in subs]

    @staticmethod
    def get_all_orders(db: Session) -> List[AdminOrderResponse]:
        orders = db.query(Order).order_by(Order.created_at.desc()).all()
        return [AdminService._to_admin_order(o) for o in orders]

    @staticmethod
    def get_all_payments(db: Session) -> List[AdminPaymentResponse]:
        payments = db.query(Payment).order_by(Payment.created_at.desc()).all()
        return [AdminService._to_admin_payment(p) for p in payments]

    @staticmethod
    def get_all_licenses_overview(db: Session) -> List[AdminLicenseResponse]:
        licenses = db.query(License).order_by(License.created_at.desc()).all()
        return [AdminService._to_admin_license(l) for l in licenses]

    @staticmethod
    def update_license_status(
        db: Session,
        license_id: str,
        new_status: LicenseStatus,
        notes: Optional[str],
        admin: User,
        ip_address: Optional[str] = None,
    ) -> AdminLicenseResponse:
        lic = db.query(License).filter(License.id == license_id).first()
        if not lic:
            raise EntityNotFoundException("License", license_id)

        old_status = lic.status
        lic.status = new_status
        lic.updated_at = utc_now()

        ev = LicenseEvent(
            license_id=lic.id,
            action=f"STATUS_{new_status.value.upper()}",
            actor_id=admin.id,
            notes=notes or f"Admin changed status from {old_status.value} to {new_status.value}",
            created_at=utc_now(),
        )
        db.add(ev)

        AdminService.record_audit_log(
            db,
            actor_id=admin.id,
            actor_email=admin.email,
            action="LICENSE_STATUS_UPDATED",
            resource_type="license",
            resource_id=lic.id,
            details=f"License {lic.masked_key} status changed from {old_status.value} to {new_status.value}",
            severity="warning" if new_status in (LicenseStatus.SUSPENDED, LicenseStatus.REVOKED) else "info",
            ip_address=ip_address,
            commit=False,
        )
        db.commit()
        db.refresh(lic)
        return AdminService._to_admin_license(lic)

    @staticmethod
    def get_usage_records(db: Session, limit: int = 100) -> List[AdminUsageRecordResponse]:
        records = db.query(UsageRecord).order_by(UsageRecord.created_at.desc()).limit(limit).all()
        return [AdminService._to_admin_usage_record(r) for r in records]

    @staticmethod
    def get_monitoring(db: Session) -> AdminMonitoringResponse:
        db_status = "online"
        try:
            db.query(User).limit(1).all()
        except Exception:
            db_status = "offline"

        ollama_ok, ollama_status = OCREngineService.check_ollama_health()
        installed_models = OCREngineService.get_installed_models() if ollama_ok else []
        loaded_models = OCREngineService.get_loaded_models() if ollama_ok else []

        total_jobs = db.query(UsageRecord).count()
        since_24h = utc_now() - timedelta(hours=24)
        jobs_24h = db.query(UsageRecord).filter(UsageRecord.created_at >= since_24h).count()
        active_licenses = db.query(License).filter(License.status == LicenseStatus.ACTIVE).count()
        active_creds = db.query(APICredential).filter(APICredential.status == CredentialStatus.ACTIVE).count()

        recent = db.query(UsageRecord).order_by(UsageRecord.created_at.desc()).limit(25).all()

        return AdminMonitoringResponse(
            backend_status="running",
            database_status=db_status,
            database_dialect=engine.dialect.name,
            ollama_status=ollama_status,
            ollama_base_url=settings.OLLAMA_BASE_URL,
            active_model=settings.OLLAMA_MODEL,
            installed_models=installed_models,
            loaded_models=loaded_models,
            total_jobs_processed=total_jobs,
            jobs_last_24h=jobs_24h,
            active_licenses=active_licenses,
            active_api_credentials=active_creds,
            recent_jobs=[AdminService._to_admin_usage_record(r) for r in recent],
        )

    @staticmethod
    def get_operators(db: Session) -> List[AdminOperatorResponse]:
        admins = (
            db.query(User)
            .filter(User.role == UserRole.PLATFORM_ADMIN)
            .order_by(User.created_at.asc())
            .all()
        )
        return [AdminOperatorResponse.model_validate(a) for a in admins]

    @staticmethod
    def create_operator(
        db: Session,
        req: AdminOperatorCreateRequest,
        admin: User,
        ip_address: Optional[str] = None,
    ) -> AdminOperatorResponse:
        email = req.email.lower()
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise EntityAlreadyExistsException("User", "email")

        new_admin = User(
            email=email,
            hashed_password=get_password_hash(req.password),
            full_name=req.full_name,
            role=UserRole.PLATFORM_ADMIN,
            status=UserStatus.ACTIVE,
        )
        db.add(new_admin)
        db.flush()

        AdminService.record_audit_log(
            db,
            actor_id=admin.id,
            actor_email=admin.email,
            action="OPERATOR_CREATED",
            resource_type="user",
            resource_id=new_admin.id,
            details=f"Created platform admin operator {new_admin.email} ({new_admin.full_name})",
            severity="warning",
            ip_address=ip_address,
            commit=False,
        )
        db.commit()
        db.refresh(new_admin)
        return AdminOperatorResponse.model_validate(new_admin)

    @staticmethod
    def get_audit_logs(db: Session, limit: int = 100) -> List[AuditLogResponse]:
        logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
        user_cache: Dict[str, str] = {}
        return [AdminService._to_audit_log_response(db, log, user_cache) for log in logs]

    @staticmethod
    def get_system_config() -> AdminSystemConfigResponse:
        return AdminSystemConfigResponse(
            ollama_base_url=settings.OLLAMA_BASE_URL,
            ollama_model=settings.OLLAMA_MODEL,
            ollama_num_ctx=settings.OLLAMA_NUM_CTX,
            ollama_num_predict=settings.OLLAMA_NUM_PREDICT,
            ollama_timeout_seconds=settings.OLLAMA_TIMEOUT_SECONDS,
            vlm_max_image_dimension=settings.VLM_MAX_IMAGE_DIMENSION,
            database_backend=engine.dialect.name,
            access_token_expire_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            refresh_token_expire_days=settings.REFRESH_TOKEN_EXPIRE_DAYS,
        )
