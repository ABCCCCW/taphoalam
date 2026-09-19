# Active context

Đã dựng MVP đầy đủ theo `docs/plan.html`: shop, POS, admin, kho, đơn online, QR, scanner, seed 50 SP.

Tài khoản: admin/Admin@2026, thu ngân 0001 & kho 0002 (mật khẩu Nguyenbaolam), khách 0901234567/khach123. Nhân viên mới tự cấp mã 0003… (`app/services/staff_accounts.py`).

Form `/dang-nhap` là khách (SĐT), không hiện hộp tài khoản mẫu. Ô trống, SĐT chỉ số, mật khẩu có nút mắt, không dấu/không khoảng trắng. Nhân viên gõ tên đăng nhập trên cùng form hoặc vào `/admin/login` (chuyển về `/dang-nhap`).

Ô ngày (`type=date`) hiện `19/09/2026`, không chữ «Hôm nay» của Safari/Chrome.

Cấu hình cửa hàng đã bỏ. Ngân hàng: icon cạnh Đăng xuất, PIN `000000` mở popup sửa tài khoản nhận CK. `/admin/settings` về Tổng quan. Sidebar admin không ghi nhóm «Hôm nay» trên Tổng quan / Bán hàng / Đơn online.

POS: header logo + tên/địa chỉ/SĐT. Khối tài khoản: họ tên NV, dưới là mã NV (`NV001`) · Ca sáng/Ca đêm (6h–18h theo giờ mở ca). Icon đầu người mở menu (Hàng ngoài, Ghép điện thoại, Đóng ca). Không chip «ĐT» hay «Ca 0001». Ô tìm F1 cạnh kệ; danh mục trong Bộ lọc. Giỏ phiếu lime + chân emerald, giá coral, QR coral.

POS QR từng trừ kho ngay khi bấm QR dù chưa nhận tiền — 2 đơn pending nuốt hết 7Up trong khi kệ còn hiện số cũ. Đã đổi: QR giữ hàng, đóng QR thì huỷ và trả tồn; kệ refetch 8s; nút + không vượt available.

Alert “kệ hết rồi” lúc giỏ 23 chai 7Up + tăm chỉ: 7Up còn đủ 23; tăm chỉ nha khoa (tạo nhanh POS) tồn 0. Thông báo tồn kho giờ kèm tên hàng.

POS: ghép ĐT xong ẩn QR, giữ WS; chip ĐT trên header. Menu Ngắt điện thoại.

POS mã lạ / hàng ngoài: menu POS hoặc quét mã chưa có kệ → tên + giá bán + số đang cầm. `quick-create` FOUND đúng số đó, `cost_confirmed=false`. Chốt đơn tự FOUND phần thiếu nên không kẹt tồn 0. Admin/stocker chốt giá vốn tại Hàng hoá. CASHIER không thấy `cost_price`.

In hoá đơn POS: chốt tiền mặt / xác nhận QR mở phiếu xem trước rồi in. CSS print portal `.print-area` ra `body`, ẩn `#root` — tránh preview trắng nhiều trang. In lại từ Hoá đơn admin.

Màn tiền mặt / QR: tờ xem trước là HOÁ ĐƠN, không chữ phiếu, không đóng dấu NHÁP. Tiền mặt: Thanh toán rồi nút Nháp (giữ giỏ). QR: Đã nhận tiền / Nháp — không nút Xoá trên màn QR. Nháp = chip Chưa TT. Bấm chip thì về giỏ như tiền mặt; Xoá đơn trên giỏ huỷ đơn QR + trả tồn. Bấm QR lại thì mở mã cũ. Tải lại POS hỏi lại `PENDING_PAYMENT`. Mã QR to (tối đa 20rem), căn giữa cột phải.

Giỏ POS: nút Nháp / Xoá đơn. Chip hàng «Để đó» ghi Chưa TT 1, Chưa TT 2 — mở lại đơn chưa thu tiền (giỏ nháp hoặc QR chờ).

