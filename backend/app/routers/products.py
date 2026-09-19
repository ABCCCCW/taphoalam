from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.permissions import require
from app.core.utils import fold, money
from app.database import get_db
from app.models import (
    AuditLog,
    Brand,
    Category,
    Inventory,
    OrderItem,
    Product,
    ProductBarcode,
    ProductUnit,
    Setting,
    Supplier,
    Unit,
    User,
)
from app.services.batch_service import suggest_expiry
from app.services.barcode import detect_symbology, generate_internal_barcode
from app.services.barcode_lookup import lookup as lookup_barcode
from app.services.inventory_service import InventoryService
from app.services.order_service import find_by_barcode, inventory_view

router = APIRouter(prefix="/api/v1", tags=["catalog"])


def _show_cost(viewer: User | None) -> bool:
    return bool(viewer and viewer.role in ("ADMIN", "STOCKER"))


def serialize_product(db: Session, p: Product, warehouse_id: int = 1, viewer: User | None = None):
    inv = inventory_view(db, p.id, warehouse_id)
    primary = next((b.barcode for b in (p.barcodes or []) if b.is_primary), None)
    if not primary and p.barcodes:
        primary = p.barcodes[0].barcode
    data = {
        "id": p.id,
        "sku": p.sku,
        "name": p.name,
        "slug": p.slug,
        "emoji": p.emoji,
        "image_url": p.image_url,
        "sale_price": float(p.sale_price),
        "vat_rate": float(p.vat_rate),
        "product_type": p.product_type,
        "category_id": p.category_id,
        "category": p.category.name if p.category else None,
        "brand": p.brand.name if p.brand else None,
        "min_stock": p.min_stock,
        "is_active": p.is_active,
        "is_online": p.is_online,
        "online_sale_mode": p.online_sale_mode,
        "sold_count": p.sold_count,
        "rating_avg": float(p.rating_avg or 0),
        "rating_count": p.rating_count,
        "description": p.description,
        "barcode": primary,
        "cost_confirmed": bool(p.cost_confirmed),
        "barcodes": [
            {"barcode": b.barcode, "is_primary": b.is_primary, "symbology": b.symbology} for b in (p.barcodes or [])
        ],
        "units": [
            {
                "id": u.id,
                "unit_id": u.unit_id,
                "name": u.unit.name if u.unit else None,
                "conversion_rate": u.conversion_rate,
                "sale_price": float(u.sale_price),
                "barcode": u.barcode,
            }
            for u in (p.units or [])
        ],
        **inv,
        "low_stock": inv["quantity"] <= p.min_stock,
        "track_expiry": bool(p.track_expiry),
        "suggested_expiry": suggest_expiry(p).isoformat(),
    }
    if _show_cost(viewer):
        data["cost_price"] = float(p.cost_price)
    return data


@router.get("/products")
def list_products(
    q: str | None = None,
    category_id: int | None = None,
    is_active: bool | None = True,
    low_stock: bool = False,
    page: int = 1,
    size: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(require("product.read")),
):
    query = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.brand),
        joinedload(Product.barcodes),
        joinedload(Product.units).joinedload(ProductUnit.unit),
    )
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if q:
        folded = fold(q)
        query = query.filter((Product.name.ilike(f"%{q}%")) | (Product.name_search.ilike(f"%{folded}%")) | (Product.sku.ilike(f"%{q}%")))
    items = query.order_by(Product.name).offset((page - 1) * size).limit(size).all()
    out = [serialize_product(db, p, viewer=user) for p in items]
    if low_stock:
        out = [x for x in out if x["low_stock"]]
    return {"items": out, "page": page, "size": size}


@router.get("/products/barcode/{code}")
def get_by_barcode(code: str, db: Session = Depends(get_db), user: User = Depends(require("product.read"))):
    product, weight = find_by_barcode(db, code)
    if not product:
        from app.core.exceptions import AppError

        raise AppError("BARCODE_UNKNOWN", "Mã chưa có trong hệ thống", 404, {"can_create": True, "barcode": code})
    data = serialize_product(db, product, viewer=user)
    if weight:
        data["weight_kg"] = weight.get("weight_kg")
        data["weight_amount"] = weight.get("amount")
        if weight.get("weight_kg"):
            data["suggested_qty"] = weight["weight_kg"]
    return data


