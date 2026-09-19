/**
 * Toạ độ cho địa chỉ giao hàng — tra ngay trên trình duyệt của khách.
 *
 * Máy chủ của tiệm có thể không ra được Internet, nên việc tra bản đồ (OpenStreetMap
 * Nominatim) và lấy vị trí máy làm ở đây, rồi gửi toạ độ lên để backend tự tính phí.
 */
export type LatLng = { lat: number; lng: number };

export async function geocode(parts: (string | undefined | null)[]): Promise<LatLng | null> {
  const q = parts.map((p) => (p || "").trim()).filter(Boolean).join(", ");
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const hit = (await res.json())?.[0];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Máy này không cho lấy vị trí"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("Chưa được phép lấy vị trí — cho phép trong trình duyệt rồi thử lại")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export const kmText = (km: number) => `${km.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
