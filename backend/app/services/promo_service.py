"""Khuyến mãi: mã chọn cho cả đơn (ORDER) và giảm tự động cho hàng cận date (NEAR_EXPIRY)."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core.utils import money, shop_today, utcnow
from app.models import ProductBatch, Promotion
from app.services.batch_service import WARN_DAYS

VN_OFFSET = timedelta(hours=7)


def day_start_utc(d: date) -> datetime:
    """00:00 ngày d giờ Hà Nội, lưu dạng UTC như mọi cột DateTime khác."""
    return datetime.combine(d, time.min) - VN_OFFSET


def day_end_utc(d: date) -> datetime:
    return datetime.combine(d, time(23, 59, 59)) - VN_OFFSET


def vn_date(dt: datetime) -> date:
    return (dt + VN_OFFSET).date()


def promo_state(p: Promotion, now: datetime | None = None) -> str:
    now = now or utcnow()
    if not p.is_active:
        return "OFF"
    if now < p.start_at:
        return "UPCOMING"
    if now > p.end_at:
        return "ENDED"
    if p.usage_limit and p.used_count >= p.usage_limit:
        return "USED_UP"
    return "LIVE"


def serialize_promo(p: Promotion, now: datetime | None = None) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "name": p.name,
        "description": p.description,
        "scope": p.scope or "ORDER",
        "type": p.type,
        "value": float(p.value),
        "min_order_amount": float(p.min_order_amount or 0),
        "max_discount": float(p.max_discount) if p.max_discount is not None else None,
        "usage_limit": p.usage_limit,
        "used_count": p.used_count or 0,
        "is_active": bool(p.is_active),
        "start_date": vn_date(p.start_at).isoformat(),
        "end_date": vn_date(p.end_at).isoformat(),
        "start_at": p.start_at.isoformat(),
        "end_at": p.end_at.isoformat(),
        "state": promo_state(p, now),
    }


def live_order_promos(db: Session) -> list[Promotion]:
    """Mã đang trong hạn, còn lượt — chỉ những mã này mới hiện cho quầy/khách chọn."""
    now = utcnow()
    rows = (
        db.query(Promotion)
        .filter(
            Promotion.is_active.is_(True),
            Promotion.scope == "ORDER",
            Promotion.start_at <= now,
            Promotion.end_at >= now,
        )
        .order_by(Promotion.min_order_amount.asc(), Promotion.end_at.asc())
        .all()
    )
    return [p for p in rows if not (p.usage_limit and p.used_count >= p.usage_limit)]


def order_discount(promo: Promotion, subtotal: float) -> float:
    discount = float(promo.value) if promo.type == "AMOUNT" else money(subtotal * float(promo.value) / 100)
    if promo.max_discount:
        discount = min(discount, float(promo.max_discount))
    return min(discount, float(subtotal))


# ---------- Cận date ----------


def near_expiry_promo(db: Session) -> Promotion | None:
    now = utcnow()
    return (
        db.query(Promotion)
        .filter(
            Promotion.is_active.is_(True),
            Promotion.scope == "NEAR_EXPIRY",
            Promotion.start_at <= now,
            Promotion.end_at >= now,
        )
        .order_by(Promotion.value.desc())
        .first()
    )


def near_expiry_stock(db: Session, product_id: int, warehouse_id: int = 1) -> tuple[float, date | None]:
    """Số lượng còn hạn nhưng chỉ còn ≤ WARN_DAYS ngày — phần này bán FIFO trước nên được giảm."""
    today = shop_today()
    lots = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == product_id,
            ProductBatch.warehouse_id == warehouse_id,
            ProductBatch.quantity > 0,
            ProductBatch.expiry_date.isnot(None),
            ProductBatch.expiry_date >= today,
            ProductBatch.expiry_date <= today + timedelta(days=WARN_DAYS),
        )
        .all()
    )
    qty = sum(float(b.quantity) for b in lots)
    nearest = min((b.expiry_date for b in lots), default=None)
    if isinstance(nearest, datetime):
        nearest = nearest.date()
    return qty, nearest


def near_expiry_info(db: Session, product_id: int, promo: Promotion | None, warehouse_id: int = 1) -> dict | None:
    if not promo:
        return None
    qty, nearest = near_expiry_stock(db, product_id, warehouse_id)
    if qty <= 0:
        return None
    return {
        "qty": qty,
        "expiry_date": nearest.isoformat() if nearest else None,
        "days": (nearest - shop_today()).days if nearest else None,
        "percent": float(promo.value),
        "promo_id": promo.id,
        "promo_code": promo.code,
        "promo_name": promo.name,
    }


def near_expiry_line_discount(
    db: Session,
    product_id: int,
    unit_price: float,
    quantity: float,
    promo: Promotion | None,
    conversion: int = 1,
    warehouse_id: int = 1,
) -> float:
    """Tiền giảm cho một dòng: chỉ phần số lượng thuộc lô cận date được giảm."""
    if not promo:
        return 0.0
    near_qty, _ = near_expiry_stock(db, product_id, warehouse_id)
    if near_qty <= 0:
        return 0.0
    units = min(float(quantity), near_qty / max(1, conversion))
    return money(unit_price * units * float(promo.value) / 100)
