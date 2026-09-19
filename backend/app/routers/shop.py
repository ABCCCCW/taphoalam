from __future__ import annotations

from datetime import timedelta

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.exceptions import AppError
from app.core.permissions import require
from app.core.security import create_token, hash_password, hash_token, verify_password
from app.core.utils import fold, money, utcnow
from app.core.paging import clamp_page, page_meta
from app.database import get_db
from app.deps import get_current_customer, get_optional_customer
from app.models import (
    Banner,
    Cart,
    CartItem,
    Customer,
    CustomerAddress,
    Inventory,
    Order,
    OrderItem,
    Product,
    ProductReview,
    Promotion,
    RefreshToken,
    Setting,
    Shipment,
)
from app.realtime.hub import hub
from app.routers.products import serialize_product
from app.services.promo_service import live_order_promos, near_expiry_info, near_expiry_line_discount, near_expiry_promo, serialize_promo
from app.services.order_service import apply_promo, create_qr_payment, gen_order_code
from app.services.reservation_service import ReservationService
from app.services import shipping
from app.services.batch_service import ensure_sellable, expired_on_shelf_ids

shop = APIRouter(prefix="/api/v1/shop", tags=["shop"])


def issue_customer(db: Session, customer: Customer):
    access = create_token(customer.id, "customer")
    refresh = create_token(customer.id, "customer_refresh", minutes=settings.refresh_token_days * 24 * 60)
    db.add(
        RefreshToken(
            subject_id=customer.id,
            token_hash=hash_token(refresh),
            subject_type="CUSTOMER",
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        )
    )
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer", "customer": serialize_customer(customer)}


def serialize_customer(c: Customer):
    return {
        "id": c.id,
        "code": c.code,
        "name": c.name,
        "phone": c.phone,
        "email": c.email,
        "tier": c.tier,
        "loyalty_points": c.loyalty_points,
        "total_spent": float(c.total_spent),
    }


class RegisterIn(BaseModel):
    name: str
    phone: str
    password: str
    email: str | None = None

    @field_validator("phone")
    @classmethod
    def vn_phone(cls, v: str) -> str:
        v = re.sub(r"\D", "", v or "")
        if not re.fullmatch(r"0\d{9}", v):
            raise ValueError("Số điện thoại 10 số, bắt đầu bằng 0")
        return v

    @field_validator("password")
    @classmethod
    def ascii_password(cls, v: str) -> str:
        v = (v or "").replace(" ", "")
        if len(v) < 6:
            raise ValueError("Mật khẩu từ 6 ký tự")
        if re.search(r"\s", v) or re.search(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", v, re.I):
            raise ValueError("Mật khẩu không viết dấu và không có khoảng trắng")
        return v


@shop.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(Customer).filter(Customer.phone == body.phone).first():
        existing = db.query(Customer).filter(Customer.phone == body.phone).first()
        if existing.password_hash:
            raise HTTPException(409, "Số điện thoại đã đăng ký")
        existing.password_hash = hash_password(body.password)
        existing.name = body.name
        existing.email = body.email or existing.email
        existing.source = "ONLINE"
        return issue_customer(db, existing)
    seq = db.query(Customer).count() + 1
    c = Customer(
        code=f"KH{seq:06d}",
        name=body.name,
        phone=body.phone,
        email=body.email,
        password_hash=hash_password(body.password),
        source="ONLINE",
    )
    db.add(c)
    db.flush()
    return issue_customer(db, c)


class LoginIn(BaseModel):
    phone: str
    password: str


@shop.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.phone == body.phone).first()
    if not c or not c.password_hash or not verify_password(body.password, c.password_hash):
        raise HTTPException(401, "Sai số điện thoại hoặc mật khẩu")
    return issue_customer(db, c)


@shop.get("/me")
def me(customer: Customer = Depends(get_current_customer)):
    return serialize_customer(customer)


