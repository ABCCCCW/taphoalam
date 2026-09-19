import { create } from "zustand";

type User = { id: number; username: string; full_name: string; role: string; permissions: string[] };

type AuthState = {
  access: string | null;
  refresh: string | null;
  user: User | null;
  setAuth: (access: string, user: User, refresh?: string | null) => void;
  logout: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  access: localStorage.getItem("staff_token"),
  refresh: localStorage.getItem("staff_refresh"),
  user: JSON.parse(localStorage.getItem("staff_user") || "null"),
  setAuth: (access, user, refresh) => {
    localStorage.setItem("staff_token", access);
    localStorage.setItem("staff_user", JSON.stringify(user));
    if (refresh) localStorage.setItem("staff_refresh", refresh);
    set({ access, user, refresh: refresh ?? localStorage.getItem("staff_refresh") });
  },
  logout: () => {
    localStorage.removeItem("staff_token");
    localStorage.removeItem("staff_refresh");
    localStorage.removeItem("staff_user");
    set({ access: null, refresh: null, user: null });
  },
}));
