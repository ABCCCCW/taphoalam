export const vnd = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(n || 0));

export const num = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(Number(n || 0));

export const day = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
};

export const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

export const uid = () => crypto.randomUUID();
