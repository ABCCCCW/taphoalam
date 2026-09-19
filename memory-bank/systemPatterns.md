# System patterns

- Mọi thay đổi tồn kho đi qua `InventoryService.apply()` (UPDATE nguyên tử + sổ cái).
- Giữ hàng online và POS QR: `ReservationService.reserve/release/consume`. POS tiền mặt mới `apply()` SALE ngay.
- Token tách `staff` / `customer`. API `/api/v1/shop/*` chỉ nhận customer.
- Ba nguồn mã vạch (USB, ĐT, gõ tay) đổ vào `handleScan` ở POS.
- POS tạo nhanh: thu ngân không gửi/xem giá vốn. Hàng `cost_confirmed=false` được FOUND phần thiếu lúc chốt. Kho chốt giá vốn + có thể IMPORT số còn trên kệ. `ensure_schema()` ALTER cột SQLite cũ.
- In phiếu: `ReceiptPrinter` portal `.print-area` ra `document.body`. `@media print` ẩn `body > *:not(.print-area)`. Không `visibility:hidden` vì phần tử ẩn vẫn phân trang.
