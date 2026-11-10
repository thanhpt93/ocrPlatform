import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.common.enums import SubscriptionStatus

def utc_now():
    return datetime.now(timezone.utc)

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    package_version_id = Column(String(36), ForeignKey("package_versions.id"), nullable=False)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    service_id = Column(String(36), ForeignKey("ocr_services.id"), nullable=False)
    start_date = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    auto_renew = Column(Boolean, default=False, nullable=False)
    status = Column(SQLEnum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("User", back_populates="subscriptions")
    package_version = relationship("PackageVersion", back_populates="subscriptions")
    order = relationship("Order", back_populates="subscription")
    service = relationship("OCRService", back_populates="subscriptions")
    licenses = relationship("License", back_populates="subscription")
    events = relationship("SubscriptionEvent", back_populates="subscription", cascade="all, delete-orphan")

class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id = Column(String(36), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    subscription = relationship("Subscription", back_populates="events")
