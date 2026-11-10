import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.common.enums import QuotaType, ReservationStatus, LedgerEntryType

def utc_now():
    return datetime.now(timezone.utc)

class UsageBalance(Base):
    __tablename__ = "usage_balances"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quota_type = Column(SQLEnum(QuotaType), default=QuotaType.PAGE, nullable=False)
    total_quota = Column(Integer, default=0, nullable=False)
    used_quota = Column(Integer, default=0, nullable=False)
    reserved_quota = Column(Integer, default=0, nullable=False)
    remaining_quota = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    license = relationship("License", back_populates="usage_balance")
    user = relationship("User")

class UsageReservation(Base):
    __tablename__ = "usage_reservations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    reservation_token = Column(String(100), unique=True, index=True, nullable=False)
    amount = Column(Integer, nullable=False)
    status = Column(SQLEnum(ReservationStatus), default=ReservationStatus.RESERVED, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    license = relationship("License")

class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(String(36), ForeignKey("ocr_services.id"), nullable=False)
    job_id = Column(String(100), nullable=True)
    amount = Column(Integer, nullable=False)
    quota_type = Column(SQLEnum(QuotaType), default=QuotaType.PAGE, nullable=False)
    unit_cost = Column(Float, default=1.0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    license = relationship("License")
    user = relationship("User")
    service = relationship("OCRService")

class UsageLedger(Base):
    __tablename__ = "usage_ledger"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    delta = Column(Integer, nullable=False)  # e.g. +1000 or -5
    balance_after = Column(Integer, nullable=False)
    entry_type = Column(SQLEnum(LedgerEntryType), nullable=False)
    reference_type = Column(String(100), nullable=True)  # e.g. "order", "job", "manual"
    reference_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    license = relationship("License")
