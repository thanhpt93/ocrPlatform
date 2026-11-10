from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.common.schemas.auth import UserResponse, UserProfileUpdateRequest, UserProfileResponse
from app.common.models.users import User, UserProfile

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    profile_data = None
    if current_user.profile:
        profile_data = UserProfileResponse(
            phone=current_user.profile.phone,
            address=current_user.profile.address,
            tax_id=current_user.profile.tax_id,
            company_name=current_user.profile.company_name,
            avatar_url=current_user.profile.avatar_url
        )
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        status=current_user.status,
        created_at=current_user.created_at,
        profile=profile_data
    )

@router.put("/me/profile", response_model=UserResponse)
def update_profile(
    req: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.full_name is not None:
        current_user.full_name = req.full_name

    profile = current_user.profile
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    
    if req.phone is not None:
        profile.phone = req.phone
    if req.address is not None:
        profile.address = req.address
    if req.tax_id is not None:
        profile.tax_id = req.tax_id
    if req.company_name is not None:
        profile.company_name = req.company_name

    db.commit()
    db.refresh(current_user)
    return get_me(current_user)
