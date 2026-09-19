# Ảnh sản phẩm

`products/` chứa ảnh mặt trước sản phẩm tải về từ **Open Food Facts** và
**Open Beauty Facts** bằng script `seeds/fetch_real_products.py`.

## Nguồn và giấy phép

- Dữ liệu: Open Food Facts, giấy phép **ODbL**
- Ảnh: người dùng đóng góp, giấy phép **CC-BY-SA**

Dùng lại được cho đồ án, chỉ cần ghi nguồn. File `seeds/real_products.json`
lưu sẵn `source_url` của từng ảnh để trích dẫn trong báo cáo.

## Chạy lại

```bash
cd backend
python -m seeds.fetch_real_products
```

Lần đầu mất vài phút vì máy chủ công cộng giới hạn ~10 lượt/phút; danh mục
được lưu cache vào `seeds/off_catalogue.json` nên các lần sau chạy tức thì.
Xoá file cache đó nếu muốn lấy dữ liệu mới.

## Mặt hàng không có ảnh

Hàng tươi (thịt, cá, rau củ) và hàng tự đóng gói (xôi, cơm hộp, bánh mì) không
có mã vạch nhà sản xuất nên không tồn tại trong bất kỳ cơ sở dữ liệu mã vạch
mở nào. Những mặt hàng này dùng emoji trong cột `products.emoji` — giao diện
tự rơi về emoji khi `image_url` trống, xem `components/ui/ProductImage.tsx`.

Muốn có ảnh thật cho nhóm này thì phải tự chụp rồi đặt vào `products/` và điền
đường dẫn `/uploads/products/<tên-file>` vào cột `image_url`.
