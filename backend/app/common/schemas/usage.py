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

class CustomerDailyUsagePoint(BaseModel):
    date: str
    units: int
    jobs: int

class CustomerServiceBreakdownPoint(BaseModel):
    service_id: str
    service_name: str
    usage_units: int
    jobs_count: int
    subscriptions_count: int
    licenses_count: int
    percentage: float

class UsageSummaryResponse(BaseModel):
    total_quota: int
    used_quota: int
    remaining_quota: int
    active_licenses: int
    active_subscriptions: int = 0
    total_jobs: int = 0
    avg_latency_ms: float = 0.0
    balances: List[UsageBalanceResponse] = []
    daily_usage: List[CustomerDailyUsagePoint] = []
    service_breakdown: List[CustomerServiceBreakdownPoint] = []

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
