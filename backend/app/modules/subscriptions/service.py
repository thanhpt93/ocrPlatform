from typing import List
from sqlalchemy.orm import Session
from app.common.models.subscriptions import Subscription
from app.common.models.licenses import License
from app.common.schemas.subscriptions import SubscriptionResponse
from app.core.exceptions import EntityNotFoundException, ForbiddenException

class SubscriptionService:
    @staticmethod
    def get_user_subscriptions(db: Session, user_id: str) -> List[SubscriptionResponse]:
        subs = db.query(Subscription).filter(Subscription.user_id == user_id).order_by(Subscription.created_at.desc()).all()
        return [SubscriptionService._to_response(s) for s in subs]

    @staticmethod
    def get_subscription_by_id(db: Session, sub_id: str, user_id: str, is_admin: bool = False) -> SubscriptionResponse:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        if not sub:
            raise EntityNotFoundException("Subscription", sub_id)
        if not is_admin and sub.user_id != user_id:
            raise ForbiddenException("You do not have access to this subscription")
        return SubscriptionService._to_response(sub)

    @staticmethod
    def _to_response(sub: Subscription) -> SubscriptionResponse:
        srv_name = sub.service.name if sub.service else None
        pkg_name = sub.package_version.package.name if sub.package_version and sub.package_version.package else None
        pkg_id = sub.package_version.package_id if sub.package_version else None
        ver_num = sub.package_version.version_number if sub.package_version else 1

        total_q = 0
        used_q = 0
        rem_q = 0
        # If there's an associated license, fetch quota info from its usage balance
        for lic in sub.licenses:
            if lic.usage_balance:
                total_q += lic.usage_balance.total_quota
                used_q += lic.usage_balance.used_quota
                rem_q += lic.usage_balance.remaining_quota

        return SubscriptionResponse(
            id=sub.id,
            user_id=sub.user_id,
            service_id=sub.service_id,
            service_name=srv_name,
            package_id=pkg_id,
            package_name=pkg_name,
            package_version_id=sub.package_version_id,
            version_number=ver_num,
            order_id=sub.order_id,
            start_date=sub.start_date,
            end_date=sub.end_date,
            auto_renew=sub.auto_renew,
            status=sub.status,
            total_quota=total_q,
            used_quota=used_q,
            remaining_quota=rem_q,
            created_at=sub.created_at
        )
