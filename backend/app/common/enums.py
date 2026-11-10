from enum import Enum

class UserRole(str, Enum):
    CUSTOMER = "CUSTOMER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"

class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    PENDING = "PENDING"

class ServiceStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class ProcessingMode(str, Enum):
    SYNCHRONOUS = "synchronous"
    ASYNCHRONOUS = "asynchronous"
    BATCH = "batch"

class DocTypeCategory(str, Enum):
    FINANCIAL = "Financial"
    LEGAL = "Legal"
    IDENTITY = "Identity"
    LOGISTICS = "Logistics"
    HEALTHCARE = "Healthcare"
    GENERAL = "General"

class QuotaType(str, Enum):
    PAGE = "Page"
    DOCUMENT = "Document"
    CREDIT = "Credit"

class PackageTier(str, Enum):
    STARTER = "Starter"
    PROFESSIONAL = "Professional"
    ENTERPRISE = "Enterprise"
    CUSTOM = "Custom"

class Duration(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"
    PAY_AS_YOU_GO = "pay_as_you_go"

class BillingType(str, Enum):
    ONE_TIME = "one_time"
    RECURRING = "recurring"

class OveragePolicy(str, Enum):
    BLOCK = "block"
    CHARGE_PER_UNIT = "charge_per_unit"
    GRACE_PERIOD = "grace_period"

class OrderStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    SUCCESSFUL = "successful"
    FAILED = "failed"

class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    SUSPENDED = "suspended"

class LicenseStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    EXPIRED = "expired"
    REVOKED = "revoked"

class CredentialStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"

class ReservationStatus(str, Enum):
    RESERVED = "reserved"
    COMMITTED = "committed"
    RELEASED = "released"

class LedgerEntryType(str, Enum):
    CREDIT_INITIAL = "credit_initial"
    DEBIT_USAGE = "debit_usage"
    CREDIT_REFUND = "credit_refund"
    ADJUSTMENT = "adjustment"
