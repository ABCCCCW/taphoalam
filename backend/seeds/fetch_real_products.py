"""Lấy mã vạch thật + ảnh sản phẩm thật từ Open Food Facts.

Dữ liệu Open Food Facts mở theo ODbL, ảnh theo CC-BY-SA — dùng được cho đồ án,
chỉ cần ghi nguồn. Script không sửa seed_data.py, nó chỉ sinh ra hai thứ:

    seeds/real_products.json     bản đồ  tên sản phẩm -> {barcode, image, nguồn}
    uploads/products/*.jpg       ảnh đã tải về máy

Chạy:  python -m seeds.fetch_real_products
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

def load_products() -> list[tuple]:
    """Đọc hằng PRODUCTS trong seed_data.py mà không import cả ứng dụng."""
    import ast

    tree = ast.parse((ROOT / "seeds" / "seed_data.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "PRODUCTS":
            return ast.literal_eval(node.value)
    raise SystemExit("Không tìm thấy PRODUCTS trong seed_data.py")


PRODUCTS = load_products()

OFF = "https://world.openfoodfacts.org"
# Cùng dự án Open Food Facts nhưng cho mỹ phẩm và hàng gia dụng —
# đồ ăn không có kem đánh răng, dầu gội, bột giặt.
OBF = "https://world.openbeautyfacts.org"
UA = "TapHoaPOS-StudentProject/1.0 (seed script)"
IMG_DIR = ROOT / "uploads" / "products"
OUT = ROOT / "seeds" / "real_products.json"
CACHE = ROOT / "seeds" / "off_catalogue.json"

# Từ khoá tìm kiếm riêng cho từng mặt hàng, vì tên trong seed có kèm dung tích
# mà Open Food Facts thường không khớp. Thiếu key nào thì lấy 2 từ đầu của tên.
QUERY = {
    "Coca-Cola 330ml": "coca cola",
    "Pepsi 330ml": "pepsi",
    "Sting dâu 330ml": "sting",
    "Trà xanh Không Độ 455ml": "tra xanh khong do",
    "Nước suối Aquafina 500ml": "aquafina",
    "Revive chanh muối 500ml": "revive",
    "Cà phê sữa Highlands lon": "highlands coffee",
    "Sữa tươi TH True Milk 180ml": "th true milk",
    "Sữa Vinamilk Có đường 220ml": "vinamilk",
    "Bia Tiger 330ml": "tiger beer",
    "Mì Hảo Hảo tôm chua cay": "hao hao",
    "Mì Omachi sườn hầm": "omachi",
    "Mì ly Modern lẩu thái": "modern lau thai",
    "Phở Đệ Nhất bò": "pho de nhat",
    "Hủ tiếu Nam Vang ăn liền": "hu tieu nam vang",
    "Bánh Oreo 137g": "oreo",
    "Bánh Cosy Marie": "cosy marie",
    "Kẹo dẻo Haribo": "haribo",
    "Snack Oishi tôm": "oishi",
    "Bim bim Poca khoai tây": "poca",
    "Chocolate KitKat": "kitkat",
    "Nước mắm Nam Ngư 500ml": "nam ngu",
    "Dầu ăn Neptune 1L": "neptune oil",
    "Tương ớt Cholimex": "cholimex chili",
    "Muối i-ốt 500g": "muoi i-ot",
    "Đường trắng Biên Hòa 1kg": "duong bien hoa",
    "Gạo ST25 túi 5kg": "gao st25",
    "Trứng gà vỉ 10 quả": "trung ga",
    "Đậu hũ trắng": "dau hu",
    "Khăn giấy Pulppy": "pulppy",
    "Nước rửa chén Sunlight": "sunlight dishwashing",
    "Bột giặt Omo 400g": "omo",
    "Kem đánh răng P/S": "p/s toothpaste",
    "Dầu gội Clear 170g": "clear shampoo",
    "Tã quần Bobby M": "bobby diaper",
    "Pin AA Panasonic vỉ 4": "panasonic aa",
    "Bánh mì sandwich": "banh mi sandwich",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", " ", s.replace("đ", "d"))


STOP = {"ml", "g", "kg", "l", "goi", "chai", "lon", "hop", "tui", "vi", "loc",
        "thung", "bo", "cai", "the", "and", "with", "flavor", "flavour", "vietnam"}


def tokens(s: str) -> set[str]:
    return {w for w in fold(s).split() if len(w) >= 3 and w not in STOP}


def score(want: str, got: str, brand_want: str, brand_got: str) -> int:
    """Điểm khớp. Trả 0 nếu tên không trùng chữ nào có nghĩa — tránh khớp bừa.

    Bài học từ lần chạy đầu: nếu cho điểm thưởng (hàng Việt Nam, mã 893) tự nó
    vượt ngưỡng thì "Kem đánh răng P/S" khớp trúng sữa tươi. Điểm thưởng giờ chỉ
    dùng để phân định giữa các ứng viên đã trùng tên, không tự tạo ra ứng viên.
    """
    w, g = tokens(want), tokens(got)
    overlap = w & g
    brand_hit = bool(brand_want) and bool(brand_got) and bool(tokens(brand_want) & tokens(brand_got))

    if not overlap and not brand_hit:
        return 0
    # cần trùng thương hiệu, hoặc trùng ít nhất 2 từ trong tên
    if not brand_hit and len(overlap) < 2:
        return 0

    return len(overlap) * 3 + (4 if brand_hit else 0)


RATE_LIMIT_S = 6.0   # Open Food Facts cho phép ~10 lượt tìm kiếm mỗi phút
_last_call = [0.0]


def get(url: str, timeout: int = 30, tries: int = 6) -> bytes:
    """Gọi API có giới hạn tốc độ; gặp 503 thì chờ tăng dần rồi thử lại."""
    for attempt in range(tries):
        gap = time.time() - _last_call[0]
        if gap < RATE_LIMIT_S:
            time.sleep(RATE_LIMIT_S - gap)
        _last_call[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if attempt == tries - 1:
                raise
            wait = 10 * (attempt + 1)
            print(f"          {e} — chờ {wait}s rồi thử lại")
            time.sleep(wait)
    raise RuntimeError("unreachable")


FIELDS = "code,product_name,product_name_vi,brands,quantity,image_front_url,countries_tags_en"


def fetch_catalogue() -> list[dict]:
    """Kéo toàn bộ hàng bán ở Việt Nam + vài thương hiệu quốc tế, lưu cache.

    Một lần gọi lấy 100 sản phẩm, tổng chỉ khoảng 20 lượt gọi — nhẹ hơn nhiều
    so với tìm kiếm riêng cho từng mặt hàng, và chạy lại thì đọc thẳng cache.
    """
    if CACHE.exists():
        rows = json.loads(CACHE.read_text(encoding="utf-8"))
        print(f"Đọc cache: {len(rows)} sản phẩm ({CACHE.name})")
        return rows

    rows: list[dict] = []
    seen: set[str] = set()

    queries = [
        f"{OFF}/api/v2/search?countries_tags_en=vietnam&fields={FIELDS}&page_size=100",
        f"{OBF}/api/v2/search?countries_tags_en=vietnam&fields={FIELDS}&page_size=100",
    ]
    for brand in ("clear", "p-s", "colgate", "omo", "sunlight", "lifebuoy", "dove"):
        queries.append(f"{OBF}/api/v2/search?brands_tags={brand}&fields={FIELDS}&page_size=100")
    # vài thương hiệu quốc tế bán ở Việt Nam nhưng không gắn thẻ quốc gia
    for brand in ("oreo", "kit-kat", "haribo", "clear", "omo", "sunlight",
                  "pepsi", "coca-cola", "tiger", "panasonic", "nestle"):
        queries.append(f"{OFF}/api/v2/search?brands_tags={brand}&fields={FIELDS}&page_size=100")

    for base in queries:
        page = 1
        while page <= 20:
            try:
                data = json.loads(get(f"{base}&page={page}"))
            except Exception as e:
                print(f"    bỏ qua trang {page}: {e}")
                break
            got = data.get("products", [])
            for p in got:
                code = p.get("code")
                if code and code not in seen and p.get("image_front_url"):
                    seen.add(code)
                    rows.append(p)
            total = data.get("count", 0)
            print(f"    {base.split('?')[1][:40]}… trang {page}: +{len(got)} (tổng {len(rows)})")
            if page * 100 >= total or not got:
                break
            page += 1

    CACHE.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"Lưu cache {len(rows)} sản phẩm vào {CACHE.name}")
    return rows


def best_match(term: str, brand: str, catalogue: list) -> dict | None:
    best, best_score = None, 0
    for p in catalogue:
        name = p.get("product_name") or p.get("product_name_vi") or ""
        base = score(term, name, brand, p.get("brands") or "")
        if base == 0:
            continue                    # tên không liên quan -> loại thẳng
        s_ = base
        if "vietnam" in (p.get("countries_tags_en") or []):
            s_ += 2                     # ưu tiên đúng hàng bán ở Việt Nam
        code = p.get("code") or ""
        if len(code) == 13 and code.startswith("893"):
            s_ += 2                     # mã do doanh nghiệp Việt Nam đăng ký
        if s_ > best_score:
            best, best_score = p, s_
    return best


def download(url: str, dest: Path) -> bool:
    try:
        data = get(url, timeout=30)
        if len(data) < 2000:          # ảnh hỏng hoặc ảnh trắng
            return False
        dest.write_bytes(data)
        return True
    except Exception:
        return False


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    catalogue = fetch_catalogue()
    result: dict[str, dict] = {}
    matched = missed = 0

    for row in PRODUCTS:
        name, _cat, brand, *_rest = row
        ptype = row[9]
        # hàng tươi và hàng tự đóng gói không có trên Open Food Facts, bỏ qua
        if ptype in ("WEIGHTED", "BULK") or name not in QUERY:
            print(f"[bỏ qua] {name}")
            continue

        print(f"[tìm]    {name}")
        hit = best_match(QUERY[name], brand, catalogue)

        if not hit:
            print("          không tìm thấy")
            missed += 1
            continue

        slug = fold(name).strip().replace(" ", "-")[:60]
        fname = f"{slug}.jpg"
        if not download(hit["image_front_url"], IMG_DIR / fname):
            print("          tải ảnh hỏng")
            missed += 1
            continue

        result[name] = {
            "barcode": hit["code"],
            "image_url": f"/uploads/products/{fname}",
            "off_name": hit.get("product_name"),
            "off_brand": hit.get("brands"),
            "source_url": f"{OFF}/product/{hit['code']}",
            "license": "CC-BY-SA · Open Food Facts",
        }
        matched += 1
        print(f"          OK  {hit['code']}  {hit.get('product_name')}")

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nLấy được {matched} sản phẩm, thiếu {missed}.")
    print(f"Ảnh: {IMG_DIR}")
    print(f"Bản đồ: {OUT}")


if __name__ == "__main__":
    main()
