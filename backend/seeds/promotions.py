"""Bộ mã khuyến mãi mẫu: ngày lễ, đơn lớn, cận date. Chạy lại không tạo trùng (khớp theo mã).

    cd backend && python -m seeds.promotions
"""
from __future__ import annotations

from datetime import date

from app.database import Base, SessionLocal, engine, ensure_schema
from app.models import Promotion
from app.services.promo_service import day_end_utc, day_start_utc

# (mã, tên, mô tả, phạm vi, kiểu, giá trị, đơn tối thiểu, giảm tối đa, từ ngày, đến ngày)
PROMOS = [
    # Cận date — tự áp vào từng món, không cần chọn
    ("CANDATE30", "Giảm 30% hàng cận date", "Tự trừ 30% vào món còn ≤ 7 ngày hạn dùng", "NEAR_EXPIRY", "PERCENT", 30, 0, None, date(2026, 1, 1), date(2027, 12, 31)),
    # Đơn lớn — chạy quanh năm
    ("DON300K", "Giảm 20.000đ đơn từ 300k", "Áp cho mọi đơn từ 300.000đ", "ORDER", "AMOUNT", 20000, 300000, None, date(2026, 9, 1), date(2027, 12, 31)),
    ("DON500K", "Giảm 50.000đ đơn từ 500k", "Áp cho mọi đơn từ 500.000đ", "ORDER", "AMOUNT", 50000, 500000, None, date(2026, 9, 1), date(2027, 12, 31)),
    ("DON1TRIEU", "Giảm 8% đơn từ 1 triệu", "Tối đa 150.000đ", "ORDER", "PERCENT", 8, 1000000, 150000, date(2026, 9, 1), date(2027, 12, 31)),
    # Ngày lễ
    ("TRUNGTHU26", "Tết Trung Thu 2026", "Rằm tháng Tám (25/9) — giảm 15% đơn từ 150k", "ORDER", "PERCENT", 15, 150000, 50000, date(2026, 9, 20), date(2026, 9, 27)),
    ("PHUNU2010", "Ngày Phụ nữ Việt Nam 20/10", "Giảm 20% đơn từ 200k", "ORDER", "PERCENT", 20, 200000, 60000, date(2026, 10, 18), date(2026, 10, 20)),
    ("NHAGIAO2011", "Ngày Nhà giáo 20/11", "Giảm 10% đơn từ 100k", "ORDER", "PERCENT", 10, 100000, 40000, date(2026, 11, 18), date(2026, 11, 20)),
    ("BLACKFRIDAY", "Black Friday 2026", "Giảm 25% đơn từ 300k", "ORDER", "PERCENT", 25, 300000, 100000, date(2026, 11, 27), date(2026, 11, 29)),
    ("NOEL2026", "Giáng sinh 2026", "Giảm 15% đơn từ 200k", "ORDER", "PERCENT", 15, 200000, 60000, date(2026, 12, 20), date(2026, 12, 25)),
    ("NAMMOI2027", "Tết Dương lịch 2027", "Giảm 30.000đ đơn từ 250k", "ORDER", "AMOUNT", 30000, 250000, None, date(2026, 12, 30), date(2027, 1, 2)),
    ("TETDINHMUI", "Tết Nguyên đán Đinh Mùi 2027", "Sắm Tết giảm 10% đơn từ 300k", "ORDER", "PERCENT", 10, 300000, 120000, date(2027, 1, 25), date(2027, 2, 14)),
    ("MUNG8THANG3", "Quốc tế Phụ nữ 8/3", "Giảm 20% đơn từ 200k", "ORDER", "PERCENT", 20, 200000, 60000, date(2027, 3, 6), date(2027, 3, 8)),
    ("LE304", "Lễ 30/4 – 1/5", "Giảm 15% đơn từ 200k", "ORDER", "PERCENT", 15, 200000, 50000, date(2027, 4, 29), date(2027, 5, 3)),
    ("QUOCKHANH29", "Quốc khánh 2/9/2027", "Giảm 29.000đ đơn từ 290k", "ORDER", "AMOUNT", 29000, 290000, None, date(2027, 8, 30), date(2027, 9, 2)),
]


def seed_promotions(db) -> int:
    added = 0
    for code, name, desc, scope, typ, value, min_order, max_disc, start, end in PROMOS:
        if db.query(Promotion).filter(Promotion.code == code).first():
            continue
        db.add(
            Promotion(
                code=code,
                name=name,
                description=desc,
                scope=scope,
                type=typ,
                value=value,
                min_order_amount=min_order,
                max_discount=max_disc,
                start_at=day_start_utc(start),
                end_at=day_end_utc(end),
                used_count=0,
                is_active=True,
            )
        )
        added += 1
    return added


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        n = seed_promotions(db)
        db.commit()
        print(f"Đã thêm {n} mã khuyến mãi")
    finally:
        db.close()
