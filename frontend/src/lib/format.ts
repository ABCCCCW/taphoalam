export const vnd = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(n || 0));

export const num = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(Number(n || 0));

export const day = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
};

/** Ngày đủ dd/mm/yyyy — dùng cho NSX, HSD. */
export const dateFull = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** "Quá hạn 3 ngày" / "Hết hạn hôm nay" / "Còn 5 ngày". */
export const expiryNote = (days?: number | null) => {
  if (days == null) return "";
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Hết hạn hôm nay";
  return `Còn ${days} ngày`;
};

export const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

/** Giờ + ngày/tháng/năm trên hoá đơn. */
export const whenFull = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const uid = () => crypto.randomUUID();
