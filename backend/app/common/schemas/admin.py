from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.common.enums import LicenseStatus, OrderStatus, PaymentStatus, SubscriptionStatus, UserRole, UserStatus
from app.common.schemas.auth import UserProfileResponse
from app.common.schemas.licenses import LicenseEntitlementResponse, LicenseEventResponse


class MonthlyRevenuePoint(BaseModel):
    month: str
    revenue: float
    orders: int
    volume: int


class ServicePopularityPoint(BaseModel):
    service_id: str
    name: str
    subscriptions: int
    usage_units: int
    percentage: float


class DailyUsagePoint(BaseModel):
    date: str
    units: int
    jobs: int


class CustomerGrowthPoint(BaseModel):
    month: str
    total: int
    new_customers: int


class AdminDashboardStatsResponse(BaseModel):
    total_customers: int
    active_services: int
    total_services: int
    active_subscriptions: int
    active_licenses: int
    total_usage_units: int
    total_ocr_jobs: int
    total_revenue: float
    monthly_revenue: List[MonthlyRevenuePoint] = []
    service_popularity: List[ServicePopularityPoint] = []
    daily_usage: List[DailyUsagePoint] = []
    customer_growth: List[CustomerGrowthPoint] = []


class AdminCustomerSummary(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    created_at: datetime
    profile: Optional[UserProfileResponse] = None
    tier: str = "Standard"
    active_subscriptions_count: int = 0
    active_licenses_count: int = 0
    total_usage: int = 0
    total_spend: float = 0.0
    monthly_spend: float = 0.0


class AdminCustomerStatusUpdateRequest(BaseModel):
    status: UserStatus


class AdminSubscriptionResponse(BaseModel):
    id: str
    user_id: str
    customer_name: str
    customer_email: str
    service_id: str
    service_name: Optional[str] = None
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    package_version_id: str
    version_number: int = 1
    order_id: Optional[str] = None
    start_date: datetime
    end_date: datetime
    auto_renew: bool
    status: SubscriptionStatus
    total_quota: int = 0
    used_quota: int = 0
    remaining_quota: int = 0
    price: float = 0.0
    currency: str = "USD"
    billing_cycle: str = "monthly"
    created_at: datetime


class AdminOrderResponse(BaseModel):
    id: str
    order_number: str
    user_id: str
    customer_name: str
    customer_email: str
    package_version_id: str
    service_name: Optional[str] = None
    package_name: Optional[str] = None
    amount: float
    currency: str
    status: OrderStatus
    payment_method: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AdminPaymentResponse(BaseModel):
    id: str
    payment_number: str
    order_id: str
    order_number: Optional[str] = None
    user_id: str
    customer_name: str
    customer_email: str
    amount: float
    currency: str
    method: str
    status: PaymentStatus
    transaction_reference: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: datetime


class AdminLicenseResponse(BaseModel):
    id: str
    masked_key: str
    user_id: str
    customer_name: str
    customer_email: str
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
    events: List[LicenseEventResponse] = []


class AdminLicenseStatusUpdateRequest(BaseModel):
    status: LicenseStatus
    notes: Optional[str] = None


class AdminUsageRecordResponse(BaseModel):
    id: str
    job_id: Optional[str] = None
    user_id: str
    customer_name: str
    customer_email: str
    license_id: str
    masked_key: Optional[str] = None
    service_id: str
    service_name: Optional[str] = None
    amount: int
    quota_type: str
    unit_cost: float
    created_at: datetime


class AdminCustomerDetailResponse(BaseModel):
    customer: AdminCustomerSummary
    subscriptions: List[AdminSubscriptionResponse] = []
    licenses: List[AdminLicenseResponse] = []
    orders: List[AdminOrderResponse] = []
    payments: List[AdminPaymentResponse] = []
    usage_records: List[AdminUsageRecordResponse] = []
    audit_logs: List["AuditLogResponse"] = []


class AdminMonitoringResponse(BaseModel):
    backend_status: str
    database_status: str
    database_dialect: str
    ollama_status: str
    ollama_base_url: str
    active_model: str
    installed_models: List[str] = []
    loaded_models: List[Dict[str, Any]] = []
    total_jobs_processed: int = 0
    jobs_last_24h: int = 0
    active_licenses: int = 0
    active_api_credentials: int = 0
    recent_jobs: List[AdminUsageRecordResponse] = []


class AdminOperatorResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminOperatorCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)


class AuditLogResponse(BaseModel):
    id: str
    actor_id: str
    actor_name: Optional[str] = None
    actor_email: str
    action: str
    resource_type: str
    resource_id: str
    ip_address: Optional[str] = None
    details: Optional[str] = None
    severity: str
    created_at: datetime


class AdminSystemConfigResponse(BaseModel):
    ollama_base_url: str
    ollama_model: str
    ollama_num_ctx: int
    ollama_num_predict: int
    ollama_timeout_seconds: int
    vlm_max_image_dimension: int
    database_backend: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
