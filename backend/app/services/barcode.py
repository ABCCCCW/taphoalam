from __future__ import annotations

def ean13_check_digit(code12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code12))
    return str((10 - total % 10) % 10)


def is_valid_ean13(code: str) -> bool:
    return len(code) == 13 and code.isdigit() and code[12] == ean13_check_digit(code[:12])


def generate_internal_barcode(product_id: int) -> str:
    body = f"200{product_id:09d}"
    return body + ean13_check_digit(body)


def parse_weight_barcode(code: str) -> dict | None:
    if len(code) != 13 or not code.startswith("2") or not code.isdigit():
        return None
    kind = code[1]
    if kind not in ("1", "2"):
        return None
    item_code = code[2:7]
    raw = int(code[7:12])
    return {
        "item_code": item_code,
        "weight_kg": raw / 1000 if kind == "1" else None,
        "amount": raw if kind == "2" else None,
    }


def detect_symbology(code: str) -> str:
    if len(code) == 13 and code.isdigit():
        return "EAN13"
    if len(code) == 8 and code.isdigit():
        return "EAN8"
    if len(code) == 12 and code.isdigit():
        return "UPCA"
    if len(code) == 14 and code.isdigit():
        return "ITF14"
    return "OTHER"
