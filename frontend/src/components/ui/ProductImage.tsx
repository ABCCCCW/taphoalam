/**
 * Ảnh sản phẩm với emoji làm dự phòng.
 *
 * Không phải mặt hàng nào cũng có ảnh thật: hàng tươi và hàng tự đóng gói
 * không có trong cơ sở dữ liệu mã vạch mở nào cả. Những mặt hàng đó rơi về
 * emoji, nên lưới hàng vẫn kín chỗ thay vì thủng một mảng trống.
 *
 * Khung bọc phải là `flex items-center justify-center`, đừng dùng
 * `grid place-items-center`. Trong grid, hàng tự co giãn theo nội dung nên
 * `h-full` của ảnh quay về kích thước gốc của tệp, ảnh phình ra khỏi khung và
 * đè lên tên với giá bên dưới.
 */
import { useState } from "react";

export function productImageSrc(url?: string | null): string | null {
  if (!url) return null;
  // Đường dẫn tương đối: Vite (dev) và nginx (production) đều proxy /uploads
  // về backend. Dùng URL tuyệt đối tới localhost sẽ hỏng khi mở trên điện thoại.
  return url;
}

export default function ProductImage({
  src,
  emoji,
  alt,
  className = "",
  emojiClassName = "",
  fit = "contain",
}: {
  src?: string | null;
  emoji?: string | null;
  alt?: string;
  className?: string;
  emojiClassName?: string;
  /** "cover" lấp kín khung (ảnh chụp tay ở quầy), "contain" giữ nguyên cả ảnh. */
  fit?: "contain" | "cover";
}) {
  const [failed, setFailed] = useState(false);
  const resolved = productImageSrc(src);

  if (!resolved || failed) {
    return <span className={emojiClassName}>{emoji || "🛒"}</span>;
  }
  return (
    <img
      src={resolved}
      alt={alt || ""}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
    />
  );
}
