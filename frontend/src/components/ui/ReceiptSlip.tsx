import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { num, vnd, when } from "../../lib/format";

export type ReceiptData = {
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  order: any;
};

export function isDraftOrder(order: any) {
  return !order || order.status !== "COMPLETED";
}

export function InvoiceSheet({ data, draft }: { data: ReceiptData; draft?: boolean }) {
  const o = data.order || {};
  const items = o.items || [];
  const pay = (o.payments || []).find((p: any) => p.status === "SUCCESS") || o.payments?.[0];
  const method = pay?.method === "QR_BANK" ? "QR ngân hàng" : pay?.method === "CASH" ? "Tiền mặt" : "Chưa thu";
  const pending = draft ?? isDraftOrder(o);
  const paid = o.paid_amount != null ? o.paid_amount : pending ? 0 : o.total_amount;

  return (
    <div className="invoice-sheet relative overflow-hidden text-ink-900">
      <div className="invoice-perforation" />
      <div className="px-3.5 pt-3 pb-4">
        <div className="text-center">
          <div className="font-display font-black text-[17px] leading-tight tracking-tight">{data.store_name || "TạpHoá Lâm"}</div>
          {data.store_address ? <div className="text-[11px] text-ink-700 mt-0.5 leading-snug">{data.store_address}</div> : null}
          {data.store_phone ? <div className="text-[11px] text-ink-700">ĐT: {data.store_phone}</div> : null}
        </div>

        <div className="mt-2.5 text-center">
          <div className="font-display font-black text-sm tracking-[.18em]">HOÁ ĐƠN</div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] border-y border-dashed border-ink-900/30 py-2">
          <div><span className="text-ink-400">Số</span> <b>{o.code || "—"}</b></div>
          <div className="text-right">{when(o.completed_at || o.created_at) || when(new Date().toISOString())}</div>
          {o.cashier ? <div className="col-span-2">Thu ngân: {o.cashier}</div> : null}
          <div className="col-span-2">Khách: {o.customer_name || "Khách lẻ"}</div>
        </div>

        <div className="mt-2 text-[11px]">
          <div className="grid grid-cols-[1.4rem_1fr_2.6rem_4.4rem] gap-x-1 font-bold text-ink-400 pb-1 border-b border-ink-900/15">
            <span>#</span>
            <span>Hàng</span>
            <span className="text-right">SL</span>
            <span className="text-right">T.tiền</span>
          </div>
          {items.map((i: any, idx: number) => (
            <div key={i.id ?? idx} className="grid grid-cols-[1.4rem_1fr_2.6rem_4.4rem] gap-x-1 py-1.5 border-b border-ink-900/[.06]">
              <span className="text-ink-400">{idx + 1}</span>
              <span className="min-w-0">
                <span className="block font-bold leading-snug">{i.product_name}</span>
                <span className="text-[10px] text-ink-400">{num(i.quantity)} × {vnd(i.unit_price)}</span>
              </span>
              <span className="text-right">{num(i.quantity)}</span>
              <span className="text-right font-semibold">{vnd(i.line_total)}</span>
            </div>
          ))}
          {!items.length && <div className="py-3 text-center text-ink-400">Chưa có hàng</div>}
        </div>

        <div className="mt-2 space-y-0.5 text-[12px]">
          {Number(o.discount_amount) > 0 ? (
            <>
              <div className="flex justify-between"><span>Cộng hàng</span><span>{vnd(o.subtotal)}</span></div>
              <div className="flex justify-between"><span>Giảm</span><span>−{vnd(o.discount_amount)}</span></div>
            </>
          ) : null}
          <div className="flex justify-between font-black text-base border-t border-ink-900/20 pt-1.5 mt-1">
            <span>Tổng cộng</span><span>{vnd(o.total_amount)}</span>
          </div>
          <div className="flex justify-between text-[11px] pt-0.5"><span>{method}</span><span>{vnd(paid)}</span></div>
          {Number(o.change_amount) > 0 ? (
            <div className="flex justify-between text-[11px]"><span>Trả khách</span><span>{vnd(o.change_amount)}</span></div>
          ) : null}
        </div>

        <div className="mt-3 pt-2 border-t border-dashed border-ink-900/30 text-center text-[11px] text-ink-700">
          {pending ? "Chưa thu tiền — chưa chốt kho." : "Cảm ơn bạn, hẹn gặp lại nhé 🥬"}
        </div>
      </div>
    </div>
  );
}

/** @deprecated dùng InvoiceSheet */
export function ReceiptBody({ data }: { data: ReceiptData }) {
  return <InvoiceSheet data={data} />;
}

export function ReceiptPrintPortal({ data }: { data: ReceiptData }) {
  return createPortal(
    <div className="print-area print-only receipt-slip">
      <InvoiceSheet data={data} />
    </div>,
    document.body
  );
}

export default function ReceiptPrinter({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
        <div className="card p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          <div className="text-xs font-bold text-coral-500 tracking-[.16em] uppercase">Đã thu tiền</div>
          <h2 className="font-display font-black text-2xl mt-1">Hoá đơn {data.order.code}</h2>
          <div className="mt-3 max-h-[50vh] overflow-auto">
            <InvoiceSheet data={data} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button className="btn-lime py-3" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> In hoá đơn
            </button>
            <button className="btn-ghost py-3" onClick={onClose}>Đơn mới</button>
          </div>
        </div>
      </div>
      <ReceiptPrintPortal data={data} />
    </>
  );
}
