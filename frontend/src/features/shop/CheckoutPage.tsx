import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Banknote, Bike, QrCode, Store } from "lucide-react";
import { shopApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import { useShopAuth } from "../../stores/shopAuthStore";
import Button from "../../components/ui/Button";
import { ChoiceCard, Input, Textarea } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { promoDiscount, type Promo } from "../../stores/cartStore";

const SHIP_FEE = 15000;

export default function CheckoutPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { customer } = useShopAuth();
  const cart = useQuery({ queryKey: ["cart"], queryFn: shopApi.cart, enabled: !!customer });
  const addrs = useQuery({ queryKey: ["addr"], queryFn: shopApi.addresses, enabled: !!customer });

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
    district: "Thanh Xuân",
    ward: "Nhân Chính",
    street: "",
  });

  const items = cart.data?.items || [];
  const saved = addrs.data?.[0];
  const needAddress = method === "DELIVERY" && !saved;
  const ship = method === "DELIVERY" ? SHIP_FEE : 0;
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
          is_default: true,
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
              desc={`+${vnd(SHIP_FEE)} quanh Thanh Xuân`}
            />
          </div>

          {method === "DELIVERY" && saved && (
            <div className="mt-4 rounded-2xl bg-lime-50 px-4 py-3 text-sm">
              <div className="font-bold text-ink-900">{saved.receiver_name}</div>
              <div className="text-ink-500">
                {saved.receiver_phone} · {saved.street}, {saved.ward}, {saved.district}
              </div>
            </div>
          )}

          {needAddress && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                inputMode="numeric"
                placeholder="0901234567"
                value={addr.receiver_phone}
                error={errors.receiver_phone}
                onChange={(e) => setAddr({ ...addr, receiver_phone: e.target.value })}
              />
              <Input
                label="Số nhà, đường"
                required
                wrapClass="sm:col-span-2"
                placeholder="12 Nguyễn Trãi"
                value={addr.street}
                error={errors.street}
                onChange={(e) => setAddr({ ...addr, street: e.target.value })}
              />
              <Input
                label="Phường"
                required
                value={addr.ward}
                error={errors.ward}
                onChange={(e) => setAddr({ ...addr, ward: e.target.value })}
              />
              <Input label="Quận" value={addr.district} onChange={(e) => setAddr({ ...addr, district: e.target.value })} />
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
