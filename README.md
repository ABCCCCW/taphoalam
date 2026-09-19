# TạpHoá POS — siêu thị mini, hai mặt tiền một kho

Hệ thống bán hàng tạp hoá: **quầy thu ngân (POS)** + **website khách tự đặt**, dùng chung tồn kho, giữ hàng cho đơn online, thanh toán VietQR, điện thoại làm máy quét.

Cần **Python 3.10+** (3.9 lỗi type hint FastAPI) và **Node 20+**. Máy chỉ có Python 3.9 / chưa cài Node thì dùng Docker.

## Chạy local (khuyên dùng khi demo)

### 1. Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m seeds.seed_data
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173

## Tài khoản mẫu

| Vai | Đăng nhập | Mật khẩu | PIN |
|---|---|---|---|
| Quản trị | `admin` | `admin123` | `0000` |
| Thu ngân | `cashier` | `cashier123` | `1234` |
| Kho | `stocker` | `stocker123` | `4321` |
| Khách | SĐT `0901234567` | `khach123` | — |

Mã KM: `TET10` (giảm 10% đơn từ 50k)

Quét thử tại POS: `8934588063053` (Coca 330ml)

## Docker
```bash
docker compose up -d
```
Nhóm `taphoa_lam` trên Docker Desktop: `BE_taphoa_lam` (cổng 8000) + `FE_taphoa_lam` (cổng 5173).

## Luồng demo nên show

1. Mở ca thu ngân → quét/bấm 3 món → bấm Tiền mặt → tồn giảm.
2. Khách online đặt 2 hộp sữa → tại quầy chỉ còn bán được phần còn lại (cột **Giữ** trên tồn kho).
3. Bấm QR → `/demo/bank` bấm chuyển khoản → đơn tự khớp.
4. Điện thoại `/scan` nhập mã 6 số từ POS.

Tài liệu thiết kế: `docs/plan.html`

## Triển khai miễn phí: Vercel + Supabase

- **Supabase** (gói Free): tạo project → *Connect* → copy chuỗi **Transaction pooler** (cổng 6543).
- Chép dữ liệu từ `backend/taphoa.db` lên Supabase (chạy một lần trên máy):
  ```bash
  cd backend
  DATABASE_URL='postgresql://postgres.<ref>:<mật-khẩu>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
    .venv/bin/python -m scripts.migrate_to_postgres --reset
  ```
- **Vercel** (gói Hobby): *Add New → Project* → import repo này, giữ nguyên Root Directory, thêm biến môi trường:

  | Biến | Giá trị |
  |---|---|
  | `DATABASE_URL` | chuỗi Transaction pooler của Supabase |
  | `SECRET_KEY` | chuỗi ngẫu nhiên dài |
  | `SKIP_SCHEMA_SYNC` | `1` |

`vercel.json` tự build frontend (Vite) ra CDN, `api/index.py` chạy FastAPI dạng serverless, ảnh `backend/uploads` được chép vào bản build. Máy quét điện thoại trên Vercel dùng hỏi định kỳ (`/scanner/sessions/{id}/events`) thay WebSocket.