@router.get("/products/pending-cost")
def pending_cost(db: Session = Depends(get_db), user: User = Depends(require("product.cost"))):
    rows = (
        db.query(Product)
        .options(joinedload(Product.barcodes), joinedload(Product.category))
        .filter(Product.cost_confirmed.is_(False), Product.is_active.is_(True))
        .order_by(Product.id.desc())
        .all()
    )
    return {"items": [serialize_product(db, p, viewer=user) for p in rows]}


@router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db), user: User = Depends(require("product.read"))):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    return serialize_product(db, p, viewer=user)


class ProductIn(BaseModel):
    name: str
    sale_price: float
    cost_price: float = 0
    category_id: int | None = None
    brand_id: int | None = None
    base_unit_id: int = 1
    product_type: str = "STANDARD"
    barcode: str | None = None
    min_stock: int = 10
    is_online: bool = True
    online_sale_mode: str = "EXACT"
    emoji: str | None = "🛒"
    description: str | None = None
    vat_rate: float = 0
    sku: str | None = None


@router.post("/products")
def create_product(body: ProductIn, db: Session = Depends(get_db), user: User = Depends(require("product.write"))):
    return _save_product(db, body, user)


class QuickCreateIn(BaseModel):
    name: str
    sale_price: float
    barcode: str | None = None
    emoji: str | None = "🛒"
    is_online: bool = False
    product_type: str = "STANDARD"
    category_id: int | None = None
    quantity: float = 1


@router.post("/products/quick-create")
def quick_create(body: QuickCreateIn, db: Session = Depends(get_db), user: User = Depends(require("pos.*"))):
    if not (body.name or "").strip():
        raise HTTPException(400, "Cần tên hàng")
    if body.sale_price <= 0:
        raise HTTPException(400, "Giá bán phải lớn hơn 0")
    qty = max(1.0, float(body.quantity or 1))
    if body.barcode:
        existing_bc = db.query(ProductBarcode).filter(ProductBarcode.barcode == body.barcode).first()
        if existing_bc:
            p = db.get(Product, existing_bc.product_id)
            if p:
                InventoryService.cover_unconfirmed(
                    db,
                    product=p,
                    warehouse_id=1,
                    need=qty,
                    user_id=user.id,
                    channel="POS",
                    note="Hàng ngoài quầy — thêm số đang cầm",
                )
                db.flush()
                return serialize_product(db, p, viewer=user)
    payload = ProductIn(
        name=body.name.strip(),
        sale_price=body.sale_price,
        cost_price=0,
        barcode=body.barcode,
        emoji=body.emoji or "🛒",
        is_online=body.is_online,
        product_type=body.product_type,
        category_id=body.category_id,
        min_stock=0,
    )
    data = _save_product(db, payload, user, cost_confirmed=False, skip_inventory=True)
    InventoryService.apply(
        db,
        product_id=data["id"],
        warehouse_id=1,
        qty=qty,
        type_="FOUND",
        ref_type="product",
        ref_id=data["id"],
        user_id=user.id,
        channel="POS",
        note="Tạo nhanh từ POS, chờ kho chốt giá vốn",
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="product.quick_created",
            entity_type="product",
            entity_id=data["id"],
            new_value={"name": payload.name, "sale_price": payload.sale_price, "barcode": payload.barcode, "quantity": qty},
        )
    )
    db.flush()
    p = db.get(Product, data["id"])
    return serialize_product(db, p, viewer=user)


class ConfirmCostIn(BaseModel):
    cost_price: float
    sale_price: float | None = None
    name: str | None = None
    quantity: float = 0


