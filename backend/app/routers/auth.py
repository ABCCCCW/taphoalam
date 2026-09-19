from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.permissions import PERMISSIONS
from app.core.security import create_token, hash_password, hash_token, verify_password
from app.core.utils import utcnow
from app.database import get_db
from app.deps import get_current_staff
from app.models import RefreshToken, User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class PinIn(BaseModel):
    pin: str


class RefreshIn(BaseModel):
    refresh_token: str


def issue_tokens(db: Session, user: User):
    access = create_token(user.id, "staff", {"role": user.role})
    refresh = create_token(user.id, "staff_refresh", minutes=settings.refresh_token_days * 24 * 60)
    db.add(
        RefreshToken(
            subject_id=user.id,
            token_hash=hash_token(refresh),
            subject_type="STAFF",
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        )
    )
    user.last_login_at = utcnow()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


def serialize_user(user: User):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "phone": user.phone,
        "email": user.email,
        "permissions": list(PERMISSIONS.get(user.role, [])),
    }


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(401, "Sai tài khoản hoặc mật khẩu")
    return issue_tokens(db, user)


@router.post("/login-pin")
def login_pin(body: PinIn, db: Session = Depends(get_db)):
    users = db.query(User).filter(User.pin_hash.isnot(None), User.is_active.is_(True)).all()
    for user in users:
        if verify_password(body.pin, user.pin_hash):
            return issue_tokens(db, user)
    raise HTTPException(401, "PIN không đúng")


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(body.refresh_token)).first()
    if not row or row.revoked_at or row.expires_at < utcnow() or row.subject_type != "STAFF":
        raise HTTPException(401, "Refresh token không hợp lệ")
    user = db.get(User, row.subject_id)
    if not user:
        raise HTTPException(401, "Tài khoản không tồn tại")
    row.revoked_at = utcnow()
    return issue_tokens(db, user)


@router.post("/logout")
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(body.refresh_token)).first()
    if row:
        row.revoked_at = utcnow()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_staff)):
    return serialize_user(user)


@router.get("/users")
def list_users(db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị được xem danh sách nhân viên")
    return [serialize_user(u) for u in db.query(User).order_by(User.id).all()]


class UserIn(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    phone: str | None = None
    email: str | None = None
    pin: str | None = None


@router.post("/users")
def create_user(body: UserIn, db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị được tạo nhân viên")
    if body.role not in ("ADMIN", "CASHIER", "STOCKER"):
        raise HTTPException(400, "Vai trò không hợp lệ")
    row = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        phone=body.phone,
        email=body.email,
        pin_hash=hash_password(body.pin) if body.pin else None,
    )
    db.add(row)
    db.flush()
    return serialize_user(row)
