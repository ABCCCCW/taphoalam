from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.exceptions import AppError
from app.core.permissions import require
from app.core.security import create_token, hash_password, hash_token, verify_password
from app.core.utils import fold, money, utcnow
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
from app.services.order_service import apply_promo, create_qr_payment, gen_order_code
from app.services.reservation_service import ReservationService

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
    items = query.offset((page - 1) * size).limit(size).all()
    out = [serialize_product(db, p) for p in items]
    if in_stock:
        out = [x for x in out if x["available"] > 0]
    return {"items": out}


@shop.get("/search")
def search(q: str, db: Session = Depends(get_db)):
    folded = fold(q)
    items = (
        db.query(Product)
        .filter(Product.is_online.is_(True), Product.is_active.is_(True))
        .filter((Product.name.ilike(f"%{q}%")) | (Product.name_search.ilike(f"%{folded}%")))
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
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    data = serialize_product(db, p)
    related = (
        db.query(Product)
        .filter(Product.category_id == p.category_id, Product.id != p.id, Product.is_online.is_(True), Product.is_active.is_(True))
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
    for i in cart.items:
        p = i.product
        inv = db.get(Inventory, (p.id, 1))
        available = float(inv.quantity) - float(inv.reserved) if inv else 0
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
            "line_total": money(float(p.sale_price) * float(i.quantity)),
        }
        items.append(line)
        subtotal += line["line_total"]
    return {"id": cart.id, "items": items, "subtotal": money(subtotal)}


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
        }
        for a in rows
    ]


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
    shipping = 15000 if body.delivery_method == "DELIVERY" else 0
    ttl = settings.online_qr_reserve_minutes if body.payment_method == "QR_BANK" else settings.online_cod_reserve_hours * 60
    order = Order(
        code=gen_order_code(db),
        customer_id=customer.id,
        warehouse_id=1,
        channel="ONLINE",
        delivery_method=body.delivery_method,
        shipping_fee=shipping,
        status="PENDING_CONFIRM",
        payment_status="UNPAID",
        note=body.note,
        reserve_expires_at=utcnow() + timedelta(minutes=ttl),
    )
    db.add(order)
    db.flush()
    subtotal = 0.0
    for ci in list(cart.items):
        p = ci.product
        line_total = money(float(p.sale_price) * float(ci.quantity))
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
    order.total_amount = money(subtotal - discount + shipping)
    if body.delivery_method == "DELIVERY":
        db.add(Shipment(order_id=order.id, method="DELIVERY", address_id=body.address_id, shipping_fee=shipping, status="PENDING"))
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
