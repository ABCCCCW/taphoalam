import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../../api/client";
import { useAuth } from "../../stores/authStore";
import { lineDiscount, lineNet, promoDiscount, useCart, type Promo } from "../../stores/cartStore";
import { num, uid, vnd } from "../../lib/format";
import { homeFor } from "../../lib/roles";
import { look, ROLE } from "../../lib/labels";
import { cn } from "../../lib/cn";
import ProductImage from "../../components/ui/ProductImage";
import ReceiptPrinter from "../../components/ui/ReceiptSlip";
import CashPayModal from "./CashPayModal";
import QrPayModal from "./QrPayModal";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { Input, MoneyInput } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { Notice } from "../../components/ui/Feedback";
import {
  Banknote, LayoutDashboard, ListFilter, LogOut, Minus, PackagePlus, Pause,
  Plus, QrCode, Search, Settings, Smartphone, StickyNote, Trash2, UserRound, X, BadgePercent, Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { phoneHost, phoneJoinOrigin, phoneHttpsPort, phoneHttpPort, isLoopback, publicOrigin } from "../../lib/origin";
import BrandLogo from "../../components/ui/BrandLogo";

const PAIR_KEY = "pos-scanner-pair";
const money = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

function staffCodeOf(id?: number | null) {
  if (!id) return "";
  return `NV${String(id).padStart(3, "0")}`;
}

function prettyPhone(raw?: string) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length === 11) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return raw || "";
}

/** Ca sáng 6h–18h, ca đêm phần còn lại — theo giờ mở ca. */
function caLabel(openedAt?: string | null) {
  const h = (openedAt ? new Date(openedAt) : new Date()).getHours();
  return h >= 6 && h < 18 ? "Ca sáng" : "Ca đêm";
}

