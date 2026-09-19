from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.database import Base, SessionLocal, engine, ensure_schema, get_db
from app.models import StockReservation, Order, Payment
from app.realtime.hub import hub
from app.routers import auth, inventory, online, ops, orders, products, scanner, shop, webhooks
from app.services.reservation_service import ReservationService
from app.services.order_service import void_unpaid_order
from app.core.utils import utcnow

if not settings.skip_schema_sync:
    Base.metadata.create_all(bind=engine)
    ensure_schema()

app = FastAPI(title="Lâm Ly Mart API", version="1.0.0")
register_exception_handlers(app)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ảnh sản phẩm tải về từ Open Food Facts nằm ở backend/uploads/products/.
# Trên Vercel ảnh được chép vào frontend/dist/uploads và CDN phục vụ, hàm Python không cần mount.
UPLOADS = Path(__file__).resolve().parents[1] / "uploads"
if UPLOADS.is_dir():
    app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(orders.router)
app.include_router(ops.router)
app.include_router(scanner.router)
app.include_router(shop.shop)
app.include_router(online.router)
app.include_router(webhooks.router)


@app.get("/api/v1/health")
def health():
    return {"ok": True, "name": settings.app_name}


@app.post("/api/v1/tasks/release-expired")
def release_expired():
    db: Session = SessionLocal()
    try:
        holds = (
            db.query(StockReservation)
            .filter(StockReservation.status == "HELD", StockReservation.expires_at < utcnow())
            .all()
        )
        seen = set()
        for h in holds:
            if h.order_id in seen:
                continue
            seen.add(h.order_id)
            ReservationService.release(db, h.order_id)
            order = db.get(Order, h.order_id)
            if order and order.status in ("PENDING_CONFIRM", "PENDING_PAYMENT"):
                order.status = "CANCELLED"
                order.cancel_reason = "Hết hạn giữ hàng"
        expired_pays = (
            db.query(Payment)
            .filter(Payment.status == "PENDING", Payment.qr_expires_at.isnot(None), Payment.qr_expires_at < utcnow())
            .all()
        )
        for pay in expired_pays:
            pay.status = "EXPIRED"
            order = db.get(Order, pay.order_id)
            if order and order.status in ("PENDING_CONFIRM", "PENDING_PAYMENT"):
                void_unpaid_order(db, order, "QR hết hạn")
        db.commit()
        return {"released": len(seen)}
    finally:
        db.close()


@app.websocket("/api/v1/ws/staff")
async def staff_ws(ws: WebSocket):
    await hub.connect_staff(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect_staff(ws)


@app.websocket("/api/v1/ws/scanner/{session_id}")
async def scanner_ws(ws: WebSocket, session_id: str):
    await hub.connect_scanner(session_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect_scanner(session_id, ws)
