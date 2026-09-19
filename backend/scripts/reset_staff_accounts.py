"""Đưa tài khoản nhân viên trên DB đang chạy về quy ước mới.

    cd backend
    python -m scripts.reset_staff_accounts                      # DB local (taphoa.db)
    DATABASE_URL='postgresql://…' python -m scripts.reset_staff_accounts   # Supabase

- `admin`: đặt lại mật khẩu thành ADMIN_PASSWORD.
- Nhân viên chưa có mã số: cấp mã 0001, 0002… theo thứ tự thu ngân → kho → còn lại,
  mật khẩu mặc định. Người đã có mã số giữ nguyên, nên chạy lại nhiều lần không sao.
"""
from __future__ import annotations

import os

os.environ.setdefault("SKIP_SCHEMA_SYNC", "1")

from app.core.security import hash_password  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import RefreshToken, User  # noqa: E402
from app.services.staff_accounts import (  # noqa: E402
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    DEFAULT_STAFF_PASSWORD,
    is_staff_code,
    next_staff_code,
)

ROLE_ORDER = {"CASHIER": 0, "STOCKER": 1}


def main():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == ADMIN_USERNAME).first()
        if admin:
            admin.password_hash = hash_password(ADMIN_PASSWORD)
            print(f"{ADMIN_USERNAME}: đặt lại mật khẩu")
        else:
            print(f"Không thấy tài khoản {ADMIN_USERNAME}")

        pending = [
            u for u in db.query(User).filter(User.role != "ADMIN").all() if not is_staff_code(u.username)
        ]
        pending.sort(key=lambda u: (ROLE_ORDER.get(u.role, 9), u.id))
        for u in pending:
            code = next_staff_code(db)
            print(f"{u.username} ({u.role}, {u.full_name}) → {code}")
            u.username = code
            u.password_hash = hash_password(DEFAULT_STAFF_PASSWORD)
            # Phiên cũ đăng nhập bằng tên cũ phải vào lại
            db.query(RefreshToken).filter(
                RefreshToken.subject_type == "STAFF", RefreshToken.subject_id == u.id
            ).delete()
            db.flush()
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
