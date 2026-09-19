"""Seed dữ liệu tạp hoá Việt Nam — chạy: python -m seeds.seed_data"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.security import hash_password
from app.services.staff_accounts import ADMIN_PASSWORD, ADMIN_USERNAME, DEFAULT_STAFF_PASSWORD
from app.core.utils import fold, utcnow
from app.database import Base, SessionLocal, engine
from app.models import (
    Banner,
    Brand,
    Category,
    Customer,
    CustomerAddress,
    Inventory,
    InventoryTransaction,
    Product,
    ProductBarcode,
    ProductUnit,
    Promotion,
    Setting,
    Supplier,
    Unit,
    User,
    Warehouse,
)

# Hàng tươi và hàng tự đóng gói: ngoài đời không có mã vạch nhà sản xuất nên
# dùng mã nội bộ 2xxxxxxxxxxx. Ảnh lấy từ Wikimedia Commons.
FRESH_PRODUCTS = [
    ("Gạo tám Hải Hậu (kg)", "Do kho", "Hải Hậu", 18000, 25000, "2000000000013", "🌾", 80, True, "BULK", 10),
    ("Thịt ba chỉ (kg)", "Thit ca", "TươiMart", 120000, 155000, "2000000000020", "🥩", 8.5, True, "WEIGHTED", 2),
    ("Ức gà phi lê (kg)", "Thit ca", "TươiMart", 65000, 85000, "2000000000037", "🍗", 6.2, True, "WEIGHTED", 2),
    ("Cá basa cắt khúc (kg)", "Thit ca", "TươiMart", 45000, 62000, "2000000000044", "🐟", 5.0, True, "WEIGHTED", 1),
    ("Rau muống bó", "Rau cu", "TươiMart", 5000, 8000, "2000000000051", "🥬", 25, True, "STANDARD", 8),
    ("Cải ngọt bó", "Rau cu", "TươiMart", 6000, 9000, "2000000000068", "🥗", 18, True, "STANDARD", 6),
    ("Cà chua (kg)", "Rau cu", "TươiMart", 18000, 25000, "2000000000075", "🍅", 12.4, True, "WEIGHTED", 3),
    ("Chuối sứ nải", "Rau cu", "TươiMart", 15000, 22000, "2000000000082", "🍌", 20, True, "STANDARD", 5),
    ("Táo Mỹ (kg)", "Rau cu", "TươiMart", 45000, 65000, "2000000000099", "🍎", 9.5, True, "WEIGHTED", 2),
    ("Trứng gà vỉ 10 quả", "Thit ca", "Ba Huân", 28000, 35000, "8934563000010", "🥚", 30, True, "STANDARD", 8),
    ("Đậu hũ trắng", "Rau cu", "Vitasoy", 7000, 10000, "8934563000011", "🧈", 16, True, "STANDARD", 6),
    ("Xôi mặn hộp", "Banh keo", "TươiMart", 15000, 22000, "2000000000129", "🍱", 8, False, "STANDARD", 3),
    ("Cơm gà hộp", "Banh keo", "TươiMart", 28000, 39000, "2000000000136", "🍱", 6, False, "STANDARD", 2),
]


from seeds.catalogue_builder import build as build_real_catalogue

# Ảnh hàng tươi lấy từ Wikimedia Commons: python -m seeds.harvest_commons
FRESH_IMAGES = {}
_fresh_file = ROOT / "seeds" / "fresh_images.json"
if _fresh_file.exists():
    FRESH_IMAGES = json.loads(_fresh_file.read_text(encoding="utf-8"))


def all_products() -> list:
    """Danh mục = hàng tươi viết tay + hàng đóng gói thật từ Open Food Facts.

    Hàng đóng gói mang tên, thương hiệu, mã vạch và ảnh bao bì thật, nên quét
    mã trên gói hàng ngoài đời là ra đúng sản phẩm. Chỉ giá và tồn do mình đặt.
    """
    rows = []
    for r in FRESH_PRODUCTS:
        img = (FRESH_IMAGES.get(r[0]) or {}).get("image_url")
        rows.append(tuple(r) + (img,))          # nối cột ảnh vào cuối
    rows += build_real_catalogue(limit=110)
    return rows


PRODUCTS = all_products()


def seed(reset: bool = False):
    if reset:
        # Chạy lại từ đầu: cần thiết sau khi tải ảnh mới về, vì seed chỉ gắn
        # image_url lúc tạo sản phẩm chứ không sửa bản ghi đã có.
        print("Xoá sạch dữ liệu cũ…")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if db.query(User).first():
        print("Đã có dữ liệu, bỏ qua seed. Muốn dựng lại: python -m seeds.seed_data --reset")
        return
    units = [
        Unit(name="Cái", is_base=True),
        Unit(name="Chai", is_base=True),
        Unit(name="Lon", is_base=True),
        Unit(name="Gói", is_base=True),
        Unit(name="Kg", is_base=True),
        Unit(name="Lốc", is_base=False),
        Unit(name="Thùng", is_base=False),
        Unit(name="Bó", is_base=True),
    ]
    db.add_all(units)
    db.flush()
    unit_map = {u.name: u.id for u in units}

    cats = [
        ("Đồ uống", "do-uong", "🥤", 1),
        ("Mì ăn liền", "mi-an-lien", "🍜", 2),
        ("Bánh kẹo", "banh-keo", "🍪", 3),
        ("Gia vị", "gia-vi", "🧂", 4),
        ("Đồ khô", "do-kho", "🌾", 5),
        ("Thịt cá", "thit-ca", "🥩", 6),
        ("Rau củ quả", "rau-cu", "🥬", 7),
        ("Gia dụng", "gia-dung", "🧴", 8),
    ]
    cat_rows = []
    for name, slug, icon, sort in cats:
        c = Category(name=name, slug=slug, icon=icon, sort_order=sort, stocktake_cycle="DAILY" if slug in ("thit-ca", "rau-cu") else "MONTHLY")
        db.add(c)
        cat_rows.append(c)
    db.flush()
    cat_map = {fold(c.name).replace(" ", ""): c.id for c in cat_rows}
    # also map ascii keys used in PRODUCTS
    cat_map.update(
        {
            "douong": cat_rows[0].id,
            "mianlien": cat_rows[1].id,
            "banhkeo": cat_rows[2].id,
            "giavi": cat_rows[3].id,
            "dokho": cat_rows[4].id,
            "thitca": cat_rows[5].id,
            "raucu": cat_rows[6].id,
            "giadung": cat_rows[7].id,
        }
    )

    brand_names = sorted({p[2] for p in PRODUCTS})
    brand_map = {}
    for n in brand_names:
        b = Brand(name=n)
        db.add(b)
        db.flush()
        brand_map[n] = b.id

    db.add(Warehouse(code="KHO01", name="Quầy bán", address="Cầu Diễn, Bắc Từ Liêm, Hà Nội", is_default=True))
    db.add(Warehouse(code="KHO02", name="Kho sau", address="Sân sau cửa hàng", is_default=False))
    db.add_all(
        [
            Supplier(code="NCC001", name="Công ty PepsiCo VN", phone="02811112222", address="Bình Dương"),
            Supplier(code="NCC022", name="Acecook Việt Nam", phone="02822223333", address="Tân Bình"),
            Supplier(code="NCC003", name="Chợ đầu mối Thủ Đức", phone="0909888777", address="Thủ Đức"),
        ]
    )

    db.add_all(
        [
            User(username=ADMIN_USERNAME, password_hash=hash_password(ADMIN_PASSWORD), full_name="Chủ tiệm Lâm", role="ADMIN", phone="0901000001", pin_hash=hash_password("0000")),
            User(username="0001", password_hash=hash_password(DEFAULT_STAFF_PASSWORD), full_name="Thu ngân Mai", role="CASHIER", phone="0901000002", pin_hash=hash_password("1234")),
            User(username="0002", password_hash=hash_password(DEFAULT_STAFF_PASSWORD), full_name="Anh Kho Nam", role="STOCKER", phone="0901000003", pin_hash=hash_password("4321")),
        ]
    )

    case_unit_done = [False]
    for i, (name, cat_key, brand, cost, sale, barcode, emoji, qty, online, ptype, min_stock, image_url) in enumerate(PRODUCTS, 1):
        slug = fold(name).replace(" ", "-")[:200] or f"sp-{i}"
        unit_name = "Kg" if ptype in ("WEIGHTED", "BULK") else "Cái"
        p = Product(
            sku=f"SP{i:04d}",
            name=name,
            slug=slug,
            name_search=fold(name),
            category_id=cat_map.get(fold(cat_key).replace(" ", "")),
            brand_id=brand_map[brand],
            base_unit_id=unit_map[unit_name],
            product_type=ptype,
            cost_price=cost,
            sale_price=sale,
            min_stock=min_stock,
            emoji=emoji,
            image_url=image_url,
            is_online=online,
            online_sale_mode="APPROX" if ptype == "WEIGHTED" else ("PICKUP_ONLY" if not online else "EXACT"),
            description=f"{name} — hàng nhập thường xuyên, giá tốt tại Lâm Ly Mart.",
            sold_count=max(0, 40 - i),
            rating_avg=4.2 + (i % 8) * 0.1,
            rating_count=3 + i % 12,
        )
        db.add(p)
        db.flush()
        db.add(
            ProductBarcode(
                barcode=barcode,
                product_id=p.id,
                is_primary=True,
                symbology="EAN13" if len(barcode) == 13 else "ITF14",
                source="INTERNAL" if barcode.startswith("2") else "MANUFACTURER",
            )
        )
        db.add(Inventory(product_id=p.id, warehouse_id=1, quantity=qty, reserved=0))
        db.add(
            InventoryTransaction(
                product_id=p.id,
                warehouse_id=1,
                type="IMPORT",
                quantity=qty,
                balance_after=qty,
                unit_cost=cost,
                ref_type="seed",
                note="Tồn đầu kỳ",
            )
        )
        # Một ví dụ bán theo thùng, để demo quy đổi đơn vị và mã vạch thùng ITF-14.
        # Chỉ gắn cho mặt hàng nước ngọt ĐẦU TIÊN — danh mục thật có nhiều Coca-Cola,
        # gắn cho tất cả sẽ đụng ràng buộc mã vạch duy nhất.
        if not case_unit_done[0] and cat_key == "Do uong":
            db.add(ProductUnit(product_id=p.id, unit_id=unit_map["Thùng"],
                               conversion_rate=24, barcode="1" + barcode[:12] + "0",
                               sale_price=float(sale) * 22))
            case_unit_done[0] = True

    c1 = Customer(code="KH000001", name="Nguyễn An", phone="0901234567", email="an@gmail.com", password_hash=hash_password("khach123"), source="ONLINE", tier="SILVER", loyalty_points=320, total_spent=1_250_000)
    c2 = Customer(code="KH000002", name="Trần Bình", phone="0912345678", source="POS", loyalty_points=80, total_spent=240000)
    db.add_all([c1, c2])
    db.flush()
    db.add(CustomerAddress(customer_id=c1.id, receiver_name="Nguyễn An", receiver_phone="0901234567", province="Hà Nội", district="Bắc Từ Liêm", ward="Cầu Diễn", street="Phạm Văn Đồng", is_default=True))

    now = utcnow()
    db.add(
        Promotion(
            code="TET10",
            name="Giảm 10% đơn từ 50k",
            type="PERCENT",
            value=10,
            min_order_amount=50000,
            max_discount=30000,
            start_at=now - timedelta(days=7),
            end_at=now + timedelta(days=60),
            is_active=True,
        )
    )

    db.add_all(
        [
            Banner(title="Miễn phí giao trong 2 km", image_url="hero-1", link_url="/catalog", sort_order=1),
            Banner(title="Rau củ sáng sớm", image_url="hero-2", link_url="/catalog?category=7", sort_order=2),
        ]
    )

    settings = {
        "store.name": "Lâm Ly Mart",
        "store.address": "Cầu Diễn, Bắc Từ Liêm, Hà Nội",
        "store.phone": "0901 234 567",
        "store.slogan": "Tươi mỗi ngày, gần ngay phố",
        "bank.bin": "970436",
        "bank.account": "0123456789",
        "bank.name": "Vietcombank",
        "bank.account_name": "TAP HOA LAM",
        "tax.default": "0",
        "loyalty.rate": "10000",
        # Phí giao: miễn phí trong 2 km, quá 2 km 20.000đ rồi mỗi km thêm 5.000đ.
        "store.lat": "21.0394",
        "store.lng": "105.7647",
        "ship.free_km": "2",
        "ship.base_fee": "20000",
        "ship.per_km": "5000",
    }
    for k, v in settings.items():
        db.add(Setting(key=k, value=v, group=k.split(".")[0]))

    from app.services.batch_service import backfill_opening_lots

    lots = backfill_opening_lots(db)
    from seeds.promotions import seed_promotions

    seed_promotions(db)
    db.commit()
    print(
        f"Seed xong: {ADMIN_USERNAME}/{ADMIN_PASSWORD} · thu ngân 0001 · kho 0002 (mật khẩu {DEFAULT_STAFF_PASSWORD}) · khách 0901234567/khach123"
        f" · {lots['created']} lô tồn đầu có hạn dùng"
    )


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