export default function PosPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { lines, add, setQty, remove, clear, customer, setCustomer, discount, promo, setPromo, hold, held, restore } = useCart();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<number | "">("");
  const [phone, setPhone] = useState("");
  const [cusEdit, setCusEdit] = useState(false);
  const [newCus, setNewCus] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [pay, setPay] = useState<"CASH" | "QR" | null>(null);
  const [cash, setCash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [waiting, setWaiting] = useState<any[]>([]);
  const [slip, setSlip] = useState<any>(null);
  const autoPrint = useRef(false);
  const [shiftCash, setShiftCash] = useState("200000");
  const [shiftErr, setShiftErr] = useState("");
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  // Nhớ phiên ghép điện thoại qua lần tải lại trang: điện thoại vẫn giữ phiên và gửi
  // mã lên, nếu quầy quên phiên thì mã quét rơi vào khoảng không.
  const [pair, setPairState] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem(PAIR_KEY) || "null");
    } catch {
      return null;
    }
  });
  const setPair = (p: any) => {
    setPairState(p);
    try {
      if (p) localStorage.setItem(PAIR_KEY, JSON.stringify(p));
      else localStorage.removeItem(PAIR_KEY);
    } catch {}
  };
  const [pairModal, setPairModal] = useState(false);
  const [phoneOn, setPhoneOn] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [quick, setQuick] = useState({ name: "", sale_price: 10000, qty: 1, barcode: "" });
  const [quickErr, setQuickErr] = useState("");
  const [weight, setWeight] = useState<any>(null);
  const [kg, setKg] = useState("0.3");
  const searchRef = useRef<HTMLInputElement>(null);
  const buf = useRef("");

  const shift = useQuery({ queryKey: ["shift"], queryFn: staffApi.currentShift, refetchInterval: 15000 });
  // Backend khởi động lại lúc quầy đang mở thì lần tải nhóm hàng đầu tiên hỏng; cứ thử lại
  // tới khi có, vì thiếu nhóm hàng là kệ trống trơn dù danh sách hàng vẫn về đủ.
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: staffApi.categories,
    refetchInterval: (query) => (query.state.data?.length ? false : 5000),
  });
  const products = useQuery({
    queryKey: ["pos-p", q, cat],
    queryFn: () => staffApi.products({ q: q || undefined, category_id: cat || undefined, size: 200 }),
    refetchInterval: 8000,
  });
  const settings = useQuery({ queryKey: ["set"], queryFn: staffApi.settings, staleTime: 60_000 });
  // Chỉ mã đang trong hạn mới về đây; qua nửa đêm là mã hết hạn tự biến mất khỏi danh sách.
  const promos = useQuery<Promo[]>({ queryKey: ["promos-live"], queryFn: staffApi.promotionsAvailable, refetchInterval: 60_000 });

  const shelves = useMemo(() => {
    const items = products.data?.items || [];
    const list = cats.data || [];
    const grouped = list
      .map((c: any) => ({ ...c, items: items.filter((p: any) => p.category_id === c.id) }))
      .filter((c: any) => c.items.length);
    // Hàng chưa xếp nhóm (hoặc nhóm hàng chưa tải được) vẫn phải hiện để bán.
    const known = new Set(list.map((c: any) => c.id));
    const rest = items.filter((p: any) => !known.has(p.category_id));
    return rest.length ? [...grouped, { id: "other", icon: "📦", name: "Hàng khác", items: rest }] : grouped;
  }, [products.data, cats.data]);

  // Tạm tính đã trừ giảm cận date của từng món
  const subtotal = lines.reduce((s, l) => s + lineNet(l), 0);
  const nearOff = lines.reduce((s, l) => s + lineDiscount(l), 0);
  const chosen = (promos.data || []).find((p) => p.code === promo) || null;
  const promoOff = promoDiscount(chosen, subtotal);
  const total = Math.max(0, subtotal - promoOff - discount);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const inCart = (id: number) => lines.find((l) => l.product_id === id)?.quantity || 0;
  const shelfOf = (id: number) => {
    const p = (products.data?.items || []).find((x: any) => x.id === id);
    if (p) return Number(p.available || 0);
    const l = lines.find((x) => x.product_id === id);
    if (l && l.available != null) return Number(l.available);
    return undefined;
  };
  const offCatalog = (id: number) => {
    const p = (products.data?.items || []).find((x: any) => x.id === id);
    if (p) return p.cost_confirmed === false;
    return lines.find((x) => x.product_id === id)?.cost_confirmed === false;
  };
  const overStock = lines.some((l) => {
    if (offCatalog(l.product_id) || l.cost_confirmed === false) return false;
    const shelf = shelfOf(l.product_id);
    return shelf != null && l.quantity > shelf;
  });

  const beep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      o.frequency.value = 880;
      o.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.08);
    } catch {}
  };

  const bump = (id: number, d: number) => {
    const l = lines.find((x) => x.product_id === id);
    if (!l) return;
    const step = l.product_type === "WEIGHTED" ? 0.1 : 1;
    const next = Math.round((l.quantity + d * step) * 1000) / 1000;
    const cap = shelfOf(id) ?? Number(l.available);
    if (d > 0 && !offCatalog(id) && l.cost_confirmed !== false && Number.isFinite(cap) && next > cap) return;
    setQty(id, next);
  };

  const put = (p: any) => {
    const outside = p.cost_confirmed === false;
    const left = Number(p.available || 0) - inCart(p.id);
    if (!outside && left <= 0) return;
    if (p.product_type === "WEIGHTED") {
      setWeight(p);
      setKg("0.3");
      return;
    }
    add(p);
    beep();
  };

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const p = await staffApi.barcode(code);
        if (p.product_type === "WEIGHTED" && !p.suggested_qty) {
          setWeight(p);
          setKg("0.3");
          return;
        }
        const left = Number(p.available || 0) - inCart(p.id);
        if (p.cost_confirmed !== false && left <= 0) return;
        add(p, p.cost_confirmed === false ? (p.suggested_qty || 1) : Math.min(p.suggested_qty || 1, Math.max(left, 1)));
        beep();
      } catch {
        setUnknown(code);
        setQuickErr("");
        setQuick({ name: "", sale_price: 10000, qty: 1, barcode: code });
        staffApi.lookup(code).then((d) => {
          setQuick((q) => ({ ...q, name: d.name || q.name, barcode: code }));
        }).catch(() => {});
      }
    },
    [add, lines]
  );

  const submitSearch = () => {
    const t = q.trim();
    if (!t) return;
    if (/^\d{8,}$/.test(t)) {
      handleScan(t);
      setQ("");
      return;
    }
    const hits = products.data?.items || [];
    if (hits.length === 1) {
      put(hits[0]);
      setQ("");
    }
  };

  useEffect(() => {
    document.documentElement.classList.add("pos-fluid");
    return () => document.documentElement.classList.remove("pos-fluid");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Không gán phím F: chỉ giữ Esc để đóng hộp thoại đang mở.
      if (e.key === "Escape") {
        e.preventDefault();
        if (slip) {
          setSlip(null);
          setPay((p) => (p === "CASH" ? null : p));
        } else if (pay === "QR") {
          parkQr();
        } else if (pairModal) {
          setPairModal(false);
        } else if (pay || more || filterOpen || unknown !== null || weight || cusEdit) {
          setPay(null);
          setMore(false);
          setFilterOpen(false);
          setUnknown(null);
          setWeight(null);
          setCusEdit(false);
        }
      }
      const typing = (document.activeElement as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']");
      if (typing || pay || slip || unknown !== null || newCus !== null || weight || pairModal) return;
      if (e.key === "Enter" && buf.current.length >= 4) {
        handleScan(buf.current);
        buf.current = "";
      } else if (e.key.length === 1 && /[0-9A-Za-z]/.test(e.key)) {
        buf.current += e.key;
        setTimeout(() => (buf.current = ""), 80);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // handleScan đổi mỗi khi đơn đổi; đọc qua ref để vòng hỏi mã quét không phải dừng/chạy
  // lại sau mỗi món (lúc đang mở lại mà điện thoại quét thì mã bị rơi).
  const scanRef = useRef(handleScan);
  scanRef.current = handleScan;

  // Mở trang là hỏi backend phiên ghép nào của mình còn hạn (ưu tiên phiên điện thoại đã
  // vào) rồi nghe lại phiên đó — kể cả khi trình duyệt này chưa từng lưu phiên.
  useEffect(() => {
    staffApi
      .scannerCurrent()
      .then((s) => {
        if (!s?.id) {
          if (pair?.id) setPair(null);
          return;
        }
        if (s.id !== pair?.id) setPair({ ...s });
        if (s.status === "ACTIVE") setPhoneOn(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hỏi backend mã mới mỗi ~1 giây thay cho WebSocket (Vercel serverless không giữ kết nối).
  // Tab ẩn thì thưa lại cho đỡ tốn lượt gọi; mạng chập chờn thì cứ hỏi lại lần sau.
  useEffect(() => {
    if (!pair?.id) return;
    let stopped = false;
    let cursor = -1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await staffApi.scannerEvents(pair.id, cursor);
        if (stopped) return;
        cursor = r.cursor;
        for (const m of r.events) {
          if (m.type === "paired" || m.type === "scan") {
            setPhoneOn(true);
            setPairModal(false);
          }
          if (m.type === "scan") scanRef.current(m.barcode);
        }
      } catch {}
      if (!stopped) timer = setTimeout(tick, document.hidden ? 5000 : 1000);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pair?.id]);

  const checkout = async (method: "CASH" | "QR_BANK") => {
    if (!shift.data) return;
    if (!lines.length || busy || overStock) return;
    setBusy(true);
    try {
      const order = await staffApi.checkout(
        {
          items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, barcode: l.barcode })),
          customer_id: customer?.id,
          payment_method: method,
          received: method === "CASH" ? cash : total,
          discount,
          promo_code: promoOff > 0 ? promo : undefined,
        },
        uid()
      );
      setLast(order);
      qc.invalidateQueries({ queryKey: ["pos-p"] });
      if (method === "CASH") {
        await openSlip(order, true);
        clear();
      } else {
        setPay("QR");
      }
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["pos-p"] });
      toast.error(e, "Không chốt được đơn, thử lại nhé");
    } finally {
      setBusy(false);
    }
  };

  const openSlip = async (order: any, doPrint = true) => {
    autoPrint.current = doPrint;
    try {
      setSlip(await staffApi.receipt(order.id));
    } catch {
      setSlip({ store_name: "Lâm Ly Mart", store_address: "12 Nguyễn Trãi, Thanh Xuân, Hà Nội", order });
    }
  };

  useEffect(() => {
    if (!slip || !autoPrint.current) return;
    autoPrint.current = false;
    const t = window.setTimeout(() => window.print(), 120);
    return () => window.clearTimeout(t);
  }, [slip]);

  const parkQr = () => {
    if (last?.status === "PENDING_PAYMENT") {
      setWaiting((w) => (w.some((x) => x.id === last.id) ? w : [...w, last]));
    }
    setPay(null);
    setLast(null);
    clear();
    qc.invalidateQueries({ queryKey: ["pos-p"] });
  };

  const resumeQr = (o: any) => {
    setWaiting((w) => w.filter((x) => x.id !== o.id));
    setLast(o);
    setPay("QR");
  };

  const abandonQr = async () => {
    const id = last?.id;
    if (last?.status === "PENDING_PAYMENT") {
      await staffApi.cancelOrder(last.id).catch(() => {});
    }
    setWaiting((w) => w.filter((x) => x.id !== id));
    setPay(null);
    setLast(null);
    qc.invalidateQueries({ queryKey: ["pos-p"] });
  };

  /* Gắn khách bằng SĐT. Không thấy số thì mở hộp thoại tạo khách mới —
     trước đây dùng prompt() của trình duyệt, bấm Huỷ là tạo «Khách lẻ» rỗng. */
  const findCus = async () => {
    const p = phone.trim();
    if (!p) return;
    try {
      const list = await staffApi.customers({ phone: p });
      if (list[0]) {
        setCustomer(list[0]);
        setCusEdit(false);
        setPhone("");
      } else {
        setNewCus(p);
      }
    } catch (e) {
      toast.error(e);
    }
  };

  const startShift = async () => {
    setShiftErr("");
    setOpening(true);
    try {
      const s = await staffApi.openShift(Number(shiftCash) || 0);
      qc.setQueryData(["shift"], s);
    } catch (e: any) {
      setShiftErr(e.message || "Không mở được ca");
    } finally {
      setOpening(false);
    }
  };

  const storeName = settings.data?.["store.name"] || "Lâm Ly Mart";
  const storeAddress = settings.data?.["store.address"] || "12 Nguyễn Trãi, Thanh Xuân, Hà Nội";
  const storePhone = settings.data?.["store.phone"] || "";
  const pickedCat = cats.data?.find((c: any) => c.id === cat);
  const initials = (user?.full_name || user?.username || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const staffCode = staffCodeOf(user?.id);
  const caName = shift.data ? caLabel(shift.data.opened_at) : "";

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] overflow-x-hidden bg-cream text-ink-900 sm:h-dvh sm:overflow-hidden">
      <header className="flex min-w-0 items-center gap-3 border-b-2 border-coral-400 bg-cream px-3 py-2.5 text-forest-900 sm:gap-4 sm:px-5">
        <button onClick={() => nav(homeFor(user?.role))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-card ring-1 ring-black/[.06]">
            <BrandLogo size={40} className="h-10 w-10" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-xl font-black leading-none tracking-tight">{storeName}</span>
            <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {storeAddress && (
                <span className="truncate text-[11px] font-semibold text-ink-500">{storeAddress}</span>
              )}
              {storePhone && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-coral-600 shadow-sm ring-1 ring-coral-100">
                  {prettyPhone(storePhone)}
                </span>
              )}
            </span>
          </span>
        </button>
        <div className="relative shrink-0">
          <button
            className={cn(
              "flex max-w-[17rem] items-center gap-2.5 rounded-2xl py-1.5 pl-3 pr-1.5 text-left shadow-card ring-1 transition",
              more
                ? "bg-white ring-coral-400"
                : "bg-white ring-black/[.06] hover:ring-coral-300"
            )}
            onClick={() => {
              setFilterOpen(false);
              setMore((v) => !v);
            }}
            aria-label="Tài khoản"
          >
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-black leading-tight text-forest-900">
                {user?.full_name || user?.username}
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                {staffCode && (
                  <span className="font-mono text-[11px] font-bold text-ink-500">{staffCode}</span>
                )}
                {caName && (
                  <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[10px] font-extrabold leading-none text-white">
                    {caName}
                  </span>
                )}
              </span>
            </span>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-coral-500 text-white">
              <UserRound className="h-5 w-5" />
            </span>
          </button>
          {more && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
              <div className="card absolute right-0 top-12 z-40 w-72 p-2 text-sm text-ink-900 shadow-pop">
                <div className="mb-1 flex items-center gap-3 rounded-xl bg-coral-50 px-2.5 py-2.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-500 font-display text-sm font-black text-white">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{user?.full_name || user?.username}</div>
                    <div className="truncate text-xs text-ink-500">
                      {[staffCode, look(ROLE, user?.role).label, caName].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <MenuItem icon={PackagePlus} label="Hàng ngoài" onClick={() => {
                  setMore(false);
                  setUnknown("");
                  setQuickErr("");
                  setQuick({ name: "", sale_price: 10000, qty: 1, barcode: "" });
                }} />
                <MenuItem icon={Smartphone} label={phoneOn ? "Ngắt điện thoại" : pair ? "Hiện mã ghép" : "Ghép điện thoại"} onClick={async () => {
                  setMore(false);
                  if (phoneOn && pair) {
                    await staffApi.scannerClose(pair.id).catch(() => {});
                    setPair(null);
                    setPhoneOn(false);
                    setPairModal(false);
                    return;
                  }
                  if (pair && !phoneOn) {
                    setPairModal(true);
                    return;
                  }
                  const origin = await phoneJoinOrigin();
                  setPair(await staffApi.scannerSession(origin));
                  setPhoneOn(false);
                  setPairModal(true);
                }} />
                {shift.data && (
                  <MenuItem icon={Pause} label="Đóng ca" onClick={() => {
                    setMore(false);
                    setClosing(true);
                  }} />
                )}
                {user?.role !== "CASHIER" && (
                  <MenuItem icon={LayoutDashboard} label="Về quản trị" onClick={() => nav(homeFor(user?.role))} />
                )}
                {user?.role === "ADMIN" && (
                  <MenuItem icon={Settings} label="Cấu hình cửa hàng" onClick={() => nav("/admin/settings")} />
                )}
                <div className="my-1 border-t border-black/[.06]" />
                <MenuItem icon={LogOut} label="Đăng xuất" onClick={() => { logout(); nav("/admin/login"); }} />
              </div>
            </>
          )}
        </div>
      </header>

      {!shift.isPending && !shift.data && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-forest-900/80 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-8 text-center animate-pop-in">
            <BrandLogo size={56} className="mx-auto h-14 w-14" />
            <h2 className="mt-3 font-display text-2xl font-black">Mở ca bán</h2>
            <MoneyInput
              label="Tiền đầu ca"
              wrapClass="mt-5 text-left"
              className="text-center font-display text-lg font-black"
              value={shiftCash}
              onChange={(e) => setShiftCash(e.target.value)}
            />
            {(shiftErr || shift.isError) && (
              <p className="mt-3 text-sm font-semibold text-coral-600">
                {shiftErr || (shift.error as Error)?.message || "Không mở được ca"}
              </p>
            )}
            <Button block size="lg" className="mt-4" loading={opening} onClick={startShift}>
              Bắt đầu ca
            </Button>
          </div>
        </div>,
        document.body
      )}

      <div className="grid min-h-0 sm:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
        <div className="flex min-h-0 min-w-0 flex-col p-3">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                ref={searchRef}
                autoFocus
                className="h-10 w-full rounded-2xl border border-ink-200 bg-white pl-9 pr-3 text-sm font-medium text-ink-900 outline-none focus:border-forest-900 focus:ring-2 focus:ring-forest-900/10"
                placeholder="Tìm tên hoặc quét mã"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              />
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                className={cn(
                  "flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm font-bold transition",
                  cat
                    ? "border-forest-900 bg-forest-900 text-white"
                    : "border-ink-200 bg-white text-ink-700 hover:bg-lime-50"
                )}
                onClick={() => {
                  setMore(false);
                  setFilterOpen((v) => !v);
                }}
                aria-label="Bộ lọc nhóm hàng"
              >
                <ListFilter className="h-4 w-4" />
                <span className="max-w-[7.5rem] truncate">
                  {pickedCat ? `${pickedCat.icon} ${pickedCat.name}` : "Bộ lọc"}
                </span>
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                  <div className="card absolute right-0 top-12 z-40 max-h-72 w-56 overflow-auto p-1.5 text-sm text-ink-900 shadow-pop">
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-lime-50",
                        !cat && "bg-lime-100 text-forest-900"
                      )}
                      onClick={() => {
                        setCat("");
                        setFilterOpen(false);
                      }}
                    >
                      ✨ Tất cả
                    </button>
                    {cats.data?.map((c: any) => (
                      <button
                        key={c.id}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-lime-50",
                          cat === c.id && "bg-lime-100 text-forest-900"
                        )}
                        onClick={() => {
                          setCat(c.id);
                          setFilterOpen(false);
                        }}
                      >
                        {c.icon} {c.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          {!cat && !q.trim() ? (
            <div className="flex-1 space-y-5 overflow-auto pr-1">
              {shelves.map((g: any) => (
                <section key={g.id}>
                  <div className="mb-2 flex items-baseline gap-2 px-0.5">
                    <h3 className="font-display text-sm font-extrabold text-forest-900">
                      {g.icon} {g.name}
                    </h3>
                    <span className="text-xs font-medium text-ink-400">{g.items.length} món</span>
                    <span className="h-px flex-1 self-center bg-black/[.06]" />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2.5">
                    {g.items.map((p: any) => (
                      <PosRow key={p.id} p={p} qty={inCart(p.id)} onAdd={() => put(p)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] content-start gap-2.5 overflow-auto pr-1">
              {products.data?.items?.map((p: any) => (
                <PosRow key={p.id} p={p} qty={inCart(p.id)} onAdd={() => put(p)} />
              ))}
              {!products.isPending && !products.data?.items?.length && (
                <div className="col-span-full grid place-items-center py-16 text-center">
                  <div>
                    <div className="text-4xl">🔍</div>
                    <p className="mt-2 font-display font-black">Kệ này không có món nào</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="m-3 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-card sm:ml-0">
          <div className="flex items-center justify-between gap-2 border-b border-black/[.06] px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <div className="font-display font-black text-ink-900">Đơn này</div>
              <div className="text-xs font-semibold text-ink-400">{num(count)} món</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink-100 px-3 text-sm font-extrabold text-ink-800 hover:bg-ink-50 disabled:opacity-30"
                disabled={!lines.length}
                onClick={hold}
                title="Để đơn này sang nháp, rồi bán khách khác"
              >
                <StickyNote className="h-3.5 w-3.5" />
                Nháp
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-coral-50 px-3 text-sm font-extrabold text-coral-600 hover:bg-coral-100 disabled:opacity-30"
                disabled={!lines.length}
                onClick={clear}
                title="Xoá hết món trên đơn này"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá đơn
              </button>
            </div>
          </div>
          {(waiting.length > 0 || held.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-black/[.06] bg-cream px-3 py-2">
              <span className="text-[0.6875rem] font-extrabold uppercase tracking-wide text-ink-400">Để đó</span>
              {waiting.map((o, i) => (
                <button
                  key={`qr-${o.id}`}
                  className="chip bg-coral-500 text-xs font-extrabold text-white"
                  onClick={() => resumeQr(o)}
                  title="QR đang chờ CK — bấm mở lại"
                >
                  <QrCode className="h-3 w-3" /> Chưa TT {i + 1}
                </button>
              ))}
              {held.map((h, i) => (
                <button
                  key={`hold-${h.id}`}
                  className="chip border border-ink-200 bg-white text-xs font-extrabold text-ink-800"
                  onClick={() => restore(h.id)}
                  title="Đơn chưa thanh toán — bấm mở lại"
                >
                  <StickyNote className="h-3 w-3" /> Chưa TT {waiting.length + i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="border-b border-black/[.04] px-3 py-2.5">
            {customer && !cusEdit ? (
              <div className="flex items-center gap-2 rounded-2xl bg-lime-50 px-2.5 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-lime-400"><UserRound className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{customer.name}</div>
                  <div className="text-xs text-ink-400">{customer.loyalty_points} điểm</div>
                </div>
                <button className="text-ink-400" onClick={() => setCustomer(null)} aria-label="Bỏ gắn khách">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : cusEdit ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="input py-2"
                  placeholder="Số điện thoại"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && findCus()}
                />
                <Button size="sm" className="px-3" onClick={findCus}>OK</Button>
                <Button size="sm" variant="ghost" className="px-3" onClick={() => { setCusEdit(false); setPhone(""); }}>
                  Huỷ
                </Button>
              </div>
            ) : (
              <button
                className="h-10 w-full rounded-2xl border border-dashed border-black/15 text-sm font-semibold text-ink-400 hover:border-lime-400 hover:text-forest-800"
                onClick={() => setCusEdit(true)}
              >
                + Gắn khách bằng SĐT
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto px-3 py-2">
            {lines.map((l) => (
              <div key={l.product_id + l.name} className="flex items-center gap-2.5 py-2">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-ink-50">
                  <ProductImage src={l.image_url} emoji={l.emoji} alt={l.name} className="absolute inset-0 h-full w-full p-1" emojiClassName="absolute inset-0 grid place-items-center text-xl" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{l.name}</div>
                  {shelfOf(l.product_id) != null && l.quantity > Number(shelfOf(l.product_id)) && l.cost_confirmed !== false ? (
                    <div className="text-xs text-coral-500">Kệ còn {num(shelfOf(l.product_id) || 0)} — bớt số lượng nhé</div>
                  ) : l.cost_confirmed === false ? (
                    <div className="text-xs text-sun-700">Hàng ngoài</div>
                  ) : lineDiscount(l) > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-coral-100 px-1.5 py-px font-extrabold text-coral-700">Cận date −{l.near_pct}%</span>
                      <span className="text-ink-400 line-through">{money(l.unit_price)}đ</span>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-400">{money(l.unit_price)}đ</div>
                  )}
                </div>
                <div className="flex items-center rounded-full bg-ink-100">
                  <button className="grid h-10 w-10 place-items-center" onClick={() => bump(l.product_id, -1)} aria-label="Bớt">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-black">{num(l.quantity)}</span>
                  <button className="grid h-10 w-10 place-items-center" onClick={() => bump(l.product_id, 1)} aria-label="Thêm">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="w-[4.5rem] shrink-0 text-right text-sm font-black text-ink-900">
                  {money(lineNet(l))}đ
                  {lineDiscount(l) > 0 && <div className="text-[0.6875rem] font-bold text-coral-600">−{money(lineDiscount(l))}đ</div>}
                </div>
              </div>
            ))}
            {!lines.length && (
              <div className="grid h-full min-h-[11rem] place-items-center px-4 text-center">
                <div>
                  <div className="text-5xl">🛒</div>
                  <p className="mt-2 font-display font-black">Chưa có món nào</p>
                  <p className="mt-1 text-sm text-ink-400">Quét mã hoặc chọn hàng.</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-forest-900 p-3 pt-2 text-white">
            {promoOpen && (
              <PromoPicker
                promos={promos.data || []}
                loading={promos.isPending}
                subtotal={subtotal}
                value={promo}
                onPick={(code) => {
                  setPromo(code === promo ? "" : code);
                  if (code !== promo) setPromoOpen(false);
                }}
              />
            )}
            {nearOff > 0 && (
              <div className="mb-1 px-1 text-xs font-semibold text-coral-300">Đã trừ cận date −{money(nearOff)}đ</div>
            )}
            <div className="mb-3 flex items-end justify-between px-1">
              <button className="inline-flex items-center gap-1 text-xs font-bold text-lime-300" onClick={() => setPromoOpen((v) => !v)}>
                <BadgePercent className="h-3.5 w-3.5" />
                {promoOpen
                  ? "Ẩn KM"
                  : chosen
                    ? promoOff > 0
                      ? `${chosen.code} −${money(promoOff)}đ`
                      : `${chosen.code} · thiếu ${money(chosen.min_order_amount - subtotal)}đ`
                    : `Chọn mã KM${promos.data?.length ? ` (${promos.data.length})` : ""}`}
              </button>
              <div className="text-right">
                <div className="text-xs text-white/60">Cần thu</div>
                <div className="font-display text-3xl font-black leading-none text-white">{money(total)}đ</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="h-12 rounded-2xl bg-white font-extrabold text-forest-900 transition active:scale-[.97] disabled:opacity-40"
                disabled={!lines.length || busy || overStock}
                onClick={() => { setCash(0); setPay("CASH"); }}
              >
                <span className="inline-flex items-center gap-1.5"><Banknote className="h-4 w-4" /> Tiền mặt</span>
              </button>
              <button
                className="h-12 rounded-2xl bg-coral-500 font-extrabold text-white transition active:scale-[.97] disabled:opacity-40"
                disabled={!lines.length || busy || overStock}
                onClick={() => checkout("QR_BANK")}
              >
                <span className="inline-flex items-center gap-1.5"><QrCode className="h-4 w-4" /> QR</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {pay === "CASH" && (
        <CashPayModal
          lines={lines}
          subtotal={subtotal}
          discount={promoOff + discount}
          total={total}
          customer={customer}
          cashier={user?.full_name}
          storeName={settings.data?.["store.name"]}
          storeAddress={settings.data?.["store.address"]}
          storePhone={settings.data?.["store.phone"]}
          cash={cash}
          onCash={setCash}
          busy={busy}
          blocked={overStock}
          slip={slip}
          onClose={() => { setPay(null); setSlip(null); }}
          onConfirm={() => checkout("CASH")}
          onDraft={() => {
            hold();
            setPay(null);
            setSlip(null);
            setCash(0);
          }}
        />
      )}

      {pay === "QR" && last && (
        <QrPayModal
          order={last}
          storeName={settings.data?.["store.name"]}
          storeAddress={settings.data?.["store.address"]}
          storePhone={settings.data?.["store.phone"]}
          onPark={parkQr}
          onCancel={abandonQr}
          onPaid={async () => {
            try {
              /* complete_qr_order ở backend không làm lại nếu đơn đã COMPLETED,
                 nên gọi lại sau khi webhook ngân hàng đã khớp là an toàn. */
              const res = await staffApi.confirmPay(last.payments[0].id);
              const done = res.order || { ...last, status: "COMPLETED" };
              setWaiting((w) => w.filter((x) => x.id !== last.id));
              setPay(null);
              clear();
              setLast(null);
              qc.invalidateQueries({ queryKey: ["pos-p"] });
              await openSlip(done, true);
            } catch (e) {
              toast.error(e, "Chưa chốt được đơn QR — để đó rồi thử lại nhé");
            }
          }}
        />
      )}

      {pairModal && pair && (
        <PairPhoneModal
          pair={pair}
          onClose={() => setPairModal(false)}
          onPaired={() => {
            setPhoneOn(true);
            setPairModal(false);
          }}
        />
      )}

      {newCus !== null && (
        <NewCustomerModal
          phone={newCus}
          onClose={() => setNewCus(null)}
          onCreated={(c) => {
            setCustomer(c);
            setNewCus(null);
            setCusEdit(false);
            setPhone("");
            toast.success(`Đã gắn khách ${c.name}`);
          }}
        />
      )}

      {closing && shift.data && (
        <CloseShiftModal
          shift={shift.data}
          onClose={() => setClosing(false)}
          onClosed={(s) => {
            setClosing(false);
            shift.refetch();
            const diff = Number(s.cash_diff || 0);
            if (diff === 0) toast.success("Két khớp đúng số, đóng ca xong.");
            else if (diff > 0) toast.info(`Đóng ca xong — két thừa ${vnd(diff)}`);
            else toast.error(`Đóng ca xong — két thiếu ${vnd(Math.abs(diff))}`);
          }}
        />
      )}

      {unknown !== null && (
        <Modal
          size="md"
          onClose={() => setUnknown(null)}
          title="Hàng ngoài"
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setUnknown(null)}>Huỷ</Button>
              <Button
                className="flex-1"
                disabled={!quick.name.trim() || !quick.sale_price}
                onClick={async () => {
                  setQuickErr("");
                  try {
                    const qty = Math.max(1, Number(quick.qty) || 1);
                    const p = await staffApi.quickCreate({
                      name: quick.name,
                      sale_price: quick.sale_price,
                      barcode: quick.barcode.trim() || undefined,
                      is_online: false,
                      quantity: qty,
                    });
                    add(p, qty);
                    setUnknown(null);
                    setQuick({ name: "", sale_price: 10000, qty: 1, barcode: "" });
                    qc.invalidateQueries({ queryKey: ["pos-p"] });
                    qc.invalidateQueries({ queryKey: ["pending-cost"] });
                  } catch (e: any) {
                    setQuickErr(e.message || "Thêm không được, thử lại nhé.");
                  }
                }}
              >
                Lưu
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Mã hàng"
              className="font-mono tracking-wide"
              placeholder="Quét hoặc gõ mã"
              value={quick.barcode}
              onChange={(e) => setQuick({ ...quick, barcode: e.target.value })}
            />
            <Input
              label="Tên hàng"
              required
              autoFocus={!quick.barcode}
              placeholder="Vd. tăm chỉ nha khoa"
              value={quick.name}
              onChange={(e) => setQuick({ ...quick, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput
                label="Giá bán"
                required
                value={quick.sale_price}
                onChange={(e) => setQuick({ ...quick, sale_price: Number(e.target.value) })}
              />
              <Input
                label="Số đang cầm"
                type="number"
                min={1}
                value={quick.qty}
                onChange={(e) => setQuick({ ...quick, qty: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            {quickErr && <Notice tone="danger">{quickErr}</Notice>}
          </div>
        </Modal>
      )}

      {weight && (
        <Modal
          size="sm"
          onClose={() => setWeight(null)}
          title={weight.name}
          subtitle={`${vnd(weight.sale_price)} mỗi kg`}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setWeight(null)}>Huỷ</Button>
              <Button className="flex-1" onClick={() => { add(weight, Number(kg)); setWeight(null); }}>Lưu</Button>
            </>
          }
        >
          <Input
            label="Cân nặng (kg)"
            className="text-center font-display text-2xl font-black"
            type="number"
            step="0.05"
            min={0}
            autoFocus
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                add(weight, Number(kg));
                setWeight(null);
              }
            }}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["0.2", "0.3", "0.5", "1"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setKg(v)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-extrabold transition",
                  kg === v ? "bg-forest-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                )}
              >
                {v} kg
              </button>
            ))}
          </div>
        </Modal>
      )}

      {slip && pay !== "CASH" && <ReceiptPrinter data={slip} onClose={() => setSlip(null)} />}
    </div>
  );
}

function PosRow({ p, qty, onAdd }: { p: any; qty: number; onAdd: () => void }) {
  const outside = p.cost_confirmed === false;
  const left = Math.max(0, Number(p.available || 0) - qty);
  const out = !outside && left <= 0;
  const low = !out && !outside && (p.low_stock || left <= Number(p.min_stock || 0));
  const unit = p.product_type === "WEIGHTED" ? " kg" : "";

  // Tồn kho chỉ là chữ nhỏ màu xám; đổi màu khi sắp hết/hàng ngoài để mắt bắt được
  // đúng món cần chú ý, còn lại cả kệ đồng một tông cho gọn.
  const stockTone = outside ? "text-sun-700" : low ? "text-coral-600" : "text-ink-400";

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={out}
      className={`group relative flex flex-col rounded-2xl bg-white p-1.5 text-left ring-1 transition hover:shadow-card active:scale-[.98] disabled:opacity-50 ${
        qty ? "ring-2 ring-forest-900" : "ring-black/[.06] hover:ring-black/[.12]"
      }`}
    >
      {qty > 0 && (
        <span className="absolute right-2.5 top-2.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-forest-900 px-1.5 text-xs font-bold text-white ring-2 ring-white">
          {num(qty)}
        </span>
      )}

      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink-100">
        <ProductImage
          src={p.image_url}
          emoji={p.emoji}
          alt={p.name}
          fit="cover"
          className="absolute inset-0 h-full w-full transition duration-300 group-hover:scale-[1.04]"
          emojiClassName="absolute inset-0 grid place-items-center text-4xl"
        />
        {out && (
          <span className="absolute inset-0 grid place-items-center bg-white/75 text-xs font-bold text-ink-600">
            Hết hàng
          </span>
        )}
        {!out && p.near_expiry && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-coral-500 px-2 py-0.5 text-[0.625rem] font-extrabold text-white">
            Cận date −{p.near_expiry.percent}%
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col px-1 pb-0.5 pt-2">
        <span className="line-clamp-2 min-h-[2.1rem] text-[0.8125rem] font-medium leading-snug text-ink-800">
          {p.name}
        </span>
        <span className="mt-1.5 flex items-baseline justify-between gap-1">
          <span className="text-sm font-bold tabular-nums text-ink-900">{money(p.sale_price)}đ</span>
          <span className={`shrink-0 text-[0.6875rem] font-medium tabular-nums ${stockTone}`}>
            {outside ? "Hàng ngoài" : out ? "Hết" : `Còn ${num(left)}${unit}`}
          </span>
        </span>
      </span>
    </button>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-lime-50" onClick={onClick}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

/** Khách chưa có trong sổ — tạo ngay tại quầy để tích điểm từ đơn này. */
function NewCustomerModal({
  phone,
  onClose,
  onCreated,
}: {
  phone: string;
  onClose: () => void;
  onCreated: (c: any) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      onCreated(await staffApi.createCustomer({ name: name.trim(), phone }));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="sm"
      onClose={onClose}
      title="Khách mới"
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>Huỷ</Button>
          <Button className="flex-1" loading={busy} disabled={!name.trim()} onClick={submit}>Lưu</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Số điện thoại" className="font-mono tracking-wide" value={phone} readOnly />
        <Input
          label="Tên khách"
          required
          autoFocus
          placeholder="Vd. chị Hoa đầu ngõ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
    </Modal>
  );
}

/** Đóng ca: đếm két rồi so với số máy tính ra, hiện lệch ngay trước khi chốt. */
function CloseShiftModal({
  shift,
  onClose,
  onClosed,
}: {
  shift: any;
  onClose: () => void;
  onClosed: (s: any) => void;
}) {
  const toast = useToast();
  const [cash, setCash] = useState(String(Math.round(shift.expected_cash || 0)));
  const [busy, setBusy] = useState(false);
  const diff = (Number(cash) || 0) - Number(shift.expected_cash || 0);

  const submit = async () => {
    setBusy(true);
    try {
      onClosed(await staffApi.closeShift(shift.id, Number(cash) || 0));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="sm"
      onClose={onClose}
      title={`Đóng ${caLabel(shift.opened_at)}`}
      subtitle={`${shift.total_orders || 0} đơn trong ca này`}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>Huỷ</Button>
          <Button className="flex-1" loading={busy} onClick={submit}>Lưu</Button>
        </>
      }
    >
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-500">Tiền đầu ca</dt>
          <dd className="font-semibold text-ink-900">{vnd(shift.opening_cash)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-500">Bán thu tiền mặt</dt>
          <dd className="font-semibold text-ink-900">{vnd(shift.cash_sales)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-500">Bán qua chuyển khoản</dt>
          <dd className="font-semibold text-ink-900">{vnd(shift.qr_sales)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-2">
          <dt className="font-display font-black text-ink-900">Két phải có</dt>
          <dd className="font-display text-lg font-black text-ink-900">{vnd(shift.expected_cash)}</dd>
        </div>
      </dl>

      <MoneyInput
        label="Tiền đếm được trong két"
        wrapClass="mt-4"
        className="text-center font-display text-xl font-black"
        autoFocus
        value={cash}
        onChange={(e) => setCash(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />

      <Notice
        className="mt-4 text-center font-extrabold"
        tone={diff === 0 ? "ok" : diff > 0 ? "warn" : "danger"}
      >
        {diff === 0 ? "Khớp đúng số" : diff > 0 ? `Két thừa ${vnd(diff)}` : `Két thiếu ${vnd(Math.abs(diff))}`}
      </Notice>
    </Modal>
  );
}

/** Chọn mã khuyến mãi đang chạy — không gõ tay. Mã chưa đủ đơn tối thiểu vẫn hiện nhưng mờ đi. */
function PromoPicker({
  promos,
  loading,
  subtotal,
  value,
  onPick,
}: {
  promos: Promo[];
  loading: boolean;
  subtotal: number;
  value: string;
  onPick: (code: string) => void;
}) {
  if (loading) return <div className="mb-2 px-1 text-xs text-white/60">Đang tải mã…</div>;
  if (!promos.length) return <div className="mb-2 px-1 text-xs text-white/60">Hôm nay không có mã nào đang chạy.</div>;
  return (
    <div className="mb-2 max-h-52 space-y-1.5 overflow-auto">
      {promos.map((p) => {
        const off = promoDiscount(p, subtotal);
        const short = p.min_order_amount - subtotal;
        const on = p.code === value;
        return (
          <button
            key={p.id}
            type="button"
            disabled={off <= 0 && !on}
            onClick={() => onPick(p.code)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition",
              on ? "bg-lime-300 text-forest-900" : "bg-white/10 text-white hover:bg-white/15",
              off <= 0 && !on && "opacity-45"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-black">{p.code}</span>
                <span className="truncate text-xs">{p.name}</span>
              </div>
              <div className={cn("text-[0.6875rem]", on ? "text-forest-800" : "text-white/60")}>
                {short > 0 ? `Thêm ${money(short)}đ để dùng` : `Giảm ${money(off)}đ`} · đến {p.end_date.split("-").reverse().join("/")}
              </div>
            </div>
            {on && <Check className="h-4 w-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

function PairPhoneModal({ pair, onClose, onPaired }: { pair: any; onClose: () => void; onPaired: () => void }) {
  const [httpsPort, setHttpsPort] = useState("5174");
  const [httpPort, setHttpPort] = useState("5173");
  const [host, setHost] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pub = publicOrigin();
  const joinUrl = pub
    ? `${pub}/scan?code=${pair.pair_code}`
    : host && !isLoopback(host) ? `http://${host}:${httpPort}/scan?code=${pair.pair_code}` : "";
  const cameraUrl = pub ? "" : host && !isLoopback(host) ? `https://${host}:${httpsPort}/scan?code=${pair.pair_code}` : "";

  const paint = async (h: string) => {
    const clean = h.trim().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    if (!clean || isLoopback(clean)) {
      setQr("");
      setErr("Điện thoại không mở được localhost. Điền IP Wi‑Fi của máy tính (Cài đặt → Wi‑Fi).");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await staffApi.scannerQr(`http://${clean}:${httpPort}/scan?code=${pair.pair_code}`);
      setQr(r.qr_image);
      setHost(clean);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    // Đã chạy trên domain HTTPS công khai (Vercel): điện thoại mở thẳng domain, khỏi dò IP Wi‑Fi.
    if (pub) {
      staffApi
        .scannerQr(`${pub}/scan?code=${pair.pair_code}`)
        .then((r) => alive && setQr(r.qr_image))
        .catch((e) => alive && setErr(e.message));
      return () => {
        alive = false;
      };
    }
    (async () => {
      const [httpsP, httpP] = await Promise.all([phoneHttpsPort(), phoneHttpPort()]);
      if (!alive) return;
      setHttpsPort(httpsP);
      setHttpPort(httpP);
      const h = await phoneHost();
      if (!alive) return;
      if (h) {
        setHost(h);
        await paint(h);
      } else {
        setErr("Chưa nhận IP Wi‑Fi. Cùng mạng với máy tính rồi điền IP (vd. 192.168.1.99).");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.pair_code]);

  useEffect(() => {
    if (!pair?.id) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await staffApi.scannerStatus(pair.id);
        if (!stop && s.status === "ACTIVE") onPaired();
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.id]);

  return (
    <Modal size="sm" onClose={onClose} title="Ghép điện thoại">
      <div className="text-center">
        <div className="rounded-2xl bg-sand py-3">
          <div className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-ink-500">Mã ghép</div>
          <div className="font-mono text-4xl font-black tracking-[0.2em] text-ink-900">{pair.pair_code}</div>
        </div>
        {!pub && <div className="mt-4 flex items-end gap-2 text-left">
          <Input
            label="IP máy tính trên Wi‑Fi"
            className="font-mono text-center"
            value={host}
            placeholder="192.168.1.97"
            onChange={(e) => setHost(e.target.value)}
            onBlur={() => host && paint(host)}
          />
          <Button className="mb-0 shrink-0" loading={busy} onClick={() => paint(host)}>
            Tạo QR
          </Button>
        </div>}
        {qr ? (
          <img src={qr} className="mx-auto mt-4 w-48 rounded-2xl bg-white p-2" alt="QR ghép máy" />
        ) : null}
        {joinUrl && (
          <p className="mt-3 break-all font-mono text-xs text-ink-800">{joinUrl}</p>
        )}
        {cameraUrl && (
          <p className="mt-1 break-all font-mono text-[0.6875rem] text-ink-400">{cameraUrl}</p>
        )}
        {err && <Notice tone="danger" className="mt-3">{err}</Notice>}
      </div>
    </Modal>
  );
}