@shop.get("/banners")
def banners(db: Session = Depends(get_db)):
    rows = db.query(Banner).filter(Banner.is_active.is_(True)).order_by(Banner.sort_order).all()
    return [{"id": b.id, "title": b.title, "image_url": b.image_url, "link_url": b.link_url} for b in rows]


@shop.get("/products")
def catalog(
    q: str | None = None,
    category_id: int | None = None,
    in_stock: bool = False,
    sort: str = "-sold_count",
    page: int = 1,
    size: int = 24,
    db: Session = Depends(get_db),
):
    query = db.query(Product).filter(Product.is_online.is_(True), Product.is_active.is_(True))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if q:
        folded = fold(q)
        query = query.filter((Product.name.ilike(f"%{q}%")) | (Product.name_search.ilike(f"%{folded}%")))
    if sort == "price":
        query = query.order_by(Product.sale_price.asc())
    elif sort == "-price":
        query = query.order_by(Product.sale_price.desc())
    else:
        query = query.order_by(Product.sold_count.desc())
    # Hàng đang có lô quá hạn trên kệ thì khách không thấy, không mua được.
    blocked = expired_on_shelf_ids(db)
    if blocked:
        query = query.filter(Product.id.notin_(blocked))
    page, size = clamp_page(page, size, default=24)
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    out = [serialize_product(db, p) for p in items]
    if in_stock:
        out = [x for x in out if x["available"] > 0]
    return {"items": out, **page_meta(page, size, total)}


@shop.get("/search")
def search(q: str, db: Session = Depends(get_db)):
    folded = fold(q)
    items = (
        db.query(Product)
        .filter(Product.is_online.is_(True), Product.is_active.is_(True))
        .filter((Product.name.ilike(f"%{q}%")) | (Product.name_search.ilike(f"%{folded}%")))
        .filter(Product.id.notin_(expired_on_shelf_ids(db) or {0}))
        .limit(8)
        .all()
    )
    return [
        {
            "id": p.id, "name": p.name, "slug": p.slug,
            "emoji": p.emoji, "image_url": p.image_url,
            "sale_price": float(p.sale_price),
        }
        for p in items
    ]


@shop.get("/products/{slug}")
def product_detail(slug: str, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.slug == slug).first()
    blocked = expired_on_shelf_ids(db)
    if not p or p.id in blocked:
        raise HTTPException(404, "Sản phẩm tạm ngưng bán")
    data = serialize_product(db, p)
    related = (
        db.query(Product)
        .filter(Product.category_id == p.category_id, Product.id != p.id, Product.is_online.is_(True), Product.is_active.is_(True))
        .filter(Product.id.notin_(blocked or {0}))
        .limit(6)
        .all()
    )
    reviews = (
        db.query(ProductReview)
        .options(joinedload(ProductReview.customer))
        .filter(ProductReview.product_id == p.id, ProductReview.is_visible.is_(True))
        .order_by(ProductReview.id.desc())
        .limit(10)
        .all()
    )
    data["related"] = [serialize_product(db, r) for r in related]
    data["reviews"] = [
        {"id": r.id, "rating": r.rating, "comment": r.comment, "reply": r.reply, "name": r.customer.name if r.customer else "Khách"}
        for r in reviews
    ]
    return data


def get_cart(db: Session, customer: Customer | None, session_key: str | None) -> Cart:
    cart = None
    if customer:
        cart = db.query(Cart).filter(Cart.customer_id == customer.id).first()
        if not cart:
            cart = Cart(customer_id=customer.id)
            db.add(cart)
            db.flush()
    elif session_key:
        cart = db.query(Cart).filter(Cart.session_key == session_key).first()
        if not cart:
            cart = Cart(session_key=session_key)
            db.add(cart)
            db.flush()
    else:
        cart = Cart(session_key="guest")
        db.add(cart)
        db.flush()
    return cart