@router.post("/products/{product_id}/confirm-cost")
def confirm_cost(product_id: int, body: ConfirmCostIn, db: Session = Depends(get_db), user: User = Depends(require("product.cost"))):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    if p.cost_confirmed:
        raise HTTPException(400, "Mặt hàng này đã chốt giá vốn")
    if body.cost_price < 0:
        raise HTTPException(400, "Giá vốn không hợp lệ")
    if body.sale_price is not None and body.sale_price <= 0:
        raise HTTPException(400, "Giá bán phải lớn hơn 0")
    old = {"name": p.name, "sale_price": float(p.sale_price), "cost_price": float(p.cost_price)}
    if body.name and body.name.strip():
        from app.core.utils import fold as fold_name

        p.name = body.name.strip()
        p.name_search = fold_name(p.name)
    if body.sale_price is not None:
        p.sale_price = body.sale_price
    inv = db.get(Inventory, (p.id, 1))
    old_qty = float(inv.quantity) if inv else 0
    extra = float(body.quantity or 0)
    if extra < 0:
        raise HTTPException(400, "Số lượng nhập không hợp lệ")
    p.cost_price = money(body.cost_price)
    if extra > 0:
        new_qty = old_qty + extra
        p.cost_price = money((old_qty * float(p.cost_price) + extra * body.cost_price) / new_qty) if new_qty else money(body.cost_price)
        InventoryService.apply(
            db,
            product_id=p.id,
            warehouse_id=1,
            qty=extra,
            type_="IMPORT",
            ref_type="product",
            ref_id=p.id,
            user_id=user.id,
            unit_cost=float(body.cost_price),
            note="Xác nhận giá vốn hàng tạo từ quầy",
        )
    p.cost_confirmed = True
    for item in db.query(OrderItem).filter(OrderItem.product_id == p.id, OrderItem.cost_price == 0).all():
        item.cost_price = money(body.cost_price)
    db.add(
        AuditLog(
            user_id=user.id,
            action="product.cost_confirmed",
            entity_type="product",
            entity_id=p.id,
            old_value=old,
            new_value={"name": p.name, "sale_price": float(p.sale_price), "cost_price": float(p.cost_price), "quantity": extra},
        )
    )
    db.flush()
    return serialize_product(db, p, viewer=user)


def _save_product(
    db: Session,
    body: ProductIn,
    user: User,
    existing: Product | None = None,
    cost_confirmed: bool | None = None,
    skip_inventory: bool = False,
):
    from app.core.utils import fold as fold_name

    count = db.query(Product).count() + 1
    sku = body.sku or f"SP{count:04d}"
    slug_base = fold_name(body.name).replace(" ", "-") or sku.lower()
    slug = slug_base
    i = 1
    while db.query(Product).filter(Product.slug == slug).first():
        i += 1
        slug = f"{slug_base}-{i}"
    p = existing or Product()
    old_price = float(p.sale_price) if existing else None
    p.sku = sku if not existing else p.sku
    p.name = body.name
    p.slug = slug if not existing else p.slug
    p.name_search = fold_name(body.name)
    p.category_id = body.category_id
    p.brand_id = body.brand_id
    p.base_unit_id = body.base_unit_id
    p.product_type = body.product_type
    p.cost_price = body.cost_price
    if cost_confirmed is not None:
        p.cost_confirmed = cost_confirmed
    elif not existing:
        p.cost_confirmed = True
    elif body.cost_price and float(body.cost_price) > 0:
        p.cost_confirmed = True
    p.sale_price = body.sale_price
    p.vat_rate = body.vat_rate
    p.min_stock = body.min_stock
    p.emoji = body.emoji
    p.description = body.description
    p.is_online = body.is_online
    p.online_sale_mode = body.online_sale_mode if body.product_type != "WEIGHTED" else "APPROX"
    p.is_active = True
    if not existing:
        db.add(p)
        db.flush()
        if not body.barcode:
            body.barcode = generate_internal_barcode(p.id)
        if body.barcode:
            taken = db.query(ProductBarcode).filter(ProductBarcode.barcode == body.barcode).first()
            if taken:
                raise HTTPException(409, "Mã này đã có trên kệ rồi")
            db.add(
                ProductBarcode(
                    barcode=body.barcode,
                    product_id=p.id,
                    symbology=detect_symbology(body.barcode),
                    is_primary=True,
                    source="INTERNAL" if body.barcode.startswith("2") else "MANUFACTURER",
                )
            )
        if not skip_inventory:
            db.add(Inventory(product_id=p.id, warehouse_id=1, quantity=0, reserved=0))
    else:
        db.flush()
        if old_price != body.sale_price:
            db.add(
                AuditLog(
                    user_id=user.id,
                    action="product.price_changed",
                    entity_type="product",
                    entity_id=p.id,
                    old_value={"sale_price": old_price},
                    new_value={"sale_price": body.sale_price},
                )
            )
    db.flush()
    return serialize_product(db, db.get(Product, p.id) or p, viewer=user)


