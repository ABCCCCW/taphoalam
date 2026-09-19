# Active context

Đã dựng MVP đầy đủ theo `docs/plan.html`: shop, POS, admin, kho, đơn online, QR, scanner, seed 50 SP.

Tài khoản: admin/admin123, cashier/cashier123, stocker/stocker123, khách 0901234567/khach123.

Form `/dang-nhap` là khách (SĐT). Nhân viên vào `/admin/login`. Nếu gõ admin/cashier/stocker trên form shop thì tự chuyển sang đăng nhập staff.

POS: header logo + tên/địa chỉ/SĐT. Khối tài khoản: họ tên NV, dưới là mã NV (`NV001`) · Ca sáng/Ca đêm (6h–18h theo giờ mở ca). Icon đầu người mở menu (Hàng ngoài, Ghép điện thoại, Đóng ca). Không chip «ĐT» hay «Ca 0001». Ô tìm F1 cạnh kệ; danh mục trong Bộ lọc. Giỏ phiếu lime + chân emerald, giá coral, QR coral.

POS QR từng trừ kho ngay khi bấm QR dù chưa nhận tiền — 2 đơn pending nuốt hết 7Up trong khi kệ còn hiện số cũ. Đã đổi: QR giữ hàng, đóng QR thì huỷ và trả tồn; kệ refetch 8s; nút + không vượt available.

Alert “kệ hết rồi” lúc giỏ 23 chai 7Up + tăm chỉ: 7Up còn đủ 23; tăm chỉ nha khoa (tạo nhanh POS) tồn 0. Thông báo tồn kho giờ kèm tên hàng.

POS: ghép ĐT xong ẩn QR, giữ WS; chip ĐT trên header. Menu Ngắt điện thoại.

POS mã lạ / hàng ngoài: menu POS hoặc quét mã chưa có kệ → tên + giá bán + số đang cầm. `quick-create` FOUND đúng số đó, `cost_confirmed=false`. Chốt đơn tự FOUND phần thiếu nên không kẹt tồn 0. Admin/stocker chốt giá vốn tại Hàng hoá. CASHIER không thấy `cost_price`.

In hoá đơn POS: chốt tiền mặt / xác nhận QR mở phiếu xem trước rồi in. CSS print portal `.print-area` ra `body`, ẩn `#root` — tránh preview trắng nhiều trang. In lại từ Hoá đơn admin.

Màn tiền mặt / QR: tờ xem trước là HOÁ ĐƠN, không chữ phiếu, không đóng dấu NHÁP. Tiền mặt: Thanh toán rồi nút Nháp (giữ giỏ). QR: Đã nhận tiền / Nháp / Huỷ QR.

Giỏ POS: nút Nháp / Xoá đơn. Chip hàng «Để đó» ghi Chưa TT 1, Chưa TT 2 — mở lại đơn chưa thu tiền (giỏ nháp hoặc QR chờ).

Dev: máy tính HTTP `http://127.0.0.1:5173` (Cursor không tin mkcert → ERR_CERT_AUTHORITY_INVALID). Ghép ĐT dùng HTTP `:5173` (QR không kẹt chứng chỉ). Camera iPhone mới cần HTTPS `:5174`. IP Wi‑Fi lấy bằng WebRTC — không tin `PUBLIC_HOST` cũ trong Docker. Đổi Wi‑Fi thì chạy `scripts/mkcert-lan.sh` rồi restart frontend.

Logo web: `frontend/public/logo-lam-mart.png` (Lâm Mart). Component `BrandLogo`. Header shop/admin/POS/login dùng ảnh này, không dùng emoji 🥬 làm logo.

Thông báo: toast có kicker (Xong / Chưa được / Nhắc), không chồng tấm trùng. Modal nhỏ xếp nút dọc. Hộp nhắc trong form/modal dùng `Notice`. Không chữ giải thích dài (hint, subtitle dạy cách dùng) — chỉ nhãn, số liệu, lỗi.
