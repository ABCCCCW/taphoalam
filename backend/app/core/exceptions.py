from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


class InsufficientStock(AppError):
    def __init__(self, product_id: int, available: float | None = None, name: str | None = None):
        who = (name or "").strip()
        if available is None:
            msg = f"{who} không đủ tồn để bán" if who else "Không đủ tồn kho để bán"
        elif float(available) <= 0:
            msg = f"{who} hết trên kệ rồi" if who else "Không đủ tồn kho để bán — kệ hết rồi"
        else:
            n = int(available) if float(available) == int(available) else available
            prefix = who or "Hàng này"
            msg = f"{prefix} không đủ tồn — kệ còn {n}"
        super().__init__(
            "INSUFFICIENT_STOCK",
            msg,
            409,
            {"product_id": product_id, "available": available, "name": who or None},
        )


def register_exception_handlers(app):
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status,
            content={"code": exc.code, "message": exc.message, "details": exc.details},
        )
