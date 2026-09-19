from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.utils import fold, shop_today
from app.models import Inventory, Product, ProductBatch

# Hạn còn lại trên kệ — ngày, không phải hạn nhà máy in trên bao.
# Hàng tươi ngắn; hàng đóng gói dài để Tổng quan chỉ hét khi thật sự gần hạn.
_CAT_DAYS = {
    "rau cu qua": 4,
    "thit ca": 3,
    "do an san": 1,
    "do uong": 180,
    "mi an lien": 270,
    "banh keo": 180,
    "gia vi": 365,
    "do kho": 240,
    "gia dung": 720,
}

# Khớp tên trước, nhóm sau — bánh có chữ trứng không lấy hạn của trứng gà.
_NAME_DAYS = (
    (("xoi", "com ga"), 1),
    (("rau muong", "cai ngot"), 3),
    (("thit ba chi", "uc ga", "ca basa", "pangasus", "xuc xich", "steak"), 3),
    (("dau hu", "tofu"), 5),
    (("chuoi",), 5),
        (("sandwich", "banh mi", "baguette"), 5),
        (("karo", "cha bong"), 45),
    (("ca chua",), 7),
    (("sua tuoi", "fresh milk"), 10),
    (("tao my", "tao "), 10),
    (("sua chua", "yogurt", "yoghurt"), 14),
        (("trung ga",), 21),
    (("dielac", "sua bot"), 365),
    (("cafe", "coffee", "trung nguyen", "g7"), 365),
    (("aquafina",), 365),
    (("gao ", "gao t", "rice paper", "galette de riz"), 240),
)


def shelf_days(product: Product) -> int:
    name = fold(product.name)
    for keys, days in _NAME_DAYS:
        if any(k in name for k in keys):
            return days
    cat = fold(product.category.name) if product.category else ""
    return _CAT_DAYS.get(cat, 180)


def remaining_shelf_days(product: Product) -> int:
    """Phần hạn còn lại ước cho tồn đang nằm trên kệ (không phải hạn đầy đủ lúc xuất xưởng)."""
    full = shelf_days(product)
    pid = int(product.id or 1)
    if full <= WARN_DAYS:
        return max(1, 1 + (pid * 3) % full)
    stay = max(WARN_DAYS + 14, int(full * 0.55))
    wobble = pid * 11 % max(1, full // 5)
    return min(full, stay + wobble)


def suggest_expiry(product: Product, today: date | None = None, *, on_shelf: bool = False) -> date:
    today = today or shop_today()
    days = remaining_shelf_days(product) if on_shelf else shelf_days(product)
    return today + timedelta(days=days)

WARN_DAYS = 7


def as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def days_until(expiry, today: date | None = None) -> int | None:
    exp = as_date(expiry)
    if not exp:
        return None
    return (exp - (today or shop_today())).days


def lot_status(expiry, today: date | None = None) -> str | None:
    days = days_until(expiry, today)
    if days is None:
        return None
    if days < 0:
        return "expired"
    if days <= WARN_DAYS:
        return "expiring"
    return "ok"


def serialize_lot(batch: ProductBatch, product: Product | None = None, today: date | None = None) -> dict:
    today = today or shop_today()
    p = product
    exp = as_date(batch.expiry_date)
    days = days_until(exp, today)
    return {
        "id": batch.id,
        "product_id": batch.product_id,
        "name": p.name if p else None,
        "sku": p.sku if p else None,
        "emoji": p.emoji if p else None,
        "image_url": p.image_url if p else None,
        "quantity": float(batch.quantity),
        "expiry_date": exp.isoformat() if exp else None,
        "days": days,
        "status": lot_status(exp, today),
        "batch_code": batch.batch_code,
    }


def live_lots(db: Session) -> list[tuple[ProductBatch, Product]]:
    return (
        db.query(ProductBatch, Product)
        .join(Product, Product.id == ProductBatch.product_id)
        .filter(ProductBatch.quantity > 0, ProductBatch.expiry_date.isnot(None))
        .order_by(ProductBatch.expiry_date.asc(), Product.name.asc())
        .all()
    )


def expiry_summary(db: Session) -> dict:
    today = shop_today()
    expired, expiring = [], []
    nearest: dict[int, date] = {}
    for batch, product in live_lots(db):
        row = serialize_lot(batch, product, today)
        exp = as_date(batch.expiry_date)
        if exp and (batch.product_id not in nearest or exp < nearest[batch.product_id]):
            nearest[batch.product_id] = exp
        if row["status"] == "expired":
            expired.append(row)
        elif row["status"] == "expiring":
            expiring.append(row)
    return {
        "warn_days": WARN_DAYS,
        "expired": expired,
        "expiring": expiring,
        "expired_count": len(expired),
        "expiring_count": len(expiring),
        "nearest": nearest,
    }


def uncovered_qty(db: Session, product_id: int, warehouse_id: int, on_hand: float) -> float:
    covered = sum(
        float(b.quantity)
        for b in db.query(ProductBatch).filter(
            ProductBatch.product_id == product_id,
            ProductBatch.warehouse_id == warehouse_id,
            ProductBatch.quantity > 0,
        )
    )
    return round(max(0, float(on_hand) - covered), 3)


def backfill_opening_lots(db: Session) -> dict:
    """Gắn lô + hạn cho tồn đang có mà chưa theo dõi. Chạy lại được — chỉ bù phần hở."""
    from sqlalchemy.orm import joinedload

    today = shop_today()
    created = 0
    rows = db.query(Inventory).all()
    for inv in rows:
        qty = float(inv.quantity)
        if qty <= 0:
            continue
        gap = uncovered_qty(db, inv.product_id, inv.warehouse_id, qty)
        if gap <= 0:
            continue
        product = db.query(Product).options(joinedload(Product.category)).filter(Product.id == inv.product_id).first()
        if not product:
            continue
        expiry = suggest_expiry(product, today, on_shelf=True)
        db.add(
            ProductBatch(
                product_id=product.id,
                warehouse_id=inv.warehouse_id,
                batch_code=f"TON-{product.sku or product.id}",
                expiry_date=expiry,
                quantity=gap,
                cost_price=float(product.cost_price or 0),
                receipt_id=None,
            )
        )
        product.track_expiry = True
        created += 1
    return {"created": created, "as_of": today.isoformat()}
