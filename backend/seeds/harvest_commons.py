"""Ảnh cho hàng tươi và hàng tự đóng gói, lấy từ Wikimedia Commons.

Rau, thịt, cá, xôi, cơm hộp không có mã vạch nhà sản xuất nên không tồn tại
trong Open Food Facts. Wikimedia Commons có ảnh thật, giấy phép mở (CC / phạm
vi công cộng), không giới hạn tốc độ — hợp cho đúng nhóm này.

Chạy:  python -m seeds.harvest_commons
Kết quả: uploads/products/fresh-*.jpg  +  seeds/fresh_images.json
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

API = "https://commons.wikimedia.org/w/api.php"
UA = "TapHoaPOS-StudentProject/1.0 (seed script)"
IMG_DIR = ROOT / "uploads" / "products"
OUT = ROOT / "seeds" / "fresh_images.json"

# Tên mặt hàng trong seed  ->  từ khoá tìm trên Commons.
# Chọn từ khoá tả NGUYÊN LIỆU chứ không tả MÓN ĂN, để ra ảnh hàng hoá trên kệ
# thay vì ảnh mâm cơm.
TERMS = {
    "Thịt ba chỉ (kg)": "pork belly",
    "Ức gà phi lê (kg)": "chicken breast raw",
    "Cá basa cắt khúc (kg)": "fish fillet raw",
    "Rau muống bó": "Ipomoea aquatica water spinach",
    "Cải ngọt bó": "choy sum brassica vegetable",
    "Cà chua (kg)": "fresh tomatoes",
    "Chuối sứ nải": "banana bunch fruit",
    "Táo Mỹ (kg)": "red apples fruit",
    "Trứng gà vỉ 10 quả": "chicken eggs tray",
    "Đậu hũ trắng": "tofu block",
    "Gạo tám Hải Hậu (kg)": "white rice grains",
    "Xôi mặn hộp": "xoi sticky rice vietnamese",
    "Cơm gà hộp": "com ga vietnamese chicken rice",
}


_last = [0.0]
RATE = 4.0   # Commons trả 429 nếu bắn nhanh hơn


def api(params: dict) -> dict:
    gap = time.time() - _last[0]
    if gap < RATE:
        time.sleep(RATE - gap)
    _last[0] = time.time()
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def find(term: str) -> dict | None:
    try:
        data = api({
            "action": "query", "generator": "search",
            "gsrsearch": f"filetype:bitmap {term}",
            "gsrnamespace": 6, "gsrlimit": 6,
            "prop": "imageinfo", "iiprop": "url|extmetadata",
            "iiurlwidth": 600, "format": "json",
        })
    except Exception as e:
        print(f"      lỗi: {e}")
        return None

    pages = (data.get("query") or {}).get("pages") or {}
    for _, v in sorted(pages.items(), key=lambda kv: kv[1].get("index", 99)):
        ii = (v.get("imageinfo") or [{}])[0]
        url = ii.get("thumburl")
        if not url:
            continue
        meta = ii.get("extmetadata") or {}
        return {
            "title": v.get("title", ""),
            "url": url,
            "license": (meta.get("LicenseShortName") or {}).get("value", "?"),
            "author": (meta.get("Artist") or {}).get("value", "")[:120],
            "page": ii.get("descriptionurl", ""),
        }
    return None


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    # chạy lại thì giữ những gì đã lấy được, chỉ đi tìm phần còn thiếu
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    ok, fail = len(out), 0

    for name, term in TERMS.items():
        if name in out:
            continue
        hit = find(term)
        if not hit:
            print(f"  [thiếu] {name}")
            fail += 1
            continue

        slug = "fresh-" + "".join(c if c.isalnum() else "-" for c in term.lower())[:44].strip("-")
        dest = IMG_DIR / f"{slug}.jpg"
        time.sleep(RATE)
        try:
            req = urllib.request.Request(hit["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            if len(data) < 3000:
                raise ValueError("ảnh quá nhỏ")
            dest.write_bytes(data)
        except Exception as e:
            print(f"  [hỏng]  {name}: {e}")
            fail += 1
            continue

        out[name] = {
            "image_url": f"/uploads/products/{dest.name}",
            "license": hit["license"],
            "source_url": hit["page"],
            "title": hit["title"],
        }
        ok += 1
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  [ok]     {name}  ←  {hit['title'][5:55]}  ({hit['license']})")

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nLấy được {ok} ảnh, thiếu {fail}. Ghi vào {OUT.name}")


if __name__ == "__main__":
    main()
