from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.permissions import require
from app.core.utils import money, utcnow
from app.database import get_db
from app.models import Banner, Order, OrderItem, ProductReview, Setting, Shipment, User
from app.routers.orders import serialize_order
from app.services.reservation_service import ReservationService

router = APIRouter(prefix="/api/v1", tags=["online-ops"])


@router.get("/online-orders")
def list_online(db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    rows = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.customer), joinedload(Order.payments), joinedload(Order.shipment))
        .filter(Order.channel == "ONLINE")
        .order_by(Order.id.desc())
        .limit(100)
        .all()
    )
    return [serialize_order(o) | {"delivery_method": o.delivery_method, "shipping_fee": float(o.shipping_fee)} for o in rows]


@router.post("/online-orders/{order_id}/confirm")
def confirm(order_id: int, db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    order = db.get(Order, order_id)
    if not order or order.channel != "ONLINE":
        raise HTTPException(404, "Không tìm thấy đơn")
    if order.status not in ("PENDING_CONFIRM", "PENDING_PAYMENT"):
        raise HTTPException(400, "Không duyệt được đơn này")
    order.status = "CONFIRMED"
    return serialize_order(order)


class RejectIn(BaseModel):
    reason: str


@router.post("/online-orders/{order_id}/reject")
def reject(order_id: int, body: RejectIn, db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    ReservationService.release(db, order.id)
    order.status = "CANCELLED"
    order.cancel_reason = body.reason
    return {"ok": True}


@router.get("/online-orders/{order_id}/picking")
def picking(order_id: int, db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    """Phiếu soạn hàng — chỉ đọc.

    Trước đây chính endpoint này đổi đơn sang PACKING, nên mở xem phiếu là đơn
    tự chuyển trạng thái. Việc chuyển trạng thái nay nằm ở POST /packing.
    """
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    return {
        "order": serialize_order(order),
        "lines": [
            {
                "id": i.id,
                "product_id": i.product_id,
                "name": i.product_name,
                "qty": float(i.quantity),
                "barcode": i.product.barcodes[0].barcode if i.product and i.product.barcodes else None,
                "emoji": i.product.emoji if i.product else "🛒",
                "image_url": i.product.image_url if i.product else None,
            }
            for i in order.items
        ],
    }


@router.post("/online-orders/{order_id}/packing")
def start_packing(order_id: int, db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    order = db.get(Order, order_id)
    if not order or order.channel != "ONLINE":
        raise HTTPException(404, "Không tìm thấy đơn")
    if order.status not in ("CONFIRMED", "PACKING"):
        raise HTTPException(400, "Đơn phải được duyệt trước khi soạn hàng")
    order.status = "PACKING"
    return serialize_order(order)


class PickIn(BaseModel):
    barcode: str | None = None
    order_item_id: int | None = None
    actual_qty: float | None = None


@router.post("/online-orders/{order_id}/pick")
def pick(order_id: int, body: PickIn, db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    item = None
    if body.order_item_id:
        item = next((i for i in order.items if i.id == body.order_item_id), None)
    elif body.barcode:
        item = next((i for i in order.items if i.product and any(b.barcode == body.barcode for b in i.product.barcodes)), None)
    if not item:
        raise HTTPException(400, "Không khớp sản phẩm trong đơn")
    if body.actual_qty is not None and item.product and item.product.product_type == "WEIGHTED":
        old_qty = float(item.quantity) or 1
        item.discount = money(float(item.discount or 0) * body.actual_qty / old_qty)
        item.quantity = body.actual_qty
        item.line_total = money(float(item.unit_price) * body.actual_qty - float(item.discount))
        order.subtotal = money(sum(float(i.line_total) for i in order.items))
        order.total_amount = money(float(order.subtotal) - float(order.discount_amount) + float(order.shipping_fee))
    return {"ok": True, "item_id": item.id, "total_amount": float(order.total_amount)}


class ShipIn(BaseModel):
    shipper_name: str = "Tự giao"
    carrier: str = "Tự giao"


@router.post("/online-orders/{order_id}/ship")
def ship(order_id: int, body: ShipIn, db: Session = Depends(get_db), _: User = Depends(require("order.fulfill"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    order.status = "SHIPPING"
    if order.shipment:
        order.shipment.status = "SHIPPING"
        order.shipment.shipper_name = body.shipper_name
        order.shipment.carrier = body.carrier
        order.shipment.shipped_at = utcnow()
    return serialize_order(order)


@router.post("/online-orders/{order_id}/complete")
def complete(order_id: int, db: Session = Depends(get_db), user: User = Depends(require("order.fulfill"))):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn")
    ReservationService.consume(db, order.id, user.id, channel="ONLINE")
    order.status = "COMPLETED"
    order.completed_at = utcnow()
    if order.payment_status != "PAID":
        order.payment_status = "PAID"
        order.paid_amount = order.total_amount
    if order.customer:
        earned = int(float(order.total_amount) // 10000)
        order.points_earned = earned
        order.customer.loyalty_points += earned
        order.customer.total_spent = money(float(order.customer.total_spent) + float(order.total_amount))
        for i in order.items:
            i.product.sold_count += int(i.quantity) if i.product.product_type == "STANDARD" else 1
    if order.shipment:
        order.shipment.status = "DELIVERED"
        order.shipment.delivered_at = utcnow()
    return serialize_order(order)


@router.get("/reviews")
def reviews(db: Session = Depends(get_db), _: User = Depends(require("product.read"))):
    rows = db.query(ProductReview).options(joinedload(ProductReview.customer)).order_by(ProductReview.id.desc()).all()
    return [
        {
            "id": r.id,
            "product_id": r.product_id,
            "rating": r.rating,
            "comment": r.comment,
            "reply": r.reply,
            "is_visible": r.is_visible,
            "customer": r.customer.name if r.customer else None,
        }
        for r in rows
    ]


class ReviewModIn(BaseModel):
    is_visible: bool | None = None
    reply: str | None = None


@router.put("/reviews/{review_id}")
def mod_review(review_id: int, body: ReviewModIn, db: Session = Depends(get_db), user: User = Depends(require("product.write"))):
    r = db.get(ProductReview, review_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy")
    if body.is_visible is not None:
        r.is_visible = body.is_visible
    if body.reply is not None:
        r.reply = body.reply
    return {"ok": True}


@router.get("/banners")
def banners(db: Session = Depends(get_db), _: User = Depends(require("product.read"))):
    return [{"id": b.id, "title": b.title, "image_url": b.image_url, "is_active": b.is_active} for b in db.query(Banner).all()]
