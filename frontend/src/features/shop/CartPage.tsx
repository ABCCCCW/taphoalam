import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Minus, Plus, Trash2 } from "lucide-react";
import { shopApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import { useShopAuth } from "../../stores/shopAuthStore";
import Button, { IconButton } from "../../components/ui/Button";
import { EmptyState, ErrorState, Notice, Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";

export default function CartPage() {
  const { customer } = useShopAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["cart"], queryFn: shopApi.cart, enabled: !!customer });
  const cart = q.data;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cart"] });
    window.dispatchEvent(new Event("cart-changed"));
  };

  /* Đổi số lượng bằng nút +/- thay vì ô number: trên điện thoại gõ số rất dễ
     thành 0 hoặc rỗng, mà rỗng thì món bị xoá khỏi giỏ mà khách không hiểu. */
  const setQty = async (item: any, next: number) => {
    const step = item.product_type === "WEIGHTED" ? 0.1 : 1;
    const qty = Math.max(0, Math.round(next / step) * step);
    if (qty > 0 && item.available != null && qty > Number(item.available)) {
      toast.info(`${item.name} chỉ còn ${num(item.available)} trên kệ`);
      return;
    }
    setBusyId(item.id);
    try {
      await shopApi.setQty(item.id, Number(qty.toFixed(3)));
      refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mb-3 text-6xl">🧺</div>
        <h1 className="font-display text-3xl font-black">Giỏ hàng</h1>
        <p className="mt-2 text-ink-500">Đăng nhập để giữ giỏ hàng và tích điểm.</p>
        <Link to="/dang-nhap" className="btn-lime mt-6 inline-flex">
          Vào tiệm
        </Link>
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="mx-auto grid max-w-5xl gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48 rounded-xl" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card">
          <ErrorState error={q.error} onRetry={q.refetch} />
        </div>
      </div>
    );
  }

  const items = cart?.items || [];
  const shortItems = items.filter((i: any) => i.out_of_stock);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="section-kicker">Giỏ hàng</div>
        <h1 className="mb-5 font-display text-2xl font-black sm:text-3xl">Món đã chọn</h1>

        {!items.length ? (
          <div className="card">
            <EmptyState
              emoji="🧺"
              title="Giỏ đang trống"
              action={
                <Link to="/catalog">
                  <Button>Đi chợ tiếp</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((i: any) => {
              const step = i.product_type === "WEIGHTED" ? 0.1 : 1;
              const busy = busyId === i.id;
              return (
                <div key={i.id} className="card flex min-w-0 items-center gap-3 p-3 sm:gap-4 sm:p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-lime-50 text-3xl sm:h-16 sm:w-16">
                    <ProductImage src={i.image_url} emoji={i.emoji} alt={i.name} className="h-full w-full p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink-900">{i.name}</div>
                    <div className="font-extrabold text-coral-500">{vnd(i.sale_price)}</div>
                    {Number(i.discount) > 0 && (
                      <div className="mt-0.5 inline-block rounded-full bg-coral-100 px-2 py-0.5 text-[11px] font-extrabold text-coral-700">
                        Cận date −{num(i.near_expiry?.percent)}% · bớt {vnd(i.discount)}
                      </div>
                    )}
                    {i.out_of_stock && (
                      <div className="mt-0.5 text-xs font-semibold text-coral-600">
                        Kệ chỉ còn {num(i.available)} — bớt số lượng nhé
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center rounded-full bg-ink-100">
                    <button
                      type="button"
                      aria-label={`Bớt ${i.name}`}
                      disabled={busy}
                      onClick={() => setQty(i, Number(i.quantity) - step)}
                      className="grid h-9 w-9 place-items-center rounded-full transition active:scale-90 disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-10 text-center font-display text-sm font-black">{num(i.quantity)}</span>
                    <button
                      type="button"
                      aria-label={`Thêm ${i.name}`}
                      disabled={busy}
                      onClick={() => setQty(i, Number(i.quantity) + step)}
                      className="grid h-9 w-9 place-items-center rounded-full transition active:scale-90 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={`Bỏ ${i.name} khỏi giỏ`}
                    tone="danger"
                    disabled={busy}
                    onClick={() => setQty(i, 0)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <aside className="card h-fit p-6 lg:sticky lg:top-24">
          <div className="font-display font-black text-ink-900">Tóm tắt đơn</div>
          <div className="mt-4 flex justify-between text-sm text-ink-500">
            <span>{items.length} món</span>
            <span>{vnd(cart.subtotal)}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3 font-display text-xl font-black">
            <span>Tạm tính</span>
            <span className="text-coral-500">{vnd(cart.subtotal)}</span>
          </div>
          {shortItems.length > 0 && (
            <Notice tone="danger" className="mt-3">{`${shortItems.length} món vượt số còn trên kệ`}</Notice>
          )}

          <Link to={shortItems.length ? "#" : "/checkout"} className="mt-5 block">
            <Button block size="lg" variant="coral" disabled={shortItems.length > 0}>
              Chốt đơn
            </Button>
          </Link>
          <Link to="/catalog" className="mt-3 block text-center text-sm font-semibold text-forest-700 hover:text-coral-500">
            + Thêm món
          </Link>
        </aside>
      )}
    </div>
  );
}
