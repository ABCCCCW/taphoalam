from __future__ import annotations

GS1_COUNTRY = {
    "893": "Việt Nam",
    "880": "Hàn Quốc",
    "885": "Thái Lan",
    "690": "Trung Quốc",
    "691": "Trung Quốc",
    "692": "Trung Quốc",
    "899": "Indonesia",
    "955": "Malaysia",
    "471": "Đài Loan",
    "489": "Hồng Kông",
    "450": "Nhật Bản",
    "490": "Nhật Bản",
}


async def lookup(barcode: str, db) -> dict:
    from app.models import BarcodeLookupCache

    cached = db.get(BarcodeLookupCache, barcode)
    if cached:
        return cached.payload

    result = {
        "barcode": barcode,
        "country": GS1_COUNTRY.get(barcode[:3]),
        "name": None,
        "brand": None,
        "image_url": None,
        "quantity": None,
        "source": "offline",
    }

    try:
        import httpx

        url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
        async with httpx.AsyncClient(timeout=4) as client:
            data = (await client.get(url)).json()
        if data.get("status") == 1:
            p = data.get("product") or {}
            result.update(
                {
                    "name": p.get("product_name") or p.get("product_name_en"),
                    "brand": p.get("brands"),
                    "quantity": p.get("quantity"),
                    "image_url": p.get("image_front_url"),
                    "source": "openfoodfacts",
                }
            )
    except Exception:
        pass

    db.add(BarcodeLookupCache(barcode=barcode, payload=result, source=result["source"]))
    db.commit()
    return result
