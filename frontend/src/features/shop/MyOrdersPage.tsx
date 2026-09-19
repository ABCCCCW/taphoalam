import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bike, Store } from "lucide-react";
import { shopApi } from "../../api/client";
import { num, vnd, when } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import { useShopAuth } from "../../stores/shopAuthStore";
import { StatusBadge } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/Feedback";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../lib/labels";
import { useConfirm } from "../../components/ui/Confirm";
import { useToast } from "../../components/ui/Toast";

/* Các bước khách thấy được. RETURNED và CANCELLED không nằm trong dòng này. */
const FLOW = ["PENDING_CONFIRM", "CONFIRMED", "PACKING", "SHIPPING", "COMPLETED"];

function Steps({ status }: { status: string }) {
  const at = FLOW.indexOf(status);
  if (at < 0) return null;
  return (
    <div className="mt-4 flex items-center gap-1">
      {FLOW.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-lime-400" : "bg-ink-100"}`}
          title={(ORDER_STATUS as Record<string, { label: string }>)[s]?.label}
        />
      ))}
    </div>
  );
}

export default function MyOrdersPage() {
  const { customer } = useShopAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["my-orders"], queryFn: shopApi.orders, enabled: !!customer });

  const cancel = async (o: any) => {
    const ok = await confirm({
      title: `Huỷ đơn ${o.code}?`,
      body: "Hàng đang giữ cho bạn sẽ được trả về kệ. Muốn mua lại thì phải đặt đơn mới.",
      confirmText: "Huỷ đơn",
      danger: true,
    });
    if (!ok) return;
    setBusy(o.id);
    try {
      await shopApi.cancel(o.id);
      toast.success("Đã huỷ đơn");
      q.refetch();
    } catch (e) {
      toast.error(e, "Chưa huỷ được đơn này");
    } finally {
      setBusy(null);
    }
  };

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mb-3 text-6xl">📦</div>
        <h1 className="font-display text-3xl font-black">Đơn của tôi</h1>
        <p className="mt-2 text-ink-500">Đăng nhập để xem đơn đã đặt.</p>
        <Link to="/dang-nhap" className="btn-lime mt-6 inline-flex">
          Vào tiệm
        </Link>
      </div>
    );
  }

  const orders = q.data || [];

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
      <div className="section-kicker">Theo dõi</div>
      <h1 className="mb-6 font-display text-2xl font-black sm:text-3xl">Đơn của tôi</h1>

      {q.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-3xl" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="card">
          <ErrorState error={q.error} onRetry={q.refetch} />
        </div>
      ) : !orders.length ? (
        <div className="card">
          <EmptyState
            emoji="📦"
            title="Chưa có đơn nào"
            action={
              <Link to="/catalog">
                <Button>Đi chợ</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o: any) => {
            const qr = o.payments?.find((p: any) => p.qr_image);
            const canCancel = ["PENDING_CONFIRM", "PENDING_PAYMENT"].includes(o.status);
            return (
              <div key={o.id} className="card p-5">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-ink-900">{o.code}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-400">
                      <span>{when(o.created_at)}</span>
                      <span className="inline-flex items-center gap-1">
                        {o.delivery_method === "DELIVERY" ? (
                          <>
                            <Bike className="h-3.5 w-3.5" /> Giao tận nơi
                          </>
                        ) : (
                          <>
                            <Store className="h-3.5 w-3.5" /> Lấy tại quầy
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge map={ORDER_STATUS} value={o.status} />
                    <StatusBadge map={PAYMENT_STATUS} value={o.payment_status} />
                  </div>
                </div>

                <Steps status={o.status} />

                <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-3 text-sm">
                  {o.items.map((i: any, idx: number) => (
                    <li key={idx} className="flex min-w-0 justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <ProductImage src={i.image_url} emoji={i.emoji} alt={i.product_name} className="h-6 w-6 shrink-0" />
                        <span className="truncate">
                          {i.product_name} <span className="text-ink-400">× {num(i.quantity)}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">{vnd(i.line_total)}</span>
                    </li>
                  ))}
                </ul>

                {Number(o.shipping_fee) > 0 && (
                  <div className="mt-2 flex justify-between text-sm text-ink-400">
                    <span>Phí giao</span>
                    <span>{vnd(o.shipping_fee)}</span>
                  </div>
                )}
                {Number(o.discount_amount) > 0 && (
                  <div className="flex justify-between text-sm text-forest-700">
                    <span>Giảm giá</span>
                    <span>−{vnd(o.discount_amount)}</span>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                  <div className="font-display text-lg font-black text-coral-500">{vnd(o.total_amount)}</div>
                  {canCancel && (
                    <Button variant="ghost" size="sm" loading={busy === o.id} onClick={() => cancel(o)}>
                      Huỷ đơn
                    </Button>
                  )}
                </div>

                {qr && o.payment_status !== "PAID" && (
                  <div className="mt-4 flex items-center gap-4 rounded-2xl bg-sand p-3">
                    <img src={qr.qr_image} alt={`Mã QR trả tiền đơn ${o.code}`} className="w-32 rounded-xl bg-white" />
                    <div className="min-w-0 text-sm">
                      <div className="font-extrabold text-ink-900">Quét để chuyển khoản</div>
                      <p className="mt-0.5 text-ink-500">
                        Chuyển đúng {vnd(o.total_amount)} là đơn tự khớp, không cần nhắn tin cho quán.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
