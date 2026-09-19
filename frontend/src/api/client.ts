import axios from "axios";
import { useAuth } from "../stores/authStore";
import { useShopAuth } from "../stores/shopAuthStore";

export const api = axios.create({ baseURL: "/api/v1" });

let staffRefreshing: Promise<string | null> | null = null;

function refreshStaffAccess() {
  if (staffRefreshing) return staffRefreshing;
  const refresh = localStorage.getItem("staff_refresh");
  if (!refresh) return Promise.resolve(null);
  staffRefreshing = axios
    .post("/api/v1/auth/refresh", { refresh_token: refresh })
    .then((r) => {
      useAuth.getState().setAuth(r.data.access_token, r.data.user, r.data.refresh_token);
      return r.data.access_token as string;
    })
    .catch(() => {
      useAuth.getState().logout();
      return null;
    })
    .finally(() => {
      staffRefreshing = null;
    });
  return staffRefreshing;
}

function toApiError(err: any) {
  const detail = err.response?.data?.message || err.response?.data?.detail;
  if (typeof detail === "string" && detail) return new Error(detail);
  if (!err.response) return new Error("Không kết nối được máy chủ. Backend hoặc Vite đang tắt — mở lại rồi thử lại.");
  return new Error(err.message || "Có lỗi xảy ra");
}

api.interceptors.request.use((config) => {
  const shop = config.url?.startsWith("/shop");
  const token = shop ? useShopAuth.getState().access : useAuth.getState().access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const cfg = err.config || {};
    const url = String(cfg.url || "");
    const staff401 =
      err.response?.status === 401 &&
      !url.includes("/shop") &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/refresh") &&
      !cfg._retry;
    if (staff401) {
      cfg._retry = true;
      const token = await refreshStaffAccess();
      if (token) {
        cfg.headers = cfg.headers || {};
        cfg.headers.Authorization = `Bearer ${token}`;
        return api.request(cfg);
      }
      const path = window.location.pathname;
      if (path.startsWith("/pos") || path.startsWith("/admin")) {
        window.location.assign("/dang-nhap");
      }
    }
    return Promise.reject(toApiError(err));
  }
);

