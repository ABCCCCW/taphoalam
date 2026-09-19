from __future__ import annotations

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import InsufficientStock
from app.core.utils import utcnow
from app.models import Inventory, Product, StockReservation
from app.services.inventory_service import InventoryService


class ReservationService:
    @staticmethod
    def reserve(db: Session, *, order_id: int, product_id: int, warehouse_id: int, qty: float, ttl_minutes: int):
        InventoryService.ensure_row(db, product_id, warehouse_id)
        res = db.execute(
            text(
                """
                UPDATE inventory SET reserved = reserved + :qty
                 WHERE product_id = :pid AND warehouse_id = :wid
                   AND quantity - reserved >= :qty
                """
            ),
            {"qty": qty, "pid": product_id, "wid": warehouse_id},
        )
        if res.rowcount == 0:
            inv = db.get(Inventory, (product_id, warehouse_id))
            available = float(inv.quantity - inv.reserved) if inv else 0
            prod = db.get(Product, product_id)
            raise InsufficientStock(product_id, available, name=prod.name if prod else None)
        db.add(
            StockReservation(
                order_id=order_id,
                product_id=product_id,
                warehouse_id=warehouse_id,
                quantity=qty,
                status="HELD",
                expires_at=utcnow() + timedelta(minutes=ttl_minutes),
            )
        )

    @staticmethod
    def release(db: Session, order_id: int):
        holds = (
            db.query(StockReservation)
            .filter(StockReservation.order_id == order_id, StockReservation.status == "HELD")
            .all()
        )
        for hold in holds:
            db.execute(
                text(
                    """
                    UPDATE inventory SET reserved = reserved - :qty
                     WHERE product_id = :pid AND warehouse_id = :wid
                       AND reserved >= :qty
                    """
                ),
                {"qty": float(hold.quantity), "pid": hold.product_id, "wid": hold.warehouse_id},
            )
            hold.status = "RELEASED"

    @staticmethod
    def consume(db: Session, order_id: int, user_id: int | None, channel: str = "ONLINE"):
        holds = (
            db.query(StockReservation)
            .filter(StockReservation.order_id == order_id, StockReservation.status == "HELD")
            .all()
        )
        for hold in holds:
            InventoryService.apply(
                db,
                product_id=hold.product_id,
                warehouse_id=hold.warehouse_id,
                qty=-float(hold.quantity),
                type_="SALE",
                ref_type="order",
                ref_id=order_id,
                user_id=user_id,
                channel=channel,
                consume_reserved=float(hold.quantity),
            )
            hold.status = "CONSUMED"
