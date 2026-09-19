from __future__ import annotations

import random
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_current_staff
from app.core.utils import utcnow
from app.database import SessionLocal, get_db
from app.models import ScannerEvent, ScannerSession, User
from app.realtime.hub import hub
from app.routers.products import serialize_product
from app.services.order_service import find_by_barcode
from app.services.vietqr import qr_data_uri

router = APIRouter(prefix="/api/v1/scanner", tags=["scanner"])


class SessionIn(BaseModel):
    origin: str | None = None


@router.post("/sessions")
def create_session(body: SessionIn = SessionIn(), db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    code = f"{random.randint(0, 999999):06d}"
    sid = str(uuid.uuid4())
    row = ScannerSession(
        id=sid,
        pair_code=code,
        user_id=user.id,
        status="WAITING",
        expires_at=utcnow() + timedelta(hours=8),
    )
    db.add(row)
    db.flush()
    origin = (body.origin or "").rstrip("/")
    if origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1"):
        origin = ""
    join_url = f"{origin}/scan?code={code}" if origin else f"/scan?code={code}"
    payload = join_url if origin else f"http://SCAN/{code}"
    return {
        "id": sid,
        "pair_code": code,
        "qr_image": qr_data_uri(payload) if origin else None,
        "join_url": join_url,
        "expires_at": row.expires_at.isoformat(),
    }


class JoinIn(BaseModel):
    pair_code: str
    device_label: str | None = "Điện thoại"


class QrIn(BaseModel):
    url: str


@router.post("/qr")
def make_qr(body: QrIn, _: User = Depends(get_current_staff)):
    url = (body.url or "").strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(400, "URL không hợp lệ")
    if "localhost" in url or "127.0.0.1" in url:
        raise HTTPException(400, "Không tạo QR localhost — điện thoại không mở được")
    return {"qr_image": qr_data_uri(url)}


@router.get("/current")
def current_session(db: Session = Depends(get_db), user: User = Depends(get_current_staff)):
    """Phiên ghép còn hạn gần nhất của nhân viên này.

    Trang Quầy tải lại (hay mở trên trình duyệt khác) sẽ quên phiên, trong khi điện
    thoại vẫn giữ phiên đó và gửi mã lên; quầy hỏi ở đây để tự nghe lại, khỏi ghép lại.
    """
    row = (
        db.query(ScannerSession)
        .filter(
            ScannerSession.user_id == user.id,
            ScannerSession.status.in_(["WAITING", "ACTIVE"]),
            ScannerSession.expires_at > utcnow(),
        )
        .order_by((ScannerSession.status == "ACTIVE").desc(), ScannerSession.created_at.desc())
        .first()
    )
    if not row:
        return None
    return {"id": row.id, "pair_code": row.pair_code, "status": row.status, "device_label": row.device_label}


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_staff)):
    row = db.get(ScannerSession, session_id)
    if not row:
        raise HTTPException(404, "Phiên không tồn tại")
    return {
        "id": row.id,
        "pair_code": row.pair_code,
        "status": row.status,
        "device_label": row.device_label,
        "scan_count": row.scan_count,
    }


@router.post("/sessions/join")
async def join_session(body: JoinIn, db: Session = Depends(get_db)):
    raw = (body.pair_code or "").strip()
    if "code=" in raw:
        raw = raw.split("code=")[-1]
    if ":" in raw:
        raw = raw.split(":")[-1]
    code = "".join(ch for ch in raw if ch.isdigit())[:6]
    row = (
        db.query(ScannerSession)
        .filter(ScannerSession.pair_code == code, ScannerSession.status.in_(["WAITING", "ACTIVE"]))
        .order_by(ScannerSession.created_at.desc())
        .first()
    )
    if not row or row.expires_at < utcnow():
        raise HTTPException(404, "Mã ghép cặp không đúng hoặc đã hết hạn")
    row.status = "ACTIVE"
    row.device_label = body.device_label
    db.add(ScannerEvent(session_id=row.id, type="paired", payload={"device_label": row.device_label}))
    db.flush()
    await hub.push_json(row.id, {"type": "paired", "device_label": row.device_label})
    return {"id": row.id, "mode": row.mode, "status": row.status}


class ScanIn(BaseModel):
    barcode: str


@router.post("/sessions/{session_id}/scan")
async def push_scan(session_id: str, body: ScanIn, db: Session = Depends(get_db)):
    row = db.get(ScannerSession, session_id)
    if not row or row.status not in ("WAITING", "ACTIVE"):
        raise HTTPException(404, "Phiên không tồn tại")
    row.scan_count += 1
    row.status = "ACTIVE"
    product, weight = find_by_barcode(db, body.barcode)
    payload = serialize_product(db, product) if product else None
    if payload and weight:
        payload["weight_kg"] = weight.get("weight_kg")
        payload["suggested_qty"] = weight.get("weight_kg")
    # Mã vào hàng đợi trong DB; quầy lấy qua /events (chạy được cả trên serverless).
    db.add(ScannerEvent(session_id=session_id, type="scan", barcode=body.barcode, payload=payload))
    db.flush()
    await hub.push_scan(session_id, body.barcode, payload)
    return {"ok": True, "product": payload, "unknown": product is None, "delivered": True}


@router.get("/sessions/{session_id}/events")
def session_events(
    session_id: str,
    after: int = -1,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
):
    """Sự kiện mới sau id `after`. after<0 chỉ trả con trỏ hiện tại để quầy không nhận lại mã cũ."""
    q = db.query(ScannerEvent).filter(ScannerEvent.session_id == session_id)
    if after < 0:
        last = q.order_by(ScannerEvent.id.desc()).first()
        return {"cursor": last.id if last else 0, "events": []}
    rows = q.filter(ScannerEvent.id > after).order_by(ScannerEvent.id).limit(50).all()
    return {
        "cursor": rows[-1].id if rows else after,
        "events": [
            {"id": r.id, "type": r.type, "barcode": r.barcode, "product": r.payload, "device_label": (r.payload or {}).get("device_label") if r.type == "paired" else None}
            for r in rows
        ],
    }


@router.delete("/sessions/{session_id}")
def close_session(session_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_staff)):
    row = db.get(ScannerSession, session_id)
    if row:
        row.status = "EXPIRED"
    return {"ok": True}


@router.websocket("/ws/{session_id}")
async def scanner_ws(websocket: WebSocket, session_id: str):
    await hub.connect_scanner(session_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect_scanner(session_id, websocket)