def serialize_cart(db: Session, cart: Cart):
    items = []
    subtotal = 0.0
    near_promo = near_expiry_promo(db)
    for i in cart.items:
        p = i.product
        inv = db.get(Inventory, (p.id, 1))
        available = float(inv.quantity) - float(inv.reserved) if inv else 0
        gross = money(float(p.sale_price) * float(i.quantity))
        discount = near_expiry_line_discount(db, p.id, float(p.sale_price), float(i.quantity), near_promo)
        line = {
            "id": i.id,
            "product_id": p.id,
            "name": p.name,
            "slug": p.slug,
            "emoji": p.emoji,
            "image_url": p.image_url,
            "sale_price": float(p.sale_price),
            "quantity": float(i.quantity),
            "product_type": p.product_type,
            "available": available,
            "out_of_stock": available < float(i.quantity),
            "gross_total": gross,
            "discount": discount,
            "near_expiry": near_expiry_info(db, p.id, near_promo),
            "line_total": money(gross - discount),
        }
        items.append(line)
        subtotal += line["line_total"]
    return {"id": cart.id, "items": items, "subtotal": money(subtotal)}


@shop.get("/promotions")
def shop_promotions(db: Session = Depends(get_db)):
    """Mã đang chạy cho khách chọn lúc đặt hàng."""
    return [serialize_promo(p) for p in live_order_promos(db)]


@shop.get("/cart")
def get_shop_cart(
    session_key: str | None = None,
    db: Session = Depends(get_db),
    customer: Customer | None = Depends(get_optional_customer),
):
    cart = get_cart(db, customer, session_key)
    return serialize_cart(db, cart)


class CartItemIn(BaseModel):
    product_id: int
    quantity: float = 1
    session_key: str | None = None


@shop.post("/cart/items")
def add_cart(body: CartItemIn, db: Session = Depends(get_db), customer: Customer | None = Depends(get_optional_customer)):
    p = db.get(Product, body.product_id)
    if not p or not p.is_online:
        raise HTTPException(404, "Sản phẩm không bán online")
    ensure_sellable(db, p)
    cart = get_cart(db, customer, body.session_key)
    existing = next((i for i in cart.items if i.product_id == body.product_id), None)
    if existing:
        existing.quantity = float(existing.quantity) + body.quantity
    else:
        db.add(CartItem(cart_id=cart.id, product_id=body.product_id, quantity=body.quantity))
    db.flush()
    return serialize_cart(db, cart)


class CartQtyIn(BaseModel):
    quantity: float
    session_key: str | None = None


@shop.put("/cart/items/{item_id}")
def update_cart_item(item_id: int, body: CartQtyIn, db: Session = Depends(get_db), customer: Customer | None = Depends(get_optional_customer)):
    item = db.get(CartItem, item_id)
    if not item:
        raise HTTPException(404, "Không tìm thấy dòng giỏ")
    if body.quantity <= 0:
        db.delete(item)
    else:
        item.quantity = body.quantity
    db.flush()
    cart = get_cart(db, customer, body.session_key)
    return serialize_cart(db, cart)


class AddressIn(BaseModel):
    receiver_name: str
    receiver_phone: str
    province: str
    district: str
    ward: str
    street: str
    lat: float | None = None
    lng: float | None = None
    note: str | None = None
    is_default: bool = True


