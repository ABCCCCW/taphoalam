import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Printer, Undo2 } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd, when } from "../../lib/format";
import { CHANNEL, ORDER_STATUS, PAYMENT_STATUS } from "../../lib/labels";
import { useAuth } from "../../stores/authStore";
import ProductImage from "../../components/ui/ProductImage";
import ReceiptPrinter from "../../components/ui/ReceiptSlip";
import Button from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Notice } from "../../components/ui/Feedback";
import { PAGE_SIZE, PageBody, PageFrame, PageHeader, Pager, SearchInput, Segmented, Toolbar } from "../../components/ui/Page";
import { Input, Textarea, Toggle } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";

export default function OrdersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [channel, setChannel] = useState<"" | "POS" | "ONLINE">("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [slip, setSlip] = useState<any>(null);
  const [returning, setReturning] = useState<any>(null);

  const q = useQuery({
    queryKey: ["orders", term, channel, page],
    queryFn: () =>
      staffApi.orders({
        q: term || undefined,
        channel: channel || undefined,
        page,
        size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = q.data?.items || [];
  const pages = q.data?.pages || 1;
  const total = q.data?.total || 0;

  const reset = (patch: () => void) => {
    patch();
    setPage(1);
  };

  const openSlip = async (order: any) => {
    try {
      setSlip(await staffApi.receipt(order.id));
    } catch {
      /* Backend chưa trả được phiếu thì vẫn in từ dữ liệu đơn đang có trên máy. */
      setSlip({
        store_name: "Lâm Ly Mart",
        store_address: "Cầu Diễn, Bắc Từ Liêm, Hà Nội",
        order,
      });
    }
  };

  const columns: Column<any>[] = [
    {
      key: "code",
      head: "Mã đơn",
      primary: true,
      cell: (o) => (
        <div className="min-w-0">
          <div className="font-mono font-bold text-ink-900">{o.code}</div>
          <div className="truncate text-[11px] text-ink-400">{o.customer_name || "Khách lẻ"}</div>
        </div>
      ),
    },
    { key: "channel", head: "Kênh", cell: (o) => <StatusBadge map={CHANNEL} value={o.channel} /> },
    {
      key: "items",
      head: "Món",
      align: "right",
      cell: (o) => <span className="text-ink-600">{num(o.items?.reduce((s: number, i: any) => s + Number(i.quantity), 0) || 0)}</span>,
    },
    {
      key: "total",
      head: "Tổng tiền",
      align: "right",
      cell: (o) => <span className="font-display font-black text-ink-900">{vnd(o.total_amount)}</span>,
    },
    { key: "status", head: "Trạng thái", cell: (o) => <StatusBadge map={ORDER_STATUS} value={o.status} /> },
    { key: "pay", head: "Thanh toán", cell: (o) => <StatusBadge map={PAYMENT_STATUS} value={o.payment_status} /> },
    {
      key: "at",
      head: "Lúc",
      align: "right",
      cell: (o) => <span className="whitespace-nowrap text-xs text-ink-400">{when(o.created_at)}</span>,
    },
    {
      key: "act",
      head: "",
      align: "right",
      cell: (o) => (
        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setDetail(o)}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        className="mb-0"
        kicker="Sổ sách"
        title="Hoá đơn"
      />

      <PageBody>

      <Toolbar>
        <SearchInput value={term} onChange={(v) => reset(() => setTerm(v))} placeholder="Tìm theo mã đơn…" />
        <Segmented
          value={channel}
          onChange={(v) => reset(() => setChannel(v))}
          options={[
            { value: "", label: "Tất cả" },
            { value: "POS", label: "Tại quầy" },
            { value: "ONLINE", label: "Website" },
          ]}
        />
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={setDetail}
        loading={q.isPending}
        error={q.isError ? q.error : undefined}
        onRetry={q.refetch}
        empty={
          <EmptyState
            emoji="🧾"
            title={term ? "Không có đơn nào khớp mã đó" : page > 1 ? "Hết đơn rồi" : "Chưa có hoá đơn nào"}
            action={
              term ? (
                <Button variant="ghost" onClick={() => reset(() => setTerm(""))}>
                  Xoá từ khoá
                </Button>
              ) : page > 1 ? (
                <Button variant="ghost" onClick={() => setPage(1)}>
                  Về trang đầu
                </Button>
              ) : undefined
            }
          />
        }
        footer={rows.length > 0 && <Pager page={page} pages={pages} total={total} onPage={setPage} />}
      />

      {detail && (
        <Modal
          size="lg"
          onClose={() => setDetail(null)}
          title={detail.code}
          subtitle={`${when(detail.created_at)} · ${detail.customer_name || "Khách lẻ"}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Đóng
              </Button>
              {user?.role !== "CASHIER" && ["COMPLETED", "PARTIALLY_RETURNED"].includes(detail.status) && (
                <Button variant="danger" icon={Undo2} onClick={() => setReturning(detail)}>
                  Khách trả hàng
                </Button>
              )}
              <Button icon={Printer} onClick={() => openSlip(detail)}>
                Xem / in hoá đơn
              </Button>
            </>
          }
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            <StatusBadge map={ORDER_STATUS} value={detail.status} />
            <StatusBadge map={PAYMENT_STATUS} value={detail.payment_status} />
            <StatusBadge map={CHANNEL} value={detail.channel} />
          </div>

          <ul className="list-rows">
            {detail.items?.map((i: any) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <ProductImage
                  src={i.image_url}
                  emoji={i.emoji}
                  alt={i.product_name}
                  className="h-9 w-9 shrink-0 rounded-xl bg-ink-50 p-1"
                  emojiClassName="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink-900">{i.product_name}</div>
                  <div className="text-xs text-ink-400">
                    {num(i.quantity)} × {vnd(i.unit_price)}
                    {Number(i.returned_qty) > 0 && (
                      <span className="ml-1 font-bold text-coral-600">· đã trả {num(i.returned_qty)}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 font-display font-black text-ink-900">{vnd(i.line_total)}</div>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
            <Line label="Tạm tính" value={vnd(detail.subtotal)} />
            {Number(detail.discount_amount) > 0 && (
              <Line label="Giảm giá" value={`− ${vnd(detail.discount_amount)}`} tone="coral" />
            )}
            {Number(detail.shipping_fee) > 0 && <Line label="Phí giao" value={vnd(detail.shipping_fee)} />}
            <div className="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-2">
              <dt className="font-display font-black text-ink-900">Tổng cộng</dt>
              <dd className="font-display text-xl font-black text-coral-600">{vnd(detail.total_amount)}</dd>
            </div>
            {Number(detail.change_amount) > 0 && (
              <Line label="Trả khách" value={vnd(detail.change_amount)} tone="lime" />
            )}
          </dl>
        </Modal>
      )}

      {returning && (
        <ReturnModal
          order={returning}
          onClose={() => setReturning(null)}
          onDone={(msg) => {
            setReturning(null);
            setDetail(null);
            toast.success(msg);
            q.refetch();
          }}
        />
      )}

      {slip && <ReceiptPrinter data={slip} onClose={() => setSlip(null)} />}
      </PageBody>
    </PageFrame>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "coral" | "lime" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd
        className={cn(
          "font-semibold",
          tone === "coral" && "text-coral-600",
          tone === "lime" && "text-forest-700",
          !tone && "text-ink-900"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Nhận lại hàng theo từng dòng.
 * Trước đây nút duy nhất là «trả toàn bộ»: khách đổi một hộp sữa mà cả đơn bị
 * trả, sổ kho và doanh thu đều sai theo.
 */
function ReturnModal({
  order,
  onClose,
  onDone,
}: {
  order: any;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const toast = useToast();
  const returnable = (order.items || []).filter((i: any) => Number(i.quantity) - Number(i.returned_qty || 0) > 0);
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries(returnable.map((i: any) => [i.id, "0"]))
  );
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const picked = returnable
    .map((i: any) => ({ item: i, n: Number(qty[i.id]) || 0 }))
    .filter((x: any) => x.n > 0);
  const refund = picked.reduce((s: number, x: any) => s + x.n * Number(x.item.unit_price), 0);

  const submit = async () => {
    if (!picked.length) {
      setErr("Chọn số lượng cho ít nhất một món");
      return;
    }
    const over = picked.find((x: any) => x.n > Number(x.item.quantity) - Number(x.item.returned_qty || 0));
    if (over) {
      setErr(`${over.item.product_name}: trả nhiều hơn số đã mua`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await staffApi.returns(order.id, {
        items: picked.map((x: any) => ({ order_item_id: x.item.id, quantity: x.n })),
        reason: reason.trim() || "Khách trả hàng",
        restock,
      });
      onDone(`Đã nhận lại ${picked.length} món, hoàn ${vnd(refund)}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title="Khách trả hàng"
      subtitle={order.code}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Huỷ
          </Button>
          <Button className="flex-1" variant="coral" loading={busy} disabled={!picked.length} onClick={submit}>
            Lưu
          </Button>
        </>
      }
    >
      {!returnable.length ? (
        <EmptyState emoji="✅" title="Đơn này đã trả hết" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setQty(
                  Object.fromEntries(
                    returnable.map((i: any) => [i.id, String(Number(i.quantity) - Number(i.returned_qty || 0))])
                  )
                )
              }
            >
              Chọn trả hết
            </Button>
          </div>

          <ul className="list-rows">
            {returnable.map((i: any) => {
              const left = Number(i.quantity) - Number(i.returned_qty || 0);
              return (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink-900">{i.product_name}</div>
                    <div className="text-xs text-ink-400">
                      còn trả được {num(left)} · {vnd(i.unit_price)} mỗi món
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={left}
                    step={0.1}
                    className="w-24 py-1.5 text-right"
                    wrapClass="shrink-0"
                    aria-label={`Số lượng trả của ${i.product_name}`}
                    value={qty[i.id] ?? "0"}
                    onChange={(e) => setQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>

          <Textarea
            label="Lý do"
            rows={2}
            placeholder="Vd. khách đổi vị khác, hộp bị móp"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Toggle
            checked={restock}
            onChange={setRestock}
            label="Nhập lại vào kho"
          />
          {err && <Notice tone="danger">{err}</Notice>}
        </div>
      )}
    </Modal>
  );
}
