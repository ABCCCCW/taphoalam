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

Fix 2026-09-19: Admin cuộn cả trang. Đổi `AdminLayout` khóa viewport; `PageFrame`/`PageBody`; Tổng quan hai khung cố định, danh sách việc/lô cuộn trong «Cần làm».

Fix 2026-09-19: Bỏ copy giải thích dài (màn tiền mặt và toàn hệ thống): hint, subtitle dạy cách dùng, Notice mẹo. Giữ nhãn, dữ liệu, lỗi.

Fix 2026-09-19: Màn tiền mặt bỏ chip 50k/100k/Đưa đúng và nút máy tính — gõ số khách đưa bằng bàn phím.

Fix 2026-09-19: Phân trang 10 dòng cho Hàng hoá, Tồn kho, Kiểm kê (và Hoá đơn, Khách, In tem). Số trang theo `total`, không cứng dãy `1 2 3 … 6 7`.

Fix 2026-09-19: In tem — bỏ chip 1/10/24/48, nút ± và mũi tên spinner. Gõ số tem. Preview hiện từng tem theo số đã chọn, không gộp ×N.

Fix 2026-09-19: Trụ sở đổi từ 12 Nguyễn Trãi, Thanh Xuân sang Cầu Diễn, Bắc Từ Liêm (shop, hoá đơn, seed, toạ độ phí ship).

Fix 2026-09-19: Chân trang shop — dính đáy viewport khi trang ngắn; bỏ cột POS/quét mã khỏi chân trang khách.

Fix 2026-09-19: Màn đăng nhập/đăng ký — bỏ hộp đen lộ tài khoản mẫu; SĐT chỉ số; mật khẩu có ẩn/hiện, không dấu, không khoảng trắng. Ô số (SĐT, PIN, STK, BIN) lọc chữ số trên toàn form.

Fix 2026-09-19: Kệ hàng shop — bỏ khay chip lệch trái và lưới icon phình. Nhóm hàng một thanh 10 ô, chọn coral. Ảnh thẻ `cover` lấp khung vuông. Bỏ tiêu đề, số món và ô xếp Bán chạy.

Fix 2026-09-19: Header shop — bỏ thanh đen «Giao quanh Cầu Diễn» / SĐT và dòng «tạp hoá online» dưới logo.

Fix 2026-09-19: Modal báo cáo — bỏ subtitle so sánh kỳ trước, dòng phụ dưới KPI, chú thích file Excel 3 sheet.

Fix 2026-09-19: Modal có chân Huỷ/Đóng thì bỏ dấu X trên header. Chi tiết hoá đơn thêm Đóng. Khôi phục `TAB_BAR`/`tabClass` vì KhoTabs import mà Page đã xoá — app trắng.

Fix 2026-09-19: Màn QR POS — bỏ chữ «Đang chờ khách chuyển» và link mô phỏng ngân hàng. Giữ Đã nhận tiền + Nháp.

Fix 2026-09-19: Mã QR POS phóng to (tối đa 20rem) và căn giữa cột phải.

Fix 2026-09-19: Thanh tìm + chip lọc trên mọi màn admin — bỏ viên thuốc xám. `Toolbar` là khay trắng, ô tìm sand, chip chọn tô than. Đơn online dùng chung `Segmented`.

Fix 2026-09-19: Ô `type=date` không hiện «Hôm nay» (Safari/Chrome). Hiện ngày số `19/09/2026`.

Fix 2026-09-19: Bỏ màn Cấu hình. Icon ngân hàng cạnh Đăng xuất; PIN `000000` rồi popup sửa STK. `/admin/settings` về Tổng quan.

Fix 2026-09-19: Bỏ form tên/SĐT/địa chỉ cửa hàng trên màn Tài khoản. POS và hoá đơn vẫn lấy từ settings/seed.

Fix 2026-09-19: Sidebar admin bỏ nhóm «Hôm nay» — Tổng quan / Bán hàng / Đơn online không có chữ + gạch ngang phía trên.

Fix 2026-09-19: Khách hàng đổi lưới thẻ sang `DataTable` như Hàng hoá / Tài khoản. Lần trước chỉ đổi thanh tìm nên màn này vẫn thẻ cũ.

Fix 2026-09-19: Nháp QR giống tiền mặt — bấm chip Chưa TT về giỏ, Xoá đơn trên giỏ mới huỷ + trả tồn. Không thêm nút Xoá trên màn QR.
