from typing import List, Optional
from sqlalchemy.orm import Session
from app.common.models.ocr_catalog import OCRService, DocumentType, ServiceDocumentType
from app.common.models.packages import Package, PackageVersion
from app.common.schemas.ocr_catalog import (
    OCRServiceCreate, OCRServiceUpdate, OCRServiceResponse, OCRServiceDetailResponse,
    DocumentTypeCreate, DocumentTypeUpdate, DocumentTypeResponse
)
from app.common.schemas.packages import PackageResponse, PackageVersionResponse
from app.common.enums import ServiceStatus
from app.core.exceptions import EntityNotFoundException, EntityAlreadyExistsException

class CatalogService:
    @staticmethod
    def get_public_services(db: Session) -> List[OCRServiceResponse]:
        services = db.query(OCRService).filter(OCRService.status == ServiceStatus.PUBLISHED).order_by(OCRService.display_order.asc()).all()
        result = []
        for s in services:
            doc_type_ids = [rel.document_type_id for rel in s.document_type_associations]
            res = OCRServiceResponse.model_validate(s)
            res.supported_doc_type_ids = doc_type_ids
            result.append(res)
        return result

    @staticmethod
    def get_service_by_id(db: Session, service_id: str, admin: bool = False) -> OCRServiceDetailResponse:
        query = db.query(OCRService).filter(OCRService.id == service_id)
        if not admin:
            query = query.filter(OCRService.status == ServiceStatus.PUBLISHED)
        service = query.first()
        if not service:
            raise EntityNotFoundException("OCR Service", service_id)

        doc_type_ids = [rel.document_type_id for rel in service.document_type_associations]
        doc_types = [
            DocumentTypeResponse(
                id=rel.document_type.id,
                code=rel.document_type.code,
                name=rel.document_type.name,
                description=rel.document_type.description,
                category=rel.document_type.category,
                example_image=rel.document_type.example_image,
                status=rel.document_type.status,
                created_at=rel.document_type.created_at,
                updated_at=rel.document_type.updated_at,
                supported_service_ids=[service.id]
            )
            for rel in service.document_type_associations
        ]

        res = OCRServiceDetailResponse.model_validate(service)
        res.supported_doc_type_ids = doc_type_ids
        res.document_types = doc_types
        return res

    @staticmethod
    def get_service_packages(db: Session, service_id: str) -> List[PackageResponse]:
        packages = db.query(Package).filter(
            Package.service_id == service_id,
            Package.status == "active"
        ).all()
        result = []
        for pkg in packages:
            current_ver = next((v for v in pkg.versions if v.is_current), None)
            current_ver_res = PackageVersionResponse.model_validate(current_ver) if current_ver else None
            pkg_res = PackageResponse(
                id=pkg.id,
                code=pkg.code,
                name=pkg.name,
                tier=pkg.tier,
                service_id=pkg.service_id,
                service_name=pkg.service.name if pkg.service else None,
                status=pkg.status,
                created_at=pkg.created_at,
                updated_at=pkg.updated_at,
                current_version=current_ver_res,
                versions=[PackageVersionResponse.model_validate(v) for v in pkg.versions]
            )
            result.append(pkg_res)
        return result

    @staticmethod
    def get_public_document_types(db: Session) -> List[DocumentTypeResponse]:
        doc_types = db.query(DocumentType).filter(DocumentType.status == "active").all()
        result = []
        for dt in doc_types:
            service_ids = [rel.service_id for rel in dt.service_associations]
            res = DocumentTypeResponse.model_validate(dt)
            res.supported_service_ids = service_ids
            result.append(res)
        return result

    # Admin Methods
    @staticmethod
    def admin_get_all_services(db: Session) -> List[OCRServiceResponse]:
        services = db.query(OCRService).order_by(OCRService.display_order.asc()).all()
        result = []
        for s in services:
            doc_type_ids = [rel.document_type_id for rel in s.document_type_associations]
            res = OCRServiceResponse.model_validate(s)
            res.supported_doc_type_ids = doc_type_ids
            result.append(res)
        return result

    @staticmethod
    def admin_create_service(db: Session, req: OCRServiceCreate) -> OCRServiceResponse:
        existing = db.query(OCRService).filter(OCRService.code == req.code).first()
        if existing:
            raise EntityAlreadyExistsException("OCR Service", "code")

        service = OCRService(
            code=req.code,
            name=req.name,
            category=req.category,
            description=req.description,
            long_description=req.long_description,
            thumbnail=req.thumbnail,
            supported_file_formats=req.supported_file_formats,
            supported_languages=req.supported_languages,
            capabilities=req.capabilities,
            processing_mode=req.processing_mode,
            display_order=req.display_order,
            status=req.status,
            starting_price=req.starting_price,
            sla=req.sla
        )
        db.add(service)
        db.flush()

        if req.supported_doc_type_ids:
            for dt_id in req.supported_doc_type_ids:
                assoc = ServiceDocumentType(service_id=service.id, document_type_id=dt_id)
                db.add(assoc)

        db.commit()
        db.refresh(service)
        doc_type_ids = [rel.document_type_id for rel in service.document_type_associations]
        res = OCRServiceResponse.model_validate(service)
        res.supported_doc_type_ids = doc_type_ids
        return res

    @staticmethod
    def admin_update_service(db: Session, service_id: str, req: OCRServiceUpdate) -> OCRServiceResponse:
        service = db.query(OCRService).filter(OCRService.id == service_id).first()
        if not service:
            raise EntityNotFoundException("OCR Service", service_id)

        update_data = req.model_dump(exclude_unset=True)
        if "supported_doc_type_ids" in update_data:
            new_doc_type_ids = update_data.pop("supported_doc_type_ids")
            # Replace associations
            db.query(ServiceDocumentType).filter(ServiceDocumentType.service_id == service.id).delete()
            for dt_id in new_doc_type_ids:
                assoc = ServiceDocumentType(service_id=service.id, document_type_id=dt_id)
                db.add(assoc)

        for key, val in update_data.items():
            setattr(service, key, val)

        db.commit()
        db.refresh(service)
        doc_type_ids = [rel.document_type_id for rel in service.document_type_associations]
        res = OCRServiceResponse.model_validate(service)
        res.supported_doc_type_ids = doc_type_ids
        return res

    @staticmethod
    def admin_publish_service(db: Session, service_id: str, publish: bool = True) -> OCRServiceResponse:
        service = db.query(OCRService).filter(OCRService.id == service_id).first()
        if not service:
            raise EntityNotFoundException("OCR Service", service_id)
        
        service.status = ServiceStatus.PUBLISHED if publish else ServiceStatus.DRAFT
        db.commit()
        db.refresh(service)
        doc_type_ids = [rel.document_type_id for rel in service.document_type_associations]
        res = OCRServiceResponse.model_validate(service)
        res.supported_doc_type_ids = doc_type_ids
        return res

    # Document Type Methods
    @staticmethod
    def admin_get_all_document_types(db: Session) -> List[DocumentTypeResponse]:
        doc_types = db.query(DocumentType).order_by(DocumentType.created_at.desc()).all()
        result = []
        for dt in doc_types:
            service_ids = [rel.service_id for rel in dt.service_associations]
            res = DocumentTypeResponse.model_validate(dt)
            res.supported_service_ids = service_ids
            result.append(res)
        return result

    @staticmethod
    def admin_create_document_type(db: Session, req: DocumentTypeCreate) -> DocumentTypeResponse:
        existing = db.query(DocumentType).filter(DocumentType.code == req.code).first()
        if existing:
            raise EntityAlreadyExistsException("Document Type", "code")

        dt = DocumentType(
            code=req.code,
            name=req.name,
            description=req.description,
            category=req.category,
            example_image=req.example_image,
            status=req.status
        )
        db.add(dt)
        db.commit()
        db.refresh(dt)
        res = DocumentTypeResponse.model_validate(dt)
        res.supported_service_ids = []
        return res

    @staticmethod
    def admin_update_document_type(db: Session, doc_type_id: str, req: DocumentTypeUpdate) -> DocumentTypeResponse:
        dt = db.query(DocumentType).filter(DocumentType.id == doc_type_id).first()
        if not dt:
            raise EntityNotFoundException("Document Type", doc_type_id)

        update_data = req.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            setattr(dt, key, val)

        db.commit()
        db.refresh(dt)
        service_ids = [rel.service_id for rel in dt.service_associations]
        res = DocumentTypeResponse.model_validate(dt)
        res.supported_service_ids = service_ids
        return res