export const staffApi = {
  login: (username: string, password: string) => api.post("/auth/login", { username, password }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  products: (params?: object) => api.get("/products", { params }).then((r) => r.data),
  product: (id: number) => api.get(`/products/${id}`).then((r) => r.data),
  barcode: (code: string) => api.get(`/products/barcode/${encodeURIComponent(code)}`).then((r) => r.data),
  lookup: (code: string) => api.get(`/barcode/lookup/${encodeURIComponent(code)}`).then((r) => r.data),
  quickCreate: (body: object) => api.post("/products/quick-create", body).then((r) => r.data),
  uploadProductImage: (id: number, image: Blob) => {
    const fd = new FormData();
    fd.append("file", image, "anh.jpg");
    return api.post(`/products/${id}/image`, fd).then((r) => r.data);
  },
  setShelfLot: (id: number, body: { mfg_date?: string; expiry_date: string; quantity?: number }) =>
    api.put(`/products/${id}/shelf-lot`, body).then((r) => r.data),
  saveProduct: (body: object, id?: number) => (id ? api.put(`/products/${id}`, body) : api.post("/products", body)).then((r) => r.data),
  categories: () => api.get("/categories").then((r) => r.data),
  units: () => api.get("/units").then((r) => r.data),
  suppliers: () => api.get("/suppliers").then((r) => r.data),
  createSupplier: (body: object) => api.post("/suppliers", body).then((r) => r.data),
  inventory: (params?: object) => api.get("/inventory", { params }).then((r) => r.data),
  history: (id: number) => api.get(`/inventory/${id}/history`).then((r) => r.data),
  adjust: (body: object) => api.post("/inventory/adjust", body).then((r) => r.data),
  batches: (status?: string) => api.get("/inventory/batches", { params: status ? { status } : undefined }).then((r) => r.data),
  writeOffBatch: (id: number) => api.post(`/inventory/batches/${id}/write-off`).then((r) => r.data),
  receipts: () => api.get("/stock-receipts").then((r) => r.data),
  createReceipt: (body: object) => api.post("/stock-receipts", body).then((r) => r.data),
  receiptLabels: (id: number) => api.get(`/stock-receipts/${id}/labels`).then((r) => r.data),
  confirmReceipt: (id: number) => api.post(`/stock-receipts/${id}/confirm`).then((r) => r.data),
  cancelReceipt: (id: number) => api.post(`/stock-receipts/${id}/cancel`).then((r) => r.data),
  stockTakes: () => api.get("/stock-takes").then((r) => r.data),
  createTake: (body: object) => api.post("/stock-takes", body).then((r) => r.data),
  updateTakeItems: (id: number, items: object[]) => api.put(`/stock-takes/${id}/items`, items).then((r) => r.data),
  balanceTake: (id: number) => api.post(`/stock-takes/${id}/balance`).then((r) => r.data),
  checkout: (body: object, key: string) =>
    api.post("/orders/checkout", body, { headers: { "Idempotency-Key": key } }).then((r) => r.data),
  cancelOrder: (id: number) => api.post(`/orders/${id}/cancel`).then((r) => r.data),
  orders: (params?: object) => api.get("/orders", { params }).then((r) => r.data),
  order: (id: number) => api.get(`/orders/${id}`).then((r) => r.data),
  receipt: (id: number) => api.get(`/orders/${id}/receipt`).then((r) => r.data),
  payQr: (id: number) => api.post(`/orders/${id}/payments/qr`).then((r) => r.data),
  payStatus: (id: number) => api.get(`/payments/${id}/status`).then((r) => r.data),
  confirmPay: (id: number) => api.post(`/payments/${id}/confirm`).then((r) => r.data),
  returns: (id: number, body: object) => api.post(`/orders/${id}/returns`, body).then((r) => r.data),
  customers: (params?: object) => api.get("/customers", { params }).then((r) => r.data),
  createCustomer: (body: object) => api.post("/customers", body).then((r) => r.data),
  openShift: (opening_cash: number) => api.post("/shifts/open", { opening_cash }).then((r) => r.data),
  currentShift: () => api.get("/shifts/current").then((r) => r.data),
  closeShift: (id: number, closing_cash: number) => api.post(`/shifts/${id}/close`, { closing_cash }).then((r) => r.data),
  dashboard: () => api.get("/reports/dashboard").then((r) => r.data),
  revenue: () => api.get("/reports/revenue").then((r) => r.data),
  profit: () => api.get("/reports/profit").then((r) => r.data),
  invValue: () => api.get("/reports/inventory-value").then((r) => r.data),
  summary: (days: number) => api.get("/reports/summary", { params: { days } }).then((r) => r.data),
  exportReport: async (days: number) => {
    const r = await api.get("/reports/export", { params: { days }, responseType: "blob" });
    const name = /filename="([^"]+)"/.exec(r.headers["content-disposition"] || "")?.[1] || "bao-cao.xlsx";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(r.data);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  settings: () => api.get("/settings").then((r) => r.data),
  saveSettings: (values: object, pin?: string) => api.put("/settings", { values, pin }).then((r) => r.data),
  unlockSettings: (pin: string) => api.post("/settings/unlock", { pin }).then((r) => r.data),
  promotions: () => api.get("/promotions").then((r) => r.data),
  promotionsAvailable: () => api.get("/promotions/available").then((r) => r.data),
  createPromotion: (body: object) => api.post("/promotions", body).then((r) => r.data),
  updatePromotion: (id: number, body: object) => api.put(`/promotions/${id}`, body).then((r) => r.data),
  deletePromotion: (id: number) => api.delete(`/promotions/${id}`).then((r) => r.data),
  users: (params?: object) => api.get("/auth/users", { params }).then((r) => r.data),
  createUser: (body: object) => api.post("/auth/users", body).then((r) => r.data),
  updateUser: (id: number, body: object) => api.patch(`/auth/users/${id}`, body).then((r) => r.data),
  resetUserPassword: (id: number, password?: string) =>
    api.post(`/auth/users/${id}/reset-password`, { password: password || null }).then((r) => r.data),
  onlineOrders: () => api.get("/online-orders").then((r) => r.data),
  confirmOnline: (id: number) => api.post(`/online-orders/${id}/confirm`).then((r) => r.data),
  rejectOnline: (id: number, reason: string) => api.post(`/online-orders/${id}/reject`, { reason }).then((r) => r.data),
  picking: (id: number) => api.get(`/online-orders/${id}/picking`).then((r) => r.data),
  startPacking: (id: number) => api.post(`/online-orders/${id}/packing`).then((r) => r.data),
  ship: (id: number) => api.post(`/online-orders/${id}/ship`, { shipper_name: "Tự giao" }).then((r) => r.data),
  completeOnline: (id: number) => api.post(`/online-orders/${id}/complete`).then((r) => r.data),
  scannerSession: (origin?: string) => api.post("/scanner/sessions", { origin }).then((r) => r.data),
  scannerCurrent: () => api.get("/scanner/current").then((r) => r.data),
  scannerStatus: (id: string) => api.get(`/scanner/sessions/${id}`).then((r) => r.data),
  scannerJoin: (pair_code: string) => api.post("/scanner/sessions/join", { pair_code }).then((r) => r.data),
  scannerEvents: (id: string, after: number) =>
    api.get(`/scanner/sessions/${id}/events`, { params: { after } }).then((r) => r.data),
  scannerScan: (id: string, barcode: string) => api.post(`/scanner/sessions/${id}/scan`, { barcode }).then((r) => r.data),
  scannerClose: (id: string) => api.delete(`/scanner/sessions/${id}`).then((r) => r.data),
  scannerQr: (url: string) => api.post("/scanner/qr", { url }).then((r) => r.data),
  labels: (product_id: number, copies: number) => api.post("/labels/print", { product_id, copies }).then((r) => r.data),
  generateBarcode: (id: number) => api.post(`/products/${id}/barcode/generate`).then((r) => r.data),
  pendingCost: () => api.get("/products/pending-cost").then((r) => r.data),
  confirmCost: (id: number, body: object) => api.post(`/products/${id}/confirm-cost`, body).then((r) => r.data),
};

