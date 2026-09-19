"""Dựng seeds/vn_catalogue.json từ ảnh đã tải về đĩa.

harvest_vn.py chỉ ghi vn_catalogue.json khi tải xong toàn bộ. Script này ghép
vn_raw.json với những ảnh đã có sẵn trong uploads/products/, nên dùng được
ngay cả khi quá trình tải còn dở.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

IMG_DIR = ROOT / "uploads" / "products"
RAW = ROOT / "seeds" / "vn_raw.json"
OUT = ROOT / "seeds" / "vn_catalogue.json"


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.replace("đ", "d")).strip("-")


def main() -> None:
    rows = json.loads(RAW.read_text(encoding="utf-8"))
    # ảnh được đặt tên {mã vạch}-{slug}.jpg
    on_disk = {f.name.split("-")[0]: f.name for f in IMG_DIR.glob("*.jpg")
               if f.name.split("-")[0].isdigit()}
    print(f"{len(rows)} bản ghi thô, {len(on_disk)} ảnh trên đĩa")

    out = []
    for p in rows:
        code = p.get("code") or ""
        fname = on_disk.get(code)
        if not fname:
            continue
        name = (p.get("product_name") or p.get("product_name_vi") or "").strip()
        if len(name) < 3 or len(name) > 90:
            continue
        out.append({
            "barcode": code,
            "name": name,
            "brand": (p.get("brands") or "").split(",")[0].strip(),
            "quantity": p.get("quantity"),
            "categories": p.get("categories_tags_en") or [],
            "image_url": f"/uploads/products/{fname}",
            "source_url": f"https://world.openfoodfacts.org/product/{code}",
        })

    # ưu tiên hàng mang mã doanh nghiệp Việt Nam lên đầu
    out.sort(key=lambda r: (not r["barcode"].startswith("893"), r["name"]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    vn = sum(1 for r in out if r["barcode"].startswith("893"))
    print(f"Ghi {len(out)} sản phẩm có ảnh ({vn} mã Việt Nam) vào {OUT.name}")


if __name__ == "__main__":
    main()
