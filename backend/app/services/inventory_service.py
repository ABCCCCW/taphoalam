from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import InsufficientStock
from app.core.utils import utcnow
from app.models import Inventory, InventoryTransaction, Product, ProductBatch


LOW_STOCK_RATIO = 0.2


def low_stock_threshold(on_hand_after_import: float) -> int:
    """20% số tồn lúc vừa nhập, làm tròn lên; nhập ít (1–4 món) thì ngưỡng là 1."""
    import math

    return max(1, math.ceil(on_hand_after_import * LOW_STOCK_RATIO)) if on_hand_after_import > 0 else 0


class InventoryService:
    @staticmethod
    def ensure_row(db: Session, product_id: int, warehouse_id: int) -> None:
        row = db.get(Inventory, (product_id, warehouse_id))
        if not row:
            db.add(Inventory(product_id=product_id, warehouse_id=warehouse_id, quantity=0, reserved=0))
            db.flush()

    @staticmethod
    def apply(
        db: Session,
        *,
        product_id: int,
        warehouse_id: int,
        qty: float,
        type_: str,
        ref_type: str | None = None,
        ref_id: int | None = None,
        user_id: int | None = None,
        unit_cost: float = 0,
        channel: str | None = None,
        note: str | None = None,
        consume_reserved: float = 0,
        batch_id: int | None = None,
    ) -> float:
        """Cửa duy nhất thay đổi tồn. qty dương = nhập, âm = xuất."""
        InventoryService.ensure_row(db, product_id, warehouse_id)

        if consume_reserved:
            res = db.execute(
                text(
                    """
                    UPDATE inventory
                       SET quantity = quantity + :qty,
                           reserved = reserved - :res
                     WHERE product_id = :pid AND warehouse_id = :wid
                       AND quantity + :qty >= 0
                       AND reserved >= :res
                    """
                ),
                {"qty": qty, "res": consume_reserved, "pid": product_id, "wid": warehouse_id},
            )
        elif qty < 0:
            res = db.execute(
                text(
                    """
                    UPDATE inventory
                       SET quantity = quantity + :qty
                     WHERE product_id = :pid AND warehouse_id = :wid
                       AND (quantity - reserved) + :qty >= 0
                    """
                ),
                {"qty": qty, "pid": product_id, "wid": warehouse_id},
            )
        else:
            res = db.execute(
                text(
                    """
                    UPDATE inventory
                       SET quantity = quantity + :qty
                     WHERE product_id = :pid AND warehouse_id = :wid
                    """
                ),
                {"qty": qty, "pid": product_id, "wid": warehouse_id},
            )

        if res.rowcount == 0:
            inv = db.get(Inventory, (product_id, warehouse_id))
            available = float(inv.quantity) - float(inv.reserved) if inv else 0
            prod = db.get(Product, product_id)
            raise InsufficientStock(product_id, available, name=prod.name if prod else None)

        if qty < 0:
            InventoryService.consume_batches(
                db,
                product_id=product_id,
                warehouse_id=warehouse_id,
                qty=-qty,
                batch_id=batch_id,
            )

        inv = db.get(Inventory, (product_id, warehouse_id))
        if inv is not None:
            db.expire(inv)

        balance = db.execute(
            text("SELECT quantity FROM inventory WHERE product_id=:pid AND warehouse_id=:wid"),
            {"pid": product_id, "wid": warehouse_id},
        ).scalar()

        db.add(
            InventoryTransaction(
                product_id=product_id,
                warehouse_id=warehouse_id,
                type=type_,
                channel=channel,
                quantity=qty,
                balance_after=balance,
                unit_cost=unit_cost,
                ref_type=ref_type,
                ref_id=ref_id,
                note=note,
                created_by=user_id,
                created_at=utcnow(),
            )
        )
        if type_ == "IMPORT" and qty > 0:
            # Ngưỡng "sắp hết" tự đặt theo lần nhập gần nhất: còn dưới 20% số tồn ngay
            # sau khi nhập là cảnh báo — người dùng không phải tự điền mức tồn tối thiểu.
            prod = db.get(Product, product_id)
            if prod is not None:
                prod.min_stock = low_stock_threshold(float(balance))
        return float(balance)

    @staticmethod
    def cover_unconfirmed(
        db: Session,
        *,
        product: Product,
        warehouse_id: int,
        need: float,
        user_id: int | None = None,
        channel: str | None = None,
        note: str | None = None,
    ) -> float:
        """Hàng ngoài quầy (chưa chốt giá vốn): ghi FOUND phần thiếu để bán được món đang cầm."""
        if not product or product.cost_confirmed:
            row = db.execute(
                text("SELECT quantity - reserved FROM inventory WHERE product_id=:pid AND warehouse_id=:wid"),
                {"pid": product.id, "wid": warehouse_id},
            ).scalar() if product else 0
            return float(row or 0)
        InventoryService.ensure_row(db, product.id, warehouse_id)
        have = db.execute(
            text("SELECT quantity - reserved FROM inventory WHERE product_id=:pid AND warehouse_id=:wid"),
            {"pid": product.id, "wid": warehouse_id},
        ).scalar()
        gap = float(need) - float(have or 0)
        if gap <= 0:
            return float(have or 0)
        return InventoryService.apply(
            db,
            product_id=product.id,
            warehouse_id=warehouse_id,
            qty=gap,
            type_="FOUND",
            ref_type="product",
            ref_id=product.id,
            user_id=user_id,
            channel=channel,
            note=note or "Hàng ngoài quầy — ghi số đang cầm",
        )

    @staticmethod
    def consume_batches(
        db: Session,
        *,
        product_id: int,
        warehouse_id: int,
        qty: float,
        batch_id: int | None = None,
    ) -> None:
        """Trừ lô khi xuất kho. Ưu tiên lô chỉ định, còn lại lấy hạn gần nhất trước."""
        left = float(qty)
        if left <= 0:
            return
        if batch_id:
            chosen = db.get(ProductBatch, batch_id)
            if chosen and chosen.product_id == product_id and float(chosen.quantity) > 0:
                take = min(float(chosen.quantity), left)
                chosen.quantity = float(chosen.quantity) - take
                left -= take
        if left <= 0:
            return
        rows = (
            db.query(ProductBatch)
            .filter(
                ProductBatch.product_id == product_id,
                ProductBatch.warehouse_id == warehouse_id,
                ProductBatch.quantity > 0,
            )
            .order_by(ProductBatch.expiry_date.is_(None), ProductBatch.expiry_date.asc(), ProductBatch.id.asc())
            .all()
        )
        for batch in rows:
            if left <= 0:
                break
            if batch_id and batch.id == batch_id:
                continue
            take = min(float(batch.quantity), left)
            batch.quantity = float(batch.quantity) - take
            left -= take
