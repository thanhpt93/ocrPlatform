from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.common.models.users import User
from app.common.schemas.subscriptions import SubscriptionResponse
from app.modules.subscriptions.service import SubscriptionService

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])

@router.get("", response_model=List[SubscriptionResponse])
def get_user_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return SubscriptionService.get_user_subscriptions(db, current_user.id)

@router.get("/{sub_id}", response_model=SubscriptionResponse)
def get_subscription_by_id(
    sub_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return SubscriptionService.get_subscription_by_id(db, sub_id, current_user.id)
