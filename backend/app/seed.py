import os
import sys
from datetime import datetime, timezone, timedelta

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, engine, Base
import app.common.models  # load models
from app.common.models.users import User, UserProfile
from app.common.models.ocr_catalog import OCRService, DocumentType, ServiceDocumentType
from app.common.models.packages import Package, PackageVersion, CreditRate
from app.common.models.licenses import License, LicenseEntitlement, LicenseEvent
from app.common.models.subscriptions import Subscription
from app.common.models.usage import UsageBalance, UsageLedger
from app.common.enums import (
    UserRole, UserStatus, ServiceStatus, ProcessingMode, DocTypeCategory,
    PackageTier, QuotaType, Duration, BillingType, OveragePolicy,
    LicenseStatus, SubscriptionStatus, LedgerEntryType
)
from app.core.security import get_password_hash, generate_license_key

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("[*] Seeding ocrPlatform database...")

        # 1. Platform Admin & Customers
        if not db.query(User).filter(User.email == "admin@ocrplatform.com").first():
            admin = User(
                email="admin@ocrplatform.com",
                hashed_password=get_password_hash("Admin@123456"),
                full_name="Platform Admin",
                role=UserRole.PLATFORM_ADMIN,
                status=UserStatus.ACTIVE
            )
            db.add(admin)
            db.flush()
            db.add(UserProfile(user_id=admin.id, company_name="ocrPlatform Operations", phone="+1 (555) 019-2831"))
            print("  Created Admin: admin@ocrplatform.com")

        customer_alex = db.query(User).filter(User.email == "alex@techcorp.io").first()
        if not customer_alex:
            customer_alex = User(
                email="alex@techcorp.io",
                hashed_password=get_password_hash("Customer@123456"),
                full_name="Alex Morgan",
                role=UserRole.CUSTOMER,
                status=UserStatus.ACTIVE
            )
            db.add(customer_alex)
            db.flush()
            db.add(UserProfile(user_id=customer_alex.id, company_name="TechCorp Logistics", phone="+1 (555) 234-5678", tax_id="US-9928172"))
            print("  Created Customer: alex@techcorp.io")

        customer_sarah = db.query(User).filter(User.email == "sarah@fintech.com").first()
        if not customer_sarah:
            customer_sarah = User(
                email="sarah@fintech.com",
                hashed_password=get_password_hash("Customer@123456"),
                full_name="Sarah Jenkins",
                role=UserRole.CUSTOMER,
                status=UserStatus.ACTIVE
            )
            db.add(customer_sarah)
            db.flush()
            db.add(UserProfile(user_id=customer_sarah.id, company_name="Fintech Ledger Inc", phone="+1 (555) 876-5432", tax_id="US-1123456"))
            print("  Created Customer: sarah@fintech.com")

        # 2. Document Types (12 types)
        doc_types_data = [
            ("dt-pdf-doc", "PDF Document", "General multipage text, report, or scanned article", DocTypeCategory.GENERAL),
            ("dt-tax-inv", "Tax Invoice", "Commercial VAT and electronic business invoices", DocTypeCategory.FINANCIAL),
            ("dt-receipt", "Payment Receipt", "Retail, restaurant, POS and fuel receipts", DocTypeCategory.FINANCIAL),
            ("dt-bank-stmt", "Bank Statement", "Monthly banking statements, transaction registers", DocTypeCategory.FINANCIAL),
            ("dt-id-card", "National ID Card", "Government-issued identity cards, chip cards", DocTypeCategory.IDENTITY),
            ("dt-passport", "International Passport", "ICAO 9303 compliant passports and MRZ zones", DocTypeCategory.IDENTITY),
            ("dt-driver-lic", "Driver License", "State and national vehicle driving licenses", DocTypeCategory.IDENTITY),
            ("dt-nd-contract", "NDA & Agreement", "Mutual non-disclosure and service contracts", DocTypeCategory.LEGAL),
            ("dt-prop-lease", "Commercial Lease", "Real estate tenancy and property lease agreements", DocTypeCategory.LEGAL),
            ("dt-bill-lading", "Bill of Lading", "Maritime, air, and freight transport documents", DocTypeCategory.LOGISTICS),
            ("dt-med-claim", "Medical Insurance Claim", "Health insurance claim forms and itemized bills", DocTypeCategory.HEALTHCARE),
            ("dt-survey-form", "Tabular Survey Form", "Structured survey questionnaires and grid tables", DocTypeCategory.GENERAL)
        ]

        doc_type_map = {}
        for code, name, desc, cat in doc_types_data:
            dt = db.query(DocumentType).filter(DocumentType.code == code).first()
            if not dt:
                dt = DocumentType(code=code, name=name, description=desc, category=cat, status="active")
                db.add(dt)
                db.flush()
            doc_type_map[code] = dt

        # 3. OCR Services (6 services)
        services_data = [
            {
                "code": "srv-pdf-ocr",
                "name": "PDF & Document OCR",
                "category": "General Document",
                "description": "High-accuracy text layer extraction for multi-page native and scanned PDFs with searchable export.",
                "long_description": "Enterprise-grade PDF text extraction handling complex multi-column layouts, font reconstruction, and searchable PDF/A generation.",
                "thumbnail": "https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80",
                "formats": ["PDF", "TIFF", "DJVU", "PNG"],
                "languages": ["English", "Vietnamese", "Japanese", "French", "German"],
                "capabilities": ["Multi-column flow detection", "Searchable PDF/A output", "Font & style preservation", "Embedded image extraction"],
                "doc_types": ["dt-pdf-doc"],
                "mode": ProcessingMode.SYNCHRONOUS,
                "order": 1,
                "price": 29.0
            },
            {
                "code": "srv-invoice-ocr",
                "name": "Invoice OCR Enterprise",
                "category": "Financial",
                "description": "Automated key-value extraction for global invoices, line items, VAT calculations, and supplier reconciliation.",
                "long_description": "Deep learning parser specialized in invoices across 40+ countries. Automatically matches line items and verifies mathematical totals.",
                "thumbnail": "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80",
                "formats": ["PDF", "PNG", "JPEG", "TIFF"],
                "languages": ["English", "Vietnamese", "German", "Spanish", "Chinese"],
                "capabilities": ["Line item table extraction", "Tax ID validation", "Currency conversion", "ERP integration schema"],
                "doc_types": ["dt-tax-inv", "dt-receipt"],
                "mode": ProcessingMode.SYNCHRONOUS,
                "order": 2,
                "price": 49.0
            },
            {
                "code": "srv-receipt-ocr",
                "name": "Receipt & Expense OCR",
                "category": "Financial",
                "description": "Instant mobile capture for thermal store receipts, taxi tickets, fuel receipts, and travel vouchers.",
                "long_description": "Optimized for wrinkled, low-light thermal receipts. Extracts merchant, date, total, tax, and individual line items for expense reports.",
                "thumbnail": "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80",
                "formats": ["PNG", "JPEG", "HEIC", "WEBP"],
                "languages": ["English", "Vietnamese", "Japanese", "Thai"],
                "capabilities": ["Thermal paper de-skewing", "Merchant name normalization", "Tip & tax split detection", "Duplicate receipt check"],
                "doc_types": ["dt-receipt"],
                "mode": ProcessingMode.SYNCHRONOUS,
                "order": 3,
                "price": 19.0
            },
            {
                "code": "srv-contract-ocr",
                "name": "Contract & Legal OCR",
                "category": "Legal",
                "description": "Semantic clause recognition, party entity extraction, termination dates, and signing block detection.",
                "long_description": "Designed for legal teams and compliance workflows. Extracts agreement parties, effective dates, liability clauses, and signature validity.",
                "thumbnail": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=80",
                "formats": ["PDF", "DOCX", "TIFF"],
                "languages": ["English", "Vietnamese", "French"],
                "capabilities": ["Clause classification", "Signature block verification", "Effective date parsing", "Redaction suggestions"],
                "doc_types": ["dt-nd-contract", "dt-prop-lease"],
                "mode": ProcessingMode.ASYNCHRONOUS,
                "order": 4,
                "price": 79.0
            },
            {
                "code": "srv-table-ocr",
                "name": "Form & Table OCR Matrix",
                "category": "Data Extraction",
                "description": "Specialized spatial parser for nested grids, borderless financial tables, checklists, and fillable forms.",
                "long_description": "Solves complex table layouts including multi-row merged cells, borderless spreadsheets, checkboxes, and nested table structures.",
                "thumbnail": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
                "formats": ["PDF", "PNG", "JPEG", "EXCEL"],
                "languages": ["English", "Multilingual numerals"],
                "capabilities": ["Merged cell reconstruction", "Borderless table detection", "Checkbox & radio detection", "Export to CSV/JSON/Excel"],
                "doc_types": ["dt-bank-stmt", "dt-survey-form"],
                "mode": ProcessingMode.BATCH,
                "order": 5,
                "price": 39.0
            },
            {
                "code": "srv-id-ocr",
                "name": "ID Document & Passport OCR",
                "category": "Identity",
                "description": "Secure eKYC identity document extraction with MRZ parsing, tamper checks, and biometric alignment.",
                "long_description": "Fast eKYC parsing for national ID cards, driver licenses, and passports with MRZ verification and anti-spoofing indicators.",
                "thumbnail": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80",
                "formats": ["PNG", "JPEG", "PDF"],
                "languages": ["English", "Vietnamese", "Global ICAO MRZ"],
                "capabilities": ["ICAO 9303 MRZ parsing", "Hologram & glare reduction", "Facial photo cropping", "Checksum validation"],
                "doc_types": ["dt-id-card", "dt-passport", "dt-driver-lic"],
                "mode": ProcessingMode.SYNCHRONOUS,
                "order": 6,
                "price": 59.0
            }
        ]

        service_map = {}
        for s_data in services_data:
            srv = db.query(OCRService).filter(OCRService.code == s_data["code"]).first()
            if not srv:
                srv = OCRService(
                    code=s_data["code"],
                    name=s_data["name"],
                    category=s_data["category"],
                    description=s_data["description"],
                    long_description=s_data["long_description"],
                    thumbnail=s_data["thumbnail"],
                    supported_file_formats=s_data["formats"],
                    supported_languages=s_data["languages"],
                    capabilities=s_data["capabilities"],
                    processing_mode=s_data["mode"],
                    display_order=s_data["order"],
                    status=ServiceStatus.PUBLISHED,
                    starting_price=s_data["price"],
                    sla="99.9% uptime"
                )
                db.add(srv)
                db.flush()

                for dt_code in s_data["doc_types"]:
                    if dt_code in doc_type_map:
                        db.add(ServiceDocumentType(service_id=srv.id, document_type_id=doc_type_map[dt_code].id))
            service_map[s_data["code"]] = srv

        # 4. Packages & Versions (12 packages across services, covering Page, Document, Credit)
        packages_seed = [
            # PDF OCR (Page-based)
            ("srv-pdf-ocr", "pkg-pdf-starter", "PDF Starter", PackageTier.STARTER, 29.0, QuotaType.PAGE, 1000, False),
            ("srv-pdf-ocr", "pkg-pdf-pro", "PDF Professional", PackageTier.PROFESSIONAL, 89.0, QuotaType.PAGE, 5000, True),
            ("srv-pdf-ocr", "pkg-pdf-ent", "PDF Enterprise", PackageTier.ENTERPRISE, 249.0, QuotaType.PAGE, 20000, False),
            # Invoice OCR (Document-based)
            ("srv-invoice-ocr", "pkg-inv-starter", "Invoice Starter", PackageTier.STARTER, 49.0, QuotaType.DOCUMENT, 500, False),
            ("srv-invoice-ocr", "pkg-inv-pro", "Invoice Growth", PackageTier.PROFESSIONAL, 149.0, QuotaType.DOCUMENT, 2000, True),
            ("srv-invoice-ocr", "pkg-inv-ent", "Invoice Corporate", PackageTier.ENTERPRISE, 399.0, QuotaType.DOCUMENT, 8000, False),
            # Receipt OCR (Credit-based)
            ("srv-receipt-ocr", "pkg-rcp-starter", "Receipt Starter Credit", PackageTier.STARTER, 19.0, QuotaType.CREDIT, 1500, False),
            ("srv-receipt-ocr", "pkg-rcp-pro", "Receipt Business Credit", PackageTier.PROFESSIONAL, 69.0, QuotaType.CREDIT, 6000, True),
            # Contract OCR (Document-based)
            ("srv-contract-ocr", "pkg-con-starter", "Contract Basic", PackageTier.STARTER, 79.0, QuotaType.DOCUMENT, 100, False),
            ("srv-contract-ocr", "pkg-con-pro", "Contract Pro Legal", PackageTier.PROFESSIONAL, 199.0, QuotaType.DOCUMENT, 500, True),
            # Table OCR (Page-based)
            ("srv-table-ocr", "pkg-tbl-pro", "Table Matrix Professional", PackageTier.PROFESSIONAL, 119.0, QuotaType.PAGE, 3000, True),
            # ID Document OCR (Document-based)
            ("srv-id-ocr", "pkg-id-pro", "ID Verification Fleet", PackageTier.PROFESSIONAL, 159.0, QuotaType.DOCUMENT, 1000, True),
        ]

        # Multi-version demo packages: e.g. "pkg-pdf-starter", "pkg-inv-pro", "pkg-rcp-pro"
        multi_version_codes = {"pkg-pdf-starter", "pkg-inv-pro", "pkg-rcp-pro"}

        package_version_map = {}
        for srv_code, pkg_code, pkg_name, tier, price, quota_type, quota_amount, is_rec in packages_seed:
            srv = service_map[srv_code]
            pkg = db.query(Package).filter(Package.code == pkg_code).first()
            if not pkg:
                pkg = Package(
                    code=pkg_code,
                    name=pkg_name,
                    tier=tier,
                    service_id=srv.id,
                    status="active"
                )
                db.add(pkg)
                db.flush()

                # If this package is in multi_version_codes, seed older version 1 & 2, then current version 3!
                if pkg_code in multi_version_codes:
                    # Version 1 (Historical)
                    v1 = PackageVersion(
                        package_id=pkg.id,
                        version_number=1,
                        price=price * 0.8,
                        currency="USD",
                        quota_type=quota_type,
                        quota_amount=int(quota_amount * 0.7),
                        duration=Duration.MONTHLY,
                        billing_type=BillingType.ONE_TIME,
                        api_access=True,
                        batch_processing=False,
                        priority_processing=False,
                        auto_renewal=False,
                        overage_policy=OveragePolicy.BLOCK,
                        features=["Standard API access", "Basic throughput"],
                        is_current=False
                    )
                    db.add(v1)

                    # Version 2 (Historical)
                    v2 = PackageVersion(
                        package_id=pkg.id,
                        version_number=2,
                        price=price * 0.9,
                        currency="USD",
                        quota_type=quota_type,
                        quota_amount=int(quota_amount * 0.85),
                        duration=Duration.MONTHLY,
                        billing_type=BillingType.ONE_TIME,
                        api_access=True,
                        batch_processing=True,
                        priority_processing=False,
                        auto_renewal=False,
                        overage_policy=OveragePolicy.BLOCK,
                        features=["Enhanced rate limits", "Batch mode"],
                        is_current=False
                    )
                    db.add(v2)

                    # Version 3 (Current)
                    v3 = PackageVersion(
                        package_id=pkg.id,
                        version_number=3,
                        price=price,
                        currency="USD",
                        quota_type=quota_type,
                        quota_amount=quota_amount,
                        duration=Duration.MONTHLY,
                        billing_type=BillingType.ONE_TIME,
                        api_access=True,
                        batch_processing=True,
                        priority_processing=True,
                        auto_renewal=True,
                        overage_policy=OveragePolicy.BLOCK,
                        features=["Full REST & Web UI", f"{quota_amount} {quota_type.value} included", "Priority queueing"],
                        is_current=True
                    )
                    db.add(v3)
                    db.flush()
                    package_version_map[pkg_code] = v3
                else:
                    v1 = PackageVersion(
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
                        priority_processing=tier != PackageTier.STARTER,
                        auto_renewal=False,
                        overage_policy=OveragePolicy.BLOCK,
                        features=["Full REST & Web UI", f"{quota_amount} {quota_type.value} included"],
                        is_current=True
                    )
                    db.add(v1)
                    db.flush()
                    package_version_map[pkg_code] = v1

        # 5. Credit Rates
        rates_data = [
            ("pdf_page", 1.0, "1 credit per standard PDF page"),
            ("invoice_extract", 2.0, "2 credits per invoice parsing with line items"),
            ("receipt_quick", 0.5, "0.5 credits per store thermal receipt"),
            ("id_card_verify", 3.0, "3 credits per government ID card with MRZ"),
            ("contract_clause", 5.0, "5 credits per legal contract clause extraction")
        ]
        for op_type, cost, desc in rates_data:
            cr = db.query(CreditRate).filter(CreditRate.operation_type == op_type).first()
            if not cr:
                db.add(CreditRate(operation_type=op_type, credits_per_unit=cost, description=desc))

        # 6. Seed Subscriptions & Licenses for Alex & Sarah (initial realistic customer state)
        if customer_alex and "pkg-pdf-pro" in package_version_map:
            alex_pv = package_version_map["pkg-pdf-pro"]
            existing_sub = db.query(Subscription).filter(Subscription.user_id == customer_alex.id).first()
            if not existing_sub:
                now = datetime.now(timezone.utc)
                sub = Subscription(
                    user_id=customer_alex.id,
                    package_version_id=alex_pv.id,
                    service_id=alex_pv.package.service_id,
                    start_date=now - timedelta(days=10),
                    end_date=now + timedelta(days=20),
                    auto_renew=True,
                    status=SubscriptionStatus.ACTIVE
                )
                db.add(sub)
                db.flush()

                raw_key, key_hash, masked_key = generate_license_key()
                lic = License(
                    key_hash=key_hash,
                    masked_key=masked_key,
                    user_id=customer_alex.id,
                    subscription_id=sub.id,
                    package_version_id=alex_pv.id,
                    service_id=alex_pv.package.service_id,
                    status=LicenseStatus.ACTIVE,
                    issued_at=sub.start_date,
                    expires_at=sub.end_date
                )
                db.add(lic)
                db.flush()

                ent = LicenseEntitlement(
                    license_id=lic.id,
                    quota_type=alex_pv.quota_type,
                    initial_quota=alex_pv.quota_amount,
                    api_access=alex_pv.api_access,
                    batch_processing=alex_pv.batch_processing,
                    priority_processing=alex_pv.priority_processing,
                    features=alex_pv.features
                )
                db.add(ent)

                bal = UsageBalance(
                    license_id=lic.id,
                    user_id=customer_alex.id,
                    quota_type=alex_pv.quota_type,
                    total_quota=alex_pv.quota_amount,
                    used_quota=650,
                    reserved_quota=0,
                    remaining_quota=alex_pv.quota_amount - 650
                )
                db.add(bal)

                ledger = UsageLedger(
                    license_id=lic.id,
                    delta=alex_pv.quota_amount,
                    balance_after=alex_pv.quota_amount,
                    entry_type=LedgerEntryType.CREDIT_INITIAL,
                    reference_type="initial_seed",
                    reference_id=lic.id
                )
                db.add(ledger)
                print("  Seeded subscription and license for Alex Morgan")

        db.commit()
        print("[+] Seeding completed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
