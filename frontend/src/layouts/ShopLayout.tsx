import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clock3, LogOut, MapPin, Phone, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { shopApi } from "../api/client";
import { useShopAuth } from "../stores/shopAuthStore";
import { vnd } from "../lib/format";
import ProductImage from "../components/ui/ProductImage";
import { cn } from "../lib/cn";
import BrandLogo from "../components/ui/BrandLogo";

const TABS = [
  { to: "/", emoji: "🏠", label: "Trang chủ" },
  { to: "/catalog", emoji: "🛍️", label: "Đi chợ" },
  { to: "/cart", emoji: "🧺", label: "Giỏ" },
];

export default function ShopLayout() {
  const { customer, logout } = useShopAuth();
  const [q, setQ] = useState("");
  const [hints, setHints] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const loc = useLocation();

  const refreshCart = () => {
    if (customer) shopApi.cart().then((c) => setCartCount(c.items?.length || 0)).catch(() => {});
    else setCartCount(0);
  };

  useEffect(() => {
    refreshCart();
  }, [customer, loc.pathname]);

  useEffect(() => {
    window.addEventListener("cart-changed", refreshCart);
    return () => window.removeEventListener("cart-changed", refreshCart);
  }, [customer]);

  useEffect(() => {
    if (!q.trim()) {
      setHints([]);
      return;
    }
    const t = setTimeout(
      () =>
        shopApi
          .search(q)
          .then((r) => {
            setHints(r);
            setOpen(true);
          })
          .catch(() => {}),
      200
    );
    return () => clearTimeout(t);
  }, [q]);

  /* Gợi ý tìm kiếm trước đây chỉ mất khi xoá hết chữ, nên nó che mất kệ hàng
     khi khách bấm ra ngoài. */
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    setHints([]);
    nav(to);
  };

  const isOn = (to: string) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to));

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[#f5f5f4] pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-black/[.06] bg-white/90 backdrop-blur-xl">
        <div className="shop-wrap flex min-w-0 items-center gap-2 py-2 sm:gap-4 sm:py-2.5">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <BrandLogo size={44} className="h-10 w-10 sm:h-11 sm:w-11" />
            <div className="hidden font-display text-xl font-black tracking-tight md:block">Lâm Ly Mart</div>
          </Link>

          <div ref={box} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              className="input rounded-xl bg-ink-50 py-2 pl-10 text-sm focus:bg-white sm:py-2.5 sm:pl-11"
              placeholder="Tìm mì, sữa, rau…"
              aria-label="Tìm hàng"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => hints.length && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) go(`/catalog?q=${encodeURIComponent(q.trim())}`);
                if (e.key === "Escape") setOpen(false);
              }}
            />
            {q && (
              <button
                type="button"
                aria-label="Xoá ô tìm"
                onClick={() => {
                  setQ("");
                  setHints([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-coral-500"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {open && q.trim() && (
              <div className="card absolute z-20 mt-2 max-h-72 w-full min-w-0 overflow-auto p-2">
                {hints.length ? (
                  hints.map((h) => (
                    <button
                      key={h.id}
                      className="flex w-full min-w-0 justify-between gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-lime-50"
                      onClick={() => go(`/p/${h.slug}`)}
                    >
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <ProductImage src={h.image_url} emoji={h.emoji} alt={h.name} className="h-7 w-7 shrink-0" />
                        <span className="truncate">{h.name}</span>
                      </span>
                      <span className="shrink-0 font-bold text-coral-500">{vnd(h.sale_price)}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-sm text-ink-400">
                    Không có món nào khớp.
                  </p>
                )}
              </div>
            )}
          </div>

          <Link
            to="/catalog"
            className="hidden shrink-0 text-sm font-bold text-forest-800 hover:text-coral-500 lg:inline"
          >
            Đi chợ
          </Link>

          <Link
            to="/cart"
            aria-label={`Giỏ hàng${cartCount ? `, ${cartCount} món` : ""}`}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ink-200 bg-white transition hover:border-forest-900"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1 text-[11px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>

          {customer ? (
            <div className="flex shrink-0 items-center gap-1">
              <Link
                to="/account"
                className="flex h-10 w-10 items-center justify-center gap-2 rounded-xl bg-forest-900 text-sm font-semibold text-white sm:w-auto sm:px-3"
              >
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">{customer.name.split(" ").pop()}</span>
              </Link>
              <button
                className="hidden h-10 w-10 place-items-center text-ink-400 hover:text-coral-500 sm:grid"
                onClick={logout}
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/dang-nhap" className="btn-ink h-10 rounded-xl px-3 text-sm sm:px-4">
                Đăng nhập
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      <footer className="relative mt-auto shrink-0 overflow-hidden bg-forest-900 text-white">
        <i className="absolute inset-y-0 left-0 w-1.5 bg-coral-500" aria-hidden />
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-coral-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl" />

        <div className="shop-wrap relative grid gap-8 py-10 sm:gap-10 sm:py-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,16rem)] md:items-start">
          <div>
            <div className="flex items-center gap-3">
              <BrandLogo size={52} className="h-12 w-12 rounded-2xl bg-white p-1 sm:h-[3.25rem] sm:w-[3.25rem]" />
              <div className="leading-tight">
                <div className="font-display text-2xl font-black tracking-tight">Lâm Ly Mart</div>
                <div className="text-[12px] font-semibold text-white/50">Tạp hoá Cầu Diễn</div>
              </div>
            </div>

            <ul className="mt-5 space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5 text-white/80">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-coral-400" />
                <span>Cầu Diễn, Bắc Từ Liêm, Hà Nội</span>
              </li>
              <li className="flex items-start gap-2.5 text-white/80">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-coral-400" />
                <span>6h30 – 22h · cả tuần</span>
              </li>
            </ul>

            <a
              href="tel:0901234567"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-coral-500 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-coral-600"
            >
              <Phone className="h-4 w-4" />
              0901 234 567
            </a>
          </div>

          <nav aria-label="Mua sắm">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/40">Mua sắm</div>
            <ul className="mt-3 space-y-1">
              <li>
                <Link className="block rounded-xl px-2 py-1.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white" to="/catalog">
                  Danh mục hàng
                </Link>
              </li>
              <li>
                <Link className="block rounded-xl px-2 py-1.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white" to="/orders">
                  Đơn của tôi
                </Link>
              </li>
              <li>
                <Link className="block rounded-xl px-2 py-1.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white" to="/account">
                  Điểm thành viên
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="relative border-t border-white/10">
          <div className="shop-wrap flex flex-wrap items-center justify-between gap-2 py-4 text-xs font-semibold text-white/45">
            <span>Cảm ơn bạn, hẹn gặp lại nhé!</span>
            <span>Lâm Ly Mart · Cầu Diễn</span>
          </div>
        </div>
      </footer>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-between border-t border-black/[.06] bg-white/95 px-4 py-2 text-[11px] font-semibold backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "relative grid min-w-[56px] place-items-center gap-0.5 rounded-xl py-1 transition",
              isOn(t.to) ? "text-forest-800" : "text-ink-500"
            )}
          >
            <span className={cn("text-base transition", isOn(t.to) && "scale-110")}>{t.emoji}</span>
            <span>{t.label}</span>
            {t.to === "/cart" && cartCount > 0 && (
              <i className="absolute -top-0.5 right-2 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[9px] not-italic text-white">
                {cartCount}
              </i>
            )}
          </Link>
        ))}
        <Link
          to={customer ? "/account" : "/dang-nhap"}
          className={cn(
            "grid min-w-[56px] place-items-center gap-0.5 rounded-xl py-1 transition",
            isOn("/account") ? "text-forest-800" : "text-ink-500"
          )}
        >
          <span className="text-base">👤</span>
          <span>{customer ? "Tôi" : "Vào"}</span>
        </Link>
      </nav>
    </div>
  );
}
