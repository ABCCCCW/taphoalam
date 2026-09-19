"""Chỉnh hạn dùng các lô cho buổi demo / bảo vệ đồ án.

- Mọi lô còn hàng có hạn trước --until được dời ra sau mốc đó (rải lệch vài tuần
  cho tự nhiên), để tới hôm demo không món nào tự hết hạn.
- Chừa lại vài lô làm ví dụ: --expired lô đã quá hạn, --soon lô sắp hết hạn
  (trong WARN_DAYS ngày). Ví dụ tính theo NGÀY CHẠY script, nên chạy lại ngay
  trước buổi bảo vệ để ví dụ vẫn đúng như ý.

Ví dụ được chọn cố định (hàng đóng gói bán ít), chạy lại vẫn trúng các món cũ.

    cd backend
    python -m seeds.demo_expiry
    python -m seeds.demo_expiry --until 2027-01-31 --expired 3 --soon 3
    DATABASE_URL='postgresql://…' python -m seeds.demo_expiry   # Supabase
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("SKIP_SCHEMA_SYNC", "1")

from app.database import SessionLocal  # noqa: E402
from app.models import Category, Product, ProductBatch  # noqa: E402
from app.services.batch_service import WARN_DAYS, as_date, shop_today  # noqa: E402

# Ví dụ lấy từ hàng đóng gói — hàng tươi hết hạn thì trông như lỗi dữ liệu hơn là ví dụ
EXAMPLE_CATEGORIES = ("do-uong", "banh-keo", "gia-vi", "an-vat", "mi-an-lien")
EXPIRED_AGO = (2, 5, 9)          # quá hạn bao nhiêu ngày
SOON_LEFT = (2, 4, 6)            # còn bao nhiêu ngày (≤ WARN_DAYS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--until", default="2027-01-31", help="mọi lô khác còn hạn tới sau ngày này")
    ap.add_argument("--expired", type=int, default=3)
    ap.add_argument("--soon", type=int, default=3)
    args = ap.parse_args()
    until = date.fromisoformat(args.until)
    today = shop_today()

    db = SessionLocal()
    try:
        lots = (
            db.query(ProductBatch)
            .filter(ProductBatch.quantity > 0, ProductBatch.expiry_date.isnot(None))
            .order_by(ProductBatch.id)
            .all()
        )
        products = {p.id: p for p in db.query(Product).all()}
        cat_slug = {c.id: c.slug for c in db.query(Category).all()}

        # Mỗi món một lô ví dụ; chọn món bán ít nhất trong nhóm hàng đóng gói
        first_lot = {}
        for lot in lots:
            first_lot.setdefault(lot.product_id, lot)
        pool = sorted(
            (lot for pid, lot in first_lot.items()
             if pid in products and cat_slug.get(products[pid].category_id) in EXAMPLE_CATEGORIES),
            key=lambda lot: (int(products[lot.product_id].sold_count or 0), lot.product_id),
        )
        n_exp, n_soon = min(args.expired, len(EXPIRED_AGO)), min(args.soon, len(SOON_LEFT))
        expired_ex = pool[:n_exp]
        soon_ex = pool[n_exp:n_exp + n_soon]
        examples = {lot.id for lot in expired_ex + soon_ex}
        example_products = {lot.product_id for lot in expired_ex + soon_ex}

        moved = 0
        for lot in lots:
            if lot.id in examples:
                continue
            # Lô khác của món ví dụ phải còn hạn xa hơn, để ví dụ là lô ra kệ trước
            exp = as_date(lot.expiry_date)
            if exp and exp >= until and lot.product_id not in example_products:
                continue
            lot.expiry_date = until + timedelta(days=(lot.product_id * 13 + lot.id * 7) % 60)
            moved += 1

        for lot, ago in zip(expired_ex, EXPIRED_AGO):
            lot.expiry_date = today - timedelta(days=ago)
        for lot, left in zip(soon_ex, SOON_LEFT):
            lot.expiry_date = today + timedelta(days=min(left, WARN_DAYS))
        db.commit()

        print(f"Dời hạn {moved} lô ra sau {until:%d/%m/%Y}.")
        for label, group in (("Hết hạn", expired_ex), ("Sắp hết hạn", soon_ex)):
            for lot in group:
                p = products[lot.product_id]
                print(f"  {label:<12} {p.name}  —  HSD {as_date(lot.expiry_date):%d/%m/%Y}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
