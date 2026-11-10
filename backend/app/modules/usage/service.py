from typing import List
from sqlalchemy.orm import Session
from app.common.models.usage import UsageBalance, UsageRecord
from app.common.models.licenses import License
from app.common.schemas.usage import UsageSummaryResponse, UsageBalanceResponse, UsageHistoryResponse, UsageRecordResponse
from app.common.enums import LicenseStatus

class UsageService:
    @staticmethod
    def get_user_usage_summary(db: Session, user_id: str) -> UsageSummaryResponse:
        balances = db.query(UsageBalance).filter(UsageBalance.user_id == user_id).all()
        active_licenses = db.query(License).filter(
            License.user_id == user_id,
            License.status == LicenseStatus.ACTIVE
        ).count()

        total_q = sum(b.total_quota for b in balances)
        used_q = sum(b.used_quota for b in balances)
        rem_q = sum(b.remaining_quota for b in balances)

        b_responses = [
            UsageBalanceResponse(
                license_id=b.license_id,
                quota_type=b.quota_type,
                total_quota=b.total_quota,
                used_quota=b.used_quota,
                reserved_quota=b.reserved_quota,
                remaining_quota=b.remaining_quota,
                updated_at=b.updated_at
            )
            for b in balances
        ]

        return UsageSummaryResponse(
            total_quota=total_q,
            used_quota=used_q,
            remaining_quota=rem_q,
            active_licenses=active_licenses,
            balances=b_responses
        )

    @staticmethod
    def get_user_usage_history(db: Session, user_id: str, limit: int = 50) -> UsageHistoryResponse:
        records = db.query(UsageRecord).filter(UsageRecord.user_id == user_id).order_by(UsageRecord.created_at.desc()).limit(limit).all()
        rec_responses = [
            UsageRecordResponse(
                id=r.id,
                license_id=r.license_id,
                service_id=r.service_id,
                service_name=r.service.name if r.service else None,
                job_id=r.job_id,
                amount=r.amount,
                quota_type=r.quota_type,
                unit_cost=r.unit_cost,
                created_at=r.created_at
            )
            for r in records
        ]

        return UsageHistoryResponse(
            total_records=len(rec_responses),
            records=rec_responses
        )
