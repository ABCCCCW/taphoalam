from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.permissions import require
from app.core.utils import money, next_code, parse_iso_date, utcnow
from app.database import get_db
from app.models import (
    Inventory,
    InventoryTransaction,
    Product,
    ProductBatch,
    Setting,
    StockReceipt,
    StockReceiptItem,
    StockTake,
    StockTakeItem,
    Supplier,
    User,
)
from app.services.batch_service import expiry_summary, live_lots, lot_status, serialize_lot
from app.services.inventory_service import InventoryService
from app.services.order_service import inventory_view

router = APIRouter(prefix="/api/v1", tags=["inventory"])


@router.get("/inventory")
def list_inventory(
    low_stock: bool = False,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require("inventory.read")),
):
    rows = db.query(Inventory).options(joinedload(Inventory.product)).all()
    lots = expiry_summary(db)
    nearest = lots["nearest"]
    out = []
    show_cost = user.role in ("ADMIN", "STOCKER")
    for inv in rows:
        p = inv.product
        if not p:
            continue
        if q and q.lower() not in p.name.lower() and q.lower() not in (p.name_search or ""):
            continue
        item = {
            "product_id": p.id,
            "sku": p.sku,
            "name": p.name,
            "emoji": p.emoji,
            "image_url": p.image_url,
            "sale_price": float(p.sale_price),
            "min_stock": p.min_stock,
            "quantity": float(inv.quantity),
            "reserved": float(inv.reserved),
            "available": float(inv.quantity) - float(inv.reserved),
            "low_stock": float(inv.quantity) <= p.min_stock,
            "cost_confirmed": bool(p.cost_confirmed),
            "expiry_date": nearest[p.id].isoformat() if p.id in nearest else None,
            "expiry_status": lot_status(nearest.get(p.id)),
        }
        if show_cost:
            item["cost_price"] = float(p.cost_price)
            item["value"] = money(float(inv.quantity) * float(p.cost_price))
        if low_stock and not item["low_stock"]:
            continue
        out.append(item)
    out.sort(key=lambda x: x["available"])
    return out


@router.get("/inventory/batches")
def list_batches(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("inventory.read")),
):
    today_lots = []
    for batch, product in live_lots(db):
        row = serialize_lot(batch, product)
        if status and row["status"] != status:
            continue
        today_lots.append(row)
    return today_lots


@router.post("/inventory/batches/{batch_id}/write-off")
def write_off_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require("inventory.*")),
):
    batch = db.get(ProductBatch, batch_id)
    if not batch or float(batch.quantity) <= 0:
        raise HTTPException(400, "Lô này không còn hàng trên kệ")
    inv = db.get(Inventory, (batch.product_id, batch.warehouse_id))
    available = (float(inv.quantity) - float(inv.reserved)) if inv else 0
    qty = min(float(batch.quantity), max(0, available))
    if qty <= 0:
        batch.quantity = 0
        raise HTTPException(400, "Tồn kho không còn đủ để xuống kệ lô này")
    product = db.get(Product, batch.product_id)
    InventoryService.apply(
        db,
        product_id=batch.product_id,
        warehouse_id=batch.warehouse_id,
        qty=-qty,
        type_="EXPIRED",
        ref_type="product_batch",
        ref_id=batch.id,
        user_id=user.id,
        unit_cost=float(batch.cost_price or 0),
        note=f"Xuống kệ lô hết hạn {batch.expiry_date}",
        batch_id=batch.id,
    )
    return {"ok": True, "quantity": qty, "name": product.name if product else None}


