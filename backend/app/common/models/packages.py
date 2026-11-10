import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.common.enums import PackageTier, QuotaType, Duration, BillingType, OveragePolicy

def utc_now():
    return datetime.now(timezone.utc)

class Package(Base):
    __tablename__ = "packages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    tier = Column(SQLEnum(PackageTier), default=PackageTier.STARTER, nullable=False)
    service_id = Column(String(36), ForeignKey("ocr_services.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="active", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    service = relationship("OCRService", back_populates="packages")
    versions = relationship("PackageVersion", back_populates="package", order_by="PackageVersion.version_number.desc()", cascade="all, delete-orphan")

class PackageVersion(Base):
    __tablename__ = "package_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    package_id = Column(String(36), ForeignKey("packages.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, default=1, nullable=False)
    price = Column(Float, nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    quota_type = Column(SQLEnum(QuotaType), default=QuotaType.PAGE, nullable=False)
    quota_amount = Column(Integer, nullable=False)
    duration = Column(SQLEnum(Duration), default=Duration.MONTHLY, nullable=False)
    billing_type = Column(SQLEnum(BillingType), default=BillingType.ONE_TIME, nullable=False)
    api_access = Column(Boolean, default=True, nullable=False)
    batch_processing = Column(Boolean, default=False, nullable=False)
    priority_processing = Column(Boolean, default=False, nullable=False)
    auto_renewal = Column(Boolean, default=False, nullable=False)
    overage_policy = Column(SQLEnum(OveragePolicy), default=OveragePolicy.BLOCK, nullable=False)
    features = Column(JSON, default=list, nullable=False)
    is_current = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    package = relationship("Package", back_populates="versions")
    order_items = relationship("OrderItem", back_populates="package_version")
    subscriptions = relationship("Subscription", back_populates="package_version")
    licenses = relationship("License", back_populates="package_version")

class CreditRate(Base):
    __tablename__ = "credit_rates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_type = Column(String(100), unique=True, index=True, nullable=False)
    credits_per_unit = Column(Float, nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
