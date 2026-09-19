from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.paging import clamp_page, page_meta
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
    ProductBatch,
    ProductUnit,
    Setting,
    Supplier,
    Unit,
    User,
)
from app.services.batch_service import (
    days_until,
    expired_on_shelf_ids,
    find_lot,
    give_lot_barcode,
    lot_label,
    lot_status,
    suggest_expiry,
)
from app.services.promo_service import near_expiry_info, near_expiry_promo
from app.services.barcode import detect_symbology, generate_internal_barcode
from app.services.barcode_lookup import lookup as lookup_barcode
from app.services.inventory_service import InventoryService
from app.services.order_service import find_by_barcode, inventory_view

router = APIRouter(prefix="/api/v1", tags=["catalog"])


def _show_cost(viewer: User | None) -> bool:
    return bool(viewer and viewer.role in ("ADMIN", "STOCKER"))


_UNSET = object()


def serialize_product(db: Session, p: Product, warehouse_id: int = 1, viewer: User | None = None, near_promo=_UNSET):
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
        "base_unit_id": p.base_unit_id,
        "unit": (db.get(Unit, p.base_unit_id).name if p.base_unit_id and db.get(Unit, p.base_unit_id) else None),
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
        "next_lot": _next_lot(db, p.id, warehouse_id),
        "near_expiry": near_expiry_info(db, p.id, near_promo if near_promo is not _UNSET else near_expiry_promo(db), warehouse_id),
    }
    if _show_cost(viewer):
        data["cost_price"] = float(p.cost_price)
    return data


def _next_lot(db: Session, product_id: int, warehouse_id: int = 1) -> dict | None:
    """Lô còn hàng hết hạn sớm nhất — lô sẽ bán ra trước, NSX/HSD của nó là thứ cần nhìn."""
    b = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == product_id,
            ProductBatch.warehouse_id == warehouse_id,
            ProductBatch.quantity > 0,
            ProductBatch.expiry_date.isnot(None),
        )
        .order_by(ProductBatch.expiry_date)
        .first()
    )
    if not b:
        return None
    return {
        "id": b.id,
        "barcode": b.barcode,
        "mfg_date": b.mfg_date.isoformat() if b.mfg_date else None,
        "expiry_date": b.expiry_date.isoformat(),
        "days": days_until(b.expiry_date),
        "status": lot_status(b.expiry_date),
        "quantity": float(b.quantity),
    }


class ShelfLotIn(BaseModel):
    mfg_date: str | None = None
    expiry_date: str
    # Chỉ dùng khi kho đang trống: số hàng có sẵn trong tay, tạo thành lô đầu tiên.
    quantity: float | None = None


@router.put("/products/{product_id}/shelf-lot")
def set_shelf_lot(product_id: int, body: ShelfLotIn, db: Session = Depends(get_db), user: User = Depends(require("product.write"))):
    """Ghi NSX / HSD cho hàng đang có trên kệ ngay từ form sửa mặt hàng.

    Hàng tạo ở quầy, hàng chốt giá vốn, tồn đầu kỳ… vào kho không qua phiếu nhập nên
    chưa có lô mang hạn dùng. Có lô rồi thì sửa lô bán ra trước; chưa có thì gom phần
    tồn chưa thuộc lô nào thành một lô mới.
    """
    from app.core.utils import parse_iso_date, utcnow

    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    exp = parse_iso_date(body.expiry_date)
    mfg = parse_iso_date(body.mfg_date) if body.mfg_date else None
    if not exp:
        raise HTTPException(400, "Cần hạn sử dụng")
    if mfg and mfg > utcnow().date():
        raise HTTPException(400, "Ngày sản xuất không thể sau hôm nay")
    if mfg and mfg >= exp:
        raise HTTPException(400, "Ngày sản xuất phải trước hạn sử dụng")

    inv = db.get(Inventory, (p.id, 1))
    on_hand = float(inv.quantity) if inv else 0.0
    if on_hand <= 0 and body.quantity and body.quantity > 0:
        InventoryService.apply(
            db,
            product_id=p.id,
            warehouse_id=1,
            qty=float(body.quantity),
            type_="IMPORT",
            ref_type="opening",
            user_id=user.id,
            unit_cost=float(p.cost_price),
            note="Tồn có sẵn khi tạo mặt hàng",
        )
        on_hand = float(body.quantity)
    if on_hand <= 0:
        raise HTTPException(400, "Kho chưa có hàng này — ghi hạn khi lập phiếu Nhập hàng")

    lots = (
        db.query(ProductBatch)
        .filter(ProductBatch.product_id == p.id, ProductBatch.warehouse_id == 1, ProductBatch.quantity > 0)
        .order_by(ProductBatch.expiry_date.is_(None), ProductBatch.expiry_date)
        .all()
    )
    in_lots = sum(float(b.quantity) for b in lots)
    loose = round(on_hand - in_lots, 3)
    if lots and loose <= 0:
        lot = lots[0]
        lot.expiry_date, lot.mfg_date = exp, mfg
    else:
        lot = ProductBatch(
            product_id=p.id,
            warehouse_id=1,
            batch_code=f"TAY-{p.id}-{utcnow():%y%m%d%H%M}",
            mfg_date=mfg,
            expiry_date=exp,
            quantity=loose if lots else on_hand,
            cost_price=float(p.cost_price),
        )
        db.add(lot)
    give_lot_barcode(db, lot)
    p.track_expiry = True
    db.flush()
    return {"next_lot": _next_lot(db, p.id), "label": lot_label(lot, p)}


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "products"
MAX_IMAGE = 5 * 1024 * 1024


