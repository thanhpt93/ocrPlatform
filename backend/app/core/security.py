import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(subject: Union[str, Any], role: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role,
        "type": "access",
        "jti": secrets.token_hex(16)
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh",
        "jti": secrets.token_hex(16)
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return {}

def hash_secret(secret: str) -> str:
    """Generate SHA-256 hash of a license key or API key secret."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()

def generate_license_key() -> tuple[str, str, str]:
    """
    Generates a cryptographically secure license key.
    Returns: (raw_key, hashed_key, masked_key)
    Format: OCR-2026-XXXX-XXXX-XXXX
    """
    part1 = secrets.token_hex(2).upper()
    part2 = secrets.token_hex(2).upper()
    part3 = secrets.token_hex(2).upper()
    raw_key = f"OCR-2026-{part1}-{part2}-{part3}"
    key_hash = hash_secret(raw_key)
    masked_key = f"OCR-2026-****-****-{part3}"
    return raw_key, key_hash, masked_key

def generate_api_key(name: str) -> tuple[str, str, str, str]:
    """
    Generates a secure API key.
    Returns: (raw_secret, key_prefix, secret_hash, masked_key)
    """
    random_part = secrets.token_urlsafe(32)
    raw_secret = f"ocr_live_{random_part}"
    key_prefix = raw_secret[:12]
    secret_hash = hash_secret(raw_secret)
    masked_key = f"{key_prefix}...{raw_secret[-4:]}"
    return raw_secret, key_prefix, secret_hash, masked_key
