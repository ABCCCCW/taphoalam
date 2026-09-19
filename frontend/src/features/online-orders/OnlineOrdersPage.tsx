import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, Check, MapPin, PackageCheck, Phone, Store, Truck, X } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd, when } from "../../lib/format";
import { look, ORDER_STATUS, PAYMENT_STATUS, TONE_CLASS } from "../../lib/labels";
import ProductImage from "../../components/ui/ProductImage";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageFrame, PageHeader, SearchInput, Section, Segmented, Toolbar } from "../../components/ui/Page";
import { Textarea } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";
import { cn } from "../../lib/cn";
import { kmText } from "../../lib/geo";

/* Thứ tự tab đi theo đúng đường đi của một đơn. "Đang xử lý" gom mọi đơn chưa xong để
   mở trang ra là thấy hết việc, không phải đi soi từng cột trống. */
const TABS = [
  { key: "ACTIVE", title: "Đang xử lý", match: (s: string) => !["COMPLETED", "CANCELLED"].includes(s) },
  { key: "PENDING_PAYMENT", title: "Chờ chuyển khoản" },
  { key: "PENDING_CONFIRM", title: "Chờ duyệt" },
  { key: "CONFIRMED", title: "Đã duyệt" },
  { key: "PACKING", title: "Đang soạn" },
  { key: "SHIPPING", title: "Đang giao" },
  { key: "COMPLETED", title: "Xong" },
  { key: "CANCELLED", title: "Đã huỷ" },
] as { key: string; title: string; match?: (s: string) => boolean }[];

const inTab = (tab: (typeof TABS)[number], status: string) => (tab.match ? tab.match(status) : status === tab.key);

