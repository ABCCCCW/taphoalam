import { create } from "zustand";

type Customer = { id: number; name: string; phone: string; tier: string; loyalty_points: number };

type State = {
  access: string | null;
  customer: Customer | null;
  setAuth: (access: string, customer: Customer) => void;
  logout: () => void;
};

export const useShopAuth = create<State>((set) => ({
  access: localStorage.getItem("cus_token"),
  customer: JSON.parse(localStorage.getItem("cus_user") || "null"),
  setAuth: (access, customer) => {
    localStorage.setItem("cus_token", access);
    localStorage.setItem("cus_user", JSON.stringify(customer));
    set({ access, customer });
  },
  logout: () => {
    localStorage.removeItem("cus_token");
    localStorage.removeItem("cus_user");
    set({ access: null, customer: null });
  },
}));
