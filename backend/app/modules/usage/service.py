from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.common.models.usage import UsageBalance, UsageRecord
from app.common.models.licenses import License
from app.common.models.subscriptions import Subscription
from app.common.models.ocr_jobs import OCRJobRecord
from app.common.schemas.usage import (
    UsageSummaryResponse,
    UsageBalanceResponse,
    UsageHistoryResponse,
    UsageRecordResponse,
    CustomerDailyUsagePoint,
    CustomerServiceBreakdownPoint,
)
from app.common.enums import LicenseStatus, SubscriptionStatus


class UsageService:
    @staticmethod
    def get_user_usage_summary(db: Session, user_id: str) -> UsageSummaryResponse:
        balances = db.query(UsageBalance).filter(UsageBalance.user_id == user_id).all()
        active_licenses = db.query(License).filter(
            License.user_id == user_id,
            License.status == LicenseStatus.ACTIVE,
        ).count()
        active_subscriptions = db.query(Subscription).filter(
            Subscription.user_id == user_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
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
                updated_at=b.updated_at,
            )
            for b in balances
        ]

        usage_records = (
            db.query(UsageRecord)
            .filter(UsageRecord.user_id == user_id)
            .order_by(UsageRecord.created_at.asc())
            .all()
        )
        ocr_jobs = db.query(OCRJobRecord).filter(OCRJobRecord.user_id == user_id).all()
        total_jobs = max(len(ocr_jobs), len(usage_records))

        latencies = [j.execution_time_ms for j in ocr_jobs if j.execution_time_ms and j.execution_time_ms > 0]
        avg_latency_ms = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

        # Real daily usage over the last 30 days
        today = datetime.now(timezone.utc).date()
        daily_units: Dict[str, int] = {}
        daily_jobs: Dict[str, int] = {}
        for i in range(29, -1, -1):
            d_str = (today - timedelta(days=i)).isoformat()
            daily_units[d_str] = 0
            daily_jobs[d_str] = 0

        for r in usage_records:
            if r.created_at:
                d_str = r.created_at.date().isoformat()
                if d_str in daily_units:
                    daily_units[d_str] += int(r.amount)
                    daily_jobs[d_str] += 1

        daily_usage = [
            CustomerDailyUsagePoint(date=d_str, units=daily_units[d_str], jobs=daily_jobs[d_str])
            for d_str in daily_units
        ]

        # Real service usage breakdown
        user_subs = db.query(Subscription).filter(Subscription.user_id == user_id).all()
        user_lics = db.query(License).filter(License.user_id == user_id).all()

        srv_map: Dict[str, Dict] = {}

        def ensure_srv(sid: str, name: Optional[str]):
            if sid not in srv_map:
                srv_map[sid] = {
                    "name": name or sid,
                    "units": 0,
                    "jobs": 0,
                    "subs": 0,
                    "lics": 0,
                }
            elif name and srv_map[sid]["name"] == sid:
                srv_map[sid]["name"] = name

        for s in user_subs:
            ensure_srv(s.service_id, s.service.name if s.service else None)
            srv_map[s.service_id]["subs"] += 1
        for l in user_lics:
            ensure_srv(l.service_id, l.service.name if l.service else None)
            srv_map[l.service_id]["lics"] += 1
        for r in usage_records:
            ensure_srv(r.service_id, r.service.name if r.service else None)
            srv_map[r.service_id]["units"] += int(r.amount)
            srv_map[r.service_id]["jobs"] += 1

        total_usage_units = sum(v["units"] for v in srv_map.values())
        service_breakdown: List[CustomerServiceBreakdownPoint] = []
        if total_usage_units > 0:
            for sid, info in srv_map.items():
                if info["units"] <= 0:
                    continue
                pct = round((info["units"] / total_usage_units) * 100.0, 1)
                service_breakdown.append(
                    CustomerServiceBreakdownPoint(
                        service_id=sid,
                        service_name=info["name"],
                        usage_units=info["units"],
                        jobs_count=info["jobs"],
                        subscriptions_count=info["subs"],
                        licenses_count=info["lics"],
                        percentage=pct,
                    )
                )
            service_breakdown.sort(key=lambda x: x.usage_units, reverse=True)

        return UsageSummaryResponse(
            total_quota=total_q,
            used_quota=used_q,
            remaining_quota=rem_q,
            active_licenses=active_licenses,
            active_subscriptions=active_subscriptions,
            total_jobs=total_jobs,
            avg_latency_ms=avg_latency_ms,
            balances=b_responses,
            daily_usage=daily_usage,
            service_breakdown=service_breakdown,
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
                created_at=r.created_at,
            )
            for r in records
        ]

        return UsageHistoryResponse(
            total_records=len(rec_responses),
            records=rec_responses,
        )
