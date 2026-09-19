"""Phí giao hàng theo khoảng cách từ tiệm tới địa chỉ khách.

Quy tắc mặc định (sửa được trong bảng settings):
- trong ``ship.free_km`` (2 km): miễn phí;
- quá 2 km: ``ship.base_fee`` (20.000đ), rồi mỗi km trọn thêm cộng ``ship.per_km`` (5.000đ).
  Ví dụ 2,5 km → 20.000đ · 3 km → 25.000đ · 4,2 km → 30.000đ.

Khoảng cách là đường chim bay giữa hai toạ độ, không phải đường đi thực tế.
Địa chỉ chưa có toạ độ thì tính mức khởi điểm và báo là chưa định vị.
"""
from __future__ import annotations

import math

from sqlalchemy.orm import Session

from app.models import Setting

# Toạ độ Cầu Diễn, Bắc Từ Liêm — dùng khi chưa cấu hình store.lat / store.lng.
DEFAULT_STORE = (21.0394, 105.7647)
DEFAULTS = {"ship.free_km": 2.0, "ship.base_fee": 20000.0, "ship.per_km": 5000.0}


def _num(db: Session, key: str, fallback: float) -> float:
    row = db.get(Setting, key)
    try:
        return float(row.value) if row and row.value not in (None, "") else fallback
    except ValueError:
        return fallback


def rule(db: Session) -> dict:
    return {
        "free_km": _num(db, "ship.free_km", DEFAULTS["ship.free_km"]),
        "base_fee": _num(db, "ship.base_fee", DEFAULTS["ship.base_fee"]),
        "per_km": _num(db, "ship.per_km", DEFAULTS["ship.per_km"]),
        "store_lat": _num(db, "store.lat", DEFAULT_STORE[0]),
        "store_lng": _num(db, "store.lng", DEFAULT_STORE[1]),
    }


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fee_for_km(km: float, r: dict) -> float:
    if km <= r["free_km"]:
        return 0.0
    return r["base_fee"] + r["per_km"] * math.floor(km - r["free_km"])


def quote(db: Session, lat: float | None, lng: float | None) -> dict:
    r = rule(db)
    if lat is None or lng is None:
        return {"located": False, "distance_km": None, "fee": r["base_fee"]}
    km = round(haversine_km(r["store_lat"], r["store_lng"], lat, lng), 2)
    return {"located": True, "distance_km": km, "fee": fee_for_km(km, r)}
