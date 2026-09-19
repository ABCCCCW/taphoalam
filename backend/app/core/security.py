from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(subject_id: int, token_type: str, extra: dict[str, Any] | None = None, minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=minutes or settings.access_token_minutes)
    payload = {
        "sub": str(subject_id),
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": expire,
        **(extra or {}),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Token không hợp lệ") from exc


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
