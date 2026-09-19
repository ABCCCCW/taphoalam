from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models import Customer, User

bearer = HTTPBearer(auto_error=False)


def _payload(creds: HTTPAuthorizationCredentials | None):
    if not creds:
        raise HTTPException(401, "Thiếu token")
    try:
        return decode_token(creds.credentials)
    except ValueError:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn")


def get_current_staff(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = _payload(creds)
    if payload.get("type") != "staff":
        raise HTTPException(401, "Endpoint này chỉ dành cho nhân viên")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "Tài khoản không tồn tại hoặc đã bị khoá")
    return user


def get_current_customer(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Customer:
    payload = _payload(creds)
    if payload.get("type") != "customer":
        raise HTTPException(401, "Endpoint này chỉ dành cho khách hàng")
    customer = db.get(Customer, int(payload["sub"]))
    if not customer or not customer.is_active:
        raise HTTPException(401, "Tài khoản không tồn tại hoặc đã bị khoá")
    return customer


def get_optional_customer(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Customer | None:
    if not creds:
        return None
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        return None
    if payload.get("type") != "customer":
        return None
    return db.get(Customer, int(payload["sub"]))


def get_idempotency_key(idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> str | None:
    return idempotency_key
