import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Minus, Plus, ShoppingBasket } from "lucide-react";
import ProductImage from "../../components/ui/ProductImage";
import ProductCard from "../../components/ui/ProductCard";
import { shopApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import { useShopAuth } from "../../stores/shopAuthStore";
import Button from "../../components/ui/Button";
import { ErrorState, Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";

export default function ProductPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { customer } = useShopAuth();
  const [qty, setQty] = useState(1);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["p", slug], queryFn: () => shopApi.product(slug!) });
  const p = q.data;

  useEffect(() => {
    if (!p) return;
    setQty(p.product_type === "WEIGHTED" ? 0.3 : 1);
  }, [p?.id, p?.product_type]);

  if (q.isPending) {
    return (
      <div className="shop-wrap py-4 sm:py-6">
        <div className="grid gap-5 md:grid-cols-2 md:gap-8">
          <Skeleton className="h-56 rounded-3xl sm:h-80 md:h-[420px]" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-9 w-3/4 rounded-xl" />
            <Skeleton className="h-10 w-40 rounded-xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-12 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (q.isError || !p) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card">
          <ErrorState
            error={q.error}
            title="Không tìm thấy món này"
            onRetry={q.refetch}
          />
        </div>
        <Link to="/catalog" className="btn-ghost mt-4 inline-flex">
          Về kệ hàng
        </Link>
      </div>
    );
  }

  const step = p.product_type === "WEIGHTED" ? 0.1 : 1;
  const max = Math.max(0, Number(p.available || 0));
  const bump = (d: number) => setQty((v) => Math.min(max || step, Math.max(step, Number((v + d).toFixed(2)))));

  const add = async () => {
    if (!customer) return nav("/dang-nhap");
    setBusy(true);
    try {
      await shopApi.addCart(p.id, qty);
      window.dispatchEvent(new Event("cart-changed"));
      setOk(true);
      setTimeout(() => setOk(false), 1600);
    } catch (e) {
      toast.error(e, "Chưa thêm được vào giỏ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shop-wrap py-4 sm:py-6">
      <Link
        to="/catalog"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 transition hover:text-coral-500"
      >
        <ArrowLeft className="h-4 w-4" /> Tiếp tục đi chợ
      </Link>

      <div className="mt-4 grid gap-5 md:grid-cols-2 md:gap-8">
        <div className="card relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-lime-100 to-sun-50 text-7xl sm:h-80 sm:text-8xl md:h-[420px]">
          <ProductImage
            src={p.image_url}
            emoji={p.emoji}
            alt={p.name}
            className="relative z-10 h-full w-full p-6"
            emojiClassName="relative z-10 drop-shadow"
          />
          {p.sold_count > 20 && (
            <span className="chip absolute left-4 top-4 bg-coral-500 font-extrabold text-white">🔥 Bán chạy</span>
          )}
        </div>

        <div className="card min-w-0 p-5 sm:p-6 md:p-8">
          <div className="text-xs font-extrabold uppercase tracking-widest text-ink-400">
            {p.brand} · {p.category}
          </div>
          <h1 className="mt-1 break-words font-display text-2xl font-black sm:text-3xl">{p.name}</h1>
          <div className="mt-4 font-display text-3xl font-black text-coral-500 sm:text-4xl">{vnd(p.sale_price)}</div>
          {p.description && <p className="mt-4 leading-relaxed text-ink-500">{p.description}</p>}

          <div
            className={cn(
              "chip mt-4 inline-flex",
              max > 0 ? "bg-lime-100 text-forest-800" : "bg-coral-100 text-coral-600"
            )}
          >
            {max > 0 ? `Còn ${num(max)} trên kệ` : "Tạm hết — quán đang nhập thêm"}
            {p.reserved > 0 ? ` · ${num(p.reserved)} đang giữ cho đơn online` : ""}
          </div>

          <div className="mt-6 flex flex-col items-stretch gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <div className="flex w-full items-center justify-center rounded-2xl border border-ink-200 bg-sand sm:w-auto">
              <button
                type="button"
                aria-label="Bớt số lượng"
                className="grid h-12 w-12 place-items-center transition active:scale-90 disabled:opacity-40"
                disabled={qty <= step}
                onClick={() => bump(-step)}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-16 text-center font-display font-black">
                {num(qty)}
                {p.product_type === "WEIGHTED" && <span className="text-xs font-bold text-ink-400"> kg</span>}
              </span>
              <button
                type="button"
                aria-label="Thêm số lượng"
                className="grid h-12 w-12 place-items-center transition active:scale-90 disabled:opacity-40"
                disabled={max > 0 && qty + step > max}
                onClick={() => bump(step)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button
              size="lg"
              variant={ok ? "lime" : "coral"}
              className="flex-1"
              icon={ok ? Check : ShoppingBasket}
              loading={busy}
              disabled={max <= 0}
              onClick={add}
            >
              {ok ? "Đã thêm vào giỏ" : max <= 0 ? "Tạm hết hàng" : "Thêm vào giỏ"}
            </Button>
          </div>

          {ok && (
            <Link
              to="/cart"
              className="mt-3 block text-center text-sm font-bold text-forest-700 hover:text-coral-500"
            >
              Xem giỏ và chốt đơn →
            </Link>
          )}
        </div>
      </div>

      {p.reviews?.length > 0 && (
        <div className="mt-12">
          <div className="section-kicker">Cảm nhận</div>
          <h3 className="mb-4 font-display text-2xl font-black">Đánh giá</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {p.reviews.map((r: any) => (
              <div key={r.id} className="card p-5">
                <div className="font-bold">
                  {r.name} <span className="text-sun-500">{"★".repeat(r.rating)}</span>
                </div>
                <p className="mt-1 text-ink-500">{r.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {p.related?.length > 0 && (
        <div className="mt-12">
          <div className="section-kicker">Mua kèm</div>
          <h3 className="mb-4 font-display text-2xl font-black">Hay lấy cùng</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {p.related.map((r: any) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
