import { useEffect, useRef, useState } from "react";
import { Check, StickyNote } from "lucide-react";
import { InvoiceSheet, type ReceiptData } from "../../components/ui/ReceiptSlip";
import { staffApi } from "../../api/client";
import { vnd } from "../../lib/format";
import Button from "../../components/ui/Button";
import { cn } from "../../lib/cn";

export default function QrPayModal({
  order,
  storeName,
  storeAddress,
  storePhone,
  onPark,
  onPaid,
}: {
  order: any;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  onPark: () => void;
  onPaid: () => void | Promise<void>;
}) {
  const data: ReceiptData = {
    store_name: storeName || "Lâm Ly Mart",
    store_address: storeAddress || "Cầu Diễn, Bắc Từ Liêm, Hà Nội",
    store_phone: storePhone,
    order,
  };

  const payment = order.payments?.[0];
  const [state, setState] = useState<"waiting" | "arrived" | "expired">("waiting");
  const [busy, setBusy] = useState(false);
  const fired = useRef(false);

  /* Ngân hàng gọi webhook về là đơn tự khớp. Hỏi trạng thái mỗi 2 giây để thu
     ngân biết tiền đã vào, khỏi phải nhìn app ngân hàng rồi đoán. */
  useEffect(() => {
    if (!payment?.id) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await staffApi.payStatus(payment.id);
        if (stop) return;
        if (s.status === "SUCCESS") setState("arrived");
        else if (s.status === "EXPIRED") setState("expired");
      } catch {
        /* Mạng chớp thì bỏ qua lượt này, lượt sau hỏi lại. */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [payment?.id]);

  const settle = async () => {
    if (fired.current) return;
    fired.current = true;
    setBusy(true);
    try {
      await onPaid();
    } finally {
      setBusy(false);
      fired.current = false;
    }
  };

  /* Tiền vào thì chốt luôn và in phiếu — không để thu ngân phải bấm thêm. */
  useEffect(() => {
    if (state === "arrived") settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-forest-900/50 p-3 backdrop-blur-sm sm:p-4">
      <div
        className="card grid max-h-[92dvh] w-full max-w-3xl overflow-hidden animate-pop-in md:grid-cols-[1.1fr_0.9fr]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 overflow-auto bg-[#f3eee6] p-4 sm:p-5">
          <div className="section-kicker">Hoá đơn</div>
          <h2 className="mt-0.5 font-display text-xl font-black">{order.code}</h2>
          <div className="mt-3">
            <InvoiceSheet data={data} draft />
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-auto p-4 text-center sm:p-5">
          <div className="font-display text-xl font-black">Khách quét QR</div>
          <p className="mt-1 text-sm text-ink-400">
            {order.code} · <b className="text-ink-700">{vnd(order.total_amount)}</b>
          </p>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-3">
            {payment?.qr_image && (
              <img
                src={payment.qr_image}
                alt="Mã VietQR của đơn này"
                className={cn(
                  "aspect-square w-[min(20rem,100%)] rounded-2xl bg-white object-contain transition",
                  state !== "waiting" && "opacity-30"
                )}
              />
            )}

            {state !== "waiting" && (
              <div
                className={cn(
                  "w-full rounded-2xl px-3 py-2.5 text-sm font-extrabold",
                  state === "arrived" && "bg-lime-100 text-forest-800",
                  state === "expired" && "bg-coral-50 text-coral-700"
                )}
                role="status"
              >
                {state === "arrived" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> Tiền đã vào — đang chốt đơn
                  </span>
                ) : (
                  "Mã QR hết hạn"
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <Button block size="lg" variant="lime" loading={busy} disabled={state === "expired"} onClick={settle}>
              Đã nhận tiền
            </Button>
            <Button block variant="ghost" icon={StickyNote} onClick={onPark}>
              Nháp
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