@shop.get("/addresses")
def list_addresses(customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    rows = db.query(CustomerAddress).filter(CustomerAddress.customer_id == customer.id).all()
    return [
        {
            "id": a.id,
            "receiver_name": a.receiver_name,
            "receiver_phone": a.receiver_phone,
            "province": a.province,
            "district": a.district,
            "ward": a.ward,
            "street": a.street,
            "note": a.note,
            "is_default": a.is_default,
            "lat": a.lat,
            "lng": a.lng,
            "shipping": shipping.quote(db, a.lat, a.lng),
        }
        for a in rows
    ]


class LocateIn(BaseModel):
    lat: float
    lng: float


@shop.patch("/addresses/{address_id}/location")
def locate_address(address_id: int, body: LocateIn, customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    """Gắn toạ độ cho địa chỉ đã lưu từ trước khi có phí theo km."""
    a = db.get(CustomerAddress, address_id)
    if not a or a.customer_id != customer.id:
        raise HTTPException(404, "Không tìm thấy địa chỉ")
    a.lat, a.lng = body.lat, body.lng
    return shipping.quote(db, a.lat, a.lng)


class QuoteIn(BaseModel):
    lat: float | None = None
    lng: float | None = None


@shop.get("/shipping/rule")
def shipping_rule(db: Session = Depends(get_db)):
    r = shipping.rule(db)
    return {k: r[k] for k in ("free_km", "base_fee", "per_km")}


@shop.post("/shipping/quote")
def shipping_quote(body: QuoteIn, db: Session = Depends(get_db)):
    return shipping.quote(db, body.lat, body.lng)


@shop.post("/addresses")
def add_address(body: AddressIn, customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    a = CustomerAddress(customer_id=customer.id, **body.model_dump())
    db.add(a)
    db.flush()
    return {"id": a.id}


class PlaceOrderIn(BaseModel):
    delivery_method: str = "PICKUP"
    address_id: int | None = None
    payment_method: str = "COD"
    promo_code: str | None = None
    note: str | None = None
    session_key: str | None = None


@shop.post("/orders")
async def place_order(body: PlaceOrderIn, customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    cart = get_cart(db, customer, body.session_key)
    if not cart.items:
        raise AppError("EMPTY_CART", "Giỏ hàng trống")
    if body.delivery_method == "DELIVERY" and not body.address_id:
        # Thiếu địa chỉ thì đơn giao vẫn tạo được nhưng shipper không biết đi đâu.
        raise AppError("NO_ADDRESS", "Đơn giao tận nơi cần địa chỉ nhận hàng")
    ship_quote = None
    if body.delivery_method == "DELIVERY":
        addr = db.get(CustomerAddress, body.address_id)
        if not addr or addr.customer_id != customer.id:
            raise AppError("NO_ADDRESS", "Địa chỉ nhận hàng không hợp lệ")
        # Phí tính lại ở server theo toạ độ đã lưu, không tin số tiền trình duyệt gửi lên.
        ship_quote = shipping.quote(db, addr.lat, addr.lng)
    shipping_fee = ship_quote["fee"] if ship_quote else 0
    ttl = settings.online_qr_reserve_minutes if body.payment_method == "QR_BANK" else settings.online_cod_reserve_hours * 60
    order = Order(
        code=gen_order_code(db),
        customer_id=customer.id,
        warehouse_id=1,
        channel="ONLINE",
        delivery_method=body.delivery_method,
        shipping_fee=shipping_fee,
        status="PENDING_CONFIRM",
        payment_status="UNPAID",
        note=body.note,
        reserve_expires_at=utcnow() + timedelta(minutes=ttl),
    )
    db.add(order)
    db.flush()
    subtotal = 0.0
    near_promo = near_expiry_promo(db)
    for ci in list(cart.items):
        p = ci.product
        ensure_sellable(db, p)
        line_discount = near_expiry_line_discount(db, p.id, float(p.sale_price), float(ci.quantity), near_promo)
        line_total = money(float(p.sale_price) * float(ci.quantity) - line_discount)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=p.id,
                product_name=p.name,
                unit_price=float(p.sale_price),
                cost_price=float(p.cost_price),
                quantity=float(ci.quantity),
                ordered_qty=float(ci.quantity),
                vat_rate=float(p.vat_rate),
                discount=line_discount,
                line_total=line_total,
            )
        )
        ReservationService.reserve(
            db,
            order_id=order.id,
            product_id=p.id,
            warehouse_id=1,
            qty=float(ci.quantity) if p.product_type != "WEIGHTED" else float(ci.quantity),
            ttl_minutes=ttl,
        )
        subtotal += line_total
        db.delete(ci)
    discount, promo_id = apply_promo(db, subtotal, body.promo_code)
    order.subtotal = subtotal
    order.discount_amount = discount
    order.promotion_id = promo_id
    order.total_amount = money(subtotal - discount + shipping_fee)
    if body.delivery_method == "DELIVERY":
        db.add(
            Shipment(
                order_id=order.id,
                method="DELIVERY",
                address_id=body.address_id,
                shipping_fee=shipping_fee,
                distance_km=ship_quote["distance_km"],
                status="PENDING",
            )
        )
    else:
        db.add(Shipment(order_id=order.id, method="PICKUP", shipping_fee=0, status="PENDING"))
    if body.payment_method == "QR_BANK":
        create_qr_payment(db, order)
    db.flush()
    await hub.notify_staff({"type": "online_order", "order_id": order.id, "code": order.code, "total": float(order.total_amount)})
    return shop_order(order)


def shop_order(order: Order):
    return {
        "id": order.id,
        "code": order.code,
        "status": order.status,
        "payment_status": order.payment_status,
        "delivery_method": order.delivery_method,
        "subtotal": float(order.subtotal),
        "discount_amount": float(order.discount_amount),
        "shipping_fee": float(order.shipping_fee),
        "total_amount": float(order.total_amount),
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "items": [
            {
                "product_name": i.product_name,
                "quantity": float(i.quantity),
                "unit_price": float(i.unit_price),
                "discount": float(i.discount or 0),
                "line_total": float(i.line_total),
                "emoji": i.product.emoji if i.product else "🛒",
                "image_url": i.product.image_url if i.product else None,
            }
            for i in order.items
        ],
        "payments": [
            {"id": p.id, "method": p.method, "status": p.status, "qr_image": p.qr_image, "amount": float(p.amount)}
            for p in (order.payments or [])
        ],
    }


@shop.get("/orders")
def my_orders(customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    rows = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.payments))
        .filter(Order.customer_id == customer.id, Order.channel == "ONLINE")
        .order_by(Order.id.desc())
        .all()
    )
    return [shop_order(o) for o in rows]


