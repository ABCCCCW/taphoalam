import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BadgePercent, BarChart3, ClipboardList, LayoutDashboard, LogOut, Menu, Package, ScanLine,
  Settings, ShoppingCart, Store, Tags, Truck, Users, Warehouse, X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../api/client";
import { useAuth } from "../stores/authStore";
import { look, ROLE } from "../lib/labels";
import { cn } from "../lib/cn";
import BrandLogo from "../components/ui/BrandLogo";

type Item = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles: string[];
  badge?: "cost" | "online";
};

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Hôm nay",
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Tổng quan", roles: ["ADMIN"] },
      { to: "/pos", icon: Store, label: "Bán hàng", roles: ["ADMIN", "CASHIER"] },
      { to: "/admin/online", icon: Truck, label: "Đơn online", roles: ["ADMIN", "CASHIER", "STOCKER"], badge: "online" },
    ],
  },
  {
    title: "Kho hàng",
    items: [
      { to: "/admin/products", icon: Package, label: "Hàng hoá", roles: ["ADMIN", "STOCKER"], badge: "cost" },
      { to: "/admin/labels", icon: Tags, label: "In tem", roles: ["ADMIN", "STOCKER"] },
      { to: "/admin/inventory", icon: Warehouse, label: "Tồn kho", roles: ["ADMIN", "STOCKER", "CASHIER"] },
      { to: "/admin/receipts", icon: ClipboardList, label: "Nhập hàng", roles: ["ADMIN", "STOCKER"] },
      { to: "/admin/stocktake", icon: ScanLine, label: "Kiểm kê", roles: ["ADMIN", "STOCKER"] },
    ],
  },
  {
    title: "Sổ sách",
    items: [
      { to: "/admin/orders", icon: ShoppingCart, label: "Hoá đơn", roles: ["ADMIN", "CASHIER"] },
      { to: "/admin/customers", icon: Users, label: "Khách hàng", roles: ["ADMIN", "CASHIER"] },
      { to: "/admin/promotions", icon: BadgePercent, label: "Khuyến mãi", roles: ["ADMIN"] },
      { to: "/admin/reports", icon: BarChart3, label: "Báo cáo", roles: ["ADMIN"] },
    ],
  },
  {
    title: "Hệ thống",
    items: [{ to: "/admin/settings", icon: Settings, label: "Cấu hình", roles: ["ADMIN"] }],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [loc.pathname]);

  const cost = useQuery({
    queryKey: ["pending-cost"],
    queryFn: staffApi.pendingCost,
    enabled: !!user && ["ADMIN", "STOCKER"].includes(user.role),
    refetchInterval: 15000,
  });
  const online = useQuery({
    queryKey: ["online-badge"],
    queryFn: staffApi.onlineOrders,
    enabled: !!user,
    refetchInterval: 20000,
  });

  const counts = {
    cost: cost.data?.items?.length || 0,
    online:
      online.data?.filter((o: any) => ["PENDING_CONFIRM", "CONFIRMED", "PACKING"].includes(o.status)).length || 0,
  };

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => user && i.roles.includes(user.role)),
  })).filter((g) => g.items.length);

  const role = look(ROLE, user?.role);
  const here = groups.flatMap((g) => g.items).find((i) =>
    i.to === "/admin" ? loc.pathname === "/admin" : loc.pathname === i.to || loc.pathname.startsWith(i.to + "/")
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to={user?.role === "CASHIER" ? "/pos" : "/admin"} className="flex items-center gap-2.5 px-1">
        <BrandLogo size={44} className="h-11 w-11" />
        <span className="min-w-0">
          <span className="block font-display text-lg font-black leading-tight text-ink-900">Lâm Ly Mart</span>
          <span className="block truncate text-xs font-semibold text-ink-500">
            {user?.full_name} · {role.label}
          </span>
        </span>
      </Link>

      <nav className="mt-7 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="px-3 pb-1.5 text-xs font-semibold text-ink-400">{g.title}</div>
            <div className="space-y-0.5">
              {g.items.map((i) => {
                const n = i.badge ? counts[i.badge] : 0;
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === "/admin"}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition",
                        isActive
                          ? "bg-coral-500 text-white shadow-sm"
                          : "text-ink-600 hover:bg-coral-50 hover:text-coral-700"
                      )
                    }
                  >
                    <i.icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    {n > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-black text-white">
                        {n}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-coral-50 py-2.5 text-sm font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
        onClick={() => {
          logout();
          nav("/admin/login");
        }}
      >
        <LogOut className="h-3.5 w-3.5" /> Đăng xuất
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-cream md:grid md:grid-cols-[16.5rem_1fr]">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-black/[.06] bg-cream/95 px-3 text-ink-900 backdrop-blur md:hidden">
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-coral-50"
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-display font-black">{here?.label || "Lâm Ly Mart"}</span>
        {user?.role !== "STOCKER" && (
          <Link to="/pos" className="shrink-0 rounded-xl bg-coral-500 px-3 py-1.5 text-sm font-black text-white">
            Bán hàng
          </Link>
        )}
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-forest-900/25 backdrop-blur-sm animate-fade-in md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] overflow-hidden border-r border-black/[.06] bg-[#FFFBF4] p-4 transition-transform duration-200",
          "md:sticky md:top-0 md:z-auto md:h-dvh md:w-auto md:max-w-none md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl text-ink-400 hover:bg-ink-100 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </aside>

      <main className="min-w-0 overflow-x-hidden p-4 sm:p-5 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
