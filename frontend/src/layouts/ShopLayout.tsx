import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, MapPin, Phone, Search, ShoppingBag, UserRound, X } from "lucide-react";
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
    <div className="min-h-dvh min-w-0 overflow-x-hidden pb-20 sm:pb-0">
      <div className="bg-forest-900 text-[11px] text-white sm:text-[12px]">
        <div className="mx-auto flex h-9 min-w-0 max-w-6xl items-center justify-between gap-3 px-3 sm:px-4">
          <span className="flex min-w-0 items-center gap-1.5 truncate opacity-90">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-lime-400" />
            <span className="truncate">Giao quanh Thanh Xuân · 15.000đ · lấy tại quầy miễn phí</span>
          </span>
          <a href="tel:0901234567" className="hidden shrink-0 items-center gap-1.5 opacity-90 hover:opacity-100 sm:flex">
            <Phone className="h-3.5 w-3.5 text-lime-400" />
            0901 234 567
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-black/[.06] bg-cream/90 backdrop-blur-xl">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <BrandLogo size={48} className="h-10 w-10 sm:h-12 sm:w-12" />
            <div className="hidden leading-tight md:block">
              <div className="font-display text-xl font-black tracking-tight">Lâm Ly Mart</div>
              <div className="-mt-0.5 text-[11px] font-semibold text-forest-700">tạp hoá online</div>
            </div>
          </Link>

          <div ref={box} className="relative min-w-0 max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              className="input bg-white py-2 pl-10 text-sm shadow-sm sm:py-2.5 sm:pl-11"
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
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-black/[.06] bg-white transition hover:border-lime-400 sm:h-11 sm:w-11"
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
                className="flex h-10 w-10 items-center justify-center gap-2 rounded-2xl bg-forest-900 font-semibold text-white sm:h-11 sm:w-auto sm:px-3"
              >
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">{customer.name.split(" ").pop()}</span>
              </Link>
              <button
                className="hidden h-11 w-11 place-items-center text-ink-400 hover:text-coral-500 sm:grid"
                onClick={logout}
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/admin/login"
                className="hidden whitespace-nowrap text-xs font-bold text-forest-800 hover:text-coral-500 md:inline"
              >
                Nhân viên
              </Link>
              <Link to="/dang-nhap" className="btn-lime h-10 px-3 text-sm sm:h-11 sm:px-4">
                Vào
              </Link>
            </div>
          )}
        </div>
      </header>

      <Outlet />

      <footer className="mt-4 bg-forest-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:py-12">
          <div>
            <div className="flex items-center gap-2">
              <BrandLogo size={40} className="h-10 w-10 rounded-full bg-white" />
              <span className="font-display text-lg font-black">Lâm Ly Mart</span>
            </div>
            <p className="mt-3 text-white/70">12 Nguyễn Trãi, Thanh Xuân, Hà Nội</p>
            <p className="mt-1 text-white/50">Mở 6h30 – 22h, cả thứ bảy chủ nhật</p>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-lime-400">Mua sắm</div>
            <Link className="mt-3 block text-white/80 hover:text-white" to="/catalog">
              Danh mục hàng
            </Link>
            <Link className="mt-1 block text-white/80 hover:text-white" to="/orders">
              Đơn của tôi
            </Link>
            <Link className="mt-1 block text-white/80 hover:text-white" to="/account">
              Điểm thành viên
            </Link>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-lime-400">Cửa hàng</div>
            <Link className="mt-3 block text-white/80 hover:text-white" to="/admin/login">
              Nhân viên / POS
            </Link>
            <Link className="mt-1 block text-white/80 hover:text-white" to="/scan">
              Điện thoại quét mã
            </Link>
            <a className="mt-3 block text-white/70 hover:text-white" href="tel:0901234567">
              0901 234 567
            </a>
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
