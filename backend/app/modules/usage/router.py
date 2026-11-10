from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.common.models.users import User
from app.common.schemas.usage import UsageSummaryResponse, UsageHistoryResponse
from app.modules.usage.service import UsageService

router = APIRouter(prefix="/usage", tags=["Usage"])

@router.get("/summary", response_model=UsageSummaryResponse)
def get_usage_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return UsageService.get_user_usage_summary(db, current_user.id)

@router.get("/history", response_model=UsageHistoryResponse)
def get_usage_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return UsageService.get_user_usage_history(db, current_user.id)
