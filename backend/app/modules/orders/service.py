import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from app.common.models.users import User
from app.common.models.packages import PackageVersion, Package
from app.common.models.ocr_catalog import OCRService
from app.common.models.orders import Order, OrderItem, Payment
from app.common.models.subscriptions import Subscription, SubscriptionEvent
from app.common.models.licenses import License, LicenseEntitlement, LicenseEvent
from app.common.models.usage import UsageBalance, UsageLedger
from app.common.schemas.orders import (
    OrderCreate, OrderCheckoutRequest, OrderResponse, OrderItemResponse,
    PaymentResponse, CheckoutResultResponse
)
from app.common.enums import (
    OrderStatus, PaymentStatus, SubscriptionStatus, LicenseStatus,
    LedgerEntryType, Duration
)
from app.core.exceptions import EntityNotFoundException, BadRequestException, ForbiddenException
from app.core.security import generate_license_key

def utc_now():
    return datetime.now(timezone.utc)

class OrderService:
    @staticmethod
    def create_order(db: Session, user: User, req: OrderCreate) -> OrderResponse:
        package_version = db.query(PackageVersion).filter(PackageVersion.id == req.package_version_id).first()
        if not package_version:
            # Fallback: support passing Package.id by finding its active version
            package_version = db.query(PackageVersion).filter(
                PackageVersion.package_id == req.package_version_id,
                PackageVersion.is_current == True
            ).order_by(PackageVersion.version_number.desc()).first()
        if not package_version:
            raise EntityNotFoundException("PackageVersion", req.package_version_id)

        # Idempotency check if key provided
        if req.idempotency_key:
            existing_order = db.query(Order).filter(
                Order.user_id == user.id,
                Order.idempotency_key == req.idempotency_key
            ).first()
            if existing_order:
                return OrderService._to_order_response(existing_order)

        order_number = f"ORD-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
        order = Order(
            order_number=order_number,
            user_id=user.id,
            package_version_id=package_version.id,
            amount=package_version.price,
            currency=package_version.currency,
            status=OrderStatus.PENDING,
            idempotency_key=req.idempotency_key
        )
        db.add(order)
        db.flush()

        item = OrderItem(
            order_id=order.id,
            package_version_id=package_version.id,
            service_id=package_version.package.service_id,
            price=package_version.price,
            quantity=1
        )
        db.add(item)
        db.commit()
        db.refresh(order)

        return OrderService._to_order_response(order)

    @staticmethod
    def get_user_orders(db: Session, user_id: str) -> List[OrderResponse]:
        orders = db.query(Order).filter(Order.user_id == user_id).order_by(Order.created_at.desc()).all()
        return [OrderService._to_order_response(o) for o in orders]

    @staticmethod
    def get_order_by_id(db: Session, order_id: str, user_id: str, is_admin: bool = False) -> OrderResponse:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise EntityNotFoundException("Order", order_id)
        if not is_admin and order.user_id != user_id:
            raise ForbiddenException("You do not have access to this order")
        return OrderService._to_order_response(order)

    @staticmethod
    def checkout(db: Session, user: User, order_id: str, req: OrderCheckoutRequest) -> CheckoutResultResponse:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise EntityNotFoundException("Order", order_id)

        # Ownership check
        if order.user_id != user.id:
            raise ForbiddenException("You do not own this order")

        # Idempotency: If order is already completed, return existing result without re-issuing!
        if order.status == OrderStatus.COMPLETED:
            existing_payment = db.query(Payment).filter(
                Payment.order_id == order.id,
                Payment.status == PaymentStatus.SUCCESSFUL
            ).first()
            existing_sub = db.query(Subscription).filter(Subscription.order_id == order.id).first()
            existing_lic = db.query(License).filter(License.subscription_id == existing_sub.id).first() if existing_sub else None

            return CheckoutResultResponse(
                order=OrderService._to_order_response(order),
                payment=OrderService._to_payment_response(existing_payment),
                subscription_id=existing_sub.id if existing_sub else None,
                license_id=existing_lic.id if existing_lic else None,
                license_key=None,  # Do not re-expose full key if already issued
                masked_key=existing_lic.masked_key if existing_lic else None
            )

        # If simulating payment failure
        if req.simulate_failure:
            payment_number = f"PAY-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
            payment = Payment(
                payment_number=payment_number,
                order_id=order.id,
                user_id=user.id,
                amount=order.amount,
                currency=order.currency,
                method=req.payment_method,
                status=PaymentStatus.FAILED,
                idempotency_key=req.idempotency_key,
                failure_reason="Card declined by test mock payment provider"
            )
            order.status = OrderStatus.FAILED
            db.add(payment)
            db.commit()
            db.refresh(order)
            db.refresh(payment)

            return CheckoutResultResponse(
                order=OrderService._to_order_response(order),
                payment=OrderService._to_payment_response(payment)
            )

        # Process SUCCESSFUL Payment & Automatic License Issuance Flow
        payment_number = f"PAY-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
        payment = Payment(
            payment_number=payment_number,
            order_id=order.id,
            user_id=user.id,
            amount=order.amount,
            currency=order.currency,
            method=req.payment_method,
            status=PaymentStatus.SUCCESSFUL,
            idempotency_key=req.idempotency_key,
            transaction_reference=f"txn_{secrets.token_hex(8)}"
        )
        db.add(payment)
        order.status = OrderStatus.COMPLETED

        pkg_version: PackageVersion = order.package_version
        service_id = pkg_version.package.service_id

        # Calculate duration
        start_date = utc_now()
        if pkg_version.duration == Duration.YEARLY:
            end_date = start_date + timedelta(days=365)
        elif pkg_version.duration == Duration.MONTHLY:
            end_date = start_date + timedelta(days=30)
        else:
            end_date = start_date + timedelta(days=365)

        # 1. Create Subscription
        subscription = Subscription(
            user_id=user.id,
            package_version_id=pkg_version.id,
            order_id=order.id,
            service_id=service_id,
            start_date=start_date,
            end_date=end_date,
            auto_renew=pkg_version.auto_renewal,
            status=SubscriptionStatus.ACTIVE
        )
        db.add(subscription)
        db.flush()

        sub_event = SubscriptionEvent(
            subscription_id=subscription.id,
            event_type="SUBSCRIPTION_ACTIVATED",
            payload={"order_id": order.id, "amount": order.amount}
        )
        db.add(sub_event)

        # 2. Generate License (Secure Key, Hash, Masked)
        raw_key, key_hash, masked_key = generate_license_key()
        license_obj = License(
            key_hash=key_hash,
            masked_key=masked_key,
            user_id=user.id,
            subscription_id=subscription.id,
            package_version_id=pkg_version.id,
            service_id=service_id,
            status=LicenseStatus.ACTIVE,
            issued_at=start_date,
            expires_at=end_date
        )
        db.add(license_obj)
        db.flush()

        # 3. Create License Entitlements
        entitlement = LicenseEntitlement(
            license_id=license_obj.id,
            quota_type=pkg_version.quota_type,
            initial_quota=pkg_version.quota_amount,
            api_access=pkg_version.api_access,
            batch_processing=pkg_version.batch_processing,
            priority_processing=pkg_version.priority_processing,
            features=pkg_version.features
        )
        db.add(entitlement)

        lic_event = LicenseEvent(
            license_id=license_obj.id,
            action="AUTOMATIC_ISSUANCE",
            actor_id=user.id,
            notes=f"Issued automatically upon payment {payment.payment_number}"
        )
        db.add(lic_event)

        # 4. Initialize Usage Balance
        usage_balance = UsageBalance(
            license_id=license_obj.id,
            user_id=user.id,
            quota_type=pkg_version.quota_type,
            total_quota=pkg_version.quota_amount,
            used_quota=0,
            reserved_quota=0,
            remaining_quota=pkg_version.quota_amount
        )
        db.add(usage_balance)

        # 5. Append Initial Credit to Ledger
        ledger_entry = UsageLedger(
            license_id=license_obj.id,
            delta=pkg_version.quota_amount,
            balance_after=pkg_version.quota_amount,
            entry_type=LedgerEntryType.CREDIT_INITIAL,
            reference_type="order",
            reference_id=order.id
        )
        db.add(ledger_entry)

        db.commit()
        db.refresh(order)
        db.refresh(payment)

        return CheckoutResultResponse(
            order=OrderService._to_order_response(order),
            payment=OrderService._to_payment_response(payment),
            subscription_id=subscription.id,
            license_id=license_obj.id,
            license_key=raw_key,  # Full key returned ONLY at issuance response
            masked_key=masked_key
        )

    @staticmethod
    def get_user_payments(db: Session, user_id: str) -> List[PaymentResponse]:
        payments = db.query(Payment).filter(Payment.user_id == user_id).order_by(Payment.created_at.desc()).all()
        return [OrderService._to_payment_response(p) for p in payments]

    @staticmethod
    def _to_order_response(order: Order) -> OrderResponse:
        items = []
        for item in order.items:
            items.append(
                OrderItemResponse(
                    id=item.id,
                    package_version_id=item.package_version_id,
                    service_id=item.service_id,
                    service_name=item.service.name if item.service else None,
                    price=item.price,
                    quantity=item.quantity
                )
            )

        pkg_name = order.package_version.package.name if order.package_version and order.package_version.package else None
        srv_name = order.package_version.package.service.name if order.package_version and order.package_version.package and order.package_version.package.service else None

        return OrderResponse(
            id=order.id,
            order_number=order.order_number,
            user_id=order.user_id,
            package_version_id=order.package_version_id,
            amount=order.amount,
            currency=order.currency,
            status=order.status,
            created_at=order.created_at,
            updated_at=order.updated_at,
            service_name=srv_name,
            package_name=pkg_name,
            items=items
        )

    @staticmethod
    def _to_payment_response(payment: Payment) -> PaymentResponse:
        return PaymentResponse(
            id=payment.id,
            payment_number=payment.payment_number,
            order_id=payment.order_id,
            order_number=payment.order.order_number if payment.order else None,
            user_id=payment.user_id,
            amount=payment.amount,
            currency=payment.currency,
            method=payment.method,
            status=payment.status,
            transaction_reference=payment.transaction_reference,
            failure_reason=payment.failure_reason,
            created_at=payment.created_at
        )
