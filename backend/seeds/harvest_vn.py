"""Kéo TOÀN BỘ hàng Việt Nam có ảnh thật từ Open Food Facts.

Khác với fetch_real_products.py (ép danh sách tự nghĩ vào cơ sở dữ liệu),
script này làm ngược lại: lấy tất cả những gì thật sự tồn tại — tên thật,
thương hiệu thật, mã vạch thật, ảnh thật — rồi để seed dựng danh mục quanh đó.

Chạy:  python -m seeds.harvest_vn
Kết quả:
    seeds/vn_catalogue.json      danh mục thô đã lọc
    uploads/products/*.jpg       ảnh
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

OFF = "https://world.openfoodfacts.org"
OBF = "https://world.openbeautyfacts.org"
UA = "TapHoaPOS-StudentProject/1.0 (seed script; contact: student project)"
FIELDS = ",".join([
    "code", "product_name", "product_name_vi", "brands", "quantity",
    "image_front_url", "image_front_small_url", "categories_tags_en",
    "countries_tags_en",
])
IMG_DIR = ROOT / "uploads" / "products"
RAW = ROOT / "seeds" / "vn_raw.json"
OUT = ROOT / "seeds" / "vn_catalogue.json"

# Thương hiệu bán ở tạp hoá Việt Nam. Truy vấn theo thẻ thương hiệu cho kết quả
# tốt hơn nhiều so với tìm theo tên, vì tên tiếng Việt trên OFF viết rất lộn xộn.
VN_BRANDS = [
    "vinamilk", "acecook", "masan", "chinsu", "trung-nguyen", "vifon",
    "kinh-do", "bibica", "oishi", "vinasoy", "nutifood", "tan-hiep-phat",
]

_last = [0.0]
RATE = 6.5


def get(url: str, timeout: int = 40, tries: int = 5) -> bytes:
    for attempt in range(tries):
        gap = time.time() - _last[0]
        if gap < RATE:
            time.sleep(RATE - gap)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if attempt == tries - 1:
                raise
            print(f"      {e} — chờ {12 * (attempt + 1)}s")
            time.sleep(12 * (attempt + 1))
    raise RuntimeError


PROGRESS = ROOT / "seeds" / "vn_progress.json"


def fetch_image(url: str, timeout: int = 45) -> bytes:
    """Tải ảnh. Khác get(): không dùng giới hạn 6.5s vì ảnh nằm ở host riêng."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def harvest(resume: bool = True) -> list[dict]:
    """Kéo dữ liệu, lưu sau mỗi trang.

    Máy chủ công cộng trả 503 liên tục nên phải chấp nhận đứt giữa chừng:
    chạy lại là đọc tiến độ cũ rồi đi tiếp, không phải làm lại từ đầu.
    """
    seen: dict[str, dict] = {}
    done: set[str] = set()
    if resume and RAW.exists():
        seen = {p["code"]: p for p in json.loads(RAW.read_text(encoding="utf-8")) if p.get("code")}
        if PROGRESS.exists():
            done = set(json.loads(PROGRESS.read_text(encoding="utf-8")))
        print(f"Tiếp tục: đã có {len(seen)} bản ghi, {len(done)} truy vấn xong")

    def save() -> None:
        RAW.write_text(json.dumps(list(seen.values()), ensure_ascii=False), encoding="utf-8")
        PROGRESS.write_text(json.dumps(sorted(done)), encoding="utf-8")

    def run(label: str, base: str, max_pages: int) -> None:
        if label in done:
            print(f"    {label}: đã xong, bỏ qua")
            return
        page = 1
        while page <= max_pages:
            try:
                data = json.loads(get(f"{base}&page={page}"))
            except Exception as e:
                print(f"    {label} dừng ở trang {page}: {e}")
                save()
                return
            got = data.get("products", [])
            new = 0
            for p in got:
                code = p.get("code") or ""
                if code and code not in seen:
                    seen[code] = p
                    new += 1
            total = data.get("count", 0)
            print(f"    {label} trang {page}: +{new} (kho {len(seen)}/{total})")
            save()
            if not got or page * 100 >= total:
                done.add(label)
                save()
                return
            page += 1
        done.add(label)
        save()

    # 1. toàn bộ hàng gắn thẻ bán tại Việt Nam
    run("VN-food", f"{OFF}/api/v2/search?countries_tags_en=vietnam&fields={FIELDS}&page_size=100", 20)
    run("VN-beauty", f"{OBF}/api/v2/search?countries_tags_en=vietnam&fields={FIELDS}&page_size=100", 10)

    # 2. thương hiệu Việt Nam, để vét những sản phẩm không gắn thẻ quốc gia
    for b in VN_BRANDS:
        run(f"brand:{b}", f"{OFF}/api/v2/search?brands_tags={b}&fields={FIELDS}&page_size=100", 3)

    save()
    rows = list(seen.values())
    print(f"\nLưu {len(rows)} bản ghi thô vào {RAW.name}")
    return rows


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.replace("đ", "d")).strip("-")


def usable(p: dict) -> bool:
    name = (p.get("product_name") or p.get("product_name_vi") or "").strip()
    code = p.get("code") or ""
    if len(name) < 3 or len(name) > 90:
        return False
    if not p.get("image_front_url"):
        return False
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    return True


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    rows = harvest()

    good = [p for p in rows if usable(p)]
    vn = [p for p in good if (p.get("code") or "").startswith("893")]
    print(f"\nCó ảnh + tên: {len(good)}   trong đó mã doanh nghiệp Việt Nam (893): {len(vn)}")

    # ưu tiên hàng mã 893, sau đó tới hàng gắn thẻ bán ở Việt Nam
    ordered = vn + [p for p in good if p not in vn and "vietnam" in (p.get("countries_tags_en") or [])]

    out, ok, fail = [], 0, 0
    for p in ordered:
        name = (p.get("product_name") or p.get("product_name_vi") or "").strip()
        fname = f"{p['code']}-{fold(name)[:40]}.jpg"
        dest = IMG_DIR / fname
        if not dest.exists():
            url = p.get("image_front_url")
            try:
                data = fetch_image(url)
                time.sleep(0.15)
                if len(data) < 2500:
                    raise ValueError("ảnh quá nhỏ")
                dest.write_bytes(data)
            except Exception as e:
                print(f"  hỏng {p['code']}: {e}")
                fail += 1
                continue
        out.append({
            "barcode": p["code"],
            "name": name,
            "brand": (p.get("brands") or "").split(",")[0].strip(),
            "quantity": p.get("quantity"),
            "categories": p.get("categories_tags_en") or [],
            "image_url": f"/uploads/products/{fname}",
            "source_url": f"{OFF}/product/{p['code']}",
        })
        ok += 1
        if ok % 20 == 0:
            print(f"  đã tải {ok} ảnh…")

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nXong: {ok} sản phẩm có ảnh thật, {fail} hỏng.")
    print(f"Danh mục: {OUT}")


if __name__ == "__main__":
    main()
