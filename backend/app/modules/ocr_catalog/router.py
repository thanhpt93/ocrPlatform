from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.common.schemas.ocr_catalog import OCRServiceResponse, OCRServiceDetailResponse, DocumentTypeResponse
from app.common.schemas.packages import PackageResponse
from app.modules.ocr_catalog.service import CatalogService

router = APIRouter(tags=["OCR Marketplace"])

@router.get("/ocr-services", response_model=List[OCRServiceResponse])
def get_public_services(db: Session = Depends(get_db)):
    return CatalogService.get_public_services(db)

@router.get("/ocr-services/{service_id}", response_model=OCRServiceDetailResponse)
def get_service_details(service_id: str, db: Session = Depends(get_db)):
    return CatalogService.get_service_by_id(db, service_id)

@router.get("/ocr-services/{service_id}/packages", response_model=List[PackageResponse])
def get_service_packages(service_id: str, db: Session = Depends(get_db)):
    return CatalogService.get_service_packages(db, service_id)

@router.get("/document-types", response_model=List[DocumentTypeResponse])
def get_public_document_types(db: Session = Depends(get_db)):
    return CatalogService.get_public_document_types(db)
