from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.common.enums import PackageTier, QuotaType, Duration, BillingType, OveragePolicy

class PackageVersionBase(BaseModel):
    price: float
    currency: str = "USD"
    quota_type: QuotaType = QuotaType.PAGE
    quota_amount: int
    duration: Duration = Duration.MONTHLY
    billing_type: BillingType = BillingType.ONE_TIME
    api_access: bool = True
    batch_processing: bool = False
    priority_processing: bool = False
    auto_renewal: bool = False
    overage_policy: OveragePolicy = OveragePolicy.BLOCK
    features: List[str] = []

class PackageVersionCreate(PackageVersionBase):
    pass

class PackageVersionResponse(PackageVersionBase):
    id: str
    package_id: str
    version_number: int
    is_current: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PackageBase(BaseModel):
    code: str
    name: str
    tier: PackageTier = PackageTier.STARTER
    service_id: str
    status: str = "active"

class PackageCreate(PackageBase):
    initial_version: PackageVersionCreate

class PackageUpdate(BaseModel):
    name: Optional[str] = None
    tier: Optional[PackageTier] = None
    status: Optional[str] = None

class PackageResponse(PackageBase):
    id: str
    service_name: Optional[str] = None
    current_version: Optional[PackageVersionResponse] = None
    versions: List[PackageVersionResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CreditRateResponse(BaseModel):
    id: str
    operation_type: str
    credits_per_unit: float
    description: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
