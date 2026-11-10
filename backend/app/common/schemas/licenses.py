from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.common.enums import LicenseStatus, QuotaType, CredentialStatus

class LicenseEntitlementResponse(BaseModel):
    quota_type: QuotaType
    initial_quota: int
    api_access: bool
    batch_processing: bool
    priority_processing: bool
    features: List[str] = []

    model_config = ConfigDict(from_attributes=True)

class LicenseEventResponse(BaseModel):
    id: str
    action: str
    actor_id: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class LicenseResponse(BaseModel):
    id: str
    masked_key: str  # Note: NEVER expose full license_key in normal list!
    user_id: str
    service_id: str
    service_name: Optional[str] = None
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    subscription_id: Optional[str] = None
    status: LicenseStatus
    quota: int = 0
    used_quota: int = 0
    remaining_quota: int = 0
    issued_at: datetime
    expires_at: datetime
    created_at: datetime
    entitlement: Optional[LicenseEntitlementResponse] = None

    model_config = ConfigDict(from_attributes=True)

class LicenseDetailResponse(LicenseResponse):
    events: List[LicenseEventResponse] = []

class LicenseActivateRequest(BaseModel):
    license_key: str

class LicenseGenerateRequest(BaseModel):
    user_id: str
    package_version_id: str
    notes: Optional[str] = "Admin manual complimentary grant"

class APICredentialCreate(BaseModel):
    name: str

class APICredentialResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    masked_key: str
    license_id: str
    status: CredentialStatus
    last_used_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class APICredentialCreatedResponse(APICredentialResponse):
    api_key: str  # Full API key returned ONLY upon creation!
