import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BadgePercent, Landmark, ClipboardList, LayoutDashboard, LogOut, Menu, Package,
  ShoppingCart, Store, Tags, Truck, UserCog, Users, Warehouse, X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../api/client";
import { PageMeta } from "../components/ui/Page";
import BankModal from "../features/settings/BankModal";
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
  /** Đường dẫn khác cũng tính là đang ở mục này (tab con). */
  also?: string[];
};

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "",
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
      { to: "/admin/inventory", icon: Warehouse, label: "Kho", roles: ["ADMIN", "STOCKER", "CASHIER"], also: ["/admin/stocktake"] },
      { to: "/admin/receipts", icon: ClipboardList, label: "Nhập hàng", roles: ["ADMIN", "STOCKER"] },
    ],
  },
  {
    title: "Sổ sách",
    items: [
      { to: "/admin/orders", icon: ShoppingCart, label: "Hoá đơn", roles: ["ADMIN", "CASHIER"] },
      { to: "/admin/customers", icon: Users, label: "Khách hàng", roles: ["ADMIN", "CASHIER"] },
      { to: "/admin/promotions", icon: BadgePercent, label: "Khuyến mãi", roles: ["ADMIN"] },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { to: "/admin/accounts", icon: UserCog, label: "Tài khoản", roles: ["ADMIN"] },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [bankOpen, setBankOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [loc.pathname]);

  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

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
    i.to === "/admin" ? loc.pathname === "/admin" : [i.to, ...(i.also || [])].some((t) => loc.pathname === t || loc.pathname.startsWith(t + "/"))
  );
  const hereGroup = groups.find((g) => here && g.items.includes(here))?.title;

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link
        to={user?.role === "CASHIER" ? "/pos" : "/admin"}
        className="flex shrink-0 items-center gap-2.5 border-b border-black/[.08] px-1 pb-4"
      >
        <BrandLogo size={44} className="h-11 w-11" />
        <span className="min-w-0">
          <span className="block font-display text-lg font-black leading-tight text-ink-900">Lâm Ly Mart</span>
          <span className="block truncate text-xs font-semibold text-ink-500">
            {user?.full_name} · {role.label}
          </span>
        </span>
      </Link>

      <nav className="mt-5 min-h-0 flex-1 space-y-6 overflow-y-auto pr-0.5">
        {groups.map((g) => (
          <section key={g.title || "main"}>
            {g.title && (
              <div className="mb-2 flex items-center gap-2 px-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-400">{g.title}</span>
                <i className="h-px min-w-0 flex-1 bg-ink-200" aria-hidden />
              </div>
            )}
            <div className="space-y-1.5">
              {g.items.map((i) => {
                const n = i.badge ? counts[i.badge] : 0;
                const on = here === i;
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === "/admin"}
                    className={() =>
                      cn(
                        "flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-sm font-bold transition",
                        on
                          ? "bg-coral-500 text-white shadow-sm"
                          : "text-ink-700 hover:bg-white hover:shadow-sm"
                      )
                    }
                  >
                    {() => (
                      <>
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                            on ? "bg-white/25 text-white" : "bg-[#e8dcc8] text-ink-700"
                          )}
                        >
                          <i.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{i.label}</span>
                        {n > 0 && (
                          <span
                            className={cn(
                              "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-[10px] font-black",
                              on ? "bg-white text-coral-600" : "bg-coral-500 text-white"
                            )}
                          >
                            {n}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="mt-3 flex shrink-0 items-center gap-2">
        {user?.role === "ADMIN" && (
          <button
            type="button"
            title="Tài khoản ngân hàng"
            aria-label="Tài khoản ngân hàng"
            onClick={() => setBankOpen(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-ink-200 bg-white text-ink-700 transition hover:border-forest-900 hover:bg-ink-50 hover:text-ink-900"
          >
            <Landmark className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-coral-200 bg-coral-50 py-2.5 text-sm font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
          onClick={() => {
            logout();
            nav("/dang-nhap");
          }}
        >
          <LogOut className="h-3.5 w-3.5" /> Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream md:grid md:grid-cols-[16.5rem_1fr]">
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-black/[.06] bg-cream/95 px-3 text-ink-900 md:hidden">
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-coral-50"
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-display font-black">{here?.label || "Lâm Ly Mart"}</span>
        {user?.role === "ADMIN" && (
          <button
            type="button"
            title="Tài khoản ngân hàng"
            aria-label="Tài khoản ngân hàng"
            onClick={() => setBankOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-700 hover:bg-coral-50"
          >
            <Landmark className="h-4 w-4" />
          </button>
        )}
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
          "md:relative md:z-auto md:h-auto md:min-h-0 md:w-auto md:max-w-none md:translate-x-0",
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

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 lg:p-6">
        <PageMeta.Provider value={{ icon: here?.icon, group: hereGroup }}>
          <Outlet />
        </PageMeta.Provider>
        {bankOpen && <BankModal onClose={() => setBankOpen(false)} />}
      </main>
    </div>
  );
}
