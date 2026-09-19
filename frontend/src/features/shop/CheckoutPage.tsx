import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Banknote, Bike, Check, LocateFixed, MapPin, Plus, QrCode, Store } from "lucide-react";
import { shopApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import { useShopAuth } from "../../stores/shopAuthStore";
import Button from "../../components/ui/Button";
import { ChoiceCard, Input, Textarea } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { promoDiscount, type Promo } from "../../stores/cartStore";
import { currentPosition, geocode, kmText, type LatLng } from "../../lib/geo";
import { cn } from "../../lib/cn";

export default function CheckoutPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { customer } = useShopAuth();
  const cart = useQuery({ queryKey: ["cart"], queryFn: shopApi.cart, enabled: !!customer });
  const addrs = useQuery({ queryKey: ["addr"], queryFn: shopApi.addresses, enabled: !!customer });
  const shipRule = useQuery({ queryKey: ["ship-rule"], queryFn: shopApi.shippingRule, staleTime: 300_000 });

  const [method, setMethod] = useState("PICKUP");
  const [pay, setPay] = useState("COD");
  const [promo, setPromo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addr, setAddr] = useState({
    receiver_name: customer?.name || "",
    receiver_phone: customer?.phone || "",
    province: "Hà Nội",
    district: "",
    ward: "",
    street: "",
  });
  // Địa chỉ đang chọn: id một địa chỉ đã lưu, hoặc "new" để nhập địa chỉ khác.
  const [pick, setPick] = useState<number | "new" | null>(null);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [locState, setLocState] = useState<"idle" | "finding" | "found" | "miss">("idle");
  const [locErr, setLocErr] = useState("");

  const items = cart.data?.items || [];
  const savedList: any[] = addrs.data || [];
  const chosenId = pick ?? (savedList.find((a) => a.is_default) || savedList[0])?.id ?? "new";
  const saved = chosenId === "new" ? null : savedList.find((a) => a.id === chosenId) || null;
  const needAddress = method === "DELIVERY" && !saved;
  const rule = shipRule.data || { free_km: 2, base_fee: 20000, per_km: 5000 };

  // Địa chỉ mới: khách gõ xong số nhà + phường thì tự tra toạ độ trên bản đồ.
  const typed = [addr.street, addr.ward, addr.district, addr.province];
  const lastTyped = useRef("");
  useEffect(() => {
    if (!needAddress || !addr.street.trim() || !addr.ward.trim()) return;
    const key = typed.join("|");
    if (key === lastTyped.current) return;
    const t = setTimeout(async () => {
      lastTyped.current = key;
      setLocState("finding");
      const hit = await geocode(typed);
      setLoc(hit);
      setLocState(hit ? "found" : "miss");
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needAddress, addr.street, addr.ward, addr.district, addr.province]);

  // Địa chỉ lưu từ trước khi tính phí theo km chưa có toạ độ: tra một lần rồi lưu lại.
  const tried = useRef(new Set<number>());
  useEffect(() => {
    if (method !== "DELIVERY" || !saved || saved.lat != null || tried.current.has(saved.id)) return;
    tried.current.add(saved.id);
    geocode([saved.street, saved.ward, saved.district, saved.province]).then(async (hit) => {
      if (!hit) return;
      await shopApi.locateAddress(saved.id, hit).catch(() => {});
      addrs.refetch();
    });
  }, [method, saved, addrs]);

  const useMyLocation = async () => {
    setLocErr("");
    setLocState("finding");
    try {
      const here = await currentPosition();
      if (saved) {
        await shopApi.locateAddress(saved.id, here);
        await addrs.refetch();
        setLocState("idle");
      } else {
        setLoc(here);
        setLocState("found");
      }
    } catch (e: any) {
      setLocErr(e.message);
      setLocState(saved ? "idle" : loc ? "found" : "miss");
    }
  };

  const target: LatLng | null = saved ? (saved.lat != null ? { lat: saved.lat, lng: saved.lng } : null) : loc;
  const quote = useQuery({
    queryKey: ["ship-quote", target?.lat, target?.lng],
    queryFn: () => shopApi.shippingQuote({ lat: target?.lat, lng: target?.lng }),
    enabled: method === "DELIVERY",
  });
  const ship = method === "DELIVERY" ? Number(quote.data?.fee ?? rule.base_fee) : 0;
  const promos = useQuery<Promo[]>({ queryKey: ["shop-promos"], queryFn: shopApi.promotions, enabled: !!customer });
  const subtotal = Number(cart.data?.subtotal || 0);
  const chosen = (promos.data || []).find((p) => p.code === promo) || null;
  const promoOff = promoDiscount(chosen, subtotal);
  const nearOff = items.reduce((s: number, i: any) => s + Number(i.discount || 0), 0);
  const total = subtotal - promoOff + ship;

  const place = async () => {
    /* Kiểm địa chỉ trước khi gọi: thiếu tên hay số nhà thì đơn giao không tới
       được, mà backend chỉ trả một câu lỗi chung. */
    const next: Record<string, string> = {};
    if (needAddress) {
      if (!addr.receiver_name.trim()) next.receiver_name = "Cần tên người nhận";
      if (!/^0\d{9}$/.test(addr.receiver_phone.replace(/\s/g, ""))) next.receiver_phone = "Số điện thoại 10 số, bắt đầu bằng 0";
      if (!addr.street.trim()) next.street = "Cần số nhà và tên đường";
      if (!addr.ward.trim()) next.ward = "Cần tên phường";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      let address_id = saved?.id;
      if (needAddress) {
        const a = await shopApi.addAddress({
          ...addr,
          receiver_phone: addr.receiver_phone.replace(/\s/g, ""),
          is_default: !savedList.length,
          lat: loc?.lat,
          lng: loc?.lng,
        });
        address_id = a.id;
      }
      const order = await shopApi.placeOrder({
        delivery_method: method,
        payment_method: pay,
        promo_code: promoOff > 0 ? promo : undefined,
        note: note.trim() || undefined,
        address_id,
      });
      window.dispatchEvent(new Event("cart-changed"));
      toast.success(`Đã đặt đơn ${order.code} — hàng được giữ cho bạn rồi`);
      nav("/orders", { state: { just: order } });
    } catch (e) {
      toast.error(e, "Chưa đặt được đơn, thử lại nhé");
    } finally {
      setBusy(false);
    }
  };

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mb-3 text-6xl">🔐</div>
        <h1 className="font-display text-3xl font-black">Cần đăng nhập</h1>
        <p className="mt-2 text-ink-500">Đăng nhập để chốt đơn và theo dõi hàng.</p>
        <Link to="/dang-nhap" className="btn-lime mt-6 inline-flex">
          Vào tiệm
        </Link>
      </div>
    );
  }

  if (cart.isPending) {
    return (
      <div className="mx-auto grid max-w-5xl gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
        </div>
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card">
          <EmptyState
            emoji="🧺"
            title="Giỏ trống thì chưa chốt được"
            action={
              <Link to="/catalog">
                <Button>Đi chợ</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        <div>
          <div className="section-kicker">Thanh toán</div>
          <h1 className="font-display text-2xl font-black sm:text-3xl">Chốt đơn · giữ hàng</h1>
        </div>

        <section className="card p-5">
          <div className="mb-3 font-display font-black text-ink-900">1. Nhận hàng thế nào</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={method === "PICKUP"}
              onClick={() => setMethod("PICKUP")}
              icon={Store}
              title="Lấy tại quầy"
              desc="Miễn phí · giữ hàng 24 giờ"
            />
            <ChoiceCard
              active={method === "DELIVERY"}
              onClick={() => setMethod("DELIVERY")}
              icon={Bike}
              tone="coral"
              title="Giao tận nơi"
              desc={`Miễn phí trong ${num(rule.free_km)} km · xa hơn từ ${vnd(rule.base_fee)}`}
            />
          </div>

          {method === "DELIVERY" && (
            <div className="mt-4 space-y-3">
              <div className="text-sm font-semibold text-ink-600">Giao tới đâu</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {savedList.map((a) => {
                  const on = saved?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setPick(a.id)}
                      className={cn(
                        "relative rounded-2xl border p-3.5 text-left transition",
                        on ? "border-ink-900 bg-white ring-1 ring-ink-900" : "border-black/10 bg-white hover:border-black/25"
                      )}
                    >
                      {on && <Check className="absolute right-3 top-3 h-4 w-4 text-ink-900" />}
                      <div className="pr-6 text-sm font-bold text-ink-900">
                        {a.receiver_name} · {a.receiver_phone}
                      </div>
                      <div className="mt-0.5 text-sm text-ink-500">
                        {[a.street, a.ward, a.district, a.province].filter(Boolean).join(", ")}
                      </div>
                      <div className="mt-1.5 text-xs font-semibold text-ink-500">
                        {a.shipping?.located
                          ? `Cách tiệm ${kmText(a.shipping.distance_km)} · ${a.shipping.fee ? vnd(a.shipping.fee) : "miễn phí giao"}`
                          : "Chưa định vị trên bản đồ"}
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPick("new")}
                  className={cn(
                    "flex min-h-[5.5rem] items-center justify-center gap-2 rounded-2xl border border-dashed p-3.5 text-sm font-bold transition",
                    needAddress ? "border-ink-900 bg-white text-ink-900" : "border-black/20 text-ink-500 hover:border-black/40 hover:text-ink-800"
                  )}
                >
                  <Plus className="h-4 w-4" /> {savedList.length ? "Giao tới địa chỉ khác" : "Nhập địa chỉ giao"}
                </button>
              </div>

              {needAddress && (
                <div className="grid gap-3 rounded-2xl bg-ink-50 p-4 sm:grid-cols-2">
                  <Input
                    label="Tên người nhận"
                    required
                    value={addr.receiver_name}
                    error={errors.receiver_name}
                    onChange={(e) => setAddr({ ...addr, receiver_name: e.target.value })}
                  />
                  <Input
                    label="Số điện thoại"
                    required
                    className="font-mono"
                    digits
                    maxLength={10}
                    placeholder="Số điện thoại 10 số"
                    value={addr.receiver_phone}
                    error={errors.receiver_phone}
                    onChange={(e) => setAddr({ ...addr, receiver_phone: e.target.value })}
                  />
                  <Input
                    label="Số nhà, đường"
                    required
                    wrapClass="sm:col-span-2"
                    placeholder="Vd. 25 Lê Văn Lương"
                    value={addr.street}
                    error={errors.street}
                    onChange={(e) => setAddr({ ...addr, street: e.target.value })}
                  />
                  <Input
                    label="Phường / xã"
                    required
                    placeholder="Vd. Cầu Diễn"
                    value={addr.ward}
                    error={errors.ward}
                    onChange={(e) => setAddr({ ...addr, ward: e.target.value })}
                  />
                  <Input
                    label="Quận / huyện"
                    placeholder="Vd. Bắc Từ Liêm"
                    value={addr.district}
                    onChange={(e) => setAddr({ ...addr, district: e.target.value })}
                  />
                  <Input
                    label="Tỉnh / thành phố"
                    wrapClass="sm:col-span-2"
                    value={addr.province}
                    onChange={(e) => setAddr({ ...addr, province: e.target.value })}
                  />
                </div>
              )}

              {/* Khoảng cách và phí giao cho địa chỉ đang chọn. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-black/10 bg-white px-4 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1 text-sm">
                  {locState === "finding" ? (
                    <span className="font-semibold text-ink-500">Đang tìm địa chỉ trên bản đồ…</span>
                  ) : needAddress && !addr.street.trim() ? (
                    <span className="font-semibold text-ink-500">Nhập địa chỉ để tính phí giao.</span>
                  ) : quote.data?.located ? (
                    <span className="font-semibold text-ink-900">
                      Cách tiệm {kmText(quote.data.distance_km)} ·{" "}
                      {quote.data.fee ? `phí giao ${vnd(quote.data.fee)}` : "miễn phí giao"}
                    </span>
                  ) : (
                    <span className="font-semibold text-sun-700">
                      Chưa tìm thấy trên bản đồ — tạm tính {vnd(rule.base_fee)}. Bấm "Vị trí của tôi" nếu bạn đang ở nơi nhận hàng.
                    </span>
                  )}
                  {locErr && <div className="mt-0.5 text-xs font-semibold text-coral-600">{locErr}</div>}
                </div>
                <Button size="sm" variant="ghost" icon={LocateFixed} loading={locState === "finding"} onClick={useMyLocation}>
                  Vị trí của tôi
                </Button>
              </div>
              <p className="text-xs text-ink-400">
                Miễn phí trong {num(rule.free_km)} km. Xa hơn: {vnd(rule.base_fee)}, mỗi km thêm {vnd(rule.per_km)}.
              </p>
            </div>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-3 font-display font-black text-ink-900">2. Trả tiền kiểu nào</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={pay === "COD"}
              onClick={() => setPay("COD")}
              icon={Banknote}
              title="Khi nhận hàng"
              desc={method === "PICKUP" ? "Trả tại quầy lúc tới lấy" : "Trả tiền mặt cho người giao"}
            />
            <ChoiceCard
              active={pay === "QR_BANK"}
              onClick={() => setPay("QR_BANK")}
              icon={QrCode}
              title="Chuyển khoản QR"
              desc="Quét app ngân hàng, không phí cổng"
            />
          </div>
          <div className="mt-4 grid gap-3">
            <div>
              <div className="mb-1.5 text-sm font-semibold text-ink-600">Mã giảm giá</div>
              {!promos.data?.length ? (
                <p className="text-sm text-ink-400">Hiện chưa có mã nào đang chạy.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {promos.data.map((p) => {
                    const off = promoDiscount(p, subtotal);
                    const on = p.code === promo;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={off <= 0 && !on}
                        onClick={() => setPromo(on ? "" : p.code)}
                        className={`rounded-2xl border p-3 text-left transition disabled:opacity-45 ${
                          on ? "border-lime-400 bg-lime-50 ring-2 ring-lime-200" : "border-black/10 hover:border-lime-400"
                        }`}
                      >
                        <div className="font-mono text-xs font-black text-ink-900">{p.code}</div>
                        <div className="truncate text-sm text-ink-700">{p.name}</div>
                        <div className="mt-0.5 text-xs text-ink-400">
                          {off > 0 ? `Giảm ${vnd(off)}` : `Thêm ${vnd(p.min_order_amount - subtotal)} để dùng`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Textarea
              label="Ghi chú cho quán"
              rows={2}
              placeholder="Vd. gọi trước khi tới, để ở bảo vệ"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>
      </div>

      <aside className="card h-fit p-6 lg:sticky lg:top-24">
        <div className="font-display font-black text-ink-900">Đơn của bạn</div>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((i: any) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 truncate">
                <ProductImage src={i.image_url} emoji={i.emoji} alt={i.name} className="h-6 w-6 shrink-0" />
                <span className="truncate">
                  {i.name} <span className="text-ink-400">× {num(i.quantity)}</span>
                </span>
              </span>
              <span className="shrink-0 text-right font-semibold">
                {vnd(i.line_total)}
                {Number(i.discount) > 0 && (
                  <span className="block text-[11px] font-bold text-coral-600">Cận date −{vnd(i.discount)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between text-sm text-ink-500">
          <span>Tạm tính</span>
          <span>{vnd(cart.data?.subtotal)}</span>
        </div>
        {nearOff > 0 && (
          <div className="flex justify-between text-sm text-coral-600">
            <span>Đã trừ hàng cận date</span>
            <span>−{vnd(nearOff)}</span>
          </div>
        )}
        {promoOff > 0 && (
          <div className="flex justify-between text-sm text-coral-600">
            <span>Mã {chosen?.code}</span>
            <span>−{vnd(promoOff)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-ink-500">
          <span>Phí giao</span>
          <span>{ship ? vnd(ship) : "0đ"}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3 font-display text-xl font-black">
          <span>Cần trả</span>
          <span className="text-coral-500">{vnd(total)}</span>
        </div>
        <Button block size="lg" variant="coral" className="mt-5" loading={busy} onClick={place}>
          Đặt đơn
        </Button>
      </aside>
    </div>
  );
}