@router.post("/products/{product_id}/image")
async def upload_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require("product.write")),
):
    """Ảnh sản phẩm: chụp bằng camera điện thoại hoặc chọn ảnh có sẵn."""
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy sản phẩm")
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Chỉ nhận ảnh JPG, PNG hoặc WEBP")
    data = await file.read()
    if len(data) > MAX_IMAGE:
        raise HTTPException(400, "Ảnh quá 5 MB — chụp lại hoặc chọn ảnh nhỏ hơn")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"p{p.id}-{uuid.uuid4().hex[:10]}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    old = p.image_url
    p.image_url = f"/uploads/products/{name}"
    _drop_product_image(db, old, keep_id=p.id)
    return {"image_url": p.image_url}


def _drop_product_image(db: Session, url: str | None, keep_id: int) -> None:
    """Xoá file ảnh cũ trên đĩa khi đã thay — không đụng nếu mặt hàng khác còn dùng."""
    if not url or not url.startswith("/uploads/products/"):
        return
    still = db.query(Product).filter(Product.image_url == url, Product.id != keep_id).first()
    if still:
        return
    prev = (UPLOAD_DIR / Path(url).name).resolve()
    if prev.parent == UPLOAD_DIR.resolve() and prev.is_file():
        prev.unlink()


def _product_scope(db: Session, q: str | None, category_id: int | None, is_active: bool | None):
    query = db.query(Product)
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if q:
        folded = fold(q)
        cond = (Product.name.ilike(f"%{q}%")) | (Product.name_search.ilike(f"%{folded}%")) | (Product.sku.ilike(f"%{q}%"))
        code = q.strip()
        if code.isdigit() and len(code) >= 6:
            # Gõ / quét mã: khớp mã nhà sản xuất hoặc mã tem lô của hệ thống.
            by_code = {r[0] for r in db.query(ProductBarcode.product_id).filter(ProductBarcode.barcode.like(f"{code}%"))}
            by_code |= {r[0] for r in db.query(ProductBatch.product_id).filter(ProductBatch.barcode.like(f"{code}%"))}
            if by_code:
                cond = cond | Product.id.in_(by_code)
        query = query.filter(cond)
    return query


def _product_kind(query, kind: str):
    if kind == "online":
        return query.filter(Product.is_online.is_(True))
    if kind == "cost":
        return query.filter(Product.cost_confirmed.is_(False))
    if kind == "low":
        return query.outerjoin(Inventory, (Inventory.product_id == Product.id) & (Inventory.warehouse_id == 1)).filter(
            func.coalesce(Inventory.quantity, 0) <= Product.min_stock
        )
    return query


@router.get("/products")
def list_products(
    q: str | None = None,
    category_id: int | None = None,
    is_active: bool | None = True,
    low_stock: bool = False,
    filter: str | None = None,
    hide_expired: bool = False,
    page: int = 1,
    size: int = 10,
    db: Session = Depends(get_db),
    user: User = Depends(require("product.read")),
):
    page, size = clamp_page(page, size)
    kind = filter if filter in {"all", "online", "low", "cost"} else ("low" if low_stock else "all")

    # Màn Hàng hoá bỏ hàng đang có lô quá hạn — những món đó nằm ở Tổng quan → Hết hạn.
    blocked = expired_on_shelf_ids(db) if hide_expired else set()

    def scoped():
        query = _product_scope(db, q, category_id, is_active)
        return query.filter(Product.id.notin_(blocked)) if blocked else query

    counts = {
        "all": _product_kind(scoped(), "all").count(),
        "online": _product_kind(scoped(), "online").count(),
        "low": _product_kind(scoped(), "low").count(),
        "cost": _product_kind(scoped(), "cost").count(),
    }
    filtered = _product_kind(scoped(), kind)
    total = filtered.count()
    meta = page_meta(page, size, total)
    ids = [
        row[0]
        for row in filtered.with_entities(Product.id)
        .order_by(Product.name)
        .offset((meta["page"] - 1) * size)
        .limit(size)
        .all()
    ]
    loaded = (
        db.query(Product)
        .options(
            joinedload(Product.category),
            joinedload(Product.brand),
            joinedload(Product.barcodes),
            joinedload(Product.units).joinedload(ProductUnit.unit),
        )
        .filter(Product.id.in_(ids))
        .all()
        if ids
        else []
    )
    by_id = {p.id: p for p in loaded}
    near_promo = near_expiry_promo(db)
    out = [serialize_product(db, by_id[i], viewer=user, near_promo=near_promo) for i in ids if i in by_id]
    return {"items": out, "counts": counts, **meta}


