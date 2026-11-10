import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.common.enums import ServiceStatus, ProcessingMode, DocTypeCategory

def utc_now():
    return datetime.now(timezone.utc)

class DocumentType(Base):
    __tablename__ = "document_types"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(SQLEnum(DocTypeCategory), default=DocTypeCategory.GENERAL, nullable=False)
    example_image = Column(String(500), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    service_associations = relationship("ServiceDocumentType", back_populates="document_type", cascade="all, delete-orphan")

class OCRService(Base):
    __tablename__ = "ocr_services"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    long_description = Column(Text, nullable=True)
    thumbnail = Column(String(500), nullable=True)
    supported_file_formats = Column(JSON, default=list, nullable=False)
    supported_languages = Column(JSON, default=list, nullable=False)
    capabilities = Column(JSON, default=list, nullable=False)
    processing_mode = Column(SQLEnum(ProcessingMode), default=ProcessingMode.SYNCHRONOUS, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    status = Column(SQLEnum(ServiceStatus), default=ServiceStatus.DRAFT, nullable=False)
    starting_price = Column(Float, default=0.0, nullable=False)
    sla = Column(String(100), default="99.9% uptime", nullable=False)
    rating = Column(Float, default=4.9, nullable=False)
    review_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    document_type_associations = relationship("ServiceDocumentType", back_populates="ocr_service", cascade="all, delete-orphan")
    packages = relationship("Package", back_populates="service", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="service")
    licenses = relationship("License", back_populates="service")

class ServiceDocumentType(Base):
    __tablename__ = "service_document_types"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    service_id = Column(String(36), ForeignKey("ocr_services.id", ondelete="CASCADE"), nullable=False)
    document_type_id = Column(String(36), ForeignKey("document_types.id", ondelete="CASCADE"), nullable=False)

    ocr_service = relationship("OCRService", back_populates="document_type_associations")
    document_type = relationship("DocumentType", back_populates="service_associations")

class OCRFeature(Base):
    __tablename__ = "ocr_features"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

class ServiceFeature(Base):
    __tablename__ = "service_features"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    service_id = Column(String(36), ForeignKey("ocr_services.id", ondelete="CASCADE"), nullable=False)
    feature_id = Column(String(36), ForeignKey("ocr_features.id", ondelete="CASCADE"), nullable=False)
