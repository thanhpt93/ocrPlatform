from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.common.enums import SubscriptionStatus

class SubscriptionResponse(BaseModel):
    id: str
    user_id: str
    service_id: str
    service_name: Optional[str] = None
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    package_version_id: str
    version_number: Optional[int] = None
    order_id: Optional[str] = None
    start_date: datetime
    end_date: datetime
    auto_renew: bool
    status: SubscriptionStatus
    total_quota: int = 0
    used_quota: int = 0
    remaining_quota: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
