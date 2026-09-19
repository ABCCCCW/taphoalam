from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.permissions import require
from app.core.utils import money, next_code, utcnow
from app.database import get_db
from app.deps import get_idempotency_key
from app.models import Customer, Order, OrderItem, OrderReturn, OrderReturnItem, Payment, Setting, User
from app.services.inventory_service import InventoryService
from app.services.order_service import checkout_pos, complete_qr_order, create_qr_payment, gen_order_code, setting, void_unpaid_order
from app.services.vietqr import build_vietqr, qr_data_uri

router = APIRouter(prefix="/api/v1", tags=["orders"])


def serialize_order(order: Order):
    return {
        "id": order.id,
        "code": order.code,
        "status": order.status,
        "payment_status": order.payment_status,
        "channel": order.channel,
        "delivery_method": order.delivery_method,
        "subtotal": float(order.subtotal),
        "discount_amount": float(order.discount_amount),
        "total_amount": float(order.total_amount),
        "paid_amount": float(order.paid_amount),
        "change_amount": float(order.change_amount),
        "points_used": order.points_used,
        "points_earned": order.points_earned,
        "customer_id": order.customer_id,
        "customer_name": order.customer.name if order.customer else None,
        "cashier": order.user.full_name if order.user else None,
        "note": order.note,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "completed_at": order.completed_at.isoformat() if order.completed_at else None,
        "items": [
            {
                "id": i.id,
                "product_id": i.product_id,
                "product_name": i.product_name,
                "emoji": i.product.emoji if i.product else "🛒",
                "image_url": i.product.image_url if i.product else None,
                "quantity": float(i.quantity),
                "unit_price": float(i.unit_price),
                "line_total": float(i.line_total),
                "cost_price": float(i.cost_price),
            }
            for i in order.items
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.method,
                "amount": float(p.amount),
                "status": p.status,
                "qr_image": p.qr_image,
                "qr_expires_at": p.qr_expires_at.isoformat() if p.qr_expires_at else None,
            }
            for p in (order.payments or [])
        ],
    }


class CheckoutIn(BaseModel):
    items: list[dict]
    customer_id: int | None = None
    payment_method: str = "CASH"
    received: float | None = None
    discount: float = 0
    promo_code: str | None = None
    points_used: int = 0
    note: str | None = None


@router.post("/orders/checkout")
def checkout(
    body: CheckoutIn,
    db: Session = Depends(get_db),
    user: User = Depends(require("pos.*")),
    idempotency_key: str | None = Depends(get_idempotency_key),
):
    order = checkout_pos(db, user=user, payload=body.model_dump(), idempotency_key=idempotency_key)
    db.flush()
    order = db.query(Order).options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.payments), joinedload(Order.customer), joinedload(Order.user)).filter(Order.id == order.id).one()
    return serialize_order(order)


@router.post("/orders/{order_id}/cancel")
def cancel_pending(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require("pos.*")),
):
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.payments),
        joinedload(Order.customer),
        joinedload(Order.user),
    ).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    if user.role == "CASHIER" and order.user_id != user.id:
        raise HTTPException(403, "Không huỷ được đơn của người khác")
    void_unpaid_order(db, order, "Thu ngân huỷ QR")
    return serialize_order(order)