Dev: máy tính HTTP `http://127.0.0.1:5173` (Cursor không tin mkcert → ERR_CERT_AUTHORITY_INVALID). Ghép ĐT dùng HTTP `:5173` (QR không kẹt chứng chỉ). Camera iPhone mới cần HTTPS `:5174`. IP Wi‑Fi lấy bằng WebRTC — không tin `PUBLIC_HOST` cũ trong Docker. Đổi Wi‑Fi thì chạy `scripts/mkcert-lan.sh` rồi restart frontend.

Logo web: `frontend/public/logo-lam-mart.png` (Lâm Ly Mart). Component `BrandLogo`. Header shop/admin/POS/login dùng ảnh này, không dùng emoji 🥬 làm logo. Tên cửa hàng mặc định: Lâm Ly Mart. Header shop không có dòng «tạp hoá online», không có thanh đen giao hàng/SĐT phía trên. Trụ sở: Cầu Diễn, Bắc Từ Liêm, Hà Nội.

Chân trang shop: `flex min-h-dvh` + `main flex-1` nên luôn sát đáy, không để khoảng trống dưới. Chỉ link khách (danh mục, đơn, điểm). POS / quét mã không hiện cho khách — nhân viên vào từ header «Nhân viên» hoặc `/admin/login`.

Kệ hàng `/catalog`: không kicker, không tiêu đề, không số món, không ô xếp. Chỉ thanh nhóm. API vẫn `sort=-sold_count`. Ảnh thẻ `object-cover` lấp ô vuông. Header shop: ô tìm kéo hết khoảng giữa logo và nút.

Thông báo: toast có kicker (Xong / Chưa được / Nhắc), không chồng tấm trùng. Modal nhỏ xếp nút dọc. Hộp nhắc trong form/modal dùng `Notice`. Không chữ giải thích dài (hint, subtitle dạy cách dùng) — chỉ nhãn, số liệu, lỗi. Modal có chân Huỷ/Đóng thì không dấu X trên header; X chỉ khi hộp không có chân (PIN, ghép ĐT, lịch sử tồn). Chi tiết hoá đơn thêm nút Đóng ở chân.

Báo cáo doanh thu (modal trên Tổng quan): subtitle chỉ khoảng ngày, không «so với X ngày liền trước». Thẻ số không dòng Kỳ trước / Tỷ suất / Tiền mặt. Chân hộp chỉ Đóng + Xuất Excel, không chú thích 3 sheet.

Admin: khung ngoài (sidebar, tiêu đề trang, viền thẻ) đứng yên. Chỉ thân `PageBody` / `Section` cuộn. Tổng quan: 4 ô hôm nay + 2 cột Cần làm / chi tiết. Nút Báo cáo mở modal. Không màn Cấu hình — ngân hàng là icon cạnh Đăng xuất (PIN 000000). Màn Tài khoản chỉ danh sách nhân viên, không form tên/SĐT/địa chỉ cửa hàng (lấy từ seed, hiện POS/hoá đơn).

Danh sách dài: 10 dòng/trang. Số trang cuối = `ceil(total / size)` — không cứng 7. `Pager` hiện hết nếu ≤ 9 trang, nhiều hơn thì đầu + quanh trang mở + trang cuối. API `{items, page, size, total, pages}`. Kiểm kê đổi trang vẫn giữ số đã đếm.

In tem (`/admin/labels`): chỉ ô số tem, không chip gợi ý / ± / spinner. Mẫu tem hiện đủ từng tờ theo số đã gõ.

Thanh tìm + lọc trên mọi màn danh sách (`Toolbar` / `SearchInput` / `Segmented`): khay sand viền ink, ô tìm trái (`sm:w-80`), chip lọc phải (`justify-between`). Chip đang chọn tô coral. Tab Kho cùng kiểu.

Khách hàng dùng `DataTable` (tên + mã KH, SĐT, hạng, nguồn, điểm, đã chi) — không lưới thẻ.
