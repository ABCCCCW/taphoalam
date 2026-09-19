import { useMemo } from "react";
import { Printer } from "lucide-react";
import { InvoiceSheet, ReceiptPrintPortal, type ReceiptData } from "../../components/ui/ReceiptSlip";
import type { CartLine } from "../../stores/cartStore";

const money = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

export default function CashPayModal({
  lines,
  subtotal,
  discount,
  total,
  customer,
  cashier,
  storeName,
  storeAddress,
  storePhone,
  cash,
  onCash,
  busy,
  blocked,
  slip,
  onClose,
  onConfirm,
  onDraft,
}: {
  lines: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  customer?: { name?: string } | null;
  cashier?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  cash: number;
  onCash: (n: number) => void;
  busy: boolean;
  blocked: boolean;
  slip: ReceiptData | null;
  onClose: () => void;
  onConfirm: () => void;
  onDraft: () => void;
}) {
  const done = !!slip;
  const given = cash;
  const change = given - total;
  const short = given < total;

  const draft = useMemo<ReceiptData>(
    () => ({
      store_name: storeName || "TạpHoá Lâm",
      store_address: storeAddress || "12 Nguyễn Trãi, Thanh Xuân, Hà Nội",
      store_phone: storePhone,
      order: {
        code: "—",
        status: "DRAFT",
        created_at: new Date().toISOString(),
        cashier,
        customer_name: customer?.name,
        subtotal,
        discount_amount: discount,
        total_amount: total,
        paid_amount: given,
        change_amount: Math.max(0, change),
        items: lines.map((l, i) => ({
          id: `${l.product_id}-${i}`,
          product_name: l.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.unit_price * l.quantity,
        })),
        payments: [{ method: "CASH", status: "PENDING", amount: given }],
      },
    }),
    [lines, subtotal, discount, total, customer, cashier, storeName, storeAddress, storePhone, given, change]
  );

  const view = slip || draft;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-forest-900/50 p-3 backdrop-blur-sm sm:p-4" onClick={done ? onClose : undefined}>
      <div
        className="card grid max-h-[92dvh] w-full max-w-3xl overflow-hidden animate-pop-in bg-[#f3eee6] md:grid-cols-[minmax(0,1.15fr)_17.5rem] md:items-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 overflow-auto p-4 sm:p-5">
          <div className="section-kicker">{done ? "Đã thu tiền" : "Hoá đơn"}</div>
          {done ? (
            <h2 className="mt-0.5 font-display text-xl font-black">{slip!.order.code}</h2>
          ) : null}
          <div className="mt-3">
            <InvoiceSheet data={view} draft={!done} />
          </div>
        </div>

        <div className="m-3 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:m-4">
          {done ? (
            <>
              <div className="rounded-2xl bg-lime-100 px-3 py-2.5 text-center">
                <div className="text-xs font-extrabold uppercase tracking-wider text-forest-700">Trả khách</div>
                <div className="font-display text-3xl font-black text-forest-900">
                  {money(Math.max(0, Number(slip!.order.change_amount || 0)))}đ
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-lime py-3" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> In hoá đơn
                </button>
                <button className="btn-ghost py-3" onClick={onClose}>Đơn mới</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-ink-500">Khách đưa</div>
                <input
                  autoFocus
                  inputMode="numeric"
                  aria-label="Số tiền khách đưa"
                  className="input mt-1 font-display text-2xl font-black text-forest-900"
                  value={money(given)}
                  placeholder="0"
                  onChange={(e) => onCash(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy && !blocked && !short) onConfirm();
                  }}
                />
              </div>

              {short ? (
                <div className="rounded-2xl bg-coral-50 px-3 py-2.5">
                  <div className="text-xs font-bold text-coral-600">Còn thiếu</div>
                  <div className="font-display text-2xl font-black text-coral-500">{money(total - given)}đ</div>
                </div>
              ) : (
                <div className="rounded-2xl bg-lime-50 px-3 py-2.5">
                  <div className="text-xs font-bold text-forest-800">Trả khách</div>
                  <div className="font-display text-2xl font-black text-forest-900">
                    {money(Math.max(0, change))}đ
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <button
                  className="btn-lime w-full py-3"
                  disabled={busy || blocked || short}
                  onClick={onConfirm}
                >
                  {busy ? "Đang thu…" : short ? "Chưa đủ tiền" : "Thanh toán"}
                </button>
                <button type="button" className="btn-ghost w-full py-3" disabled={busy} onClick={onDraft}>
                  Nháp
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {slip && <ReceiptPrintPortal data={slip} />}
    </div>
  );
}
