from __future__ import annotations

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import AppError
from app.core.utils import money, next_code, utcnow
from app.services.promo_service import near_expiry_line_discount, near_expiry_promo, order_discount
from app.models import Customer, Order, OrderItem, Payment, Product, ProductBarcode, ProductUnit, Promotion, Setting, Shift, StockReservation
from app.services.inventory_service import InventoryService
from app.services.reservation_service import ReservationService
from app.services.vietqr import build_vietqr, qr_data_uri


def setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(Setting, key)
    return row.value if row and row.value is not None else default


def gen_order_code(db: Session, prefix: str = "HD") -> str:
    day = utcnow().strftime("%Y%m%d")
    count = db.query(Order).filter(Order.code.like(f"{prefix}{day}-%")).count() + 1
    return next_code(prefix, count)


def product_snapshot(db: Session, product_id: int, quantity: float, unit_id: int | None = None, barcode: str | None = None):
    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise AppError("PRODUCT_NOT_FOUND", "Sản phẩm không tồn tại", 404)
    conversion = 1
    unit_price = float(product.sale_price)
    product_unit_id = None
    if unit_id:
        pu = db.query(ProductUnit).filter(ProductUnit.product_id == product_id, ProductUnit.id == unit_id).first()
        if pu:
            conversion = pu.conversion_rate
            unit_price = float(pu.sale_price)
            product_unit_id = pu.id
    line_qty = float(quantity)
    return {
        "product": product,
        "product_unit_id": product_unit_id,
        "conversion_rate": conversion,
        "unit_price": unit_price,
        "quantity": line_qty,
        "barcode": barcode,
        "line_total": money(unit_price * line_qty),
        "base_qty": line_qty * conversion,
    }


def find_by_barcode(db: Session, code: str):
    from app.services.barcode import parse_weight_barcode

    weight = parse_weight_barcode(code)
    if weight:
        sku_tail = weight["item_code"].lstrip("0") or "0"
        product = db.query(Product).filter(Product.sku.like(f"%{sku_tail}")).first()
        pb = db.query(ProductBarcode).filter(ProductBarcode.barcode == code).first()
        if pb:
            product = db.get(Product, pb.product_id)
        return product, weight

    pb = db.query(ProductBarcode).filter(ProductBarcode.barcode == code).first()
    if pb:
        return db.get(Product, pb.product_id), None
    pu = db.query(ProductUnit).filter(ProductUnit.barcode == code).first()
    if pu:
        return db.get(Product, pu.product_id), None
    return None, None


def inventory_view(db: Session, product_id: int, warehouse_id: int = 1) -> dict:
    row = db.execute(
        text("SELECT quantity, reserved FROM inventory WHERE product_id=:pid AND warehouse_id=:wid"),
        {"pid": product_id, "wid": warehouse_id},
    ).first()
    qty = float(row[0]) if row else 0
    reserved = float(row[1]) if row else 0
    return {"quantity": qty, "reserved": reserved, "available": qty - reserved}


def apply_promo(db: Session, subtotal: float, code: str | None) -> tuple[float, int | None]:
    if not code:
        return 0, None
    promo = (
        db.query(Promotion)
        .filter(Promotion.code == code.strip().upper(), Promotion.is_active.is_(True), Promotion.scope == "ORDER")
        .first()
    )
    if not promo:
        raise AppError("PROMO_INVALID", "Mã khuyến mãi không hợp lệ")
    now = utcnow()
    if now < promo.start_at:
        raise AppError("PROMO_NOT_STARTED", "Mã khuyến mãi chưa tới ngày áp dụng")
    if now > promo.end_at:
        raise AppError("PROMO_EXPIRED", "Mã khuyến mãi đã hết hạn")
    if float(subtotal) < float(promo.min_order_amount):
        raise AppError("PROMO_MIN", f"Đơn tối thiểu {int(promo.min_order_amount):,}đ".replace(",", "."))
    if promo.usage_limit and promo.used_count >= promo.usage_limit:
        raise AppError("PROMO_LIMIT", "Mã đã hết lượt dùng")
    return order_discount(promo, subtotal), promo.id


