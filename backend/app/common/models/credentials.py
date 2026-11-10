import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.common.enums import CredentialStatus

def utc_now():
    return datetime.now(timezone.utc)

class APICredential(Base):
    __tablename__ = "api_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    key_prefix = Column(String(20), index=True, nullable=False)
    secret_hash = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    status = Column(SQLEnum(CredentialStatus), default=CredentialStatus.ACTIVE, nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="api_credentials")
    license = relationship("License", back_populates="api_credentials")