@shop.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order or order.customer_id != customer.id:
        raise HTTPException(404, "Không tìm thấy đơn")
    if order.status not in ("PENDING_CONFIRM", "PENDING_PAYMENT"):
        raise HTTPException(400, "Đơn đã được cửa hàng xác nhận, không huỷ được trên app")
    ReservationService.release(db, order.id)
    order.status = "CANCELLED"
    order.cancel_reason = "Khách huỷ"
    return {"ok": True}


@shop.post("/orders/{order_id}/payments/qr")
def shop_qr(order_id: int, customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order or order.customer_id != customer.id:
        raise HTTPException(404, "Không tìm thấy đơn")
    create_qr_payment(db, order)
    db.refresh(order)
    return shop_order(order)


class ReviewIn(BaseModel):
    product_id: int
    order_id: int
    rating: int
    comment: str | None = None


@shop.post("/reviews")
def add_review(body: ReviewIn, customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    order = db.get(Order, body.order_id)
    if not order or order.customer_id != customer.id or order.status != "COMPLETED":
        raise HTTPException(400, "Chỉ đánh giá đơn đã hoàn tất của bạn")
    if body.product_id not in {i.product_id for i in order.items}:
        raise HTTPException(400, "Sản phẩm không nằm trong đơn này")
    if db.query(ProductReview).filter(ProductReview.order_id == order.id, ProductReview.product_id == body.product_id).first():
        raise HTTPException(409, "Đã đánh giá sản phẩm này")
    db.add(ProductReview(product_id=body.product_id, customer_id=customer.id, order_id=order.id, rating=max(1, min(5, body.rating)), comment=body.comment))
    db.flush()
    reviews = db.query(ProductReview).filter(ProductReview.product_id == body.product_id, ProductReview.is_visible.is_(True)).all()
    product = db.get(Product, body.product_id)
    product.rating_count = len(reviews)
    product.rating_avg = money(sum(r.rating for r in reviews) / len(reviews)) if reviews else 0
    return {"ok": True}
