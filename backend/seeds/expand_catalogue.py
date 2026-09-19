"""Bổ sung hàng cho các kệ còn mỏng: thịt cá, rau củ quả, kem, đông lạnh, ăn vặt,
gia dụng (dầu gội, sữa tắm, nước giặt…) và gia vị nấu ăn.

Nguồn ảnh
  - Hàng có thương hiệu: Open Food Facts / Open Beauty Facts / Open Products Facts.
    Chỉ nhận bản ghi đúng thương hiệu, ưu tiên hàng bán ở Việt Nam.
  - Hàng tươi, hàng tự đóng gói: Wikimedia Commons (giấy phép mở).
  - Không tìm được ảnh thì để emoji, như các món cũ.

Tên, giá bán lẻ, số tồn là do mình đặt. Ảnh cùng thương hiệu chưa chắc cùng
quy cách đóng gói, nên KHÔNG mượn mã vạch của bản ghi đó — dùng mã nội bộ 21xxx.

Chạy (nạp vào DB đang dùng, món đã có tên thì bỏ qua — chạy lại được):
    cd backend
    python -m seeds.expand_catalogue              # tải ảnh còn thiếu rồi nạp
    python -m seeds.expand_catalogue --no-fetch   # chỉ nạp, dùng ảnh đã tải
    DATABASE_URL='postgresql://…' python -m seeds.expand_catalogue --no-fetch   # Supabase
Nguồn từng ảnh ghi ở seeds/expand_images.json.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("SKIP_SCHEMA_SYNC", "1")

from app.core.utils import fold  # noqa: E402

IMG_DIR = ROOT / "uploads" / "products"
IMAGES = ROOT / "seeds" / "expand_images.json"
UA = "TapHoaPOS-StudentProject/1.0 (seed script)"

FACTS = {
    "off": "https://world.openfoodfacts.org",
    "obf": "https://world.openbeautyfacts.org",
    "opf": "https://world.openproductsfacts.org",
}

# Danh mục mới: slug -> (tên, icon, thứ tự)
NEW_CATEGORIES = {
    "kem": ("Kem", "🍦", 10),
    "dong-lanh": ("Đông lạnh", "🧊", 11),
    "an-vat": ("Ăn vặt", "🍿", 12),
}

FRESH = "TươiMart"

# (tên, slug danh mục, thương hiệu, giá vốn, giá bán, emoji, tồn, kiểu, tồn tối thiểu, đơn vị, nguồn ảnh)
# nguồn ảnh: ("commons", từ khoá) | ("off"|"obf"|"opf", từ khoá, "thương|hiệu") [+ từ khoá commons dự phòng]
# kiểu WEIGHTED = bán cân (đơn vị Kg), STANDARD = bán theo cái/gói/chai.
ITEMS: list[tuple] = [
    # ── Thịt cá ───────────────────────────────────────────────────────────
    ("Sườn non heo (kg)", "thit-ca", FRESH, 130000, 165000, "🍖", 7, "WEIGHTED", 2, "Kg", ("commons", "raw pork ribs butcher")),
    ("Thịt nạc vai heo (kg)", "thit-ca", FRESH, 110000, 140000, "🥩", 6, "WEIGHTED", 2, "Kg", ("commons", "raw pork loin")),
    ("Thịt heo xay (kg)", "thit-ca", FRESH, 100000, 130000, "🥩", 5, "WEIGHTED", 2, "Kg", ("commons", "minced pork raw")),
    ("Thăn bò Úc (kg)", "thit-ca", FRESH, 260000, 320000, "🥩", 4, "WEIGHTED", 1, "Kg", ("commons", "raw beef tenderloin")),
    ("Bắp bò (kg)", "thit-ca", FRESH, 220000, 280000, "🥩", 4, "WEIGHTED", 1, "Kg", ("commons", "raw beef shank")),
    ("Đùi gà góc tư (kg)", "thit-ca", FRESH, 55000, 75000, "🍗", 8, "WEIGHTED", 2, "Kg", ("commons", "raw chicken leg quarters")),
    ("Cánh gà (kg)", "thit-ca", FRESH, 75000, 95000, "🍗", 6, "WEIGHTED", 2, "Kg", ("commons", "raw chicken wings")),
    ("Tôm thẻ tươi (kg)", "thit-ca", FRESH, 170000, 220000, "🦐", 4, "WEIGHTED", 1, "Kg", ("commons", "raw prawns seafood market")),
    ("Mực ống tươi (kg)", "thit-ca", FRESH, 200000, 260000, "🦑", 3, "WEIGHTED", 1, "Kg", ("commons", "fresh squid seafood market")),
    ("Cá hồi phi lê (kg)", "thit-ca", FRESH, 360000, 450000, "🐟", 3, "WEIGHTED", 1, "Kg", ("commons", "raw salmon fillet")),
    ("Cá thu cắt khúc (kg)", "thit-ca", FRESH, 220000, 280000, "🐟", 3, "WEIGHTED", 1, "Kg", ("commons", "king mackerel steaks")),
    ("Ngao trắng (kg)", "thit-ca", FRESH, 32000, 45000, "🦪", 6, "WEIGHTED", 2, "Kg", ("commons", "clams seafood market")),
    ("Trứng vịt vỉ 10 quả", "thit-ca", FRESH, 30000, 38000, "🥚", 20, "STANDARD", 5, "Vỉ", ("commons", "duck eggs basket")),
    ("Giò lụa (kg)", "thit-ca", FRESH, 170000, 220000, "🍖", 3, "WEIGHTED", 1, "Kg", ("commons", "Giò lụa")),

    # ── Rau củ quả ────────────────────────────────────────────────────────
    ("Bắp cải (kg)", "rau-cu", FRESH, 12000, 18000, "🥬", 15, "WEIGHTED", 3, "Kg", ("commons", "cabbages market stall")),
    ("Cà rốt (kg)", "rau-cu", FRESH, 15000, 22000, "🥕", 14, "WEIGHTED", 3, "Kg", ("commons", "fresh carrots")),
    ("Khoai tây Đà Lạt (kg)", "rau-cu", FRESH, 20000, 28000, "🥔", 20, "WEIGHTED", 4, "Kg", ("commons", "potatoes pile")),
    ("Hành tây (kg)", "rau-cu", FRESH, 22000, 30000, "🧅", 10, "WEIGHTED", 2, "Kg", ("commons", "onions market stall")),
    ("Dưa chuột (kg)", "rau-cu", FRESH, 14000, 20000, "🥒", 10, "WEIGHTED", 2, "Kg", ("commons", "cucumbers market")),
    ("Bí đỏ (kg)", "rau-cu", FRESH, 12000, 18000, "🎃", 10, "WEIGHTED", 2, "Kg", ("commons", "pumpkin squash market")),
    ("Súp lơ xanh (cây)", "rau-cu", FRESH, 18000, 25000, "🥦", 12, "STANDARD", 3, "Cây", ("commons", "fresh broccoli")),
    ("Xà lách lô lô (bó)", "rau-cu", FRESH, 8000, 12000, "🥬", 15, "STANDARD", 4, "Bó", ("commons", "lettuce heads market")),
    ("Hành lá (bó)", "rau-cu", FRESH, 3000, 5000, "🌿", 20, "STANDARD", 5, "Bó", ("commons", "spring onions bunch")),
    ("Nấm kim châm (gói)", "rau-cu", FRESH, 8000, 12000, "🍄", 20, "STANDARD", 5, "Gói", ("commons", "enoki mushroom package")),
    ("Tỏi Lý Sơn (kg)", "rau-cu", FRESH, 90000, 120000, "🧄", 4, "WEIGHTED", 1, "Kg", ("commons", "garlic bulbs")),
    ("Chanh ta (kg)", "rau-cu", FRESH, 20000, 30000, "🍋", 6, "WEIGHTED", 1, "Kg", ("commons", "limes fruit")),
    ("Cam sành (kg)", "rau-cu", FRESH, 25000, 35000, "🍊", 15, "WEIGHTED", 3, "Kg", ("commons", "green oranges fruit")),
    ("Xoài cát Hoà Lộc (kg)", "rau-cu", FRESH, 45000, 60000, "🥭", 10, "WEIGHTED", 2, "Kg", ("commons", "mangoes market")),
    ("Dưa hấu (kg)", "rau-cu", FRESH, 12000, 18000, "🍉", 25, "WEIGHTED", 5, "Kg", ("commons", "watermelons")),
    ("Nho xanh (kg)", "rau-cu", FRESH, 70000, 95000, "🍇", 6, "WEIGHTED", 1, "Kg", ("commons", "green grapes fruit")),
    ("Thanh long ruột đỏ (kg)", "rau-cu", FRESH, 22000, 32000, "🐉", 10, "WEIGHTED", 2, "Kg", ("commons", "red dragon fruit")),
    ("Bưởi da xanh (quả)", "rau-cu", FRESH, 50000, 65000, "🍈", 12, "STANDARD", 3, "Quả", ("commons", "pomelo fruit")),

    # ── Kem ──────────────────────────────────────────────────────────────
    ("Kem ốc quế Cornetto socola", "kem", "Wall's", 14000, 20000, "🍦", 40, "STANDARD", 10, "Cái", ("off", "cornetto chocolate", "cornetto|wall", "ice cream cone")),
    ("Kem Magnum hạnh nhân", "kem", "Wall's", 22000, 30000, "🍫", 30, "STANDARD", 8, "Cái", ("off", "magnum almond", "magnum", "chocolate ice cream bar")),
    ("Kem ốc quế Celano socola", "kem", "Celano", 12000, 18000, "🍦", 40, "STANDARD", 10, "Cái", ("off", "celano", "celano|kido", "ice cream cone")),
    ("Kem que Merino dâu", "kem", "Merino", 6000, 10000, "🍓", 50, "STANDARD", 10, "Cái", ("off", "merino kem", "merino|kido", "ice pop strawberry")),
    ("Kem hộp Vinamilk vani 450ml", "kem", "Vinamilk", 38000, 52000, "🍨", 20, "STANDARD", 5, "Hộp", ("off", "vinamilk kem", "vinamilk", "vanilla ice cream tub")),
    ("Kem TH true Milk socola 100ml", "kem", "TH true Milk", 12000, 17000, "🍨", 30, "STANDARD", 8, "Hộp", ("off", "th true milk kem", "th true", "chocolate ice cream cup")),
    ("Kem Häagen-Dazs vani 100ml", "kem", "Häagen-Dazs", 75000, 95000, "🍨", 10, "STANDARD", 3, "Hộp", ("off", "haagen dazs vanilla", "haagen|häagen")),
    ("Kem Ben & Jerry's Cookie Dough 465ml", "kem", "Ben & Jerry's", 150000, 189000, "🍨", 6, "STANDARD", 2, "Hộp", ("off", "ben jerry cookie dough", "ben & jerry|ben and jerry|ben jerry")),

    # ── Đông lạnh ────────────────────────────────────────────────────────
    ("Há cảo tôm 500g", "dong-lanh", "CP", 52000, 68000, "🥟", 15, "STANDARD", 4, "Gói", ("commons", "har gow dumplings")),
    ("Chả giò Cầu Tre 500g", "dong-lanh", "Cầu Tre", 55000, 72000, "🥟", 15, "STANDARD", 4, "Gói", ("commons", "Chả giò")),
    ("Sủi cảo Bibigo 350g", "dong-lanh", "Bibigo", 48000, 62000, "🥟", 15, "STANDARD", 4, "Gói", ("off", "bibigo mandu", "bibigo", "mandu dumplings")),
    ("Bánh bao nhân thịt (gói 4 cái)", "dong-lanh", "Thọ Phát", 38000, 48000, "🥟", 12, "STANDARD", 3, "Gói", ("commons", "banh bao steamed buns")),
    ("Xúc xích Đức 500g", "dong-lanh", "CP", 70000, 89000, "🌭", 12, "STANDARD", 3, "Gói", ("commons", "bratwurst sausages raw")),
    ("Khoai tây chiên McCain 1kg", "dong-lanh", "McCain", 78000, 98000, "🍟", 10, "STANDARD", 3, "Gói", ("off", "mccain french fries", "mccain", "frozen french fries")),
    ("Gà viên nuggets 500g", "dong-lanh", "CP", 62000, 79000, "🍗", 10, "STANDARD", 3, "Gói", ("commons", "chicken nuggets")),
    ("Bò viên Vissan 500g", "dong-lanh", "Vissan", 58000, 75000, "🍢", 12, "STANDARD", 3, "Gói", ("off", "vissan", "vissan", "beef balls")),
    ("Cá viên chiên 500g", "dong-lanh", FRESH, 40000, 52000, "🍢", 12, "STANDARD", 3, "Gói", ("commons", "fish balls skewers")),
    ("Đậu Hà Lan đông lạnh 500g", "dong-lanh", "Aviko", 32000, 42000, "🫛", 10, "STANDARD", 3, "Gói", ("off", "frozen peas", "aviko|bonduelle|findus|birds eye", "frozen green peas")),

    # ── Ăn vặt ───────────────────────────────────────────────────────────
    ("Snack tôm cay Oishi 40g", "an-vat", "Oishi", 4500, 6000, "🦐", 60, "STANDARD", 15, "Gói", ("off", "oishi prawn crackers", "oishi", "prawn crackers snack")),
    ("Khoai tây chiên Poca 52g", "an-vat", "Poca", 9000, 12000, "🥔", 50, "STANDARD", 12, "Gói", ("off", "poca", "poca")),
    ("Pringles kem chua hành 107g", "an-vat", "Pringles", 36000, 45000, "🥫", 24, "STANDARD", 6, "Hộp", ("off", "pringles sour cream onion", "pringles")),
    ("Rong biển Tao Kae Noi 32g", "an-vat", "Tao Kae Noi", 20000, 26000, "🌿", 30, "STANDARD", 8, "Gói", ("off", "tao kae noi", "tao kae noi|taokaenoi", "roasted seaweed snack")),
    ("Đậu phộng Tân Tân 80g", "an-vat", "Tân Tân", 13000, 17000, "🥜", 40, "STANDARD", 10, "Gói", ("off", "tan tan dau phong", "tan tan|tân tân", "coated peanuts")),
    ("Hạt điều rang muối 250g", "an-vat", "Bình Phước", 75000, 95000, "🥜", 15, "STANDARD", 4, "Hũ", ("commons", "roasted cashew nuts")),
    ("Khô gà lá chanh 200g", "an-vat", FRESH, 42000, 55000, "🍗", 20, "STANDARD", 5, "Hũ", ("commons", "chicken floss")),
    ("Mít sấy Vinamit 100g", "an-vat", "Vinamit", 30000, 38000, "🍈", 25, "STANDARD", 6, "Gói", ("off", "vinamit jackfruit", "vinamit", "dried jackfruit chips")),
    ("Bánh Chocopie Orion hộp 12 cái", "an-vat", "Orion", 48000, 58000, "🍫", 20, "STANDARD", 5, "Hộp", ("off", "orion choco pie", "orion")),
    ("Kẹo dẻo Haribo Goldbears 80g", "an-vat", "Haribo", 22000, 29000, "🍬", 30, "STANDARD", 8, "Gói", ("off", "haribo goldbears", "haribo")),
    ("Bánh quy Oreo vani 133g", "an-vat", "Oreo", 17000, 22000, "🍪", 30, "STANDARD", 8, "Gói", ("off", "oreo original", "oreo")),
    ("Bắp rang bơ 100g", "an-vat", FRESH, 12000, 18000, "🍿", 25, "STANDARD", 6, "Gói", ("commons", "popcorn bowl")),

    # ── Gia dụng: chăm sóc cá nhân ───────────────────────────────────────
    ("Dầu gội Clear Men bạc hà 630g", "gia-dung", "Clear", 140000, 169000, "🧴", 12, "STANDARD", 3, "Chai", ("obf", "clear men shampoo", "clear")),
    ("Dầu gội Sunsilk mềm mượt 650g", "gia-dung", "Sunsilk", 115000, 139000, "🧴", 12, "STANDARD", 3, "Chai", ("obf", "sunsilk smooth manageable", "sunsilk")),
    ("Dầu gội Head & Shoulders 625ml", "gia-dung", "Head & Shoulders", 150000, 179000, "🧴", 10, "STANDARD", 3, "Chai", ("obf", "head shoulders shampoo", "head & shoulders|head and shoulders|head shoulders")),
    ("Dầu xả Dove phục hồi 610g", "gia-dung", "Dove", 120000, 145000, "🧴", 8, "STANDARD", 2, "Chai", ("obf", "dove conditioner", "dove")),
    ("Sữa tắm Lifebuoy 850g", "gia-dung", "Lifebuoy", 125000, 150000, "🧼", 10, "STANDARD", 3, "Chai", ("obf", "lifebuoy body wash", "lifebuoy")),
    ("Sữa tắm Dove dưỡng ẩm 530g", "gia-dung", "Dove", 130000, 159000, "🧼", 8, "STANDARD", 2, "Chai", ("obf", "dove body wash", "dove")),
    ("Xà bông cục Lifebuoy 90g", "gia-dung", "Lifebuoy", 14000, 18000, "🧼", 30, "STANDARD", 8, "Cái", ("obf", "lifebuoy soap bar", "lifebuoy")),
    ("Nước rửa tay Lifebuoy 500g", "gia-dung", "Lifebuoy", 55000, 69000, "🧴", 12, "STANDARD", 3, "Chai", ("obf", "lifebuoy hand wash", "lifebuoy")),
    ("Kem đánh răng P/S 230g", "gia-dung", "P/S", 30000, 38000, "🪥", 30, "STANDARD", 8, "Cái", ("obf", "p/s toothpaste", "p/s", "toothpaste tube")),
    ("Kem đánh răng Colgate MaxFresh 225g", "gia-dung", "Colgate", 36000, 45000, "🪥", 25, "STANDARD", 6, "Cái", ("obf", "colgate toothpaste", "colgate", "toothpaste tube")),
    ("Bàn chải Colgate lông mềm", "gia-dung", "Colgate", 18000, 25000, "🪥", 30, "STANDARD", 8, "Cái", ("obf", "colgate toothbrush", "colgate", "toothbrush")),
    ("Băng vệ sinh Diana 8 miếng", "gia-dung", "Diana", 17000, 22000, "🩹", 30, "STANDARD", 8, "Gói", ("obf", "diana sanitary pads", "diana")),
    ("Lăn khử mùi Nivea Men 50ml", "gia-dung", "Nivea", 65000, 79000, "🧴", 10, "STANDARD", 3, "Chai", ("obf", "nivea men roll-on", "nivea")),

    # ── Gia dụng: giặt giũ, lau rửa ──────────────────────────────────────
    ("Nước giặt OMO Matic 3.6kg", "gia-dung", "OMO", 165000, 195000, "🧺", 10, "STANDARD", 3, "Túi", ("opf", "omo liquid detergent", "omo")),
    ("Bột giặt Ariel 2.7kg", "gia-dung", "Ariel", 125000, 149000, "🧺", 8, "STANDARD", 2, "Túi", ("opf", "ariel detergent", "ariel")),
    ("Nước xả Comfort đậm đặc 3.2L", "gia-dung", "Comfort", 140000, 169000, "🌸", 8, "STANDARD", 2, "Túi", ("opf", "comfort fabric conditioner", "comfort")),
    ("Nước xả Downy huyền bí 1.5L", "gia-dung", "Downy", 95000, 115000, "🌸", 8, "STANDARD", 2, "Chai", ("opf", "downy fabric softener", "downy")),
    ("Nước rửa chén Sunlight chanh 750g", "gia-dung", "Sunlight", 26000, 32000, "🍋", 30, "STANDARD", 8, "Chai", ("opf", "sunlight dishwashing", "sunlight", "dish soap bottle")),
    ("Nước lau sàn Sunlight 1kg", "gia-dung", "Sunlight", 36000, 45000, "🧽", 15, "STANDARD", 4, "Chai", ("opf", "sunlight floor cleaner", "sunlight", "floor cleaner bottle")),
    ("Tẩy bồn cầu Vim 880ml", "gia-dung", "Vim", 32000, 39000, "🚽", 15, "STANDARD", 4, "Chai", ("opf", "vim toilet cleaner", "vim")),
    ("Bọt biển rửa chén (3 miếng)", "gia-dung", "Scotch-Brite", 15000, 20000, "🧽", 20, "STANDARD", 5, "Gói", ("commons", "kitchen scrub sponges")),
    ("Giấy vệ sinh 10 cuộn", "gia-dung", "Bless You", 62000, 75000, "🧻", 15, "STANDARD", 4, "Lốc", ("commons", "toilet paper rolls")),
    ("Khăn giấy rút 180 tờ", "gia-dung", "Pulppy", 16000, 22000, "🧻", 25, "STANDARD", 6, "Gói", ("commons", "facial tissue box")),
    ("Túi đựng rác 3 cuộn", "gia-dung", FRESH, 20000, 28000, "🗑️", 20, "STANDARD", 5, "Gói", ("commons", "black garbage bags")),
    ("Màng bọc thực phẩm 30m", "gia-dung", "Ringo", 25000, 32000, "📦", 15, "STANDARD", 4, "Hộp", ("commons", "plastic wrap roll kitchen")),

    # ── Gia vị, nguyên liệu nấu ăn ───────────────────────────────────────
    ("Dầu ăn Neptune 1L", "gia-vi", "Neptune", 48000, 58000, "🫗", 20, "STANDARD", 5, "Chai", ("off", "neptune", "neptune", "cooking oil bottles supermarket")),
    ("Nước mắm Nam Ngư 750ml", "gia-vi", "Nam Ngư", 38000, 46000, "🐟", 20, "STANDARD", 5, "Chai", ("off", "nam ngu", "nam ngu|nam ngư|chin-su", "fish sauce bottles")),
    ("Hạt nêm Knorr thịt thăn 400g", "gia-vi", "Knorr", 33000, 40000, "🧂", 20, "STANDARD", 5, "Gói", ("off", "knorr hat nem", "knorr")),
    ("Bột ngọt Ajinomoto 454g", "gia-vi", "Ajinomoto", 30000, 37000, "🧂", 20, "STANDARD", 5, "Gói", ("off", "ajinomoto", "ajinomoto")),
    ("Đường tinh luyện Biên Hòa 1kg", "gia-vi", "Biên Hòa", 24000, 29000, "🍚", 20, "STANDARD", 5, "Gói", ("off", "bien hoa", "bien hoa|biên hòa", "granulated white sugar")),
    ("Bột mì đa dụng Meizan 1kg", "gia-vi", "Meizan", 20000, 26000, "🌾", 15, "STANDARD", 4, "Gói", ("off", "meizan flour", "meizan", "wheat flour bag")),
    ("Nước tương Maggi 700ml", "gia-vi", "Maggi", 28000, 35000, "🥢", 20, "STANDARD", 5, "Chai", ("off", "maggi soy sauce", "maggi")),
    ("Tiêu đen xay 50g", "gia-vi", "DH Foods", 15000, 20000, "🌶️", 20, "STANDARD", 5, "Hũ", ("commons", "ground black pepper")),
]


# ─── tải ảnh ──────────────────────────────────────────────────────────────
_last = {"facts": 0.0, "commons": 0.0}
RATE = {"facts": 6.5, "commons": 4.0}   # hai nguồn đều trả 429 nếu bắn nhanh


def _get(url: str, lane: str | None = None, timeout: int = 40) -> bytes:
    if lane:
        gap = time.time() - _last[lane]
        if gap < RATE[lane]:
            time.sleep(RATE[lane] - gap)
        _last[lane] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            # Open Facts hay trả 503 lúc đông, đợi một lúc là được
            if e.code not in (429, 502, 503) or attempt == 2:
                raise
            time.sleep(20 * (attempt + 1))


def find_facts(site: str, terms: str, brands: str) -> dict | None:
    params = {
        "search_terms": terms, "json": 1, "page_size": 30,
        "fields": "code,product_name,brands,image_front_url,countries_tags_en",
    }
    try:
        data = json.loads(_get(f"{FACTS[site]}/cgi/search.pl?{urllib.parse.urlencode(params)}", "facts"))
    except Exception as e:
        print(f"      lỗi {site}: {e}")
        return None
    wanted = [b.strip() for b in brands.split("|") if b.strip()]
    hits = []
    for p in data.get("products") or []:
        brand = (p.get("brands") or "").lower()
        if not p.get("image_front_url"):
            continue
        if wanted and not any(w in brand for w in wanted):
            continue
        in_vn = "vietnam" in " ".join(p.get("countries_tags_en") or []).lower()
        hits.append((0 if in_vn else 1, p))
    if not hits:
        return None
    hits.sort(key=lambda h: h[0])
    p = hits[0][1]
    return {
        "url": p["image_front_url"],
        "source_url": f"{FACTS[site]}/product/{p.get('code')}",
        "license": "CC BY-SA (Open Facts)",
        "title": f"{p.get('brands', '')} — {p.get('product_name', '')}"[:120],
    }


def find_commons(term: str) -> dict | None:
    params = {
        "action": "query", "generator": "search", "gsrsearch": f"filetype:bitmap {term}",
        "gsrnamespace": 6, "gsrlimit": 6, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": 600, "format": "json",
    }
    try:
        data = json.loads(_get(f"https://commons.wikimedia.org/w/api.php?{urllib.parse.urlencode(params)}", "commons"))
    except Exception as e:
        print(f"      lỗi commons: {e}")
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for _, v in sorted(pages.items(), key=lambda kv: kv[1].get("index", 99)):
        ii = (v.get("imageinfo") or [{}])[0]
        if not ii.get("thumburl"):
            continue
        meta = ii.get("extmetadata") or {}
        return {
            "url": ii["thumburl"],
            "source_url": ii.get("descriptionurl", ""),
            "license": (meta.get("LicenseShortName") or {}).get("value", "?"),
            "title": v.get("title", ""),
        }
    return None


def fetch_images() -> dict:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    done = json.loads(IMAGES.read_text(encoding="utf-8")) if IMAGES.exists() else {}
    for item in ITEMS:
        name, src = item[0], item[10]
        if name in done:
            continue
        hit = None
        if src[0] == "commons":
            hit = find_commons(src[1])
        else:
            hit = find_facts(src[0], src[1], src[2])
            if not hit and len(src) > 3:
                hit = find_commons(src[3])
        if not hit:
            print(f"  [thiếu] {name} — để emoji")
            continue
        dest = IMG_DIR / f"x-{re.sub(r'[^a-z0-9]+', '-', fold(name)).strip('-')[:48]}.jpg"
        try:
            data = _get(hit["url"], "commons" if "wikimedia" in hit["url"] else None, timeout=60)
            if len(data) < 3000:
                raise ValueError("ảnh quá nhỏ")
            dest.write_bytes(data)
        except Exception as e:
            print(f"  [hỏng]  {name}: {e}")
            continue
        done[name] = {"image_url": f"/uploads/products/{dest.name}", **{k: hit[k] for k in ("license", "source_url", "title")}}
        IMAGES.write_text(json.dumps(done, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  [ok]     {name}  ←  {hit['title'][:60]}")
    return done


# ─── nạp vào DB ───────────────────────────────────────────────────────────
def ean13(body12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body12))
    return body12 + str((10 - total % 10) % 10)


def load(images: dict) -> None:
    from app.database import SessionLocal
    from app.models import Brand, Category, Inventory, InventoryTransaction, Product, ProductBarcode, Unit
    from app.services.batch_service import backfill_opening_lots

    db = SessionLocal()
    try:
        cats = {c.slug: c for c in db.query(Category).all()}
        for slug, (name, icon, order) in NEW_CATEGORIES.items():
            if slug not in cats:
                cats[slug] = Category(name=name, slug=slug, icon=icon, sort_order=order, is_active=True)
                db.add(cats[slug])
                print(f"+ danh mục {icon} {name}")
        db.flush()

        units = {u.name: u.id for u in db.query(Unit).all()}
        brands = {b.name: b for b in db.query(Brand).all()}
        have = {n for (n,) in db.query(Product.name).all()}
        slugs = {s for (s,) in db.query(Product.slug).all()}
        codes = {c for (c,) in db.query(ProductBarcode.barcode).all()}
        n_sku = max([int(s[2:]) for (s,) in db.query(Product.sku).all() if s and s.startswith("SP") and s[2:].isdigit()] or [0])

        added = updated = 0
        existing = {p.name: p for p in db.query(Product).filter(Product.name.in_([it[0] for it in ITEMS])).all()}
        for i, (name, cat, brand, cost, sale, emoji, qty, ptype, min_stock, unit, _src) in enumerate(ITEMS):
            if name in have:
                img = (images.get(name) or {}).get("image_url")
                if name in existing and existing[name].image_url != img:
                    existing[name].image_url = img
                    updated += 1
                continue
            if brand not in brands:
                brands[brand] = Brand(name=brand)
                db.add(brands[brand])
                db.flush()
            n_sku += 1
            slug = fold(name).replace(" ", "-")[:200]
            if slug in slugs:
                slug = f"{slug}-{n_sku}"
            slugs.add(slug)
            code = ean13(f"21{n_sku:010d}")
            while code in codes:
                n_sku += 1
                code = ean13(f"21{n_sku:010d}")
            codes.add(code)

            p = Product(
                sku=f"SP{n_sku:04d}",
                name=name,
                slug=slug,
                name_search=fold(name),
                category_id=cats[cat].id,
                brand_id=brands[brand].id,
                base_unit_id=units.get(unit) or units["Cái"],
                product_type=ptype,
                cost_price=cost,
                sale_price=sale,
                min_stock=min_stock,
                emoji=emoji,
                image_url=(images.get(name) or {}).get("image_url"),
                is_online=True,
                online_sale_mode="APPROX" if ptype == "WEIGHTED" else "EXACT",
                description=f"{name} — hàng nhập thường xuyên, giá tốt tại Lâm Ly Mart.",
                sold_count=4 + (i * 7) % 23,
                rating_avg=4.2 + (i % 8) * 0.1,
                rating_count=2 + i % 11,
            )
            db.add(p)
            db.flush()
            db.add(ProductBarcode(barcode=code, product_id=p.id, is_primary=True, symbology="EAN13", source="INTERNAL"))
            db.add(Inventory(product_id=p.id, warehouse_id=1, quantity=qty, reserved=0))
            db.add(InventoryTransaction(product_id=p.id, warehouse_id=1, type="IMPORT", quantity=qty,
                                        balance_after=qty, unit_cost=cost, ref_type="seed", note="Tồn đầu kỳ"))
            added += 1

        db.flush()
        lots = backfill_opening_lots(db)
        db.commit()
        with_img = sum(1 for it in ITEMS if it[0] in images)
        print(f"\nThêm {added} món mới, cập nhật ảnh {updated} món đã có, {lots['created']} lô tồn đầu. "
              f"Có ảnh thật: {with_img}/{len(ITEMS)}.")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true", help="không tải ảnh, chỉ nạp DB")
    args = ap.parse_args()
    images = json.loads(IMAGES.read_text(encoding="utf-8")) if IMAGES.exists() else {}
    if not args.no_fetch:
        images = fetch_images()
    load(images)


if __name__ == "__main__":
    main()