@router.put("/products/{product_id}")
def update_product(product_id: int, body: ProductIn, db: Session = Depends(get_db), user: User = Depends(require("product.write"))):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    return _save_product(db, body, user, existing=p)


@router.delete("/products/{product_id}")
def deactivate(product_id: int, db: Session = Depends(get_db), _: User = Depends(require("product.write"))):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    p.is_active = False
    return {"ok": True}


@router.get("/barcode/lookup/{code}")
async def barcode_lookup(code: str, db: Session = Depends(get_db), _: User = Depends(require("product.read"))):
    return await lookup_barcode(code, db)


class BarcodeIn(BaseModel):
    barcode: str
    is_primary: bool = False


@router.post("/products/{product_id}/barcodes")
def add_barcode(product_id: int, body: BarcodeIn, db: Session = Depends(get_db), _: User = Depends(require("product.write"))):
    if db.query(ProductBarcode).filter(ProductBarcode.barcode == body.barcode).first():
        raise HTTPException(409, "Mã vạch đã thuộc sản phẩm khác")
    db.add(
        ProductBarcode(
            barcode=body.barcode,
            product_id=product_id,
            is_primary=body.is_primary,
            symbology=detect_symbology(body.barcode),
        )
    )
    db.flush()
    return {"ok": True}


@router.post("/products/{product_id}/barcode/generate")
def gen_barcode(product_id: int, db: Session = Depends(get_db), _: User = Depends(require("product.write"))):
    code = generate_internal_barcode(product_id)
    if not db.query(ProductBarcode).filter(ProductBarcode.barcode == code).first():
        db.add(ProductBarcode(barcode=code, product_id=product_id, is_primary=True, source="INTERNAL", symbology="EAN13"))
    return {"barcode": code}


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    return [
        {"id": c.id, "name": c.name, "slug": c.slug, "icon": c.icon, "sort_order": c.sort_order}
        for c in db.query(Category).filter(Category.is_active.is_(True)).order_by(Category.sort_order).all()
    ]


@router.get("/brands")
def brands(db: Session = Depends(get_db)):
    return [{"id": b.id, "name": b.name} for b in db.query(Brand).all()]


@router.get("/units")
def units(db: Session = Depends(get_db)):
    return [{"id": u.id, "name": u.name, "is_base": u.is_base} for u in db.query(Unit).all()]


@router.get("/suppliers")
def suppliers(db: Session = Depends(get_db), _: User = Depends(require("inventory.read"))):
    return [
        {"id": s.id, "code": s.code, "name": s.name, "phone": s.phone, "debt": float(s.debt)}
        for s in db.query(Supplier).filter(Supplier.is_active.is_(True)).all()
    ]


class LabelsIn(BaseModel):
    product_id: int
    copies: int = 1


@router.post("/labels/print")
def labels(body: LabelsIn, db: Session = Depends(get_db), _: User = Depends(require("product.read"))):
    p = db.get(Product, body.product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    barcode = next((b.barcode for b in p.barcodes if b.is_primary), None) or (p.barcodes[0].barcode if p.barcodes else None)
    return {
        "product_id": p.id,
        "name": p.name,
        "price": float(p.sale_price),
        "barcode": barcode,
        "copies": max(1, min(body.copies, 200)),
    }
