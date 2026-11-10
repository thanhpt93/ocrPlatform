from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.common.enums import OrderStatus, PaymentStatus

class OrderCreate(BaseModel):
    package_version_id: str
    idempotency_key: Optional[str] = None

class OrderCheckoutRequest(BaseModel):
    payment_method: str = "mock_card"
    idempotency_key: Optional[str] = None
    simulate_failure: bool = False

class OrderItemResponse(BaseModel):
    id: str
    package_version_id: str
    service_id: str
    service_name: Optional[str] = None
    price: float
    quantity: int

    model_config = ConfigDict(from_attributes=True)

class OrderResponse(BaseModel):
    id: str
    order_number: str
    user_id: str
    package_version_id: str
    amount: float
    currency: str
    status: OrderStatus
    created_at: datetime
    updated_at: datetime
    service_name: Optional[str] = None
    package_name: Optional[str] = None
    items: List[OrderItemResponse] = []

    model_config = ConfigDict(from_attributes=True)

class PaymentResponse(BaseModel):
    id: str
    payment_number: str
    order_id: str
    order_number: Optional[str] = None
    user_id: str
    amount: float
    currency: str
    method: str
    status: PaymentStatus
    transaction_reference: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CheckoutResultResponse(BaseModel):
    order: OrderResponse
    payment: PaymentResponse
    subscription_id: Optional[str] = None
    license_id: Optional[str] = None
    license_key: Optional[str] = None  # Returned ONLY on successful checkout/issuance!
    masked_key: Optional[str] = None
