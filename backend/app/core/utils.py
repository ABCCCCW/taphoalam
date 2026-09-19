from __future__ import annotations

import unicodedata
from datetime import date, datetime, timedelta, timezone


def fold(text: str | None) -> str:
    if not text:
        return ""
    nfd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").lower()


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def shop_today() -> date:
    """Ngày dương lịch ở Hà Nội — hạn dùng so với đây, không phải UTC."""
    return (utcnow() + timedelta(hours=7)).date()


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def next_code(prefix: str, seq: int, width: int = 4) -> str:
    day = utcnow().strftime("%Y%m%d")
    return f"{prefix}{day}-{seq:0{width}d}"


def money(value) -> float:
    return round(float(value or 0), 2)


def qty(value) -> float:
    return round(float(value or 0), 3)
