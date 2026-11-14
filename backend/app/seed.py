import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, engine, Base
import app.common.models  # load models
from app.common.models.users import User, UserProfile
from app.common.models.ocr_catalog import OCRService, DocumentType, ServiceDocumentType
from app.common.models.packages import Package, PackageVersion, CreditRate
from app.common.enums import (
    UserRole, UserStatus, ServiceStatus, ProcessingMode, DocTypeCategory,
    PackageTier, QuotaType, Duration, BillingType, OveragePolicy
)
from app.core.security import get_password_hash


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("[*] Seeding ocrPlatform database (real catalog only)...")

        # 1. Platform Admin
        if not db.query(User).filter(User.email == "admin@ocrplatform.com").first():
            admin = User(
                email="admin@ocrplatform.com",
                hashed_password=get_password_hash("Admin@123456"),
                full_name="Platform Admin",
                role=UserRole.PLATFORM_ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.add(admin)
            db.flush()
            db.add(
                UserProfile(
                    user_id=admin.id,
                    company_name="ocrPlatform Operations",
                    phone="",
                )
            )
            print("  Created Admin: admin@ocrplatform.com")

        # 2. Real Document Types for Identity OCR (CCCD, GPLX, Hộ chiếu)
        doc_types_data = [
            (
                "dt-id-card",
                "Căn cước công dân / CMND",
                "Nhận diện & trích xuất Căn cước công dân gắn chip, thẻ Căn cước 2024 và CMND (số định danh, họ tên, ngày sinh, giới tính, quốc tịch, quê quán, nơi thường trú, ngày cấp, có giá trị đến, nơi cấp).",
                DocTypeCategory.IDENTITY,
            ),
            (
                "dt-driver-lic",
                "Giấy phép lái xe (GPLX)",
                "Bóc tách thông tin Giấy phép lái xe các hạng (A1, A2, B1, B2, C, D...): số GPLX, họ tên, ngày sinh, quốc tịch, nơi cư trú, hạng bằng, ngày cấp, ngày hết hạn và nơi cấp.",
                DocTypeCategory.IDENTITY,
            ),
            (
                "dt-passport",
                "Hộ chiếu (Passport)",
                "Trích xuất thông tin Hộ chiếu Việt Nam & quốc tế chuẩn ICAO 9303: số hộ chiếu, loại hộ chiếu, mã quốc gia, họ tên, số CCCD/CMND, ngày sinh, giới tính, nơi sinh, ngày cấp, ngày hết hạn, cơ quan cấp và 2 dòng MRZ.",
                DocTypeCategory.IDENTITY,
            ),
        ]

        doc_type_map = {}
        for code, name, desc, cat in doc_types_data:
            dt = db.query(DocumentType).filter(DocumentType.code == code).first()
            if not dt:
                dt = DocumentType(
                    code=code,
                    name=name,
                    description=desc,
                    category=cat,
                    status="active",
                )
                db.add(dt)
                db.flush()
            doc_type_map[code] = dt

        # 3. First Real Marketplace Service: OCR Giấy tờ tùy thân
        srv = db.query(OCRService).filter(OCRService.code == "srv-id-ocr").first()
        if not srv:
            srv = OCRService(
                code="srv-id-ocr",
                name="OCR Giấy tờ tùy thân (CCCD, GPLX, Hộ chiếu)",
                category="Identity",
                description="Nhận diện & trích xuất JSON chuẩn hóa cho Căn cước công dân / CMND, Giấy phép lái xe và Hộ chiếu qua Web Portal và API.",
                long_description=(
                    "Pipeline Hybrid AI thực tế gồm DocAligner (tách nền & xoay thẳng thẻ), RapidOCR (phát hiện dòng chữ), "
                    "PaddleOCR-VL-Vi (nhận dạng tiếng Việt GPU) và Qwen2.5-3B (chuẩn hóa JSON có kiểm tra ràng buộc). "
                    "Hỗ trợ xử lý trực tiếp trên Web và tích hợp qua REST API với X-API-Key, lưu đầy đủ lịch sử & ảnh đối soát."
                ),
                thumbnail="/thumbnails/id-document-ocr.svg",
                supported_file_formats=["JPG", "JPEG", "PNG", "WEBP", "PDF"],
                supported_languages=["Tiếng Việt", "English", "ICAO MRZ"],
                capabilities=[
                    "Tự động tách nền & xoay thẳng thẻ (DocAligner)",
                    "Bóc tách Căn cước công dân / CMND",
                    "Bóc tách Giấy phép lái xe (GPLX)",
                    "Bóc tách Hộ chiếu & 2 dòng MRZ",
                    "Xuất JSON chuẩn hóa & lưu lịch sử Web",
                    "Tích hợp REST API (X-API-Key)",
                ],
                processing_mode=ProcessingMode.SYNCHRONOUS,
                display_order=1,
                status=ServiceStatus.PUBLISHED,
                starting_price=39.0,
                sla="Hybrid AI Local/GPU",
                rating=5.0,
                review_count=0,
            )
            db.add(srv)
            db.flush()

            for dt_code in ["dt-id-card", "dt-driver-lic", "dt-passport"]:
                if dt_code in doc_type_map:
                    db.add(
                        ServiceDocumentType(
                            service_id=srv.id,
                            document_type_id=doc_type_map[dt_code].id,
                        )
                    )

        # 4. Real Packages for srv-id-ocr
        packages_seed = [
            (
                "pkg-id-starter",
                "ID Verification Starter",
                PackageTier.STARTER,
                39.0,
                QuotaType.DOCUMENT,
                200,
                False,
                [
                    "200 lượt OCR giấy tờ tùy thân / tháng",
                    "Hỗ trợ CCCD/CMND, Bằng lái xe, Hộ chiếu",
                    "Web Portal & REST API (X-API-Key)",
                    "Lưu lịch sử JSON & ảnh đối soát",
                ],
            ),
            (
                "pkg-id-pro",
                "ID Verification Fleet",
                PackageTier.PROFESSIONAL,
                159.0,
                QuotaType.DOCUMENT,
                1000,
                True,
                [
                    "1,000 lượt OCR giấy tờ tùy thân / tháng",
                    "Hỗ trợ CCCD/CMND, Bằng lái xe, Hộ chiếu",
                    "Web Portal & REST API (X-API-Key)",
                    "Lưu lịch sử JSON & ảnh đối soát",
                ],
            ),
            (
                "pkg-id-ent",
                "ID Verification Enterprise",
                PackageTier.ENTERPRISE,
                499.0,
                QuotaType.DOCUMENT,
                5000,
                False,
                [
                    "5,000 lượt OCR giấy tờ tùy thân / tháng",
                    "Hỗ trợ CCCD/CMND, Bằng lái xe, Hộ chiếu",
                    "Web Portal & nhiều API Key theo license",
                    "Lưu lịch sử JSON & ảnh đối soát",
                ],
            ),
        ]

        for pkg_code, pkg_name, tier, price, quota_type, quota_amount, priority_proc, features in packages_seed:
            pkg = db.query(Package).filter(Package.code == pkg_code).first()
            if not pkg:
                pkg = Package(
                    code=pkg_code,
                    name=pkg_name,
                    tier=tier,
                    service_id=srv.id,
                    status="active",
                )
                db.add(pkg)
                db.flush()

                pv = PackageVersion(
                    package_id=pkg.id,
                    version_number=1,
                    price=price,
                    currency="USD",
                    quota_type=quota_type,
                    quota_amount=quota_amount,
                    duration=Duration.MONTHLY,
                    billing_type=BillingType.ONE_TIME,
                    api_access=True,
                    batch_processing=True,
                    priority_processing=priority_proc,
                    auto_renewal=False,
                    overage_policy=OveragePolicy.BLOCK,
                    features=features,
                    is_current=True,
                )
                db.add(pv)

        # 5. Real Credit Rate
        if not db.query(CreditRate).filter(CreditRate.operation_type == "id_card_verify").first():
            db.add(
                CreditRate(
                    operation_type="id_card_verify",
                    credits_per_unit=1.0,
                    description="1 document unit per identity document (CCCD, Driver License, Passport)",
                )
            )

        db.commit()
        print("[+] Seeding completed successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