@router.get("/orders")
def list_orders(
    channel: str | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(require("order.read")),
):
    query = db.query(Order).options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.customer), joinedload(Order.user), joinedload(Order.payments))
    if user.role == "CASHIER":
        query = query.filter(Order.user_id == user.id)
    if channel:
        query = query.filter(Order.channel == channel)
    if status:
        query = query.filter(Order.status == status)
    if q:
        query = query.filter(Order.code.ilike(f"%{q}%"))
    rows = query.order_by(Order.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": [serialize_order(o) for o in rows]}


@router.get("/orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), _: User = Depends(require("order.read"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    return serialize_order(order)


@router.get("/orders/{order_id}/receipt")
def receipt(order_id: int, db: Session = Depends(get_db), _: User = Depends(require("pos.*"))):
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.payments),
            joinedload(Order.customer),
            joinedload(Order.user),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    return {
        "store_name": (db.get(Setting, "store.name").value if db.get(Setting, "store.name") else "TạpHoá Lâm"),
        "store_address": (db.get(Setting, "store.address").value if db.get(Setting, "store.address") else "12 Nguyễn Trãi, Thanh Xuân, Hà Nội"),
        "store_phone": (db.get(Setting, "store.phone").value if db.get(Setting, "store.phone") else ""),
        "order": serialize_order(order),
    }


class CashIn(BaseModel):
    received: float


@router.post("/orders/{order_id}/payments/cash")
def pay_cash(order_id: int, body: CashIn, db: Session = Depends(get_db), user: User = Depends(require("pos.*"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    if body.received < float(order.total_amount):
        raise HTTPException(400, "Chưa đủ tiền")
    db.add(Payment(order_id=order.id, method="CASH", amount=order.total_amount, status="SUCCESS", paid_at=utcnow(), confirmed_by=user.id))
    order.paid_amount = body.received
    order.change_amount = money(body.received - float(order.total_amount))
    order.status = "COMPLETED"
    order.payment_status = "PAID"
    order.completed_at = utcnow()
    return serialize_order(order)


@router.post("/orders/{order_id}/payments/qr")
def pay_qr(order_id: int, db: Session = Depends(get_db), user: User = Depends(require("pos.*"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    create_qr_payment(db, order, user)
    db.refresh(order)
    payment = order.payments[-1]
    return {
        "payment_id": payment.id,
        "qr_image": payment.qr_image,
        "qr_content": payment.qr_content,
        "expires_at": payment.qr_expires_at.isoformat() if payment.qr_expires_at else None,
        "amount": float(payment.amount),
        "order": serialize_order(order),
    }


@router.get("/payments/{payment_id}/status")
def payment_status(payment_id: int, db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy thanh toán")
    if p.status == "PENDING" and p.qr_expires_at and p.qr_expires_at < utcnow():
        p.status = "EXPIRED"
    return {"id": p.id, "status": p.status, "order_id": p.order_id}


@router.post("/payments/{payment_id}/confirm")
def confirm_payment(payment_id: int, db: Session = Depends(get_db), user: User = Depends(require("pos.*"))):
    p = db.get(Payment, payment_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy thanh toán")
    order = db.get(Order, p.order_id)
    complete_qr_order(db, order, p, user.id)
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.payments),
            joinedload(Order.customer),
            joinedload(Order.user),
        )
        .filter(Order.id == order.id)
        .one()
    )
    return {"ok": True, "order": serialize_order(order)}


class ReturnIn(BaseModel):
    items: list[dict]
    reason: str
    restock: bool = True
    refund_method: str = "CASH"


@router.post("/orders/{order_id}/returns")
def create_return(order_id: int, body: ReturnIn, db: Session = Depends(get_db), user: User = Depends(require("order.read"))):
    if user.role == "CASHIER":
        raise HTTPException(403, "Thu ngân không được tạo phiếu trả hàng")
    order = db.get(Order, order_id)
    if not order or order.status not in ("COMPLETED", "PARTIALLY_RETURNED"):
        raise HTTPException(400, "Chỉ trả được đơn đã hoàn tất")
    day = utcnow().strftime("%Y%m%d")
    seq = db.query(OrderReturn).filter(OrderReturn.code.like(f"TH{day}-%")).count() + 1
    ret = OrderReturn(
        code=next_code("TH", seq, 3),
        order_id=order.id,
        user_id=user.id,
        reason=body.reason,
        refund_method=body.refund_method,
        restock=body.restock,
    )
    db.add(ret)
    db.flush()
    total = 0.0
    by_id = {i.id: i for i in order.items}
    for raw in body.items:
        item = by_id.get(int(raw["order_item_id"]))
        qty = float(raw["quantity"])
        if not item or qty <= 0:
            continue
        refund = money(float(item.unit_price) * qty)
        db.add(OrderReturnItem(return_id=ret.id, order_item_id=item.id, product_id=item.product_id, quantity=qty, refund_amount=refund))
        item.returned_qty = float(item.returned_qty) + qty
        total += refund
        if body.restock:
            InventoryService.apply(
                db,
                product_id=item.product_id,
                warehouse_id=order.warehouse_id,
                qty=qty * item.conversion_rate,
                type_="SALE_RETURN",
                ref_type="return",
                ref_id=ret.id,
                user_id=user.id,
                channel=order.channel,
            )
    ret.total_refund = total
    order.status = "RETURNED" if all(float(i.returned_qty) >= float(i.quantity) for i in order.items) else "PARTIALLY_RETURNED"
    return {"id": ret.id, "code": ret.code, "total_refund": total}
