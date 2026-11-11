import uuid
import pytest
from datetime import datetime, timezone, timedelta
from app.common.models.users import User, UserProfile
from app.common.models.ocr_catalog import OCRService, DocumentType, ServiceDocumentType
from app.common.models.packages import Package, PackageVersion
from app.common.models.orders import Order, OrderItem, Payment
from app.common.models.subscriptions import Subscription, SubscriptionEvent
from app.common.models.licenses import License, LicenseEntitlement, LicenseEvent
from app.common.models.credentials import APICredential
from app.common.models.usage import UsageBalance, UsageLedger
from app.common.enums import (
    UserRole, UserStatus, ServiceStatus, OrderStatus, PaymentStatus,
    SubscriptionStatus, LicenseStatus, CredentialStatus, QuotaType,
    Duration, BillingType, LedgerEntryType, DocTypeCategory, PackageTier
)

# --- STEP 1: CUSTOMER REGISTRATION & AUTHENTICATION ---

def test_step1_customer_registration_and_authentication(client, db):
    """
    STEP 1: Verify Customer Registration, Login, JWT auth, and Database Verification.
    """
    unique_email = f"e2e_customer_{uuid.uuid4().hex[:8]}@testdomain.io"
    password = "StrongPassword@2026!"
    full_name = "E2E Acceptance Tester"
    company_name = "Global Automation Ltd"
    phone = "+1-800-555-0199"

    # 1. Positive Registration
    reg_res = client.post("/api/v1/auth/register", json={
        "email": unique_email,
        "password": password,
        "full_name": full_name,
        "company_name": company_name,
        "phone": phone
    })
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert "refresh_token" in reg_data
    assert reg_data["email"] == unique_email
    assert reg_data["full_name"] == full_name
    assert reg_data["role"].upper() == "CUSTOMER"
    user_id = reg_data["user_id"]

    # 2. Login verification
    login_res = client.post("/api/v1/auth/login", json={
        "email": unique_email,
        "password": password
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token_data = login_res.json()
    access_token = token_data["access_token"]
    assert access_token is not None

    # 3. Profile retrieval with JWT
    headers = {"Authorization": f"Bearer {access_token}"}
    profile_res = client.get("/api/v1/users/me", headers=headers)
    assert profile_res.status_code == 200
    profile_data = profile_res.json()
    assert profile_data["id"] == user_id
    assert profile_data["email"] == unique_email
    assert profile_data["full_name"] == full_name
    assert profile_data["role"].upper() == "CUSTOMER"
    assert profile_data["status"].upper() == "ACTIVE"
    assert profile_data["profile"]["company_name"] == company_name
    assert profile_data["profile"]["phone"] == phone

    # 4. Direct Database Verification
    user_record = db.query(User).filter(User.email == unique_email).all()
    assert len(user_record) == 1, "Exactly one customer record must exist in PostgreSQL/DB"
    u = user_record[0]
    assert u.id == user_id
    assert u.role == UserRole.CUSTOMER
    assert u.status == UserStatus.ACTIVE
    # Password must be securely hashed with bcrypt ($2b$ or $2a$)
    assert u.hashed_password.startswith("$2"), "Password must be stored as a secure bcrypt hash"
    assert password not in u.hashed_password, "Plaintext password must NEVER be stored"
    assert u.profile is not None
    assert u.profile.company_name == company_name

    # 5. Negative Registration Tests
    # A. Register with already existing email
    dup_res = client.post("/api/v1/auth/register", json={
        "email": unique_email,
        "password": "AnotherPassword@123",
        "full_name": "Duplicate User"
    })
    assert dup_res.status_code in [400, 409], "Duplicate email must be rejected"

    # B. Register with invalid email format
    invalid_email_res = client.post("/api/v1/auth/register", json={
        "email": "not-a-valid-email",
        "password": "ValidPassword@123",
        "full_name": "Invalid Email"
    })
    assert invalid_email_res.status_code == 422, "Invalid email format must return 422"

    # C. Register with short password (< 6 chars)
    short_pw_res = client.post("/api/v1/auth/register", json={
        "email": f"short_{uuid.uuid4().hex[:6]}@domain.io",
        "password": "123",
        "full_name": "Short Pass"
    })
    assert short_pw_res.status_code == 422, "Password shorter than minimum length must return 422"

    # D. Incomplete registration (missing required fields)
    incomplete_res = client.post("/api/v1/auth/register", json={
        "email": f"inc_{uuid.uuid4().hex[:6]}@domain.io"
    })
    assert incomplete_res.status_code == 422, "Missing password and full_name must return 422"


# --- STEP 2: BROWSE OCR MARKETPLACE ---

def test_step2_browse_ocr_marketplace_and_catalog(client, customer_one_token, db):
    """
    STEP 2: Retrieve published OCR Services, detail page, supported document types,
    and packages across PAGE, DOCUMENT, and CREDIT billing types.
    """
    headers = {"Authorization": f"Bearer {customer_one_token}"}

    # Ensure we have services for all 3 quota types (PAGE, DOCUMENT, CREDIT) in DB
    srv_doc = db.query(OCRService).filter(OCRService.code == "srv-pub-document").first()
    if not srv_doc:
        srv_doc = OCRService(
            code="srv-pub-document",
            name="Invoice Extraction OCR",
            category="Financial",
            description="Document-based invoice parser",
            processing_mode="synchronous",
            status=ServiceStatus.PUBLISHED,
            starting_price=49.0
        )
        db.add(srv_doc)
        db.flush()

        pkg_doc = Package(code="pkg-doc-test", name="Invoice Pack", tier=PackageTier.STARTER, service_id=srv_doc.id, status="active")
        db.add(pkg_doc)
        db.flush()

        pv_doc = PackageVersion(
            package_id=pkg_doc.id,
            version_number=1,
            price=49.0,
            currency="USD",
            quota_type=QuotaType.DOCUMENT,
            quota_amount=500,
            duration=Duration.MONTHLY,
            billing_type=BillingType.ONE_TIME,
            api_access=True,
            features=["500 Documents included"],
            is_current=True
        )
        db.add(pv_doc)

    srv_credit = db.query(OCRService).filter(OCRService.code == "srv-pub-credit").first()
    if not srv_credit:
        srv_credit = OCRService(
            code="srv-pub-credit",
            name="Receipt & Utility Credit OCR",
            category="Utility",
            description="Credit-based receipt OCR",
            processing_mode="synchronous",
            status=ServiceStatus.PUBLISHED,
            starting_price=19.0
        )
        db.add(srv_credit)
        db.flush()

        pkg_credit = Package(code="pkg-credit-test", name="Credit Bundle", tier=PackageTier.STARTER, service_id=srv_credit.id, status="active")
        db.add(pkg_credit)
        db.flush()

        pv_credit = PackageVersion(
            package_id=pkg_credit.id,
            version_number=1,
            price=19.0,
            currency="USD",
            quota_type=QuotaType.CREDIT,
            quota_amount=2000,
            duration=Duration.MONTHLY,
            billing_type=BillingType.ONE_TIME,
            api_access=True,
            features=["2000 Credits included"],
            is_current=True
        )
        db.add(pv_credit)
    db.commit()

    # 1. Retrieve published OCR services
    services_res = client.get("/api/v1/ocr-services", headers=headers)
    assert services_res.status_code == 200
    services = services_res.json()
    assert len(services) >= 1
    # Check that NO draft service is present
    for s in services:
        assert s["status"] == "published", "Only published services should be visible to customers"
        assert s["code"] != "srv-draft-1", "Draft services must be hidden from marketplace"

    # 2. Retrieve Service Detail & Supported Document Types
    target_srv = services[0]
    detail_res = client.get(f"/api/v1/ocr-services/{target_srv['id']}", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == target_srv["id"]
    assert detail["name"] == target_srv["name"]
    assert "document_types" in detail
    assert isinstance(detail["document_types"], list)

    # 3. Retrieve available packages for service
    pkg_res = client.get(f"/api/v1/ocr-services/{target_srv['id']}/packages", headers=headers)
    assert pkg_res.status_code == 200
    pkgs = pkg_res.json()
    assert len(pkgs) >= 1
    for p in pkgs:
        assert p["status"] == "active", "Only active packages must be available for purchase"
        assert p["current_version"] is not None
        assert p["current_version"]["price"] > 0
        assert p["current_version"]["quota_amount"] > 0
        assert p["current_version"]["quota_type"] in ["Page", "Document", "Credit"]

    # 4. Negative tests
    # Unpublished service cannot be accessed by ID
    draft_srv = db.query(OCRService).filter(OCRService.status == ServiceStatus.DRAFT).first()
    if draft_srv:
        draft_res = client.get(f"/api/v1/ocr-services/{draft_srv.id}", headers=headers)
        assert draft_res.status_code == 404, "Draft service must return 404 for customer"

    # Nonexistent service ID
    non_srv_res = client.get("/api/v1/ocr-services/00000000-0000-0000-0000-000000000000", headers=headers)
    assert non_srv_res.status_code == 404

    # Nonexistent package ID
    non_pkg_res = client.get("/api/v1/packages/non-existent-pkg-id", headers=headers)
    assert non_pkg_res.status_code == 404


# --- STEP 3: SELECT PACKAGE & CREATE ORDER ---

def test_step3_select_package_and_order_creation(client, customer_one, customer_one_token, db):
    """
    STEP 3: Select a package (PAGE, 1,000 quota, 30 days, ONE_TIME, API access).
    Create order and verify backend authoritativeness.
    """
    headers = {"Authorization": f"Bearer {customer_one_token}"}

    # Fetch package
    pkg_data = client.get("/api/v1/packages/pkg-test-1").json()
    pv = pkg_data["current_version"]
    assert pv["quota_type"] == "Page"
    assert pv["quota_amount"] == 1000
    assert pv["price"] == 29.0
    assert pv["api_access"] is True
    version_id = pv["id"]

    # 1. Create Order through API
    idempotency_key = f"order-idemp-{uuid.uuid4().hex[:12]}"
    order_res = client.post("/api/v1/orders", headers=headers, json={
        "package_version_id": version_id,
        "idempotency_key": idempotency_key
    })
    assert order_res.status_code == 201, f"Create order failed: {order_res.text}"
    order = order_res.json()

    assert order["user_id"] == customer_one.id
    assert order["status"] == "pending"
    assert order["amount"] == 29.0
    assert order["currency"] == "USD"
    assert order["package_version_id"] == version_id
    assert len(order["items"]) == 1
    assert order["items"][0]["price"] == 29.0
    assert order["items"][0]["quantity"] == 1

    order_id = order["id"]

    # 2. Database verification
    db_order = db.query(Order).filter(Order.id == order_id).first()
    assert db_order is not None
    assert db_order.user_id == customer_one.id
    assert db_order.amount == 29.0
    assert db_order.status == OrderStatus.PENDING
    assert len(db_order.items) == 1
    assert db_order.items[0].package_version_id == version_id

    # 3. Negative tests
    # Invalid package version ID
    bad_order_res = client.post("/api/v1/orders", headers=headers, json={
        "package_version_id": "00000000-0000-0000-0000-000000000000"
    })
    assert bad_order_res.status_code == 404, "Invalid package_version_id must return 404"


# --- STEP 4 & 5: CHECKOUT & AUTOMATIC SUBSCRIPTION CREATION ---

def test_step4_and_5_checkout_and_subscription_creation(client, customer_one, customer_one_token, db):
    """
    STEP 4: Test payment scenarios (Success, Failed).
    STEP 5: Verify automatic Subscription creation upon payment success.
    """
    headers = {"Authorization": f"Bearer {customer_one_token}"}
    pkg_data = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = pkg_data["current_version"]["id"]

    # --- Scenario B: Failed Payment ---
    order_fail_res = client.post("/api/v1/orders", headers=headers, json={"package_version_id": version_id})
    order_fail_id = order_fail_res.json()["id"]

    checkout_fail = client.post(f"/api/v1/orders/{order_fail_id}/checkout", headers=headers, json={
        "payment_method": "mock_card",
        "simulate_failure": True
    })
    assert checkout_fail.status_code == 200
    fail_data = checkout_fail.json()
    assert fail_data["order"]["status"] == "failed"
    assert fail_data["payment"]["status"] == "failed"
    assert fail_data["subscription_id"] is None
    assert fail_data["license_id"] is None

    # Verify in DB: No subscription or license exists for this failed order
    sub_fail_db = db.query(Subscription).filter(Subscription.order_id == order_fail_id).first()
    assert sub_fail_db is None, "Failed payment must NEVER create a Subscription"

    # --- Scenario A: Successful Payment ---
    order_succ_res = client.post("/api/v1/orders", headers=headers, json={"package_version_id": version_id})
    order_succ_id = order_succ_res.json()["id"]

    checkout_succ = client.post(f"/api/v1/orders/{order_succ_id}/checkout", headers=headers, json={
        "payment_method": "mock_corporate_card",
        "simulate_failure": False
    })
    assert checkout_succ.status_code == 200, f"Checkout failed: {checkout_succ.text}"
    succ_data = checkout_succ.json()

    # Check order & payment status
    assert succ_data["order"]["status"] == "completed"
    assert succ_data["payment"]["status"] == "successful"
    assert succ_data["subscription_id"] is not None
    assert succ_data["license_id"] is not None
    assert succ_data["license_key"] is not None
    assert succ_data["license_key"].startswith("OCR-2026-")

    sub_id = succ_data["subscription_id"]

    # Verify Subscription API
    sub_api_res = client.get(f"/api/v1/subscriptions/{sub_id}", headers=headers)
    assert sub_api_res.status_code == 200
    sub_data = sub_api_res.json()
    assert sub_data["id"] == sub_id
    assert sub_data["user_id"] == customer_one.id
    assert sub_data["order_id"] == order_succ_id
    assert sub_data["package_version_id"] == version_id
    assert sub_data["status"] == "active"
    assert sub_data["total_quota"] == 1000

    # Verify Subscription in DB
    db_sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    assert db_sub is not None
    assert db_sub.user_id == customer_one.id
    assert db_sub.order_id == order_succ_id
    assert db_sub.status == SubscriptionStatus.ACTIVE
    assert db_sub.start_date is not None
    assert db_sub.end_date > db_sub.start_date
    # Check Subscription Event recorded
    events = db.query(SubscriptionEvent).filter(SubscriptionEvent.subscription_id == sub_id).all()
    assert len(events) >= 1
    assert any(e.event_type == "SUBSCRIPTION_ACTIVATED" for e in events)

    # Idempotency / Duplicate payment test
    dup_checkout = client.post(f"/api/v1/orders/{order_succ_id}/checkout", headers=headers, json={
        "payment_method": "mock_corporate_card",
        "simulate_failure": False
    })
    assert dup_checkout.status_code == 200
    dup_data = dup_checkout.json()
    assert dup_data["subscription_id"] == sub_id, "Repeating checkout must not create duplicate subscription"
    # Ensure no second subscription in DB for this order
    all_subs_for_order = db.query(Subscription).filter(Subscription.order_id == order_succ_id).all()
    assert len(all_subs_for_order) == 1, "There must be exactly 1 subscription per purchase order"


# --- STEP 6: AUTOMATIC LICENSE ISSUANCE & USAGE INITIALIZATION ---

def test_step6_automatic_license_issuance(client, customer_one, customer_one_token, db):
    """
    STEP 6: Verify cryptographic License issuance, Entitlements, Usage Balance,
    audit ledger, and security (plaintext key never persisted or exposed in list API).
    """
    headers = {"Authorization": f"Bearer {customer_one_token}"}
    pkg_data = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = pkg_data["current_version"]["id"]

    order_res = client.post("/api/v1/orders", headers=headers, json={"package_version_id": version_id})
    order_id = order_res.json()["id"]

    checkout_res = client.post(f"/api/v1/orders/{order_id}/checkout", headers=headers, json={
        "payment_method": "mock_card"
    })
    res_data = checkout_res.json()
    license_id = res_data["license_id"]
    raw_key = res_data["license_key"]
    masked_key = res_data["masked_key"]

    # 1. License key format verification
    assert raw_key.startswith("OCR-2026-")
    assert masked_key.startswith("OCR-2026-")
    assert "****" in masked_key

    # 2. Database verification of License security
    db_lic = db.query(License).filter(License.id == license_id).first()
    assert db_lic is not None
    assert db_lic.user_id == customer_one.id
    assert db_lic.status == LicenseStatus.ACTIVE
    assert db_lic.masked_key == masked_key
    # SHA-256 hash must be 64 characters
    assert len(db_lic.key_hash) == 64
    assert raw_key not in db_lic.key_hash, "Raw key must not be stored in key_hash"
    # Plaintext key column MUST NOT exist on License model
    assert not hasattr(db_lic, "license_key"), "Plaintext license key column must not exist"

    # 3. Entitlement verification
    assert db_lic.entitlement is not None
    ent = db_lic.entitlement
    assert ent.quota_type == QuotaType.PAGE
    assert ent.initial_quota == 1000
    assert ent.api_access is True

    # 4. Usage Balance verification (Total: 1000, Used: 0, Reserved: 0, Remaining: 1000)
    assert db_lic.usage_balance is not None
    bal = db_lic.usage_balance
    assert bal.total_quota == 1000
    assert bal.used_quota == 0
    assert bal.reserved_quota == 0
    assert bal.remaining_quota == 1000

    # 5. Usage Ledger verification
    ledger_entries = db.query(UsageLedger).filter(UsageLedger.license_id == license_id).all()
    assert len(ledger_entries) == 1
    entry = ledger_entries[0]
    assert entry.delta == 1000
    assert entry.balance_after == 1000
    assert entry.entry_type == LedgerEntryType.CREDIT_INITIAL
    assert entry.reference_type == "order"
    assert entry.reference_id == order_id

    # 6. List API Security: License Key must NOT be exposed in list API
    list_res = client.get("/api/v1/licenses", headers=headers)
    assert list_res.status_code == 200
    lic_items = list_res.json()
    item = next(l for l in lic_items if l["id"] == license_id)
    assert item["masked_key"] == masked_key
    assert "license_key" not in item, "Full raw key must NEVER be leaked in License List API"
    assert item["quota"] == 1000
    assert item["remaining_quota"] == 1000


# --- STEP 7: API CREDENTIAL GENERATION & MANAGEMENT ---

def test_step7_api_credential_lifecycle_and_security(client, customer_one, customer_one_token, customer_two_token, db):
    """
    STEP 7: Generate API credentials, retrieve secret ONCE, verify hash in DB,
    masked key in list, revoke first credential, verify cross-customer isolation.
    """
    headers_c1 = {"Authorization": f"Bearer {customer_one_token}"}
    headers_c2 = {"Authorization": f"Bearer {customer_two_token}"}

    # Acquire a license for Customer One
    pkg_data = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = pkg_data["current_version"]["id"]
    order_res = client.post("/api/v1/orders", headers=headers_c1, json={"package_version_id": version_id})
    order_id = order_res.json()["id"]
    checkout_res = client.post(f"/api/v1/orders/{order_id}/checkout", headers=headers_c1, json={"payment_method": "mock_card"})
    license_id = checkout_res.json()["license_id"]

    # 1. Generate First API Credential
    cred1_res = client.post(f"/api/v1/licenses/{license_id}/credentials", headers=headers_c1, json={
        "name": "Production Server Key"
    })
    assert cred1_res.status_code == 201, f"Create credential failed: {cred1_res.text}"
    cred1_data = cred1_res.json()
    cred1_id = cred1_data["id"]
    raw_api_key = cred1_data["api_key"]
    assert raw_api_key.startswith("ocr_live_")
    assert cred1_data["status"] == "active"
    assert cred1_data["last_used_at"] is None

    # Check Database: secret_hash must be SHA-256 (64 hex chars), raw secret not stored
    db_cred1 = db.query(APICredential).filter(APICredential.id == cred1_id).first()
    assert db_cred1 is not None
    assert len(db_cred1.secret_hash) == 64
    assert raw_api_key not in db_cred1.secret_hash, "Raw secret must never be stored in database"
    assert db_cred1.user_id == customer_one.id
    assert db_cred1.license_id == license_id

    # 2. Generate Second API Credential
    cred2_res = client.post(f"/api/v1/licenses/{license_id}/credentials", headers=headers_c1, json={
        "name": "Staging Server Backup Key"
    })
    assert cred2_res.status_code == 201
    cred2_id = cred2_res.json()["id"]

    # 3. List Credentials (must return masked keys, NO raw secrets)
    list_res = client.get(f"/api/v1/licenses/{license_id}/credentials", headers=headers_c1)
    assert list_res.status_code == 200
    creds = list_res.json()
    assert len(creds) == 2
    for c in creds:
        assert "api_key" not in c, "Raw API Key must never be returned in List API"
        assert "masked_key" in c
        assert "****" in c["masked_key"]

    # 4. Revoke First Credential
    del_res = client.delete(f"/api/v1/licenses/{license_id}/credentials/{cred1_id}", headers=headers_c1)
    assert del_res.status_code == 200

    # 5. Verify First is REVOKED and Second remains ACTIVE
    list_after = client.get(f"/api/v1/licenses/{license_id}/credentials", headers=headers_c1).json()
    c1_after = next(c for c in list_after if c["id"] == cred1_id)
    c2_after = next(c for c in list_after if c["id"] == cred2_id)
    assert c1_after["status"] == "revoked"
    assert c2_after["status"] == "active"

    # 6. Security Isolation: Customer Two cannot access Customer One's credentials
    # Customer Two tries to list Customer One's credentials
    hacked_list = client.get(f"/api/v1/licenses/{license_id}/credentials", headers=headers_c2)
    assert hacked_list.status_code == 403, "Customer Two cannot access Customer One's credentials"

    # Customer Two tries to create credential on Customer One's license
    hacked_create = client.post(f"/api/v1/licenses/{license_id}/credentials", headers=headers_c2, json={
        "name": "Unauthorized Intruder Key"
    })
    assert hacked_create.status_code == 403, "Customer Two cannot generate keys on Customer One's license"

    # Customer Two tries to revoke Customer One's credential
    hacked_del = client.delete(f"/api/v1/licenses/{license_id}/credentials/{cred2_id}", headers=headers_c2)
    assert hacked_del.status_code in [403, 404]


# --- SECTION 5: CROSS-MODULE DATA CONSISTENCY ---

def test_cross_module_data_consistency(client, customer_one, customer_one_token, db):
    """
    SECTION 5: Verify the complete relational chain from User to APICredential.
    USER -> ORDER -> ORDER_ITEM -> PACKAGE_VERSION -> SUBSCRIPTION -> LICENSE -> (ENTITLEMENT, USAGE_BALANCE, USAGE_LEDGER, APICREDENTIAL)
    """
    headers = {"Authorization": f"Bearer {customer_one_token}"}
    pkg_data = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = pkg_data["current_version"]["id"]

    order_res = client.post("/api/v1/orders", headers=headers, json={"package_version_id": version_id})
    order_id = order_res.json()["id"]

    checkout_res = client.post(f"/api/v1/orders/{order_id}/checkout", headers=headers, json={"payment_method": "mock_card"})
    res_data = checkout_res.json()
    license_id = res_data["license_id"]
    sub_id = res_data["subscription_id"]

    # Generate an API credential
    cred_res = client.post(f"/api/v1/licenses/{license_id}/credentials", headers=headers, json={"name": "Audit Chain Key"})
    cred_id = cred_res.json()["id"]

    # Traverse database graph
    db_user = db.query(User).filter(User.id == customer_one.id).first()
    db_order = db.query(Order).filter(Order.id == order_id).first()
    db_item = db.query(OrderItem).filter(OrderItem.order_id == order_id).first()
    db_pv = db.query(PackageVersion).filter(PackageVersion.id == version_id).first()
    db_sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    db_lic = db.query(License).filter(License.id == license_id).first()
    db_ent = db.query(LicenseEntitlement).filter(LicenseEntitlement.license_id == license_id).first()
    db_bal = db.query(UsageBalance).filter(UsageBalance.license_id == license_id).first()
    db_cred = db.query(APICredential).filter(APICredential.id == cred_id).first()

    # Assert complete relational consistency
    assert db_order.user_id == db_user.id
    assert db_item.order_id == db_order.id
    assert db_item.package_version_id == db_pv.id
    assert db_sub.order_id == db_order.id
    assert db_sub.user_id == db_user.id
    assert db_sub.package_version_id == db_pv.id
    assert db_lic.subscription_id == db_sub.id
    assert db_lic.user_id == db_user.id
    assert db_lic.package_version_id == db_pv.id
    assert db_ent.license_id == db_lic.id
    assert db_bal.license_id == db_lic.id
    assert db_bal.user_id == db_user.id
    assert db_cred.license_id == db_lic.id
    assert db_cred.user_id == db_user.id

    # Verify no orphaned records exist
    orphaned_subs = db.query(Subscription).filter(Subscription.user_id == None).count()
    orphaned_lics = db.query(License).filter(License.user_id == None).count()
    orphaned_bals = db.query(UsageBalance).filter(UsageBalance.license_id == None).count()
    assert orphaned_subs == 0
    assert orphaned_lics == 0
    assert orphaned_bals == 0


# --- SECTION 6: PACKAGE VERSION REGRESSION & HISTORICAL PRESERVATION ---

def test_package_version_regression_and_historical_preservation(client, customer_one_token, customer_two_token, admin_token, db):
    """
    SECTION 6:
    1. Customer 1 purchases Package Version 1 (price 50, quota 1000).
    2. Admin publishes Version 2 (price 75, quota 1800).
    3. Customer 1's subscription and license retain Version 1 attributes unchanged.
    4. New Customer 2 purchases the package and receives Version 2 attributes.
    """
    headers_c1 = {"Authorization": f"Bearer {customer_one_token}"}
    headers_c2 = {"Authorization": f"Bearer {customer_two_token}"}
    headers_adm = {"Authorization": f"Bearer {admin_token}"}

    services = client.get("/api/v1/ocr-services").json()
    service_id = services[0]["id"]

    # 1. Admin creates Package with Version 1
    pkg_res = client.post("/api/v1/admin/packages", headers=headers_adm, json={
        "code": f"pkg-hist-{uuid.uuid4().hex[:6]}",
        "name": "Historical Snapshot Test Pack",
        "tier": "Starter",
        "service_id": service_id,
        "status": "active",
        "initial_version": {
            "price": 50.0,
            "currency": "USD",
            "quota_type": "Page",
            "quota_amount": 1000,
            "duration": "monthly",
            "features": ["V1 Snapshot Feature"]
        }
    })
    assert pkg_res.status_code == 201
    pkg_id = pkg_res.json()["id"]
    v1_id = pkg_res.json()["current_version"]["id"]

    # 2. Customer 1 purchases Version 1
    o1_res = client.post("/api/v1/orders", headers=headers_c1, json={"package_version_id": v1_id})
    o1_id = o1_res.json()["id"]
    chk1_res = client.post(f"/api/v1/orders/{o1_id}/checkout", headers=headers_c1, json={"payment_method": "mock_card"})
    sub1_id = chk1_res.json()["subscription_id"]
    lic1_id = chk1_res.json()["license_id"]

    # 3. Admin updates package by creating Version 2 with new price & quota
    v2_res = client.post(f"/api/v1/admin/packages/{pkg_id}/versions", headers=headers_adm, json={
        "price": 75.0,
        "currency": "USD",
        "quota_type": "Page",
        "quota_amount": 1800,
        "duration": "monthly",
        "billing_type": "one_time",
        "api_access": True,
        "features": ["V2 Upgraded Quota & Feature"]
    })
    assert v2_res.status_code == 201
    v2_id = v2_res.json()["id"]

    # 4. Verify Customer 1's existing Subscription and License still preserve Version 1 values
    sub1 = client.get(f"/api/v1/subscriptions/{sub1_id}", headers=headers_c1).json()
    assert sub1["package_version_id"] == v1_id
    assert sub1["total_quota"] == 1000, "Customer 1 total quota must remain 1000 (Version 1)"

    lic1 = client.get(f"/api/v1/licenses/{lic1_id}", headers=headers_c1).json()
    assert lic1["quota"] == 1000, "Customer 1 license quota must remain 1000"

    # 5. Customer 2 purchases the package now (gets Version 2)
    o2_res = client.post("/api/v1/orders", headers=headers_c2, json={"package_version_id": v2_id})
    assert o2_res.json()["amount"] == 75.0, "Customer 2 must be billed at Version 2 price ($75)"
    o2_id = o2_res.json()["id"]

    chk2_res = client.post(f"/api/v1/orders/{o2_id}/checkout", headers=headers_c2, json={"payment_method": "mock_card"})
    sub2_id = chk2_res.json()["subscription_id"]
    lic2_id = chk2_res.json()["license_id"]

    sub2 = client.get(f"/api/v1/subscriptions/{sub2_id}", headers=headers_c2).json()
    assert sub2["package_version_id"] == v2_id
    assert sub2["total_quota"] == 1800, "Customer 2 receives Version 2 quota (1800)"

    lic2 = client.get(f"/api/v1/licenses/{lic2_id}", headers=headers_c2).json()
    assert lic2["quota"] == 1800


# --- SECTION 7: SECURITY & AUTHORIZATION TESTING ---

def test_security_and_role_based_access_control(client, customer_one_token, customer_two_token, admin_token):
    """
    SECTION 7: Verify RBAC constraints.
    Customer cannot access admin APIs or other customers' resources.
    Admin can access admin APIs.
    """
    headers_c1 = {"Authorization": f"Bearer {customer_one_token}"}
    headers_c2 = {"Authorization": f"Bearer {customer_two_token}"}
    headers_adm = {"Authorization": f"Bearer {admin_token}"}

    # 1. Customer cannot access Admin endpoints
    for endpoint in ["/api/v1/admin/packages", "/api/v1/admin/customers", "/api/v1/admin/ocr-services", "/api/v1/admin/licenses"]:
        res = client.get(endpoint, headers=headers_c1)
        assert res.status_code == 403, f"Customer must be blocked from {endpoint}"

    # 2. Admin can access Admin endpoints
    for endpoint in ["/api/v1/admin/packages", "/api/v1/admin/customers", "/api/v1/admin/ocr-services", "/api/v1/admin/licenses"]:
        res = client.get(endpoint, headers=headers_adm)
        assert res.status_code == 200, f"Admin must have access to {endpoint}"

    # 3. Unauthenticated requests are rejected with 401
    unauth_orders = client.get("/api/v1/orders")
    assert unauth_orders.status_code == 401
    unauth_lics = client.get("/api/v1/licenses")
    assert unauth_lics.status_code == 401
    unauth_subs = client.get("/api/v1/subscriptions")
    assert unauth_subs.status_code == 401


# --- SECTION 9: FAILURE RECOVERY & IDEMPOTENCY ---

def test_failure_recovery_and_idempotency(client, customer_one_token):
    """
    SECTION 9:
    1. Idempotent Order Creation with same idempotency_key returns identical order.
    2. Repeated checkout on already completed order returns original result without duplicate charges.
    """
    headers = {"Authorization": f"Bearer {customer_one_token}"}
    pkg_data = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = pkg_data["current_version"]["id"]

    idemp_key = f"idemp-{uuid.uuid4().hex}"

    # 1. First order creation
    o1 = client.post("/api/v1/orders", headers=headers, json={
        "package_version_id": version_id,
        "idempotency_key": idemp_key
    }).json()

    # 2. Second order creation with same idempotency key
    o2 = client.post("/api/v1/orders", headers=headers, json={
        "package_version_id": version_id,
        "idempotency_key": idemp_key
    }).json()

    assert o1["id"] == o2["id"], "Idempotent order creation must return existing order ID"
    assert o1["order_number"] == o2["order_number"]

    # 3. Checkout and then repeat checkout
    chk1 = client.post(f"/api/v1/orders/{o1['id']}/checkout", headers=headers, json={"payment_method": "mock_card"}).json()
    chk2 = client.post(f"/api/v1/orders/{o1['id']}/checkout", headers=headers, json={"payment_method": "mock_card"}).json()

    assert chk1["subscription_id"] == chk2["subscription_id"]
    assert chk1["license_id"] == chk2["license_id"]
    assert chk2["license_key"] is None, "Repeated checkout must NOT re-expose full license key"
