import { create } from "zustand";

export type CartLine = {
  product_id: number;
  name: string;
  emoji?: string;
  image_url?: string | null;
  barcode?: string;
  unit_price: number;
  quantity: number;
  product_type?: string;
  available?: number;
  product_unit_id?: number;
  cost_confirmed?: boolean;
  /** Số lượng thuộc lô cận date và % giảm tự động (backend tính lại khi thanh toán). */
  near_qty?: number;
  near_pct?: number;
  near_expiry_date?: string | null;
};

/** Tiền giảm cận date của một dòng: chỉ phần số lượng thuộc lô cận date được giảm. */
export function lineDiscount(l: CartLine) {
  if (!l.near_qty || !l.near_pct) return 0;
  return Math.round(l.unit_price * Math.min(l.quantity, l.near_qty) * l.near_pct) / 100;
}

export function lineNet(l: CartLine) {
  return l.unit_price * l.quantity - lineDiscount(l);
}

export type Promo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  type: "PERCENT" | "AMOUNT";
  value: number;
  min_order_amount: number;
  max_discount?: number | null;
  end_date: string;
};

/** Tiền giảm của mã cho đơn — 0 nếu chưa đủ đơn tối thiểu. Công thức giống backend. */
export function promoDiscount(p: Promo | null | undefined, subtotal: number) {
  if (!p || subtotal < p.min_order_amount) return 0;
  let d = p.type === "AMOUNT" ? p.value : Math.round(subtotal * p.value) / 100;
  if (p.max_discount) d = Math.min(d, p.max_discount);
  return Math.min(d, subtotal);
}

type Held = { id: string; lines: CartLine[]; customer?: any };

type State = {
  lines: CartLine[];
  customer: any | null;
  discount: number;
  promo: string;
  held: Held[];
  add: (p: any, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  setCustomer: (c: any | null) => void;
  setDiscount: (n: number) => void;
  setPromo: (s: string) => void;
  hold: () => void;
  restore: (id: string) => void;
};

export const useCart = create<State>((set, get) => ({
  lines: [],
  customer: null,
  discount: 0,
  promo: "",
  held: [],
  add: (p, qty = 1) => {
    const q = p.suggested_qty || qty;
    const lines = [...get().lines];
    const i = lines.findIndex((l) => l.product_id === p.id && !p.suggested_qty);
    if (i >= 0 && p.product_type !== "WEIGHTED") {
      lines[i] = {
        ...lines[i],
        quantity: lines[i].quantity + q,
        cost_confirmed: p.cost_confirmed !== false && lines[i].cost_confirmed !== false,
      };
    } else {
      lines.push({
        product_id: p.id,
        name: p.name,
        emoji: p.emoji,
        image_url: p.image_url,
        barcode: p.barcode,
        unit_price: p.sale_price,
        quantity: q,
        product_type: p.product_type,
        available: p.available,
        cost_confirmed: p.cost_confirmed !== false,
        near_qty: p.near_expiry?.qty,
        near_pct: p.near_expiry?.percent,
        near_expiry_date: p.near_expiry?.expiry_date,
      });
    }
    set({ lines });
  },
  setQty: (id, qty) => set({ lines: get().lines.map((l) => (l.product_id === id ? { ...l, quantity: qty } : l)).filter((l) => l.quantity > 0) }),
  remove: (id) => set({ lines: get().lines.filter((l) => l.product_id !== id) }),
  clear: () => set({ lines: [], discount: 0, promo: "", customer: get().customer }),
  setCustomer: (c) => set({ customer: c }),
  setDiscount: (n) => set({ discount: n }),
  setPromo: (s) => set({ promo: s }),
  hold: () => {
    const { lines, customer, held } = get();
    if (!lines.length) return;
    set({ held: [...held, { id: Date.now().toString(), lines, customer }], lines: [], customer: null });
  },
  restore: (id) => {
    const h = get().held.find((x) => x.id === id);
    if (!h) return;
    set({ lines: h.lines, customer: h.customer, held: get().held.filter((x) => x.id !== id) });
  },
}));
