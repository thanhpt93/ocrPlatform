from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.common.models.users import User, UserProfile, RefreshToken
from app.common.schemas.auth import UserRegisterRequest, UserLoginRequest, TokenResponse, RefreshTokenRequest
from app.common.enums import UserRole, UserStatus
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token, hash_secret
from app.core.exceptions import EntityAlreadyExistsException, UnauthorizedException, BadRequestException
from app.core.config import settings

class AuthService:
    @staticmethod
    def register(db: Session, req: UserRegisterRequest) -> TokenResponse:
        existing = db.query(User).filter(User.email == req.email.lower()).first()
        if existing:
            raise EntityAlreadyExistsException("User", "email")

        user = User(
            email=req.email.lower(),
            hashed_password=get_password_hash(req.password),
            full_name=req.full_name,
            role=UserRole.CUSTOMER,
            status=UserStatus.ACTIVE
        )
        db.add(user)
        db.flush()

        profile = UserProfile(
            user_id=user.id,
            company_name=req.company_name,
            phone=req.phone
        )
        db.add(profile)

        access_token = create_access_token(user.id, user.role.value)
        refresh_token_str = create_refresh_token(user.id)
        
        refresh_token = RefreshToken(
            user_id=user.id,
            token_hash=hash_secret(refresh_token_str),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        )
        db.add(refresh_token)
        db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token_str,
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value
        )

    @staticmethod
    def login(db: Session, req: UserLoginRequest) -> TokenResponse:
        user = db.query(User).filter(User.email == req.email.lower()).first()
        if not user or not verify_password(req.password, user.hashed_password):
            raise UnauthorizedException("Invalid email or password")

        if user.status != UserStatus.ACTIVE:
            raise UnauthorizedException("Account is not active")

        access_token = create_access_token(user.id, user.role.value)
        refresh_token_str = create_refresh_token(user.id)
        
        refresh_token = RefreshToken(
            user_id=user.id,
            token_hash=hash_secret(refresh_token_str),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        )
        db.add(refresh_token)
        db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token_str,
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value
        )

    @staticmethod
    def refresh(db: Session, req: RefreshTokenRequest) -> TokenResponse:
        token_hash = hash_secret(req.refresh_token)
        stored_token = db.query(RefreshToken).filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False
        ).first()

        if not stored_token or stored_token.expires_at < datetime.now(timezone.utc):
            raise UnauthorizedException("Invalid or expired refresh token")

        user = db.query(User).filter(User.id == stored_token.user_id).first()
        if not user or user.status != UserStatus.ACTIVE:
            raise UnauthorizedException("User inactive or not found")

        # Invalidate old refresh token and issue new pair
        stored_token.revoked = True
        
        new_access_token = create_access_token(user.id, user.role.value)
        new_refresh_str = create_refresh_token(user.id)
        new_refresh = RefreshToken(
            user_id=user.id,
            token_hash=hash_secret(new_refresh_str),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        )
        db.add(new_refresh)
        db.commit()

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_str,
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value
        )

    @staticmethod
    def logout(db: Session, user_id: str):
        # Revoke active refresh tokens
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False
        ).update({"revoked": True})
        db.commit()
