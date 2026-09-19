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
};

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
