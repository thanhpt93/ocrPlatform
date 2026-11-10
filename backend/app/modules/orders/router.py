from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.common.models.users import User
from app.common.schemas.orders import OrderCreate, OrderCheckoutRequest, OrderResponse, PaymentResponse, CheckoutResultResponse
from app.modules.orders.service import OrderService

router = APIRouter(tags=["Orders & Payments"])

@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    req: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return OrderService.create_order(db, current_user, req)

@router.get("/orders", response_model=List[OrderResponse])
def get_user_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return OrderService.get_user_orders(db, current_user.id)

@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order_by_id(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return OrderService.get_order_by_id(db, order_id, current_user.id)

@router.post("/orders/{order_id}/checkout", response_model=CheckoutResultResponse)
def checkout_order(
    order_id: str,
    req: OrderCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return OrderService.checkout(db, current_user, order_id, req)

@router.get("/payments/history", response_model=List[PaymentResponse])
def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return OrderService.get_user_payments(db, current_user.id)
