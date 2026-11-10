import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.common.enums import LicenseStatus, QuotaType

def utc_now():
    return datetime.now(timezone.utc)

class License(Base):
    __tablename__ = "licenses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash = Column(String(64), unique=True, index=True, nullable=False)
    masked_key = Column(String(100), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subscription_id = Column(String(36), ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True)
    package_version_id = Column(String(36), ForeignKey("package_versions.id"), nullable=False)
    service_id = Column(String(36), ForeignKey("ocr_services.id"), nullable=False)
    status = Column(SQLEnum(LicenseStatus), default=LicenseStatus.ACTIVE, nullable=False)
    issued_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("User", back_populates="licenses")
    subscription = relationship("Subscription", back_populates="licenses")
    package_version = relationship("PackageVersion", back_populates="licenses")
    service = relationship("OCRService", back_populates="licenses")
    entitlement = relationship("LicenseEntitlement", back_populates="license", uselist=False, cascade="all, delete-orphan")
    events = relationship("LicenseEvent", back_populates="license", cascade="all, delete-orphan")
    api_credentials = relationship("APICredential", back_populates="license", cascade="all, delete-orphan")
    usage_balance = relationship("UsageBalance", back_populates="license", uselist=False, cascade="all, delete-orphan")

class LicenseEntitlement(Base):
    __tablename__ = "license_entitlements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), unique=True, nullable=False)
    quota_type = Column(SQLEnum(QuotaType), default=QuotaType.PAGE, nullable=False)
    initial_quota = Column(Integer, nullable=False)
    api_access = Column(Boolean, default=True, nullable=False)
    batch_processing = Column(Boolean, default=False, nullable=False)
    priority_processing = Column(Boolean, default=False, nullable=False)
    features = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    license = relationship("License", back_populates="entitlement")

class LicenseEvent(Base):
    __tablename__ = "license_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)
    actor_id = Column(String(100), nullable=False)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    license = relationship("License", back_populates="events")