export default function OnlineOrdersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["online"], queryFn: staffApi.onlineOrders, refetchInterval: 15000 });
  const [term, setTerm] = useState("");
  const [tabKey, setTabKey] = useState("ACTIVE");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<any>(null);

  const run = async (order: any, label: string, fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(`${order.code} · ${label}`);
      q.refetch();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const complete = async (order: any) => {
    const ok = await confirm({
      title: `Hoàn tất đơn ${order.code}?`,
      body: (
        <>
          Hàng đang giữ sẽ được trừ hẳn khỏi kho, đơn ghi là đã thu <b>{vnd(order.total_amount)}</b>
          {order.customer_name ? ` và khách ${order.customer_name} được cộng điểm.` : "."}
        </>
      ),
      confirmText: "Hoàn tất",
    });
    if (ok) await run(order, "đã hoàn tất", () => staffApi.completeOnline(order.id));
  };

  const all: any[] = q.data || [];
  const needle = term.trim().toLowerCase();
  const searched = all.filter((o) =>
    !needle ? true : `${o.code} ${o.customer_name || ""} ${o.customer_phone || ""}`.toLowerCase().includes(needle)
  );
  const tab = TABS.find((t) => t.key === tabKey) || TABS[0];
  const list = searched.filter((o) => inTab(tab, o.status));
  const picked = list.find((o) => o.id === pickedId) || list[0] || null;

  return (
    <PageFrame>
      <PageHeader className="mb-0" title="Đơn online" />

      <Toolbar className="mb-0 shrink-0">
        <SearchInput value={term} onChange={setTerm} placeholder="Tìm mã đơn, tên hoặc SĐT…" />
        <Segmented
          value={tabKey}
          onChange={(v) => {
            setTabKey(v);
            setPickedId(null);
          }}
          options={TABS.map((t) => ({
            value: t.key,
            label: t.title,
            count: searched.filter((o) => inTab(t, o.status)).length,
          }))}
        />
      </Toolbar>

      {q.isPending ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[24rem_minmax(0,1fr)]">
          <Skeleton className="h-72 rounded-[1.75rem] lg:h-full" />
          <Skeleton className="min-h-0 flex-1 rounded-[1.75rem]" />
        </div>
      ) : !all.length ? (
        <div className="card">
          <EmptyState emoji="🛵" title="Website chưa có đơn nào" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:overflow-hidden">
          <Section title={tab.title} desc={`${num(list.length)} đơn`} accent="ink" className="shrink-0 lg:h-full" bodyClassName="!p-2">
            {!list.length ? (
              <div className="grid h-full place-items-center py-12 text-center">
                <div>
                  <div className="font-display text-base font-black text-ink-900">{needle ? "Không khớp đơn nào" : "Không có đơn nào"}</div>
                  <p className="mt-1 text-sm font-semibold text-ink-500">
                    {needle ? "Thử bỏ bớt chữ đang tìm." : "Đơn mới từ web sẽ tự hiện ở đây."}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {list.map((o) => {
                  const st = look(ORDER_STATUS, o.status);
                  const on = picked?.id === o.id;
                  const ship = o.delivery_method === "DELIVERY";
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setPickedId(o.id)}
                        className={cn(
                          "w-full rounded-2xl bg-white px-3.5 py-3 text-left ring-1 transition",
                          on ? "ring-2 ring-forest-900" : "ring-black/[.06] hover:ring-black/[.15]"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink-500">{o.code}</span>
                          <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", TONE_CLASS[st.tone])}>
                            {st.label}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-bold text-ink-900">{o.customer_name || "Khách lẻ"}</span>
                          <span className="shrink-0 font-display text-base font-black tabular-nums text-ink-900">{vnd(o.total_amount)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-400">
                          {ship ? <Bike className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
                          {ship ? "Giao tận nơi" : "Lấy tại quầy"} · {o.items?.length || 0} món · {when(o.created_at)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {picked ? (
            <OrderDetail
              key={picked.id}
              order={picked}
              busy={busy}
              onConfirm={() => run(picked, "đã duyệt", () => staffApi.confirmOnline(picked.id))}
              onReject={() => setRejecting(picked)}
              onPack={() => run(picked, "bắt đầu soạn hàng", () => staffApi.startPacking(picked.id))}
              onShip={() => run(picked, "đã xuất giao", () => staffApi.ship(picked.id))}
              onComplete={() => complete(picked)}
            />
          ) : (
            <Section title="Chi tiết đơn" accent="ink" className="min-h-[16rem] lg:h-full lg:min-h-0">
              <div className="grid h-full place-items-center py-12 text-center text-sm font-semibold text-ink-400">
                Chọn một đơn bên trái để xem.
              </div>
            </Section>
          )}
        </div>
      )}

      {rejecting && (
        <RejectModal
          order={rejecting}
          onClose={() => setRejecting(null)}
          onDone={(msg) => {
            setRejecting(null);
            toast.success(msg);
            q.refetch();
          }}
        />
      )}
    </PageFrame>
  );
}

/** Chi tiết một đơn: ai đặt, giao đi đâu, lấy món gì, và đúng một bước tiếp theo để bấm. */
function OrderDetail({
  order,
  busy,
  onConfirm,
  onReject,
  onPack,
  onShip,
  onComplete,
}: {
  order: any;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onPack: () => void;
  onShip: () => void;
  onComplete: () => void;
}) {
  const pick = useQuery({ queryKey: ["picking", order.id], queryFn: () => staffApi.picking(order.id) });
  const barcodeOf = (itemId: number) => pick.data?.lines?.find((l: any) => l.id === itemId)?.barcode;
  const ship = order.delivery_method === "DELIVERY";
  const st = look(ORDER_STATUS, order.status);
  const pay = look(PAYMENT_STATUS, order.payment_status);
  const s = order.status;

  return (
    <Section
      title={order.code}
      desc={`Đặt ${when(order.created_at)}`}
      accent="ink"
      className="min-h-[24rem] lg:h-full lg:min-h-0"
      actions={
        <div className="flex gap-1.5">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", TONE_CLASS[st.tone])}>{st.label}</span>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", TONE_CLASS[pay.tone])}>{pay.label}</span>
        </div>
      }
      bodyClassName="flex flex-col gap-4"
      footer={
        ["COMPLETED", "CANCELLED"].includes(s) ? undefined : (
          <>
          {(s === "PENDING_PAYMENT" || s === "PENDING_CONFIRM") && (
            <>
              <Button variant="danger" icon={X} disabled={busy} onClick={onReject}>
                {s === "PENDING_PAYMENT" ? "Huỷ đơn" : "Từ chối"}
              </Button>
              <Button icon={Check} loading={busy} onClick={onConfirm}>
                {s === "PENDING_PAYMENT" ? "Đã nhận tiền · Duyệt" : "Duyệt đơn"}
              </Button>
            </>
          )}
          {s === "CONFIRMED" && (
            <Button icon={PackageCheck} loading={busy} onClick={onPack}>
              Bắt đầu soạn hàng
            </Button>
          )}
          {s === "PACKING" && ship && (
            <Button icon={Truck} loading={busy} onClick={onShip}>
              Soạn xong · Giao đi
            </Button>
          )}
          {s === "PACKING" && !ship && (
            <Button variant="ink" loading={busy} onClick={onComplete}>
              Khách đã lấy · Hoàn tất
            </Button>
          )}
          {s === "SHIPPING" && (
            <Button variant="ink" loading={busy} onClick={onComplete}>
              Đã giao · Hoàn tất
            </Button>
          )}
          </>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-3.5 ring-1 ring-black/[.05]">
          <div className="text-xs font-semibold text-ink-500">Khách</div>
          <div className="mt-1 font-bold text-ink-900">{order.customer_name || "Khách lẻ"}</div>
          {(order.address?.receiver_phone || order.customer_phone) && (
            <a
              href={`tel:${order.address?.receiver_phone || order.customer_phone}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-ink-900"
            >
              <Phone className="h-3.5 w-3.5" />
              {order.address?.receiver_phone || order.customer_phone}
            </a>
          )}
        </div>
        <div className="rounded-2xl bg-white p-3.5 ring-1 ring-black/[.05]">
          <div className="text-xs font-semibold text-ink-500">{ship ? "Giao tới" : "Nhận hàng"}</div>
          {ship ? (
            <>
              <div className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-ink-900">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span>{order.address?.line || "Chưa có địa chỉ"}</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-ink-500">
                {order.distance_km != null ? `Cách tiệm ${kmText(order.distance_km)}` : "Chưa rõ khoảng cách"} · phí giao{" "}
                {Number(order.shipping_fee) ? vnd(order.shipping_fee) : "miễn phí"}
              </div>
              {order.address?.receiver_name && order.address.receiver_name !== order.customer_name && (
                <div className="mt-1 text-xs text-ink-500">Người nhận: {order.address.receiver_name}</div>
              )}
              {order.address?.note && <div className="mt-1 text-xs text-ink-500">Ghi chú: {order.address.note}</div>}
            </>
          ) : (
            <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <Store className="h-3.5 w-3.5 text-ink-400" /> Khách tới quầy lấy
            </div>
          )}
        </div>
      </div>

      {order.note && (
        <div className="rounded-2xl bg-sun-50 px-3.5 py-2.5 text-sm font-semibold text-sun-700">Khách dặn: {order.note}</div>
      )}

      <div className="rounded-2xl bg-white px-3.5 ring-1 ring-black/[.05]">
        <div className="flex items-center justify-between border-b border-ink-100 py-2.5 text-xs font-semibold text-ink-500">
          <span>Món cần lấy</span>
          <span>{num(order.items?.length || 0)} món</span>
        </div>
        <ul className="divide-y divide-ink-100">
          {(order.items || []).map((i: any) => (
            <li key={i.id} className="flex items-center gap-3 py-2.5">
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-ink-50">
                <ProductImage
                  src={i.image_url}
                  emoji={i.emoji}
                  alt={i.product_name}
                  fit="cover"
                  className="absolute inset-0 h-full w-full"
                  emojiClassName="absolute inset-0 grid place-items-center text-lg"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink-900">{i.product_name}</div>
                <div className="truncate font-mono text-[0.6875rem] text-ink-400">
                  {barcodeOf(i.id) || "không mã vạch"} · {vnd(i.unit_price)}
                </div>
              </div>
              <div className="shrink-0 font-display text-lg font-black tabular-nums text-ink-900">× {num(i.quantity)}</div>
              <div className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-ink-900">{vnd(i.line_total)}</div>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-ink-100 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Tiền hàng</dt>
            <dd className="font-semibold tabular-nums">{vnd(order.subtotal)}</dd>
          </div>
          {order.discount_amount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Giảm</dt>
              <dd className="font-semibold tabular-nums">−{vnd(order.discount_amount)}</dd>
            </div>
          )}
          {ship && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Phí giao</dt>
              <dd className="font-semibold tabular-nums">{vnd(order.shipping_fee || 0)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="font-display font-black text-ink-900">Khách trả</dt>
            <dd className="font-display text-xl font-black tabular-nums text-ink-900">{vnd(order.total_amount)}</dd>
          </div>
        </dl>
      </div>

      {s === "CANCELLED" && order.cancel_reason && (
        <div className="rounded-2xl bg-ink-100 px-3.5 py-2.5 text-sm font-semibold text-ink-600">Lý do huỷ: {order.cancel_reason}</div>
      )}

    </Section>
  );
}

/** Từ chối đơn — phải ghi lý do vì khách nhìn thấy dòng này. */
function RejectModal({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: (m: string) => void }) {
  const toast = useToast();
  const QUICK = ["Hết hàng khách đặt", "Ngoài vùng giao", "Không liên lạc được khách", "Khách đổi ý qua điện thoại"];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!reason.trim()) {
      setErr("Ghi lý do để khách biết vì sao đơn bị huỷ");
      return;
    }
    setBusy(true);
    try {
      await staffApi.rejectOnline(order.id, reason.trim());
      onDone(`Đã từ chối ${order.code}, hàng giữ đã trả về kho`);
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
      title={`Từ chối đơn ${order.code}`}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Huỷ
          </Button>
          <Button className="flex-1" variant="coral" loading={busy} onClick={submit}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setReason(r);
                setErr("");
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                reason === r ? "bg-forest-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          label="Lý do"
          required
          rows={2}
          value={reason}
          error={err}
          placeholder="Khách sẽ thấy dòng này trong đơn của họ"
          onChange={(e) => {
            setReason(e.target.value);
            setErr("");
          }}
        />
      </div>
    </Modal>
  );
}
