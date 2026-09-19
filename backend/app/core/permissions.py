from __future__ import annotations

from fastapi import Depends, HTTPException

from app.deps import get_current_staff

PERMISSIONS = {
    "ADMIN": {"*"},
    "CASHIER": {
        "pos.*",
        "order.read",
        "customer.*",
        "product.read",
        "inventory.read",
        "shift.own",
        "order.fulfill",
    },
    "STOCKER": {
        "product.read",
        "product.cost",
        "product.barcode.print",
        "inventory.*",
        "receipt.*",
        "stocktake.*",
        "order.fulfill",
    },
}


def require(permission: str):
    def guard(user=Depends(get_current_staff)):
        granted = PERMISSIONS.get(user.role, set())
        if "*" in granted:
            return user
        if permission in granted:
            return user
        if f"{permission.split('.')[0]}.*" in granted:
            return user
        raise HTTPException(403, "Bạn không có quyền thực hiện thao tác này")

    return guard
