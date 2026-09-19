/**
 * Bảng dịch enum của backend sang tiếng Việt cho người dùng.
 *
 * Màn hình quản trị trước đây in thẳng `PENDING_CONFIRM`, `SHRINKAGE` ra bảng.
 * Thu ngân và nhân viên kho không đọc được mấy chữ đó, nên mọi enum đi qua đây.
 */

export type Tone = "lime" | "coral" | "ink" | "sun" | "sky" | "grape" | "mute";

export const TONE_CLASS: Record<Tone, string> = {
  lime: "bg-lime-100 text-forest-800",
  coral: "bg-coral-100 text-coral-700",
  ink: "bg-forest-900 text-white",
  sun: "bg-sun-100 text-sun-700",
  sky: "bg-sky-100 text-sky-700",
  grape: "bg-grape-100 text-grape-700",
  mute: "bg-ink-100 text-ink-500",
};

type Entry = { label: string; tone: Tone };

const dict = <T extends Record<string, Entry>>(m: T) => m;

export const ORDER_STATUS = dict({
  PENDING_PAYMENT: { label: "Chờ chuyển khoản", tone: "sky" },
  PENDING_CONFIRM: { label: "Chờ duyệt", tone: "sun" },
  CONFIRMED: { label: "Đã duyệt", tone: "lime" },
  PACKING: { label: "Đang soạn", tone: "sun" },
  SHIPPING: { label: "Đang giao", tone: "grape" },
  COMPLETED: { label: "Xong", tone: "ink" },
  CANCELLED: { label: "Đã huỷ", tone: "mute" },
  REFUNDED: { label: "Đã hoàn tiền", tone: "coral" },
  RETURNED: { label: "Khách trả hết", tone: "coral" },
  PARTIALLY_RETURNED: { label: "Trả một phần", tone: "sun" },
});

export const PAYMENT_STATUS = dict({
  PAID: { label: "Đã trả", tone: "lime" },
  UNPAID: { label: "Chưa trả", tone: "coral" },
  PARTIAL: { label: "Trả một phần", tone: "sun" },
  REFUNDED: { label: "Đã hoàn", tone: "mute" },
});

export const CHANNEL = dict({
  POS: { label: "Tại quầy", tone: "lime" },
  ONLINE: { label: "Website", tone: "grape" },
});

export const PAY_METHOD = dict({
  CASH: { label: "Tiền mặt", tone: "lime" },
  QR_BANK: { label: "Chuyển khoản", tone: "sky" },
  COD: { label: "Trả khi nhận", tone: "sun" },
});

export const DELIVERY = dict({
  PICKUP: { label: "Lấy tại quầy", tone: "lime" },
  DELIVERY: { label: "Giao tận nơi", tone: "coral" },
});

export const DOC_STATUS = dict({
  DRAFT: { label: "Nháp", tone: "mute" },
  CONFIRMED: { label: "Đã nhập kho", tone: "lime" },
  CANCELLED: { label: "Đã huỷ", tone: "coral" },
  BALANCED: { label: "Đã cân bằng", tone: "ink" },
});

export const TX_TYPE = dict({
  IMPORT: { label: "Nhập hàng", tone: "lime" },
  SALE: { label: "Bán ra", tone: "sky" },
  SALE_RETURN: { label: "Khách trả lại", tone: "sun" },
  SUPPLIER_RETURN: { label: "Trả nhà cung cấp", tone: "coral" },
  ADJUST: { label: "Điều chỉnh", tone: "grape" },
  DAMAGED: { label: "Hàng dập vỡ", tone: "coral" },
  EXPIRED: { label: "Hết hạn", tone: "coral" },
  SHRINKAGE: { label: "Hao hụt", tone: "sun" },
  FOUND: { label: "Kiểm thấy thêm", tone: "lime" },
  CANCEL: { label: "Huỷ đơn, trả tồn", tone: "mute" },
});

/** Loại điều chỉnh thu ngân/kho được chọn khi ghi sổ hao hụt. */
export const ADJUST_TYPES = [
  { value: "SHRINKAGE", label: "Hao hụt (héo, rơi, mất)" },
  { value: "DAMAGED", label: "Dập vỡ, hỏng bao bì" },
  { value: "EXPIRED", label: "Hết hạn sử dụng" },
  { value: "ADJUST", label: "Điều chỉnh khác" },
];

export const PRODUCT_TYPE = dict({
  STANDARD: { label: "Đếm cái", tone: "lime" },
  WEIGHTED: { label: "Cân kg", tone: "sun" },
  BULK: { label: "Bán xá", tone: "sky" },
});

export const PRODUCT_TYPES = [
  { value: "STANDARD", label: "Đếm cái — bán theo chiếc/gói" },
  { value: "WEIGHTED", label: "Cân kg — rau, thịt, hoa quả" },
  { value: "BULK", label: "Bán xá — gạo, đường múc lẻ" },
];

export const TIER = dict({
  MEMBER: { label: "Khách quen", tone: "mute" },
  SILVER: { label: "Bạc", tone: "sky" },
  GOLD: { label: "Vàng", tone: "sun" },
  VIP: { label: "VIP", tone: "coral" },
});

export const ROLE = dict({
  ADMIN: { label: "Chủ tiệm", tone: "ink" },
  CASHIER: { label: "Thu ngân", tone: "lime" },
  STOCKER: { label: "Nhân viên kho", tone: "sky" },
});

export const ROLES = [
  { value: "CASHIER", label: "Thu ngân — bán hàng tại quầy" },
  { value: "STOCKER", label: "Nhân viên kho — nhập hàng, kiểm kê" },
  { value: "ADMIN", label: "Chủ tiệm — toàn quyền" },
];

/** Tra nhãn an toàn: enum lạ vẫn hiện ra chữ gốc thay vì ô trống. */
export function look(map: Record<string, Entry>, key?: string | null): Entry {
  if (!key) return { label: "—", tone: "mute" };
  return map[key] || { label: key, tone: "mute" };
}