@router.get("/inventory/{product_id}/history")
def history(product_id: int, db: Session = Depends(get_db), _: User = Depends(require("inventory.read"))):
    rows = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.product_id == product_id)
        .order_by(InventoryTransaction.id.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "type": r.type,
            "channel": r.channel,
            "quantity": float(r.quantity),
            "balance_after": float(r.balance_after),
            "unit_cost": float(r.unit_cost),
            "ref_type": r.ref_type,
            "ref_id": r.ref_id,
            "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


class AdjustIn(BaseModel):
    product_id: int
    quantity: float
    type: str = "ADJUST"
    note: str


@router.post("/inventory/adjust")
def adjust(body: AdjustIn, db: Session = Depends(get_db), user: User = Depends(require("inventory.*"))):
    if body.type not in ("ADJUST", "DAMAGED", "EXPIRED", "SHRINKAGE"):
        raise HTTPException(400, "Loại điều chỉnh không hợp lệ")
    if not body.note:
        raise HTTPException(400, "Bắt buộc ghi lý do")
    InventoryService.apply(
        db,
        product_id=body.product_id,
        warehouse_id=1,
        qty=body.quantity,
        type_=body.type,
        ref_type="adjust",
        user_id=user.id,
        note=body.note,
    )
    return inventory_view(db, body.product_id)


class ReceiptItemIn(BaseModel):
    product_id: int
    quantity: float
    unit_cost: float
    batch_code: str | None = None
    expiry_date: str | None = None


class ReceiptIn(BaseModel):
    supplier_id: int | None = None
    items: list[ReceiptItemIn]
    note: str | None = None
    discount: float = 0


@router.get("/stock-receipts")
def list_receipts(db: Session = Depends(get_db), _: User = Depends(require("receipt.*"))):
    rows = db.query(StockReceipt).options(joinedload(StockReceipt.items), joinedload(StockReceipt.supplier)).order_by(StockReceipt.id.desc()).all()
    return [
        {
            "id": r.id,
            "code": r.code,
            "status": r.status,
            "supplier": r.supplier.name if r.supplier else None,
            "total_amount": float(r.total_amount),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "items": [
                {
                    "product_id": i.product_id,
                    "product_name": i.product.name if i.product else None,
                    "quantity": float(i.quantity),
                    "unit_cost": float(i.unit_cost),
                    "line_total": float(i.line_total),
                    "expiry_date": i.expiry_date.isoformat() if i.expiry_date else None,
                }
                for i in r.items
            ],
        }
        for r in rows
    ]


@router.post("/stock-receipts")
def create_receipt(body: ReceiptIn, db: Session = Depends(get_db), user: User = Depends(require("receipt.*"))):
    day = utcnow().strftime("%Y%m%d")
    seq = db.query(StockReceipt).filter(StockReceipt.code.like(f"PN{day}-%")).count() + 1
    receipt = StockReceipt(
        code=next_code("PN", seq),
        supplier_id=body.supplier_id,
        warehouse_id=1,
        discount=body.discount,
        note=body.note,
        created_by=user.id,
        status="DRAFT",
    )
    db.add(receipt)
    db.flush()
    subtotal = 0.0
    for raw in body.items:
        if raw.quantity <= 0:
            raise HTTPException(400, "Số lượng nhập phải lớn hơn 0")
        expiry = parse_iso_date(raw.expiry_date)
        if not expiry:
            raise HTTPException(400, "Mỗi dòng nhập cần hạn sử dụng — để còn biết lô nào phải xuống kệ")
        line = money(raw.quantity * raw.unit_cost)
        db.add(
            StockReceiptItem(
                receipt_id=receipt.id,
                product_id=raw.product_id,
                quantity=raw.quantity,
                unit_cost=raw.unit_cost,
                line_total=line,
                batch_code=raw.batch_code,
                expiry_date=expiry,
            )
        )
        subtotal += line
    receipt.subtotal = subtotal
    receipt.total_amount = max(0, money(subtotal - body.discount))
    db.flush()
    return {"id": receipt.id, "code": receipt.code, "status": receipt.status, "total_amount": float(receipt.total_amount)}


@router.post("/stock-receipts/{receipt_id}/confirm")
def confirm_receipt(receipt_id: int, db: Session = Depends(get_db), user: User = Depends(require("receipt.*"))):
    receipt = db.get(StockReceipt, receipt_id)
    if not receipt or receipt.status != "DRAFT":
        raise HTTPException(400, "Phiếu không hợp lệ hoặc đã xác nhận")
    if any(not item.expiry_date for item in receipt.items):
        raise HTTPException(400, "Phiếu thiếu hạn sử dụng — lập phiếu mới và ghi hạn từng lô")
    for item in receipt.items:
        product = db.get(Product, item.product_id)
        inv = db.get(Inventory, (item.product_id, receipt.warehouse_id))
        old_qty = float(inv.quantity) if inv else 0
        old_cost = float(product.cost_price)
        new_qty = old_qty + float(item.quantity)
        if new_qty > 0:
            product.cost_price = money((old_qty * old_cost + float(item.quantity) * float(item.unit_cost)) / new_qty)
        InventoryService.apply(
            db,
            product_id=item.product_id,
            warehouse_id=receipt.warehouse_id,
            qty=float(item.quantity),
            type_="IMPORT",
            ref_type="stock_receipt",
            ref_id=receipt.id,
            user_id=user.id,
            unit_cost=float(item.unit_cost),
        )
        db.add(
            ProductBatch(
                product_id=item.product_id,
                warehouse_id=receipt.warehouse_id,
                batch_code=item.batch_code or f"{receipt.code}-{item.product_id}",
                expiry_date=item.expiry_date,
                quantity=float(item.quantity),
                cost_price=float(item.unit_cost),
                receipt_id=receipt.id,
            )
        )
        if item.expiry_date:
            product.track_expiry = True
    if receipt.supplier_id:
        supplier = db.get(Supplier, receipt.supplier_id)
        if supplier:
            supplier.debt = money(float(supplier.debt) + float(receipt.total_amount) - float(receipt.paid_amount))
    receipt.status = "CONFIRMED"
    receipt.confirmed_at = utcnow()
    return {"ok": True, "code": receipt.code}


@router.post("/stock-receipts/{receipt_id}/cancel")
def cancel_receipt(receipt_id: int, db: Session = Depends(get_db), user: User = Depends(require("receipt.*"))):
    receipt = db.get(StockReceipt, receipt_id)
    if not receipt or receipt.status == "CANCELLED":
        raise HTTPException(400, "Không huỷ được phiếu này")
    if receipt.status == "CONFIRMED":
        for item in receipt.items:
            batch = (
                db.query(ProductBatch)
                .filter(ProductBatch.receipt_id == receipt.id, ProductBatch.product_id == item.product_id)
                .first()
            )
            InventoryService.apply(
                db,
                product_id=item.product_id,
                warehouse_id=receipt.warehouse_id,
                qty=-float(item.quantity),
                type_="SUPPLIER_RETURN",
                ref_type="stock_receipt",
                ref_id=receipt.id,
                user_id=user.id,
                unit_cost=float(item.unit_cost),
                note="Huỷ phiếu nhập",
                batch_id=batch.id if batch else None,
            )
    receipt.status = "CANCELLED"
    return {"ok": True}


class StockTakeIn(BaseModel):
    note: str | None = None
    items: list[dict]


@router.post("/stock-takes")
def create_take(body: StockTakeIn, db: Session = Depends(get_db), user: User = Depends(require("stocktake.*"))):
    day = utcnow().strftime("%Y%m%d")
    seq = db.query(StockTake).filter(StockTake.code.like(f"KK{day}-%")).count() + 1
    take = StockTake(code=next_code("KK", seq), warehouse_id=1, created_by=user.id, note=body.note)
    db.add(take)
    db.flush()
    for raw in body.items:
        pid = int(raw["product_id"])
        inv = db.get(Inventory, (pid, 1))
        sys_qty = float(inv.quantity) if inv else 0
        actual = float(raw.get("actual_quantity", sys_qty))
        db.add(
            StockTakeItem(
                stock_take_id=take.id,
                product_id=pid,
                system_quantity=sys_qty,
                actual_quantity=actual,
                reason=raw.get("reason"),
            )
        )
    return {"id": take.id, "code": take.code}


@router.get("/stock-takes")
def list_takes(db: Session = Depends(get_db), _: User = Depends(require("stocktake.*"))):
    rows = db.query(StockTake).options(joinedload(StockTake.items)).order_by(StockTake.id.desc()).all()
    return [
        {
            "id": t.id,
            "code": t.code,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "items": [
                {
                    "product_id": i.product_id,
                    "name": i.product.name if i.product else None,
                    "system_quantity": float(i.system_quantity),
                    "actual_quantity": float(i.actual_quantity),
                    "diff": float(i.actual_quantity) - float(i.system_quantity),
                    "reason": i.reason,
                }
                for i in t.items
            ],
        }
        for t in rows
    ]


@router.put("/stock-takes/{take_id}/items")
def update_take_items(take_id: int, body: list[dict], db: Session = Depends(get_db), _: User = Depends(require("stocktake.*"))):
    take = db.get(StockTake, take_id)
    if not take or take.status != "DRAFT":
        raise HTTPException(400, "Phiếu đã cân bằng")
    by_pid = {i.product_id: i for i in take.items}
    for raw in body:
        item = by_pid.get(int(raw["product_id"]))
        if item:
            item.actual_quantity = float(raw["actual_quantity"])
            item.reason = raw.get("reason")
    return {"ok": True}


@router.post("/stock-takes/{take_id}/balance")
def balance_take(take_id: int, db: Session = Depends(get_db), user: User = Depends(require("stocktake.*"))):
    if user.role not in ("ADMIN",):
        raise HTTPException(403, "Chỉ quản trị được cân bằng kho")
    take = db.get(StockTake, take_id)
    if not take or take.status != "DRAFT":
        raise HTTPException(400, "Không cân bằng được")
    total_diff = 0.0
    for item in take.items:
        diff = float(item.actual_quantity) - float(item.system_quantity)
        if diff == 0:
            continue
        product = db.get(Product, item.product_id)
        InventoryService.apply(
            db,
            product_id=item.product_id,
            warehouse_id=take.warehouse_id,
            qty=diff,
            type_="ADJUST",
            ref_type="stock_take",
            ref_id=take.id,
            user_id=user.id,
            note=item.reason or "Cân bằng kiểm kê",
        )
        total_diff += diff * float(product.cost_price)
    take.status = "BALANCED"
    take.balanced_at = utcnow()
    take.total_diff_value = money(total_diff)
    return {"ok": True, "total_diff_value": float(take.total_diff_value)}
