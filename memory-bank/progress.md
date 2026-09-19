# Progress

Done: auth 2 hệ, CRUD hàng, tồn/sổ cái, nhập-kiểm kê, POS F1–F9, VietQR + mock bank, giữ hàng online, shop, dashboard, in tem, seed.

Scanner iOS: canvas `display:none` làm drawImage đen — đã bỏ; quét dải ngang + invert. User cần reload `/scan` trên điện thoại.

Known: SQLite cho dev; Docker compose seed SQLite volume.

Fix 2026-08-27: POS QR trừ kho sớm + kệ stale → chốt tiền mặt fail dù UI còn hàng. QR giờ reserved; huỷ QR restock cả đơn cũ đã SALE.

Fix 2026-08-27: POS mã lạ không còn ô giá vốn. Thu ngân chỉ bán; admin/stocker xác nhận giá vốn trên Hàng hoá.

Fix 2026-08-27: Hàng ngoài (quét mã / menu) bán được ngay — checkout FOUND phần thiếu nếu chưa chốt giá vốn.

Fix 2026-08-27: In hoá đơn POS preview trắng 6 trang — `visibility:hidden` vẫn phân trang kệ POS, `window.print()` chạy trước khi phiếu render. Đổi portal print + modal xem trước, in sau khi vẽ.

Fix 2026-08-27: Phiếu tính tiền mẫu chuẩn + dấu NHÁP. QR chờ CK không chặn quầy — để đó bán đơn khác, chip NHÁP mở lại.

Fix 2026-08-27: Form tiền mặt — nút Thanh toán + Nháp; xem trước đổi thành HOÁ ĐƠN, bỏ chữ phiếu và dấu NHÁP trên tờ.

Fix 2026-08-27: Giỏ POS — nút || khó hiểu. Đổi thành Nháp / Xoá đơn. Chip đơn để đó ghi Chưa TT 1, Chưa TT 2 — không ghi «Nháp · x món».

Fix 2026-09-19: Bảng hiển thị dính liền, tiêu đề nhạt. Đổi `.tbl` + `tbl-wrap`: khung rõ, tiêu đề đậm, kẻ dòng/cột đủ, xen màu dòng. `list-rows` cho danh sách dạng bảng.

Fix 2026-09-19: Ghép ĐT hỏng — QR trỏ `192.168.8.203` (PUBLIC_HOST cũ) + cert chỉ có `192.168.1.97` trong khi máy đang `192.168.1.99`. QR ghép chuyển HTTP `:5173`, IP lấy WebRTC, cấp lại cert SAN.

Fix 2026-09-19: Logo web (`/logo-lam-mart.png`) thay emoji 🥬 trên header shop, admin, POS, login, favicon.

Fix 2026-09-19: Đổi tên ứng dụng thành Lâm Ly Mart (header, hoá đơn, cấu hình, seed, API title).

Fix 2026-09-19: Header POS — tìm kiếm xuống cạnh kệ, tab Tất cả/nhóm hàng gom vào nút Bộ lọc, trên cùng hiện thông tin cửa hàng + menu icon người.

Fix 2026-09-19: Thông báo/modal chữ sát nhau. Toast tách nhãn + nội dung, gộp trùng; modal sm xếp nút dọc; hộp nhắc dùng `Notice`.

Fix 2026-09-19: Ô modal chỉ gõ được 1 chữ — `useEffect` phụ thuộc `onClose` nên mỗi lần gõ lại focus panel. Bỏ dep đó, nới padding chân nút.

Fix 2026-09-19: Chân thông báo một hàng Huỷ/Lưu. Quét mã lạ thì Hàng ngoài hiện sẵn mã vào ô Mã hàng.

Fix 2026-09-19: Header POS bỏ chip «Ca 0001» / «ĐT». Hiện họ tên NV, dưới là mã NV + Ca sáng/Ca đêm.

Fix 2026-09-19: Bỏ copy giải thích dài (màn tiền mặt và toàn hệ thống): hint, subtitle dạy cách dùng, Notice mẹo. Giữ nhãn, dữ liệu, lỗi.

Fix 2026-09-19: Màn tiền mặt bỏ chip 50k/100k/Đưa đúng và nút máy tính — gõ số khách đưa bằng bàn phím.