@router.get("/products/barcode/{code}")
def get_by_barcode(code: str, db: Session = Depends(get_db), user: User = Depends(require("product.read"))):
    product, weight = find_by_barcode(db, code)
    if not product:
        from app.core.exceptions import AppError

        raise AppError("BARCODE_UNKNOWN", "Mã chưa có trong hệ thống", 404, {"can_create": True, "barcode": code})
    data = serialize_product(db, product, viewer=user)
    lot = find_lot(db, code)
    if lot:
        # Quét tem lô: hạn dùng là của chính lô này, không phải lô bán ra trước.
        data["scanned_lot"] = {
            "id": lot.id,
            "barcode": lot.barcode,
            "expiry_date": lot.expiry_date.isoformat() if lot.expiry_date else None,
            "days": days_until(lot.expiry_date),
            "status": lot_status(lot.expiry_date),
            "quantity": float(lot.quantity),
        }
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
    # Kiểu bán suy ra từ đơn vị: bán theo kg là hàng cân, còn lại đếm theo cái/lon/gói…
    unit = db.get(Unit, body.base_unit_id)
    by_weight = bool(unit and unit.name.strip().lower() in WEIGHT_UNITS)
    if by_weight:
        body.product_type = body.product_type if body.product_type in ("WEIGHTED", "BULK") else "WEIGHTED"
    else:
        body.product_type = "STANDARD"
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
        # Sửa hàng: đổi mã vạch chính nếu người dùng gõ mã khác; hàng cũ chưa có mã thì
        # tự cấp mã nội bộ để món nào cũng in được tem dán kệ.
        code = (body.barcode or "").strip()
        current = next((b for b in p.barcodes if b.is_primary), None) or (p.barcodes[0] if p.barcodes else None)
        if not code and not current:
            code = generate_internal_barcode(p.id)
        if code and (not current or current.barcode != code):
            taken = db.query(ProductBarcode).filter(ProductBarcode.barcode == code).first()
            if taken and taken.product_id != p.id:
                raise HTTPException(409, "Mã này đã gắn cho mặt hàng khác")
            for b in p.barcodes:
                b.is_primary = False
            if taken:
                taken.is_primary = True
            else:
                db.add(
                    ProductBarcode(
                        barcode=code,
                        product_id=p.id,
                        symbology=detect_symbology(code),
                        is_primary=True,
                        source="INTERNAL" if code.startswith("2") else "MANUFACTURER",
                    )
                )
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


WEIGHT_UNITS = {"kg", "g", "gam", "lạng"}


@router.get("/units")
def units(db: Session = Depends(get_db)):
    return [
        {"id": u.id, "name": u.name, "is_base": u.is_base, "by_weight": u.name.strip().lower() in WEIGHT_UNITS}
        for u in db.query(Unit).order_by(Unit.id).all()
    ]


@router.get("/suppliers")
def suppliers(db: Session = Depends(get_db), _: User = Depends(require("inventory.read"))):
    return [
        {"id": s.id, "code": s.code, "name": s.name, "phone": s.phone, "debt": float(s.debt)}
        for s in db.query(Supplier).filter(Supplier.is_active.is_(True)).all()
    ]


class SupplierIn(BaseModel):
    name: str
    phone: str | None = None
    address: str | None = None


@router.post("/suppliers")
def create_supplier(body: SupplierIn, db: Session = Depends(get_db), _: User = Depends(require("inventory.*"))):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Cần tên nhà cung cấp")
    if any(fold(s.name) == fold(name) for s in db.query(Supplier).filter(Supplier.is_active.is_(True)).all()):
        raise HTTPException(409, "Nhà cung cấp này đã có trong danh sách")
    phone = (body.phone or "").replace(" ", "") or None
    # Lấy số lớn nhất đang dùng chứ không đếm dòng — mã cũ có thể nhảy cóc (NCC022).
    nums = [int(c[3:]) for (c,) in db.query(Supplier.code).filter(Supplier.code.like("NCC%")) if c[3:].isdigit()]
    s = Supplier(code=f"NCC{max(nums, default=0) + 1:03d}", name=name, phone=phone, address=(body.address or "").strip() or None)
    db.add(s)
    db.flush()
    return {"id": s.id, "code": s.code, "name": s.name, "phone": s.phone, "debt": 0.0}


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
