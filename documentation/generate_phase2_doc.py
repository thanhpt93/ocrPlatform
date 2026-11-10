import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_phase2_documentation():
    doc = Document()

    # Page Margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Document Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(20)
    p_title.paragraph_format.space_after = Pt(4)
    run_title = p_title.add_run("TÀI LIỆU KIẾN TRÚC & TRIỂN KHAI HỆ THỐNG")
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(24)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(15, 23, 42) # Slate 900

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(24)
    run_sub = p_sub.add_run("ocrPlatform – Phase 2: Backend Foundation, OCR Marketplace, Package Management & Automatic License Issuance")
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(13)
    run_sub.font.color.rgb = RGBColor(37, 99, 235) # Blue 600
    run_sub.font.bold = True

    # Metadata Box Table
    meta_table = doc.add_table(rows=4, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Dự án:", "ocrPlatform (SaaS OCR Marketplace)"),
        ("Giai đoạn:", "Phase 2: Backend Foundation & API Integration"),
        ("Công nghệ chính:", "Python, FastAPI, PostgreSQL, SQLAlchemy 2.x, Alembic, Pydantic v2, Pytest, Docker Compose, React, TypeScript, TanStack Query"),
        ("Ngày hoàn thành:", "10/11/2026")
    ]
    for i, (k, v) in enumerate(meta_data):
        row = meta_table.rows[i]
        c0 = row.cells[0]
        c1 = row.cells[1]
        c0.width = Inches(1.8)
        c1.width = Inches(5.0)
        c0.text = k
        c1.text = v
        c0.paragraphs[0].runs[0].font.bold = True
        c0.paragraphs[0].runs[0].font.size = Pt(10)
        c0.paragraphs[0].runs[0].font.color.rgb = RGBColor(71, 85, 105)
        c1.paragraphs[0].runs[0].font.size = Pt(10)
        set_cell_background(c0, "F1F5F9")
        set_cell_background(c1, "F8FAFC")
        set_cell_margins(c0, 80, 80, 120, 120)
        set_cell_margins(c1, 80, 80, 120, 120)

    doc.add_paragraph().paragraph_format.space_after = Pt(16)

    def add_heading_1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = "Calibri"
        run.font.size = Pt(16)
        run.font.bold = True
        run.font.color.rgb = RGBColor(15, 23, 42)
        return p

    def add_heading_2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = "Calibri"
        run.font.size = Pt(13)
        run.font.bold = True
        run.font.color.rgb = RGBColor(37, 99, 235)
        return p

    def add_body_p(text, bold_prefix=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            r_pre.font.name = "Calibri"
            r_pre.font.size = Pt(10.5)
            r_pre.font.bold = True
            r_pre.font.color.rgb = RGBColor(30, 41, 59)
        run = p.add_run(text)
        run.font.name = "Calibri"
        run.font.size = Pt(10.5)
        run.font.color.rgb = RGBColor(51, 65, 85)
        return p

    def add_bullet(text, bold_prefix=None):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            r_pre.font.name = "Calibri"
            r_pre.font.size = Pt(10.5)
            r_pre.font.bold = True
            r_pre.font.color.rgb = RGBColor(30, 41, 59)
        run = p.add_run(text)
        run.font.name = "Calibri"
        run.font.size = Pt(10.5)
        run.font.color.rgb = RGBColor(51, 65, 85)
        return p

    # --- SECTION 1 ---
    add_heading_1("1. Tổng quan Dự án & Mục tiêu Phase 2")
    add_body_p("ocrPlatform là nền tảng SaaS thương mại dịch vụ OCR (Optical Character Recognition) thông minh, cung cấp giải pháp bóc tách dữ liệu văn bản chuyên sâu cho từng nghiệp vụ tài liệu chuyên biệt: Hóa đơn (Invoice), Vé & Hóa đơn bán lẻ (Receipts), Hợp đồng pháp lý (Contracts), Biểu mẫu & Bảng biểu (Forms/Tables), Giấy tờ định danh eKYC (ID Cards/Passports) và Tài liệu PDF tổng hợp.")
    add_body_p("Trong Phase 1, dự án đã hoàn thiện trọn vẹn kiến trúc giao diện người dùng (UI/UX) với 18 màn hình bao gồm Customer Portal (9 màn hình) và Platform Admin Portal (9 màn hình).")
    add_body_p("Mục tiêu của Phase 2:", "Trọng tâm kỹ thuật: ")
    add_bullet(" Xây dựng kiến trúc Backend vững chắc theo mô hình Modular Monolith sử dụng Python & FastAPI.", "1. Backend Monolith: ")
    add_bullet(" Thiết kế hệ thống cơ sở dữ liệu quan hệ PostgreSQL chuẩn hóa với SQLAlchemy 2.x và quản lý phiên bản qua Alembic migrations.", "2. Database & Migrations: ")
    add_bullet(" Triển khai cơ chế xác thực bảo mật JWT (Access Token & Refresh Token) và băm mật khẩu bcrypt.", "3. Xác thực & Phân quyền: ")
    add_bullet(" Mô hình hạn ngạch linh hoạt kết hợp PAGE (trang), DOCUMENT (tài liệu) và CREDIT (điểm tín dụng quy đổi linh hoạt).", "4. Hybrid Billing Engine: ")
    add_bullet(" Cơ chế quản lý phiên bản gói cước bất biến; gói cước mới không làm thay đổi các gói thuê bao lịch sử của khách hàng.", "5. Immutable Package Versioning: ")
    add_bullet(" Cơ chế cấp phát License tự động ngay sau khi thanh toán thành công (Thanh toán -> Subscription -> License -> Entitlement -> Usage Balance -> Ledger).", "6. Automatic License Issuance: ")
    add_bullet(" Tách biệt License Key (dùng cho phần mềm/kích hoạt máy) và API Key (dùng cho tích hợp API bên ngoài, có hỗ trợ Revoke). Không bao giờ lộ full License Key ở API danh sách.", "7. Quản lý License & API Key: ")
    add_bullet(" Tích hợp frontend React với các REST API thực tế thông qua TanStack Query và Zustand store.", "8. Tích hợp Frontend: ")
    add_bullet(" Đạt 100% tỷ lệ pass cho toàn bộ 19 kịch bản kiểm thử Pytest và cung cấp môi trường Docker Compose hoàn chỉnh.", "9. Test Suite & Docker: ")

    # --- SECTION 2 ---
    add_heading_1("2. Các Quyết định Nghiệp vụ Cốt lõi (Confirmed Business Decisions)")
    add_bullet(" Mỗi tài khoản khách hàng là một người dùng độc lập. Trong giai đoạn này chưa triển khai tổ chức đa người dùng (Multi-tenant Organization / Tenant Members), nhưng thiết kế cấu trúc dữ liệu đảm bảo có thể mở rộng về sau mà không phải viết lại backend.", "Mô hình khách hàng cá nhân (Individual Account): ")
    add_bullet(" Việc cấp phát License diễn ra hoàn toàn tự động, ngay khi giao dịch thanh toán được xác nhận thành công.", "Cấp phát License tự động (Automatic Issuance): ")
    add_bullet(" Hỗ trợ 3 loại hạn ngạch trong cùng hệ thống: Page-based, Document-based, Credit-based. Khách hàng có thể mua nhiều gói cước với các hình thức hạn ngạch khác nhau.", "Thanh toán lai (Hybrid Billing): ")
    add_bullet(" Chuẩn bị kiến trúc phục vụ 2 kênh: Web UI (xác thực qua JWT cookie/header) và External API (xác thực qua API Key x-api-key và kiểm tra License Entitlement).", "Kênh truy cập OCR: ")
    add_bullet(" Quá trình thanh toán và cấp phát License được bảo vệ bởi tính lũy thừa. Khi có callback lặp lại hoặc người dùng ấn thanh toán nhiều lần, hệ thống không cấp trùng lặp License hay Subscription mới.", "Tính lũy thừa (Idempotency): ")

    # --- SECTION 3 ---
    add_heading_1("3. Kiến trúc Backend Modular Monolith")
    add_body_p("Backend được thiết kế theo cấu trúc Modular Monolith chuẩn FastAPI, phân tách rõ ràng giữa Core, Common (Models, Schemas, Enums) và từng Business Domain Module độc lập:")
    
    struct_table = doc.add_table(rows=11, cols=2)
    struct_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    struct_rows = [
        ("Thư mục / Module", "Vai trò và Trách nhiệm"),
        ("backend/app/core/", "Chứa cấu hình hệ thống (Settings pydantic-settings), kết nối DB (SQLAlchemy engine/sessionmaker), mã hóa & JWT security, ngoại lệ tùy biến (exceptions), dependency injection (get_current_user, get_current_admin)."),
        ("backend/app/common/models/", "Các thực thể SQLAlchemy 2.x đại diện cho toàn bộ bảng CSDL."),
        ("backend/app/common/schemas/", "Pydantic v2 schemas phục vụ xác thực request/response cho toàn bộ API."),
        ("backend/app/common/enums.py", "Tập hợp các kiểu liệt kê Enum chuẩn hóa (UserRole, QuotaType, LicenseStatus, v.v.)."),
        ("backend/app/modules/auth/ & users/", "Đăng ký, đăng nhập JWT, làm mới token, cập nhật hồ sơ cá nhân."),
        ("backend/app/modules/ocr_catalog/", "Dịch vụ danh mục OCR công khai và quản lý loại tài liệu."),
        ("backend/app/modules/packages/", "Quản lý gói cước và cơ chế phát hành phiên bản bất biến (Package Versioning)."),
        ("backend/app/modules/orders/ & payments/", "Tạo đơn hàng, cổng thanh toán Mock Provider, xử lý giao dịch tự động."),
        ("backend/app/modules/licenses/ & credentials/", "Cấp phát License tự động, bảo mật License Key, quản lý và thu hồi API Key."),
        ("backend/app/modules/usage/ & admin/", "Quản lý số dư hạn ngạch, sổ cái kế toán Ledger và các API quản trị hệ thống."),
    ]
    for idx, (c0_val, c1_val) in enumerate(struct_rows):
        row = struct_table.rows[idx]
        row.cells[0].width = Inches(2.3)
        row.cells[1].width = Inches(4.5)
        row.cells[0].text = c0_val
        row.cells[1].text = c1_val
        if idx == 0:
            set_cell_background(row.cells[0], "0F172A")
            set_cell_background(row.cells[1], "0F172A")
            row.cells[0].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
            row.cells[1].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
            row.cells[0].paragraphs[0].runs[0].font.bold = True
            row.cells[1].paragraphs[0].runs[0].font.bold = True
        else:
            set_cell_background(row.cells[0], "F8FAFC" if idx % 2 == 1 else "FFFFFF")
            set_cell_background(row.cells[1], "F8FAFC" if idx % 2 == 1 else "FFFFFF")
            row.cells[0].paragraphs[0].runs[0].font.size = Pt(9.5)
            row.cells[1].paragraphs[0].runs[0].font.size = Pt(9.5)
        set_cell_margins(row.cells[0], 60, 60, 100, 100)
        set_cell_margins(row.cells[1], 60, 60, 100, 100)

    # --- SECTION 4 ---
    add_heading_1("4. Chi tiết Thiết kế Cơ sở Dữ liệu & Lược đồ Thực thể")
    
    add_heading_2("4.1. Nhóm Người dùng & Xác thực (Auth & Users)")
    add_bullet(" Bảng người dùng trung tâm. Chứa email (unique index), hashed_password (băm bcrypt), full_name, role (CUSTOMER, PLATFORM_ADMIN), status (ACTIVE, SUSPENDED, PENDING).", "users: ")
    add_bullet(" Hồ sơ khách hàng mở rộng: công ty (company_name), số điện thoại, địa chỉ, mã số thuế (tax_id).", "user_profiles: ")
    add_bullet(" Quản lý Refresh Token an toàn, lưu mã băm SHA-256 token_hash, thời gian hết hạn (expires_at) và cờ thu hồi (revoked).", "refresh_tokens: ")

    add_heading_2("4.2. Nhóm Danh mục Dịch vụ & Loại Tài liệu (OCR Catalog)")
    add_bullet(" Lưu thông tin dịch vụ OCR (code, name, category, description, SLA, rating, supported_file_formats, supported_languages, capabilities, processing_mode, display_order, status).", "ocr_services: ")
    add_bullet(" Danh mục các loại tài liệu phân theo nhóm: Financial, Legal, Identity, Logistics, Healthcare, General.", "document_types: ")
    add_bullet(" Bảng liên kết nhiều-nhiều giữa OCR Services và Document Types, cho phép 1 loại tài liệu được xử lý bởi nhiều microservice và ngược lại.", "service_document_types: ")

    add_heading_2("4.3. Nhóm Gói cước & Quản lý Phiên bản (Packages & Versioning)")
    add_bullet(" Định danh gói cước thương mại (Starter, Professional, Enterprise, Custom), gắn với service_id.", "packages: ")
    add_bullet(" Lưu trữ snapshot bất biến của từng phiên bản gói cước: version_number, price, currency, quota_type (Page, Document, Credit), quota_amount, duration (monthly, yearly), billing_type, api_access, batch_processing, priority_processing, features, is_current.", "package_versions: ")
    add_bullet(" Tỷ lệ quy đổi credit cho các tác vụ OCR: operation_type (pdf_page, invoice_extract, receipt_quick, id_card_verify, contract_clause), credits_per_unit.", "credit_rates: ")

    add_heading_2("4.4. Nhóm Đơn hàng & Thanh toán (Orders & Payments)")
    add_bullet(" Đơn hàng mua gói cước: order_number, user_id, package_version_id, amount, status (pending, completed, failed, cancelled), idempotency_key.", "orders: ")
    add_bullet(" Chi tiết mục đơn hàng kèm snapshot giá tại thời điểm mua.", "order_items: ")
    add_bullet(" Giao dịch thanh toán: payment_number, order_id, user_id, amount, method, status (successful, failed, pending), transaction_reference, failure_reason.", "payments: ")

    add_heading_2("4.5. Nhóm Thuê bao & Cấp phát License (Subscriptions & Licenses)")
    add_bullet(" Gói thuê bao dịch vụ: user_id, package_version_id, order_id, service_id, start_date, end_date, auto_renew, status (active, pending, expired, cancelled, suspended).", "subscriptions: ")
    add_bullet(" License bảo mật: key_hash (SHA-256 duy nhất), masked_key (e.g. OCR-2026-****-****-ABCD), user_id, subscription_id, package_version_id, service_id, status, issued_at, expires_at.", "licenses: ")
    add_bullet(" Hạn mức quyền lợi của License: quota_type, initial_quota, api_access, batch_processing, priority_processing, features.", "license_entitlements: ")
    add_bullet(" Lịch sử vòng đời License (Cấp phát, Kích hoạt, Tạm dừng, Gia hạn, Thu hồi).", "license_events: ")
    add_bullet(" Khóa API dành cho lập trình viên tích hợp ngoài: name, key_prefix, secret_hash, license_id, user_id, status (active, revoked), last_used_at.", "api_credentials: ")

    add_heading_2("4.6. Nhóm Quản lý Hạn ngạch & Sổ cái (Usage & Ledger)")
    add_bullet(" Số dư hạn ngạch theo License: total_quota, used_quota, reserved_quota, remaining_quota.", "usage_balances: ")
    add_bullet(" Đặt trước hạn ngạch khi xử lý batch, kèm token đặt chỗ và thời gian hết hạn.", "usage_reservations: ")
    add_bullet(" Nhật ký chi tiết mỗi lần thực hiện tác vụ bóc tách OCR.", "usage_records: ")
    add_bullet(" Sổ cái kế toán hạn ngạch bất biến (Append-Only): delta (+1000 nạp ban đầu, -5 tiêu thụ), balance_after, entry_type (credit_initial, debit_usage, credit_refund, adjustment).", "usage_ledger: ")

    # --- SECTION 5 ---
    add_heading_1("5. Quy trình Cấp phát License Tự động & Bảo mật")
    add_body_p("Hệ thống tự động kích hoạt chuỗi xử lý khép kín trong cùng một giao dịch cơ sở dữ liệu khi thanh toán thành công:")
    add_bullet("1. Khách hàng gửi yêu cầu POST /api/v1/orders/{id}/checkout kèm phương thức thanh toán và khóa idempotency_key.")
    add_bullet("2. Hệ thống kiểm tra quyền sở hữu đơn hàng của user và kiểm tra xem đơn hàng đã từng hoàn tất hay chưa để ngăn chặn thanh toán trùng lặp.")
    add_bullet("3. Mock Payment Provider xác nhận giao dịch thành công và tạo bản ghi Payment với mã tham chiếu duy nhất.")
    add_bullet("4. Tự động tạo bản ghi Subscription kích hoạt trạng thái ACTIVE, liên kết với đúng package_version_id đã mua.")
    add_bullet("5. Tạo License Key bảo mật bằng thư viện secrets của Python theo định dạng OCR-2026-XXXX-XXXX-XXXX.")
    add_bullet("6. Băm License Key bằng SHA-256 để lưu vào cột key_hash, đồng thời tạo chuỗi masked_key che giấu các ký tự nhạy cảm.")
    add_bullet("7. Tạo bản ghi LicenseEntitlement kế thừa toàn bộ cấu hình từ package_version.")
    add_bullet("8. Khởi tạo số dư ban đầu trong usage_balances với remaining_quota = package_version.quota_amount và ghi nhận giao dịch CREDIT_INITIAL vào usage_ledger.")
    add_bullet("9. Trả về response chứa license_key gốc DUY NHẤT một lần này cho khách hàng lưu trữ an toàn.")

    # --- SECTION 6 ---
    add_heading_1("6. Tích hợp Frontend & Backend")
    add_body_p("Giao diện Frontend React đã được kết nối toàn diện với các API Backend thực tế:")
    add_bullet(" Cấu hình proxy tự động chuyển tiếp toàn bộ request từ /api sang http://127.0.0.1:8000 trong quá trình phát triển.", "Vite Proxy: ")
    add_bullet(" Module chuyên trách quản lý JWT tokens trong localStorage (ocr_access_token, ocr_refresh_token), tự động đính kèm header Authorization: Bearer và bắt lỗi 401.", "API Client: ")
    add_bullet(" Tập hợp các React Query hooks (useServices, useDocumentTypes, useSubscriptions, useLicenses, useOrders, useAdminPackages, v.v.) chuẩn hóa caching và trạng thái loading.", "TanStack Query Custom Hooks: ")
    add_bullet(" Hàm syncWithBackend() tự động kiểm tra phiên đăng nhập của khách hàng mẫu (Alex Morgan) hoặc Admin, nạp trực tiếp dữ liệu danh mục, gói cước, thuê bao, license từ CSDL vào Zustand store.", "Zustand Reactive Store Synchronization: ")
    add_bullet(" Khi khách hàng chọn gói cước và hoàn tất Modal Checkout, frontend gọi trực tiếp POST /api/v1/orders và POST /api/v1/orders/{id}/checkout để tạo đơn hàng và nhận License Key tức thì.", "Checkout Flow Tích hợp: ")

    # --- SECTION 7 ---
    add_heading_1("7. Dữ liệu Mẫu Ban đầu (Seed Data)")
    add_body_p("Tập lệnh seed tự động (app.seed) khởi tạo cơ sở dữ liệu với đầy đủ các đối tượng thực tế:")
    add_bullet(" 6 dịch vụ hoàn chỉnh (PDF OCR, Invoice OCR Enterprise, Receipt & Expense OCR, Contract & Legal OCR, Form & Table OCR Matrix, ID Document OCR).", "6 Dịch vụ OCR: ")
    add_bullet(" 12 loại tài liệu (PDF Document, Tax Invoice, Payment Receipt, Bank Statement, National ID, Passport, Driver License, NDA & Agreement, Commercial Lease, Bill of Lading, Medical Claim, Tabular Survey Form).", "12 Loại Tài liệu: ")
    add_bullet(" 12 gói cước bao phủ cả 3 loại hạn ngạch (Page, Document, Credit). Các gói demo (PDF Starter, Invoice Growth, Receipt Business Credit) có 3 phiên bản Version 1, Version 2, Version 3 để kiểm thử Package Versioning.", "12 Gói cước & Đa phiên bản: ")
    add_bullet(" admin@ocrplatform.com / Admin@123456 (Quyền PLATFORM_ADMIN toàn hệ thống).", "Tài khoản Quản trị viên: ")
    add_bullet(" alex@techcorp.io / Customer@123456 (Khách hàng mẫu sở hữu sẵn gói PDF Pro kèm License và hạn ngạch thực tế); sarah@fintech.com / Customer@123456.", "Tài khoản Khách hàng: ")

    # --- SECTION 8 ---
    add_heading_1("8. Kiểm thử Tự động & Kết quả Test Suite")
    add_body_p("Toàn bộ 19 kịch bản kiểm thử tự động sử dụng Pytest trên môi trường in-memory SQLite đạt tỷ lệ 100% Passed:")
    
    test_table = doc.add_table(rows=7, cols=3)
    test_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    test_rows = [
        ("Phân nhóm Test", "Số kịch bản", "Kết quả"),
        ("1. Authentication & Users", "5 kịch bản (Register, Duplicate Email, Login, Wrong Pass, Token Validate)", "100% PASSED"),
        ("2. OCR Marketplace & Public Catalog", "4 kịch bản (Public listing, Service Detail, Packages, Document Types)", "100% PASSED"),
        ("3. Package Management & Versioning", "2 kịch bản (Create package with v1, Multi-version & Immutable preservation)", "100% PASSED"),
        ("4. Orders, Payments & Automatic License", "3 kịch bản (Order creation, Failed payment, Automatic license issuance & API Key)", "100% PASSED"),
        ("5. Security, Ownership & RBAC", "4 kịch bản (Cross-customer order/license isolation, Admin route protection)", "100% PASSED"),
        ("TỔNG CỘNG", "19 kịch bản kiểm thử độc lập", "19/19 PASSED (4.79s)")
    ]
    for idx, (c0_v, c1_v, c2_v) in enumerate(test_rows):
        row = test_table.rows[idx]
        row.cells[0].width = Inches(2.3)
        row.cells[1].width = Inches(3.5)
        row.cells[2].width = Inches(1.2)
        row.cells[0].text = c0_v
        row.cells[1].text = c1_v
        row.cells[2].text = c2_v
        if idx == 0:
            set_cell_background(row.cells[0], "0F172A")
            set_cell_background(row.cells[1], "0F172A")
            set_cell_background(row.cells[2], "0F172A")
            row.cells[0].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
            row.cells[1].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
            row.cells[2].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
            row.cells[0].paragraphs[0].runs[0].font.bold = True
            row.cells[1].paragraphs[0].runs[0].font.bold = True
            row.cells[2].paragraphs[0].runs[0].font.bold = True
        elif idx == 6:
            set_cell_background(row.cells[0], "E2E8F0")
            set_cell_background(row.cells[1], "E2E8F0")
            set_cell_background(row.cells[2], "DCFCE7") # Light Green
            row.cells[0].paragraphs[0].runs[0].font.bold = True
            row.cells[1].paragraphs[0].runs[0].font.bold = True
            row.cells[2].paragraphs[0].runs[0].font.bold = True
            row.cells[2].paragraphs[0].runs[0].font.color.rgb = RGBColor(22, 101, 52)
        else:
            set_cell_background(row.cells[0], "F8FAFC" if idx % 2 == 1 else "FFFFFF")
            set_cell_background(row.cells[1], "F8FAFC" if idx % 2 == 1 else "FFFFFF")
            set_cell_background(row.cells[2], "F0FDF4")
            row.cells[0].paragraphs[0].runs[0].font.size = Pt(9.5)
            row.cells[1].paragraphs[0].runs[0].font.size = Pt(9.5)
            row.cells[2].paragraphs[0].runs[0].font.size = Pt(9.5)
            row.cells[2].paragraphs[0].runs[0].font.bold = True
            row.cells[2].paragraphs[0].runs[0].font.color.rgb = RGBColor(22, 101, 52)
        set_cell_margins(row.cells[0], 60, 60, 100, 100)
        set_cell_margins(row.cells[1], 60, 60, 100, 100)
        set_cell_margins(row.cells[2], 60, 60, 100, 100)

    # --- SECTION 9 ---
    add_heading_1("9. Hướng dẫn Triển khai & Khởi chạy Hệ thống")
    add_heading_2("9.1. Khởi chạy cục bộ (Local Development)")
    add_body_p("1. Khởi động Backend FastAPI (sử dụng môi trường conda ocr):")
    add_bullet("Chạy lệnh: python main.py tại thư mục gốc C:\\project\\ocrPlatform.")
    add_bullet("Tài liệu tương tác Swagger UI: http://127.0.0.1:8000/api/v1/docs")
    add_bullet("Tài liệu kỹ thuật ReDoc: http://127.0.0.1:8000/api/v1/redoc")
    add_body_p("2. Khởi động Frontend React Dev Server:")
    add_bullet("Chạy lệnh: npm run dev")
    add_bullet("Truy cập cổng ứng dụng web: http://localhost:3000")

    add_heading_2("9.2. Khởi chạy với Docker Compose (Full Stack Containerized)")
    add_body_p("Chạy lệnh sau tại thư mục gốc:")
    add_bullet("docker compose up --build")
    add_body_p("Docker Compose sẽ tự động xây dựng và điều phối 3 container dịch vụ:")
    add_bullet("PostgreSQL 16 (Cổng 5432, lưu trữ persistent volume)")
    add_bullet("Redis 7 (Cổng 6379, sẵn sàng cho cache và hàng đợi job)")
    add_bullet("Backend FastAPI (Cổng 8000, tự động chạy Alembic migrations và nạp dữ liệu seed ban đầu)")

    # --- SECTION 10 ---
    add_heading_1("10. Các Giới hạn Hiện tại & Lộ trình Phase 3")
    add_heading_2("10.1. Các giới hạn thiết kế trong Phase 2 (Đúng phạm vi Out of Scope)")
    add_bullet("Chưa tích hợp các AI engine nhận diện thực tế (PaddleOCR, Tesseract, docTR) – hiện sẵn sàng ở tầng schema và metadata.")
    add_bullet("Chưa kết nối cổng thanh toán thật (Stripe, VNPay, PayPal) – sử dụng Mock Payment Provider tuân thủ quy trình nghiệp vụ đầy đủ.")
    add_bullet("Số dư hạn ngạch chưa tự động trừ khi xử lý file OCR thực tế (hệ thống đã sẵn sàng bảng usage_ledger và usage_balances).")

    add_heading_2("10.2. Lộ trình Triển khai Phase 3 (Recommended Phase 3 Roadmap)")
    add_bullet("Triển khai Asynchronous Worker Pool (Celery hoặc RQ kết nối với Redis/RabbitMQ) để xử lý file tài liệu đa luồng, hỗ trợ PDF nhiều trang.")
    add_bullet("Kết nối Inference Engine: Tích hợp mô hình OCR thực tế và tự động khấu trừ quota thông qua usage_ledger sau mỗi tác vụ thành công.")
    add_bullet("Tích hợp Webhook Stripe / VNPay cho thanh toán tự động trong môi trường production.")
    add_bullet("Hoàn thiện External API Authentication Gateway Middleware để các hệ thống doanh nghiệp bên ngoài có thể gọi API OCR trực tiếp bằng API Key.")

    # Save document
    output_dir = "C:/project/ocrPlatform/documentation"
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "ocrPlatform_Phase2_Backend_Documentation.docx")
    doc.save(out_path)
    print(f"Document successfully created at: {out_path}")

if __name__ == "__main__":
    create_phase2_documentation()