def checkout_pos(db: Session, *, user, payload: dict, idempotency_key: str | None):
    if idempotency_key:
        existing = db.query(Order).filter(Order.idempotency_key == idempotency_key).first()
        if existing:
            return existing

    shift = (
        db.query(Shift)
        .filter(Shift.user_id == user.id, Shift.status == "OPEN")
        .order_by(Shift.id.desc())
        .first()
    )
    if not shift:
        raise AppError("SHIFT_REQUIRED", "Hãy mở ca trước khi bán hàng")

    items_in = payload.get("items") or []
    if not items_in:
        raise AppError("EMPTY_CART", "Giỏ hàng trống")

    warehouse_id = payload.get("warehouse_id") or settings.default_warehouse_id
    order = Order(
        code=gen_order_code(db),
        customer_id=payload.get("customer_id"),
        user_id=user.id,
        warehouse_id=warehouse_id,
        shift_id=shift.id,
        channel="POS",
        delivery_method="AT_STORE",
        status="PENDING_PAYMENT",
        idempotency_key=idempotency_key,
        note=payload.get("note"),
        points_used=int(payload.get("points_used") or 0),
    )
    db.add(order)
    db.flush()

    subtotal = 0.0
    snapshots = []
    near_promo = near_expiry_promo(db)
    for raw in items_in:
        snap = product_snapshot(
            db,
            int(raw["product_id"]),
            float(raw.get("quantity") or 1),
            raw.get("product_unit_id"),
            raw.get("barcode"),
        )
        snapshots.append(snap)
        # Hàng cận date: tự trừ % thẳng vào dòng, thu ngân không phải chọn mã
        line_discount = near_expiry_line_discount(
            db,
            snap["product"].id,
            snap["unit_price"],
            snap["quantity"],
            near_promo,
            conversion=snap["conversion_rate"],
            warehouse_id=warehouse_id,
        )
        snap["line_total"] = money(snap["line_total"] - line_discount)
        item = OrderItem(
            order_id=order.id,
            product_id=snap["product"].id,
            product_unit_id=snap["product_unit_id"],
            product_name=snap["product"].name,
            barcode=snap["barcode"],
            unit_price=snap["unit_price"],
            cost_price=float(snap["product"].cost_price),
            quantity=snap["quantity"],
            conversion_rate=snap["conversion_rate"],
            vat_rate=float(snap["product"].vat_rate),
            discount=line_discount,
            line_total=snap["line_total"],
        )
        db.add(item)
        subtotal += snap["line_total"]

    extra_discount = money(payload.get("discount") or 0)
    promo_discount, promo_id = apply_promo(db, subtotal, payload.get("promo_code"))
    discount = extra_discount + promo_discount
    points_used = order.points_used
    points_value = 0.0
    customer = db.get(Customer, order.customer_id) if order.customer_id else None
    if points_used:
        if not customer:
            raise AppError("POINTS_NO_CUSTOMER", "Cần gắn khách hàng để dùng điểm")
        if customer.loyalty_points < points_used:
            raise AppError("POINTS_NOT_ENOUGH", "Không đủ điểm")
        points_value = points_used  # 1 điểm = 1đ
        customer.loyalty_points -= points_used

    total = max(0, money(subtotal - discount - points_value))
    order.subtotal = subtotal
    order.discount_amount = discount + points_value
    order.total_amount = total
    order.promotion_id = promo_id
    if promo_id:
        promo = db.get(Promotion, promo_id)
        promo.used_count += 1

    method = (payload.get("payment_method") or "CASH").upper()
    received = money(payload.get("received") or total)

    if method == "CASH":
        if received < total:
            raise AppError("CASH_SHORT", "Số tiền khách đưa chưa đủ")
        _pos_take_stock(db, order, snapshots, user, warehouse_id)
        order.paid_amount = received
        order.change_amount = money(received - total)
        db.add(
            Payment(
                order_id=order.id,
                method="CASH",
                amount=total,
                status="SUCCESS",
                paid_at=utcnow(),
                confirmed_by=user.id,
            )
        )
        order.status = "COMPLETED"
        order.payment_status = "PAID"
        order.completed_at = utcnow()
        shift.cash_sales = money(float(shift.cash_sales) + total)
        shift.expected_cash = money(float(shift.opening_cash) + float(shift.cash_sales))
        shift.total_orders += 1
        if customer:
            earned = int(total // 10000)
            order.points_earned = earned
            customer.loyalty_points += earned
            customer.total_spent = money(float(customer.total_spent) + total)
            if customer.total_spent >= 5_000_000:
                customer.tier = "GOLD"
            elif customer.total_spent >= 1_000_000:
                customer.tier = "SILVER"
        db.flush()
        return order

    if method == "QR_BANK":
        for snap in snapshots:
            InventoryService.cover_unconfirmed(
                db,
                product=snap["product"],
                warehouse_id=warehouse_id,
                need=snap["base_qty"],
                user_id=user.id if user else None,
                channel="POS",
            )
            ReservationService.reserve(
                db,
                order_id=order.id,
                product_id=snap["product"].id,
                warehouse_id=warehouse_id,
                qty=snap["base_qty"],
                ttl_minutes=settings.qr_ttl_minutes,
            )
        return create_qr_payment(db, order, user, shift)

    raise AppError("PAYMENT_METHOD", "Phương thức thanh toán không hỗ trợ")


def _inc_sold(product, quantity: float) -> None:
    if not product:
        return
    product.sold_count += int(quantity) if product.product_type == "STANDARD" else 1


def _dec_sold(product, quantity: float) -> None:
    if not product:
        return
    dec = int(quantity) if product.product_type == "STANDARD" else 1
    product.sold_count = max(0, product.sold_count - dec)


def _pos_take_stock(db: Session, order: Order, snapshots: list, user, warehouse_id: int) -> None:
    for snap in snapshots:
        InventoryService.cover_unconfirmed(
            db,
            product=snap["product"],
            warehouse_id=warehouse_id,
            need=snap["base_qty"],
            user_id=user.id if user else None,
            channel="POS",
        )
        InventoryService.apply(
            db,
            product_id=snap["product"].id,
            warehouse_id=warehouse_id,
            qty=-snap["base_qty"],
            type_="SALE",
            ref_type="order",
            ref_id=order.id,
            user_id=user.id if user else None,
            unit_cost=float(snap["product"].cost_price),
            channel="POS",
        )
        _inc_sold(snap["product"], snap["quantity"])


def void_unpaid_order(db: Session, order: Order, reason: str) -> Order:
    if order.status not in ("PENDING_PAYMENT", "PENDING_CONFIRM"):
        raise AppError("ORDER_NOT_CANCELLABLE", "Đơn này không huỷ được")
    holds = (
        db.query(StockReservation)
        .filter(StockReservation.order_id == order.id, StockReservation.status == "HELD")
        .all()
    )
    if holds:
        ReservationService.release(db, order.id)
    else:
        for item in order.items:
            qty = float(item.quantity) * float(item.conversion_rate or 1)
            InventoryService.apply(
                db,
                product_id=item.product_id,
                warehouse_id=order.warehouse_id,
                qty=qty,
                type_="CANCEL",
                ref_type="order",
                ref_id=order.id,
                user_id=order.user_id,
                channel=order.channel,
                note=reason,
            )
            _dec_sold(item.product, float(item.quantity))
    for pay in order.payments:
        if pay.status == "PENDING":
            pay.status = "CANCELLED"
    order.status = "CANCELLED"
    order.cancel_reason = reason
    db.flush()
    return order


def create_qr_payment(db: Session, order: Order, user=None, shift: Shift | None = None) -> Order:
    bank_bin = setting(db, "bank.bin", "970436")
    account = setting(db, "bank.account", "1234567890")
    content = order.code.replace("-", "")[:25]
    payload = build_vietqr(bank_bin, account, int(order.total_amount), content)
    payment = Payment(
        order_id=order.id,
        method="QR_BANK",
        amount=order.total_amount,
        status="PENDING",
        qr_content=payload,
        qr_image=qr_data_uri(payload),
        qr_expires_at=utcnow() + timedelta(minutes=settings.qr_ttl_minutes),
    )
    db.add(payment)
    order.status = "PENDING_PAYMENT"
    order.payment_status = "UNPAID"
    order.reserve_expires_at = payment.qr_expires_at
    db.flush()
    return order


def complete_qr_order(db: Session, order: Order, payment: Payment, confirmed_by: int | None = None):
    if order.status == "COMPLETED":
        return order
    payment.status = "SUCCESS"
    payment.paid_at = utcnow()
    payment.confirmed_by = confirmed_by
    order.paid_amount = order.total_amount
    order.payment_status = "PAID"
    if order.channel == "POS":
        holds = (
            db.query(StockReservation)
            .filter(StockReservation.order_id == order.id, StockReservation.status == "HELD")
            .all()
        )
        if holds:
            ReservationService.consume(db, order.id, confirmed_by, channel="POS")
            for item in order.items:
                _inc_sold(item.product, float(item.quantity))
        order.status = "COMPLETED"
        order.completed_at = utcnow()
        if order.shift_id:
            shift = db.get(Shift, order.shift_id)
            if shift:
                shift.qr_sales = money(float(shift.qr_sales) + float(order.total_amount))
                shift.total_orders += 1
        if order.customer_id:
            customer = db.get(Customer, order.customer_id)
            if customer:
                earned = int(float(order.total_amount) // 10000)
                order.points_earned = earned
                customer.loyalty_points += earned
                customer.total_spent = money(float(customer.total_spent) + float(order.total_amount))
    db.flush()
    return order
