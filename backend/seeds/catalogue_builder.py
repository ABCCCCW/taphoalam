"""Dựng danh mục hàng hoá từ dữ liệu thật đã tải về.

Đầu vào : seeds/vn_catalogue.json  (harvest_vn.py / build_from_disk.py sinh ra)
Đầu ra  : danh sách tuple cùng định dạng PRODUCTS trong seed_data.py, có cột ảnh

Tên, thương hiệu, mã vạch, ảnh bao bì đều là thật. Chỉ giá bán và số tồn là do
mình đặt — không nguồn mở nào biết cửa hàng bạn bán bao nhiêu tiền.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "seeds" / "vn_catalogue.json"

# Thẻ phân loại của Open Food Facts là chuỗi người đọc được ("Carbonated drinks").
#
# THỨ TỰ QUAN TRỌNG và từng gây lỗi: "Salty snacks" chứa chuỗi con "salt", nên nếu
# xét Gia vị trước Bánh kẹo thì toàn bộ snack khoai tây rơi vào Gia vị. Tương tự
# "...drinks with sugar" chứa "sugar". Vì vậy: nhóm cụ thể (mì, đồ uống, bánh kẹo)
# phải xét TRƯỚC nhóm chung (gia vị), và từ khoá gia vị phải ở dạng đầy đủ.
CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Mi an lien", ("noodle", "pasta", "vermicelli", "instant rice")),
    ("Banh keo", ("snack", "biscuit", "chocolate", "candy", "candies", "cake",
                  "wafer", "cracker", "crisp", "chips and fries", "confection",
                  "appetizer", "sweet spread", "jelly", "chewing gum")),
    ("Do uong", ("beverage", "drink", "water", "soda", "juice", "tea", "coffee",
                 "beer", "milk", "dairies", "yogurt", "yoghurt", "smoothie")),
    ("Gia vi", ("sauce", "condiment", "seasoning", "spice", "vinegar", "ketchup",
                "mayonnaise", "table salt", "sea salt", "salts", "sugars",
                "vegetable oil", "olive oil", "cooking oil", "honey", "nut butter",
                "peanut butter")),
    ("Do kho", ("cereal", "rice", "flour", "canned", "legume", "grocer",
                "potatoes and their products", "oat", "pulses")),
    ("Thit ca", ("meat", "fish", "seafood", "egg", "poultry", "sausage")),
    ("Rau cu", ("fruit", "vegetable", "fresh food", "tofu", "soy product")),
    # đậu hũ / tàu hũ là thực phẩm tươi, không phải bánh kẹo
    ("Gia dung", ("hygiene", "beauty", "shampoo", "soap", "toothpaste",
                  "deodorant", "hand wash", "washing", "cleaning", "cosmetic",
                  "hair care", "body wash", "dental")),
]

# Thẻ "ô dù" quá rộng, gắn cho gần như mọi thứ nên không nói lên điều gì.
# Bơ hạt phỉ mang thẻ "plant-based foods and beverages" và suýt bị xếp vào Đồ uống
# chỉ vì chuỗi con "beverages" trong đó. Loại hẳn trước khi tính điểm.
UMBRELLA_TAGS = (
    "plant-based foods and beverages",
    "beverages and beverages preparations",
    "fruit-based foods and beverages",
    "fruits and vegetables based foods",
    "plant-based foods",
    "groceries",
)

# Xếp tay. Phần lớn những món này KHÔNG có thẻ phân loại nào trên Open Food Facts
# nên buộc phải đoán theo tên, và đoán theo tên thì sai. Vặn thêm luật để cứu vài
# món lẻ chỉ làm hỏng những món đang đúng — liệt kê thẳng ra rõ ràng hơn.
# Khoá là tên sản phẩm đúng như trong danh mục.
MANUAL: dict[str, str] = {
    # sốt và gia vị bị nhầm sang nhóm khác
    "Spaghetti sauce":            "Gia vi",   # là sốt, không phải mì
    "Cashew butter":              "Gia vi",   # bơ hạt, cùng loại với bơ đậu phộng
    "Lotus Grand Annatto":        "Gia vi",   # hạt điều màu, dùng tạo màu món ăn
    "Nt dragon Fried red onion":  "Gia vi",   # hành phi, là đồ rắc
    "simply dầu gạo":             "Gia vi",   # dầu ăn từ cám gạo

    # bánh kẹo bị nhầm vì tên chứa chữ gây hiểu lầm
    "Đậu Phộng Da Cá":            "Banh keo", # "da cá" tả lớp vỏ, không phải cá
    "Sandwich cha bong":          "Banh keo", # bánh mì, không phải thịt
    "Kẹo Hương Xoài Nhân Muối Ớt":"Banh keo", # là kẹo, "muối" làm nó lạc sang gia vị
    "Lương khô hạt dinh dưỡng":   "Banh keo", # bánh lương khô
    "Rice cracker":               "Banh keo", # bánh gạo giòn
    "Dried Fresh Mango":          "Banh keo", # xoài sấy là đồ ăn vặt

    # còn lại
    "Dielac Alpha":               "Do uong",  # sữa bột
    "Coco Fresh":                 "Do uong",  # nước dừa
    "Duy Anh Rice Macaroni":      "Mi an lien", # nui gạo
    "Galette de riz 28cm":        "Do kho",   # bánh tráng

    # đồ ăn nóng bán tại quầy — xem ghi chú về nhóm "Đồ ăn sẵn" bên dưới
    "Cơm gà hộp":                 "Do an san",
    "Xôi mặn hộp":                "Do an san",
}

# Cụm chặn: xuất hiện thì KHÔNG được rơi vào nhóm tương ứng.
# "phô mai" bỏ dấu thành "pho mai" — chữ "pho" làm phô mai bị nhầm sang phở.
BLOCKERS: dict[str, tuple[str, ...]] = {
    "Mi an lien": ("pho mai", "pho mat"),
}

# Từ khoá trong TÊN sản phẩm, dùng khi mặt hàng không có thẻ phân loại nào.
# Có cả tiếng Việt vì tên trên Open Food Facts phần lớn do người Việt nhập.
# Khớp theo TỪ chứ không theo chuỗi con, và cụm dài đặt trước từ chung.
NAME_RULES: list[tuple[str, tuple[str, ...]]] = [
    # bánh mì / bánh tráng… là bánh, phải chặn trước khi chữ "mì" kịp khớp
    ("Banh keo", ("banh mi", "banh my", "banh trang", "banh gao", "banh quy",
                  "banh bong lan", "banh xop", "choco pie", "chocopie")),
    ("Do uong", ("sua chua", "sua tuoi", "nuoc ep", "nuoc tang luc")),
    ("Mi an lien", ("mi", "my", "noodle", "noodles", "pho", "hu tieu", "bun",
                    "mien", "chao", "ramen", "spaghetti", "pasta")),
    ("Do uong", ("nuoc", "tra", "coffee", "cafe", "ca phe", "sua", "milk",
                 "beer", "bia", "juice", "soda", "cola", "pepsi", "7up",
                 "sprite", "fanta", "aquafina", "lavie", "sting", "revive",
                 "yogurt", "yoghurt", "drink", "water", "tonic", "latte")),
    ("Gia vi", ("nuoc mam", "tuong", "sauce", "dau an", "muoi", "duong",
                "bot ngot", "hat nem", "mam", "gia vi", "vinegar", "ketchup",
                "mayonnaise", "sa te", "sate", "peanut butter", "bo dau phong",
                "bo hat", "bo thuc vat", "mut", "sua dac")),
    ("Do kho", ("gao", "bot", "ngu coc", "rice", "flour", "cereal", "oat",
                "avoine", "com", "dau xanh", "dau den", "dau nanh")),
    ("Gia dung", ("dau goi", "sua tam", "xa phong", "kem danh rang", "nuoc rua",
                  "bot giat", "khan giay", "shampoo", "soap", "toothpaste",
                  "detergent", "lotion", "tam", "chi nha khoa")),
    ("Banh keo", ("banh", "keo", "snack", "chocolate", "socola", "wafer",
                  "cookie", "biscuit", "chip", "chips", "bim bim", "candy",
                  "kem", "pudding", "jelly", "cracker")),
    ("Thit ca", ("thit", "ca", "tom", "trung", "xuc xich", "pate", "meat",
                 "fish", "cha", "gio", "nem", "pangasius", "filet")),
    ("Rau cu", ("dau hu", "tau hu", "rau", "cu", "qua", "tofu")),
]

# Khoảng giá bán hợp lý theo danh mục (đồng), bước 500đ.
PRICE_BANDS = {
    "Do uong": (7000, 22000),
    "Mi an lien": (4000, 14000),
    "Banh keo": (8000, 38000),
    "Gia vi": (12000, 55000),
    "Do kho": (18000, 95000),
    "Thit ca": (20000, 65000),
    "Rau cu": (8000, 35000),
    "Gia dung": (20000, 85000),
    "Do an san": (15000, 45000),
}

EMOJI = {
    "Do uong": "🥤", "Mi an lien": "🍜", "Banh keo": "🍪", "Gia vi": "🧂",
    "Do kho": "🌾", "Thit ca": "🥩", "Rau cu": "🥬", "Gia dung": "🧴",
    "Do an san": "🍱",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", s.replace("đ", "d")).strip()


def pick_category(item: dict) -> str:
    """Chọn nhóm hàng bằng cách ĐẾM ĐIỂM, không phải khớp-cái-đầu-tiên-thắng.

    Khớp cái đầu tiên rất mong manh: sữa chua mang cả thẻ "Dairies" lẫn "Desserts",
    tuỳ thứ tự luật mà ra Đồ uống hay Bánh kẹo. Đếm điểm thì Đồ uống được 2 (milk,
    dairies) còn Bánh kẹo được 1 (dessert) — thắng đúng. Snack khoai tây được 4
    điểm Bánh kẹo và 0 điểm Gia vị, nên không còn lạc sang gia vị nữa.
    """
    manual = MANUAL.get(item["name"].strip())
    if manual:
        return manual

    flat = fold(item["name"]) + " " + fold(item.get("brand") or "")

    def blocked(cat: str) -> bool:
        return any(bad in flat for bad in BLOCKERS.get(cat, ()))

    raw_tags = [t.lower() for t in (item.get("categories") or [])]
    tags = " | ".join(t for t in raw_tags if t not in UMBRELLA_TAGS)
    if tags:
        scores = {
            cat: sum(1 for k in keys if k in tags)
            for cat, keys in CATEGORY_RULES
            if not blocked(cat)
        }
        best = max(scores, key=lambda c: scores[c]) if scores else None
        if best and scores[best] > 0:
            return best

    words = flat.split()
    for cat, keys in NAME_RULES:
        if blocked(cat):
            continue
        for k in keys:
            if " " in k:
                if k in flat:                    # cụm nhiều từ: khớp nguyên cụm
                    return cat
            elif k in words:                     # một từ: phải đứng riêng
                return cat
    return "Banh keo"


def stable_price(barcode: str, lo: int, hi: int) -> int:
    """Giá cố định theo mã vạch — chạy lại seed vẫn ra đúng giá cũ."""
    h = int(hashlib.md5(barcode.encode()).hexdigest()[:8], 16)
    steps = max(1, (hi - lo) // 500)
    return lo + (h % steps) * 500


def usable_name(name: str) -> bool:
    n = name.strip()
    if len(n) < 4 or len(n) > 70:
        return False
    if re.fullmatch(r"[\d\s\-.]+", n):          # tên chỉ là dãy số
        return False
    if sum(c.isdigit() for c in n) > len(n) * 0.5:
        return False
    return True


def clean_name(raw: str, brand: str) -> str:
    name = re.sub(r"\s+", " ", raw).strip(" -–—,;")
    if len(name) > 60:
        name = name[:60].rsplit(" ", 1)[0]
    # thêm thương hiệu nếu tên quá chung chung ("Fresh milk" -> "Vinamilk Fresh milk")
    if brand and len(name) < 16 and fold(brand) not in fold(name):
        name = f"{brand} {name}"
    return name


def build(limit: int = 110) -> list[tuple]:
    if not CATALOGUE.exists():
        return []
    items = json.loads(CATALOGUE.read_text(encoding="utf-8"))

    # gom theo danh mục để lấy đều tay, tránh 90% rơi vào một nhóm
    buckets: dict[str, list[tuple]] = {}
    seen: set[str] = set()

    for it in items:
        if not usable_name(it["name"]):
            continue
        name = clean_name(it["name"], it.get("brand") or "")
        # bảng xếp tay tra được bằng cả tên gốc lẫn tên hiển thị
        cat = MANUAL.get(name.strip()) or pick_category(it)
        key = fold(name)
        if key in seen:
            continue
        seen.add(key)

        lo, hi = PRICE_BANDS[cat]
        sale = stable_price(it["barcode"], lo, hi)
        cost = max(500, int(sale * 0.74) // 500 * 500)
        qty = 12 + (int(it["barcode"][-2:]) % 80)

        buckets.setdefault(cat, []).append((
            name, cat, it.get("brand") or "Khác", cost, sale, it["barcode"],
            EMOJI[cat], qty, True, "STANDARD", max(4, qty // 6), it["image_url"],
        ))

    # rút vòng tròn qua các danh mục cho danh sách cân đối
    rows: list[tuple] = []
    order = [c for c in EMOJI if c in buckets]
    i = 0
    while len(rows) < limit and any(buckets.values()):
        cat = order[i % len(order)]
        if buckets.get(cat):
            rows.append(buckets[cat].pop(0))
        i += 1
        if i > limit * 12:
            break
    return rows