export const shopApi = {
  register: (body: object) => api.post("/shop/auth/register", body).then((r) => r.data),
  login: (phone: string, password: string) => api.post("/shop/auth/login", { phone, password }).then((r) => r.data),
  me: () => api.get("/shop/me").then((r) => r.data),
  products: (params?: object) => api.get("/shop/products", { params }).then((r) => r.data),
  product: (slug: string) => api.get(`/shop/products/${slug}`).then((r) => r.data),
  search: (q: string) => api.get("/shop/search", { params: { q } }).then((r) => r.data),
  cart: () => api.get("/shop/cart").then((r) => r.data),
  promotions: () => api.get("/shop/promotions").then((r) => r.data),
  addCart: (product_id: number, quantity = 1) => api.post("/shop/cart/items", { product_id, quantity }).then((r) => r.data),
  setQty: (id: number, quantity: number) => api.put(`/shop/cart/items/${id}`, { quantity }).then((r) => r.data),
  addresses: () => api.get("/shop/addresses").then((r) => r.data),
  addAddress: (body: object) => api.post("/shop/addresses", body).then((r) => r.data),
  locateAddress: (id: number, body: { lat: number; lng: number }) => api.patch(`/shop/addresses/${id}/location`, body).then((r) => r.data),
  shippingRule: () => api.get("/shop/shipping/rule").then((r) => r.data),
  shippingQuote: (body: { lat?: number | null; lng?: number | null }) => api.post("/shop/shipping/quote", body).then((r) => r.data),
  placeOrder: (body: object) => api.post("/shop/orders", body).then((r) => r.data),
  orders: () => api.get("/shop/orders").then((r) => r.data),
  cancel: (id: number) => api.post(`/shop/orders/${id}/cancel`).then((r) => r.data),
  payQr: (id: number) => api.post(`/shop/orders/${id}/payments/qr`).then((r) => r.data),
  banners: () => api.get("/shop/banners").then((r) => r.data),
  categories: () => api.get("/categories").then((r) => r.data),
  review: (body: object) => api.post("/shop/reviews", body).then((r) => r.data),
};

export async function bankPay(orderCode: string, amount: number) {
  const body = {
    reference_code: `MOCK-${Date.now()}`,
    amount,
    content: orderCode,
    account_number: "0123456789",
    gateway: "MOCK",
  };
  const enc = new TextEncoder().encode(JSON.stringify(body));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("taphoa-demo-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc);
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return axios.post("/api/v1/webhooks/bank", body, { headers: { "X-Signature": hex } }).then((r) => r.data);
}
