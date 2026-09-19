from __future__ import annotations

import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.utils import utcnow
from app.database import get_db
from app.models import BankTransaction, Order, Payment
from app.services.order_service import complete_qr_order

router = APIRouter(prefix="/api/v1", tags=["webhooks"])


class BankHookIn(BaseModel):
    reference_code: str
    amount: float
    content: str
    account_number: str | None = None
    gateway: str = "MOCK"


def verify_sig(body: bytes, signature: str | None):
    if not signature:
        raise HTTPException(401, "Thiếu chữ ký webhook")
    expected = hmac.new(settings.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Chữ ký webhook không hợp lệ")


@router.post("/webhooks/bank")
async def bank_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_signature: str | None = Header(default=None, alias="X-Signature"),
):
    raw = await request.body()
    verify_sig(raw, x_signature)
    payload = json.loads(raw.decode())
    body = BankHookIn(**payload)
    if db.query(BankTransaction).filter(BankTransaction.reference_code == body.reference_code).first():
        return {"ok": True, "duplicate": True}
    tx = BankTransaction(
        gateway=body.gateway,
        reference_code=body.reference_code,
        account_number=body.account_number,
        amount=body.amount,
        content=body.content,
        transaction_date=utcnow(),
        raw=payload,
    )
    db.add(tx)
    db.flush()
    content = (body.content or "").replace(" ", "").replace("-", "").upper()
    payment = None
    for p in db.query(Payment).filter(Payment.method == "QR_BANK", Payment.status == "PENDING").all():
        order = db.get(Order, p.order_id)
        if not order:
            continue
        needle = order.code.replace("-", "").upper()
        if needle in content or order.code.upper() in (body.content or "").upper():
            if abs(float(p.amount) - float(body.amount)) < 0.01:
                payment = p
                break
    if not payment:
        return {"ok": True, "matched": False}
    order = db.get(Order, payment.order_id)
    complete_qr_order(db, order, payment)
    payment.transaction_ref = body.reference_code
    tx.matched_order_id = order.id
    tx.matched_at = utcnow()
    return {"ok": True, "matched": True, "order_code": order.code}
