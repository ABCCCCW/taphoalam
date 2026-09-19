from __future__ import annotations

import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.paging import clamp_page, page_meta
from app.core.permissions import PERMISSIONS
from app.core.security import create_token, hash_password, hash_token, verify_password
from app.core.utils import utcnow
from app.database import get_db
from app.deps import get_current_staff
from app.models import RefreshToken, User
from app.services.staff_accounts import DEFAULT_STAFF_PASSWORD, next_staff_code

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


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
        "is_active": user.is_active,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "permissions": list(PERMISSIONS.get(user.role, [])),
    }


_VN_MARK = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)


def clean_password(value: str | None, *, required: bool = False) -> str | None:
    raw = (value or "").replace(" ", "")
    if not raw:
        if required:
            raise HTTPException(400, "Nhập mật khẩu")
        return None
    if len(raw) < 6:
        raise HTTPException(400, "Mật khẩu từ 6 ký tự")
    if _VN_MARK.search(raw):
        raise HTTPException(400, "Mật khẩu không viết dấu và không có khoảng trắng")
    return raw


def revoke_staff_sessions(db: Session, user_id: int):
    db.query(RefreshToken).filter(
        RefreshToken.subject_id == user_id,
        RefreshToken.subject_type == "STAFF",
        RefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": utcnow()}, synchronize_session=False)


def active_admins(db: Session) -> int:
    return db.query(User).filter(User.role == "ADMIN", User.is_active.is_(True)).count()


def require_admin(user: User):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ chủ tiệm được quản lý tài khoản nhân viên")


def get_staff(db: Session, user_id: int) -> User:
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(404, "Không thấy nhân viên này")
    return row


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(401, "Sai tài khoản hoặc mật khẩu")
    return issue_tokens(db, user)


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(body.refresh_token)).first()
    if not row or row.revoked_at or row.expires_at < utcnow() or row.subject_type != "STAFF":
        raise HTTPException(401, "Refresh token không hợp lệ")
    user = db.get(User, row.subject_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Tài khoản không tồn tại hoặc đã bị khoá")
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
def list_users(
    q: str | None = None,
    role: str | None = None,
    active: bool | None = None,
    page: int = 1,
    size: int = 10,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_staff),
):
    require_admin(user)
    page, size = clamp_page(page, size)
    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((User.full_name.ilike(like)) | (User.username.ilike(like)) | (User.phone.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    if active is not None:
        query = query.filter(User.is_active.is_(active))
    total = query.count()
    rows = query.order_by(User.id).offset((page - 1) * size).limit(size).all()
    return {
        "items": [serialize_user(u) for u in rows],
        "next_username": next_staff_code(db),
        **page_meta(page, size, total),
    }


class UserIn(BaseModel):
    # Để trống: tự cấp mã số tiếp theo (0003, 0004…) và mật khẩu mặc định
    username: str | None = None
    password: str | None = None
    full_name: str
    role: str
    phone: str | None = None
    email: str | None = None


@router.post("/users")
def create_user(body: UserIn, db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    require_admin(user)
    # Tiệm chỉ có một chủ — tài khoản mới chỉ là thu ngân hoặc kho.
    if body.role not in ("CASHIER", "STOCKER"):
        raise HTTPException(400, "Chỉ tạo được thu ngân hoặc nhân viên kho")
    username = (body.username or "").strip().lower() or next_staff_code(db)
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, f"Tên đăng nhập {username} đã có người dùng")
    password = clean_password(body.password) or DEFAULT_STAFF_PASSWORD
    row = User(
        username=username,
        password_hash=hash_password(password),
        full_name=body.full_name.strip(),
        role=body.role,
        phone=body.phone,
        email=body.email,
    )
    db.add(row)
    db.flush()
    return serialize_user(row)


class UserPatch(BaseModel):
    full_name: str | None = None
    role: str | None = None
    phone: str | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    require_admin(user)
    row = get_staff(db, user_id)
    last_admin = row.role == "ADMIN" and row.is_active and active_admins(db) <= 1

    if body.full_name is not None:
        name = body.full_name.strip()
        if not name:
            raise HTTPException(400, "Cần tên để hiện trên hoá đơn")
        row.full_name = name
    if body.phone is not None:
        row.phone = body.phone.strip() or None
    if body.role is not None:
        if body.role not in ("ADMIN", "CASHIER", "STOCKER"):
            raise HTTPException(400, "Vai trò không hợp lệ")
        if (body.role == "ADMIN") != (row.role == "ADMIN"):
            raise HTTPException(400, "Tiệm chỉ có một chủ tiệm, không đổi vai sang hoặc từ chủ tiệm")
        row.role = body.role
    if body.is_active is not None:
        if user_id == user.id and not body.is_active:
            raise HTTPException(400, "Không tự tắt tài khoản đang đăng nhập")
        if last_admin and not body.is_active:
            raise HTTPException(400, "Không tắt chủ tiệm cuối cùng")
        row.is_active = body.is_active
        if not body.is_active:
            revoke_staff_sessions(db, row.id)
    return serialize_user(row)


class PasswordIn(BaseModel):
    password: str | None = None


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, body: PasswordIn, db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    require_admin(user)
    row = get_staff(db, user_id)
    password = clean_password(body.password) or DEFAULT_STAFF_PASSWORD
    row.password_hash = hash_password(password)
    if user_id != user.id:
        revoke_staff_sessions(db, row.id)
    return {"ok": True, "username": row.username}
