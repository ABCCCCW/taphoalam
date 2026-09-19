"""Bù hạn dùng cho tồn đang có mà chưa gắn lô. Chạy: python -m seeds.backfill_expiry"""
from __future__ import annotations

from app.database import SessionLocal
from app.services.batch_service import backfill_opening_lots


def main() -> None:
    db = SessionLocal()
    try:
        result = backfill_opening_lots(db)
        db.commit()
        print(f"Đã gắn {result['created']} lô tồn đầu (tính ngày {result['as_of']}).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
