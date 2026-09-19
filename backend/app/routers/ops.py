from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.permissions import require
from app.core.utils import money, next_code, utcnow
from app.services.batch_service import expiry_summary
from app.database import SessionLocal, get_db
from app.deps import get_current_staff
from app.models import AuditLog, Customer, Order, Promotion, Setting, Shift, User
from app.realtime.hub import hub

router = APIRouter(prefix="/api/v1", tags=["ops"])


@router.get("/customers")
def list_customers(phone: str | None = None, q: str | None = None, db: Session = Depends(get_db), _: User = Depends(require("customer.*"))):
    query = db.query(Customer)
    if phone:
        query = query.filter(Customer.phone == phone)
    if q:
        query = query.filter((Customer.name.ilike(f"%{q}%")) | (Customer.phone.ilike(f"%{q}%")))
    rows = query.order_by(Customer.id.desc()).limit(50).all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "tier": c.tier,
            "loyalty_points": c.loyalty_points,
            "total_spent": float(c.total_spent),
            "address": c.address,
            "source": c.source,
        }
        for c in rows
    ]


class CustomerIn(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None


@router.post("/customers")
def create_customer(body: CustomerIn, db: Session = Depends(get_db), _: User = Depends(require("customer.*"))):
    if body.phone and db.query(Customer).filter(Customer.phone == body.phone).first():
        raise HTTPException(409, "Số điện thoại đã tồn tại")
    seq = db.query(Customer).count() + 1
    c = Customer(code=f"KH{seq:06d}", name=body.name, phone=body.phone, email=body.email, address=body.address, source="POS")
    db.add(c)
    db.flush()
    return {"id": c.id, "code": c.code, "name": c.name, "phone": c.phone, "loyalty_points": 0, "tier": c.tier}


class ShiftOpenIn(BaseModel):
    opening_cash: float = 0


@router.post("/shifts/open")
def open_shift(body: ShiftOpenIn, db: Session = Depends(get_db), user: User = Depends(require("shift.own"))):
    existing = db.query(Shift).filter(Shift.user_id == user.id, Shift.status == "OPEN").first()
    if existing:
        return _shift(existing)
    day = utcnow().strftime("%Y%m%d")
    seq = db.query(Shift).filter(Shift.code.like(f"CA{day}-%")).count() + 1
    shift = Shift(
        code=next_code("CA", seq),
        user_id=user.id,
        warehouse_id=settings.default_warehouse_id,
        opening_cash=body.opening_cash,
        expected_cash=body.opening_cash,
    )
    db.add(shift)
    db.flush()
    return _shift(shift)


@router.get("/shifts/current")
def current_shift(db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    shift = db.query(Shift).filter(Shift.user_id == user.id, Shift.status == "OPEN").first()
    return _shift(shift) if shift else None


class ShiftCloseIn(BaseModel):
    closing_cash: float


@router.post("/shifts/{shift_id}/close")
def close_shift(shift_id: int, body: ShiftCloseIn, db: Session = Depends(get_db), user: User = Depends(require("shift.own"))):
    shift = db.get(Shift, shift_id)
    if not shift or shift.status != "OPEN":
        raise HTTPException(400, "Ca không hợp lệ")
    if user.role != "ADMIN" and shift.user_id != user.id:
        raise HTTPException(403, "Không đóng ca của người khác")
    shift.closing_cash = body.closing_cash
    shift.expected_cash = money(float(shift.opening_cash) + float(shift.cash_sales))
    shift.cash_diff = money(body.closing_cash - float(shift.expected_cash))
    shift.status = "CLOSED"
    shift.closed_at = utcnow()
    return _shift(shift)


def _shift(s: Shift):
    return {
        "id": s.id,
        "code": s.code,
        "status": s.status,
        "opening_cash": float(s.opening_cash),
        "cash_sales": float(s.cash_sales),
        "qr_sales": float(s.qr_sales),
        "expected_cash": float(s.expected_cash),
        "closing_cash": float(s.closing_cash) if s.closing_cash is not None else None,
        "cash_diff": float(s.cash_diff) if s.cash_diff is not None else None,
        "total_orders": s.total_orders,
        "opened_at": s.opened_at.isoformat() if s.opened_at else None,
        "cashier": s.user.full_name if s.user else None,
    }


@router.get("/reports/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(require("product.read"))):
    if user.role == "CASHIER":
        raise HTTPException(403, "Thu ngân không xem được báo cáo")
    today = utcnow().date()
    orders = db.query(Order).filter(Order.status == "COMPLETED").all()
    today_orders = [o for o in orders if o.completed_at and o.completed_at.date() == today]
    yesterday_orders = [o for o in orders if o.completed_at and o.completed_at.date() == (today.fromordinal(today.toordinal() - 1))]
    revenue_today = sum(float(o.total_amount) for o in today_orders)
    revenue_yesterday = sum(float(o.total_amount) for o in yesterday_orders)
    profit_today = 0.0
    for o in today_orders:
        for i in o.items:
            profit_today += float(i.line_total) - float(i.cost_price) * float(i.quantity)
    from app.models import Inventory

    low = 0
    for inv in db.query(Inventory).options(joinedload(Inventory.product)).all():
        if inv.product and float(inv.quantity) <= inv.product.min_stock:
            low += 1
    cash_amt = 0.0
    qr_amt = 0.0
    for o in today_orders:
        for p in o.payments:
            if p.status != "SUCCESS":
                continue
            if p.method == "CASH":
                cash_amt += float(p.amount)
            else:
                qr_amt += float(p.amount)
    online_pending = db.query(Order).filter(Order.channel == "ONLINE", Order.status.in_(["PENDING_CONFIRM", "CONFIRMED", "PACKING"])).count()
    from app.models import Product

    cost_pending = db.query(Product).filter(Product.cost_confirmed.is_(False), Product.is_active.is_(True)).count()
    can_profit = user.role == "ADMIN"
    lots = expiry_summary(db)
    return {
        "revenue_today": revenue_today,
        "revenue_yesterday": revenue_yesterday,
        "orders_today": len(today_orders),
        "aov": money(revenue_today / len(today_orders)) if today_orders else 0,
        "profit_today": profit_today if can_profit else None,
        "low_stock": low,
        "cash_amount": cash_amt,
        "qr_amount": qr_amt,
        "online_pending": online_pending,
        "cost_pending": cost_pending,
        "expired_count": lots["expired_count"],
        "expiring_count": lots["expiring_count"],
        "expired": lots["expired"],
        "expiring": lots["expiring"],
        "warn_days": lots["warn_days"],
    }


@router.get("/reports/revenue")
def revenue(group_by: str = "day", channel: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị xem báo cáo doanh thu")
    query = db.query(Order).filter(Order.status == "COMPLETED")
    if channel:
        query = query.filter(Order.channel == channel)
    rows = query.all()
    from collections import defaultdict

    buckets = defaultdict(lambda: {"revenue": 0, "orders": 0, "pos": 0, "online": 0})
    for o in rows:
        if not o.completed_at:
            continue
        key = o.completed_at.date().isoformat()
        buckets[key]["revenue"] += float(o.total_amount)
        buckets[key]["orders"] += 1
        buckets[key][o.channel.lower()] += float(o.total_amount)
    out = [{"date": k, **v} for k, v in sorted(buckets.items())]
    return out


@router.get("/reports/profit")
def profit(db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị xem lợi nhuận")
    from collections import defaultdict

    acc = defaultdict(lambda: {"name": "", "qty": 0, "revenue": 0, "cost": 0, "profit": 0})
    for o in db.query(Order).filter(Order.status == "COMPLETED").options(joinedload(Order.items)).all():
        for i in o.items:
            a = acc[i.product_id]
            a["name"] = i.product_name
            a["qty"] += float(i.quantity)
            a["revenue"] += float(i.line_total)
            a["cost"] += float(i.cost_price) * float(i.quantity)
            a["profit"] = a["revenue"] - a["cost"]
    return sorted(acc.values(), key=lambda x: x["profit"], reverse=True)


@router.get("/reports/inventory-value")
def inventory_value(db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị")
    from app.models import Inventory

    cost = 0.0
    sale = 0.0
    for inv in db.query(Inventory).options(joinedload(Inventory.product)).all():
        if not inv.product or not inv.product.is_active:
            continue
        cost += float(inv.quantity) * float(inv.product.cost_price)
        sale += float(inv.quantity) * float(inv.product.sale_price)
    return {"cost_value": money(cost), "sale_value": money(sale)}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: User = Depends(get_current_staff)):
    return {s.key: s.value for s in db.query(Setting).all()}


class SettingsIn(BaseModel):
    values: dict[str, str]


@router.put("/settings")
def put_settings(body: SettingsIn, db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị")
    for k, v in body.values.items():
        row = db.get(Setting, k)
        if row:
            row.value = v
        else:
            db.add(Setting(key=k, value=v))
    return {"ok": True}


@router.get("/promotions")
def promotions(db: Session = Depends(get_db), _: User = Depends(get_current_staff)):
    return [
        {
            "id": p.id,
            "code": p.code,
            "name": p.name,
            "type": p.type,
            "value": float(p.value),
            "min_order_amount": float(p.min_order_amount),
            "is_active": p.is_active,
            "start_at": p.start_at.isoformat(),
            "end_at": p.end_at.isoformat(),
        }
        for p in db.query(Promotion).all()
    ]


@router.get("/audit-logs")
def audit_logs(db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Chỉ quản trị")
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(100).all()
    return [
        {
            "id": r.id,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
