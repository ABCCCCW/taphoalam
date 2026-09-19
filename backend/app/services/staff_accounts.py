"""Quy ước tài khoản nhân viên.

Quản trị đăng nhập bằng tên `admin`. Nhân viên còn lại dùng mã số 4 chữ số
cấp lần lượt (0001 thu ngân, 0002 kho, 0003…), mật khẩu mặc định bên dưới —
nhân viên nên tự đổi sau lần đầu vào.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import User

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Admin@2026"
DEFAULT_STAFF_PASSWORD = "Nguyenbaolam"


def is_staff_code(username: str) -> bool:
    return len(username) == 4 and username.isdigit()


def next_staff_code(db: Session) -> str:
    used = [int(u) for (u,) in db.query(User.username).all() if is_staff_code(u)]
    return f"{max(used, default=0) + 1:04d}"
