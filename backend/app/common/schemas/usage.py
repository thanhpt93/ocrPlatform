from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.common.enums import QuotaType

class UsageBalanceResponse(BaseModel):
    license_id: str
    quota_type: QuotaType
    total_quota: int
    used_quota: int
    reserved_quota: int
    remaining_quota: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UsageSummaryResponse(BaseModel):
    total_quota: int
    used_quota: int
    remaining_quota: int
    active_licenses: int
    balances: List[UsageBalanceResponse] = []

class UsageRecordResponse(BaseModel):
    id: str
    license_id: str
    service_id: str
    service_name: Optional[str] = None
    job_id: Optional[str] = None
    amount: int
    quota_type: QuotaType
    unit_cost: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UsageHistoryResponse(BaseModel):
    total_records: int
    records: List[UsageRecordResponse] = []
