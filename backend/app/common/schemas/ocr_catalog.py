from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.common.enums import ServiceStatus, ProcessingMode, DocTypeCategory

class DocumentTypeBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    category: DocTypeCategory = DocTypeCategory.GENERAL
    example_image: Optional[str] = None
    status: str = "active"

class DocumentTypeCreate(DocumentTypeBase):
    pass

class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[DocTypeCategory] = None
    example_image: Optional[str] = None
    status: Optional[str] = None

class DocumentTypeResponse(DocumentTypeBase):
    id: str
    created_at: datetime
    updated_at: datetime
    supported_service_ids: List[str] = []

    model_config = ConfigDict(from_attributes=True)

class OCRServiceBase(BaseModel):
    code: str
    name: str
    category: str
    description: str
    long_description: Optional[str] = None
    thumbnail: Optional[str] = None
    supported_file_formats: List[str] = []
    supported_languages: List[str] = []
    capabilities: List[str] = []
    processing_mode: ProcessingMode = ProcessingMode.SYNCHRONOUS
    display_order: int = 0
    starting_price: float = 0.0
    sla: str = "99.9% uptime"

class OCRServiceCreate(OCRServiceBase):
    status: ServiceStatus = ServiceStatus.DRAFT
    supported_doc_type_ids: List[str] = []

class OCRServiceUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    long_description: Optional[str] = None
    thumbnail: Optional[str] = None
    supported_file_formats: Optional[List[str]] = None
    supported_languages: Optional[List[str]] = None
    capabilities: Optional[List[str]] = None
    processing_mode: Optional[ProcessingMode] = None
    display_order: Optional[int] = None
    status: Optional[ServiceStatus] = None
    starting_price: Optional[float] = None
    sla: Optional[str] = None
    supported_doc_type_ids: Optional[List[str]] = None

class OCRServiceResponse(OCRServiceBase):
    id: str
    status: ServiceStatus
    rating: float
    review_count: int
    created_at: datetime
    updated_at: datetime
    supported_doc_type_ids: List[str] = []

    model_config = ConfigDict(from_attributes=True)

class OCRServiceDetailResponse(OCRServiceResponse):
    document_types: List[DocumentTypeResponse] = []
