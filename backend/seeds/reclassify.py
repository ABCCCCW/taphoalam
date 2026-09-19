"""Xếp lại nhóm hàng cho sản phẩm đã có trong database.

Chạy lại luật phân loại trong catalogue_builder trên dữ liệu đang có, cập nhật
category_id và emoji tại chỗ — KHÔNG xoá đơn hàng hay tồn kho như seed --reset.

    python -m seeds.reclassify            # xem trước, không ghi gì
    python -m seeds.reclassify --apply    # ghi vào database
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import SessionLocal
from app.models import Category, Product, ProductBarcode
from seeds.catalogue_builder import EMOJI, MANUAL, pick_category
from seeds.seed_data import FRESH_PRODUCTS

CATALOGUE = ROOT / "seeds" / "vn_catalogue.json"

# Hàng tươi do mình tự khai trong seed, nhóm đã đúng sẵn -> không đụng vào.
# Nhận diện theo TÊN chứ không theo mã vạch: vài món mang mã 893 giả từ seed cũ
# nên lọc theo tiền tố mã sẽ bỏ sót (đậu hũ từng bị xếp nhầm sang bánh kẹo vì thế).
FRESH_NAMES = {r[0] for r in FRESH_PRODUCTS}


def main() -> None:
    apply = "--apply" in sys.argv
    by_barcode = {}
    if CATALOGUE.exists():
        by_barcode = {r["barcode"]: r for r in json.loads(CATALOGUE.read_text(encoding="utf-8"))}

    # Ánh xạ tường minh. Không dùng fold() để suy ra: fold() trong app không đổi
    # "đ" thành "d", nên "Đồ uống" ra "đouong" còn khoá cần tìm là "douong" —
    # lệch âm thầm, và 43 mặt hàng bị bỏ qua vì thế.
    CAT_NAME = {
        "Do uong": "Đồ uống", "Mi an lien": "Mì ăn liền", "Banh keo": "Bánh kẹo",
        "Gia vi": "Gia vị", "Do kho": "Đồ khô", "Thit ca": "Thịt cá",
        "Rau cu": "Rau củ quả", "Gia dung": "Gia dụng",
        "Do an san": "Đồ ăn sẵn",
    }
    db = SessionLocal()
    cats = {c.name: c for c in db.query(Category).all()}
    # "Đồ ăn sẵn" là nhóm mới cho cơm hộp, xôi — cửa hàng tiện lợi nào cũng có
    # quầy đồ nóng, mà tám nhóm cũ không có chỗ nào chứa được chúng cho hợp lý.
    if "Đồ ăn sẵn" not in cats:
        new = Category(name="Đồ ăn sẵn", slug="do-an-san", icon="🍱",
                       sort_order=9, stocktake_cycle="DAILY")
        db.add(new)
        db.flush()
        cats["Đồ ăn sẵn"] = new
        print("Đã tạo nhóm mới: Đồ ăn sẵn")

    missing = [v for v in CAT_NAME.values() if v not in cats]
    if missing:
        print("Thiếu nhóm trong database:", missing)
        return

    changed, skipped, unknown = [], 0, 0
    for p in db.query(Product).all():
        bc = db.query(ProductBarcode).filter(ProductBarcode.product_id == p.id).first()
        code = bc.barcode if bc else ""
        if p.name in FRESH_NAMES and p.name not in MANUAL:
            skipped += 1
            continue

        # Tra bảng xếp tay theo TÊN HIỂN THỊ trước. pick_category nhận bản ghi gốc
        # của Open Food Facts, mà tên gốc có thể khác tên hiển thị (tên quá ngắn thì
        # lúc dựng danh mục có ghép thêm tên hãng vào), nên tra bên trong sẽ trượt.
        item = by_barcode.get(code) or {"name": p.name, "brand": "", "categories": []}
        want = MANUAL.get(p.name.strip()) or pick_category(item)
        target = cats.get(CAT_NAME[want])
        if not target:
            unknown += 1
            continue
        if p.category_id != target.id:
            old = db.get(Category, p.category_id)
            changed.append((p.name, old.name if old else "-", target.name))
            if apply:
                p.category_id = target.id
                p.emoji = EMOJI[want]

    for name, old, new in changed:
        print(f"  {name[:46]:46} {old:12} -> {new}")
    print(f"\n{len(changed)} đổi nhóm · {skipped} hàng tươi giữ nguyên · {unknown} không map được")

    if apply:
        db.commit()
        print("Đã ghi vào database.")
    else:
        print("Xem trước. Thêm --apply để ghi.")
    db.close()


if __name__ == "__main__":
    main()
