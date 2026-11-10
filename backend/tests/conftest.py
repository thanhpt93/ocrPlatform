import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db
from app.main import app
from app.core.security import get_password_hash, create_access_token
from app.common.models.users import User, UserProfile
from app.common.enums import UserRole, UserStatus
from app.seed import seed

# In-memory SQLite for fast isolated testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    # Seed base catalog data
    db = TestingSessionLocal()
    try:
        from app.common.models.ocr_catalog import OCRService, DocumentType, ServiceDocumentType
        from app.common.models.packages import Package, PackageVersion, CreditRate
        from app.common.enums import ServiceStatus, ProcessingMode, DocTypeCategory, PackageTier, QuotaType, Duration, BillingType, OveragePolicy

        dt = DocumentType(code="dt-test-pdf", name="Test PDF", category=DocTypeCategory.GENERAL, status="active")
        db.add(dt)
        db.flush()

        srv_pub = OCRService(
            code="srv-pub-1",
            name="Published Service",
            category="General",
            description="Published OCR service",
            processing_mode=ProcessingMode.SYNCHRONOUS,
            status=ServiceStatus.PUBLISHED,
            starting_price=10.0
        )
        db.add(srv_pub)

        srv_draft = OCRService(
            code="srv-draft-1",
            name="Draft Service",
            category="General",
            description="Draft OCR service",
            processing_mode=ProcessingMode.SYNCHRONOUS,
            status=ServiceStatus.DRAFT,
            starting_price=20.0
        )
        db.add(srv_draft)
        db.flush()

        # Connect published service to document type
        db.add(ServiceDocumentType(service_id=srv_pub.id, document_type_id=dt.id))

        # Create package for srv_pub
        pkg = Package(
            code="pkg-test-1",
            name="Test Page Package",
            tier=PackageTier.STARTER,
            service_id=srv_pub.id,
            status="active"
        )
        db.add(pkg)
        db.flush()

        pv1 = PackageVersion(
            package_id=pkg.id,
            version_number=1,
            price=29.0,
            currency="USD",
            quota_type=QuotaType.PAGE,
            quota_amount=1000,
            duration=Duration.MONTHLY,
            billing_type=BillingType.ONE_TIME,
            api_access=True,
            features=["1000 pages"],
            is_current=True
        )
        db.add(pv1)

        db.commit()
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db):
    admin = User(
        email="test_admin@ocrplatform.com",
        hashed_password=get_password_hash("AdminPass123"),
        full_name="Test Admin",
        role=UserRole.PLATFORM_ADMIN,
        status=UserStatus.ACTIVE
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin

@pytest.fixture
def customer_one(db):
    user = User(
        email="customer1@tech.com",
        hashed_password=get_password_hash("CustomerPass123"),
        full_name="Customer One",
        role=UserRole.CUSTOMER,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@pytest.fixture
def customer_two(db):
    user = User(
        email="customer2@tech.com",
        hashed_password=get_password_hash("CustomerPass123"),
        full_name="Customer Two",
        role=UserRole.CUSTOMER,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user.id, admin_user.role.value)

@pytest.fixture
def customer_one_token(customer_one):
    return create_access_token(customer_one.id, customer_one.role.value)

@pytest.fixture
def customer_two_token(customer_two):
    return create_access_token(customer_two.id, customer_two.role.value)
