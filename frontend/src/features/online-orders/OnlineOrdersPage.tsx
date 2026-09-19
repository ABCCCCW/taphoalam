import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, Check, PackageCheck, Store, Truck, X } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd, when } from "../../lib/format";
import { DELIVERY, ORDER_STATUS, PAYMENT_STATUS } from "../../lib/labels";
import ProductImage from "../../components/ui/ProductImage";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader, SearchInput, Toolbar } from "../../components/ui/Page";
import { Textarea } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";
import { cn } from "../../lib/cn";

const LANES = [
  { key: "PENDING_CONFIRM", title: "Chờ duyệt", tint: "bg-sun-50 border-sun-100", dot: "bg-sun-500" },
  { key: "CONFIRMED", title: "Đã duyệt", tint: "bg-lime-50 border-lime-100", dot: "bg-lime-500" },
  { key: "PACKING", title: "Đang soạn", tint: "bg-coral-50 border-coral-100", dot: "bg-coral-500" },
  { key: "SHIPPING", title: "Đang giao", tint: "bg-grape-50 border-grape-100", dot: "bg-grape-500" },
  { key: "COMPLETED", title: "Xong", tint: "bg-ink-50 border-ink-100", dot: "bg-forest-700" },
];

export default function OnlineOrdersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["online"], queryFn: staffApi.onlineOrders, refetchInterval: 15000 });
  const [term, setTerm] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);

  const run = async (order: any, label: string, fn: () => Promise<any>) => {
    setBusyId(order.id);
    try {
      await fn();
      toast.success(`${order.code} · ${label}`);
      q.refetch();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const complete = async (order: any) => {
    const ok = await confirm({
      title: `Hoàn tất đơn ${order.code}?`,
      body: (
        <>
          Hàng đang giữ sẽ được trừ hẳn khỏi kho, đơn ghi là đã thu{" "}
          <b>{vnd(order.total_amount)}</b>
          {order.customer_name ? ` và khách ${order.customer_name} được cộng điểm.` : "."}
        </>
      ),
      confirmText: "Hoàn tất",
    });
    if (ok) await run(order, "đã hoàn tất", () => staffApi.completeOnline(order.id));
  };

  const orders = (q.data || []).filter((o: any) => {
    const hay = `${o.code} ${o.customer_name || ""} ${o.customer_phone || ""}`.toLowerCase();
    if (term.trim() && !hay.includes(term.trim().toLowerCase())) return false;
    if (!showDone && o.status === "COMPLETED") return false;
    return true;
  });
  const lanes = LANES.filter((l) => showDone || l.key !== "COMPLETED").map((l) => ({
    ...l,
    items: orders.filter((o: any) => o.status === l.key),
  }));
  return (
    <div>
      <PageHeader
        kicker="Hôm nay"
        title="Đơn online"
      />

      <Toolbar>
        <SearchInput value={term} onChange={setTerm} placeholder="Tìm mã đơn, tên hoặc SĐT…" />
        <Button variant={showDone ? "soft" : "ghost"} size="sm" onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Ẩn đơn đã xong" : "Hiện đơn đã xong"}
        </Button>
      </Toolbar>

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {LANES.slice(0, 4).map((l) => (
            <Skeleton key={l.key} className="h-64 rounded-3xl" />
          ))}
        </div>
      ) : !(q.data || []).length ? (
        <div className="card">
          <EmptyState
            emoji="🛵"
            title="Website chưa có đơn nào"
          />
        </div>
      ) : !orders.length ? (
        <div className="card">
          <EmptyState
            emoji="🔎"
            title="Không khớp đơn nào"
            action={
              term ? (
                <Button variant="ghost" onClick={() => setTerm("")}>
                  Xoá từ khoá
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setShowDone(true)}>
                  Hiện đơn đã xong
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className={cn("-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 xl:grid xl:overflow-visible", showDone ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
          {lanes.map((lane) => (
            <section key={lane.key} className="w-[17rem] shrink-0 xl:w-auto">
              <header className="mb-2 flex items-center gap-2 px-1">
                <i className={cn("h-2.5 w-2.5 rounded-full", lane.dot)} />
                <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink-800">{lane.title}</h2>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-black text-ink-600">
                  {lane.items.length}
                </span>
              </header>

              <div className={cn("space-y-2 rounded-3xl border p-2", lane.tint)}>
                {!lane.items.length && (
                  <p className="px-2 py-6 text-center text-xs font-semibold text-ink-400">Trống</p>
                )}
                {lane.items.map((o: any) => {
                  const busy = busyId === o.id;
                  const ship = o.delivery_method === "DELIVERY";
                  return (
                    <article key={o.id} className="rounded-2xl bg-white p-3 shadow-card">
                      <button type="button" className="w-full text-left" onClick={() => setDetail(o)}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold text-ink-500">{o.code}</span>
                          <StatusBadge map={PAYMENT_STATUS} value={o.payment_status} />
                        </div>
                        <div className="mt-1 font-display text-lg font-black text-ink-900">{vnd(o.total_amount)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge tone={ship ? "coral" : "lime"}>
                            {ship ? <Bike className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                            {ship ? "Giao" : "Tại quầy"}
                          </Badge>
                          <span className="truncate text-[11px] font-semibold text-ink-500">
                            {o.customer_name || "Khách lẻ"}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-ink-400">
                          {o.items?.length || 0} món · {when(o.created_at)}
                        </div>
                      </button>

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {lane.key === "PENDING_CONFIRM" && (
                          <>
                            <Button
                              size="sm"
                              icon={Check}
                              loading={busy}
                              onClick={() => run(o, "đã duyệt", () => staffApi.confirmOnline(o.id))}
                            >
                              Duyệt
                            </Button>
                            <Button size="sm" variant="danger" icon={X} disabled={busy} onClick={() => setRejecting(o)}>
                              Từ chối
                            </Button>
                          </>
                        )}
                        {lane.key === "CONFIRMED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={PackageCheck}
                            loading={busy}
                            onClick={() => run(o, "bắt đầu soạn hàng", () => staffApi.startPacking(o.id))}
                          >
                            Soạn hàng
                          </Button>
                        )}
                        {lane.key === "PACKING" && ship && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Truck}
                            loading={busy}
                            onClick={() => run(o, "đã xuất giao", () => staffApi.ship(o.id))}
                          >
                            Giao đi
                          </Button>
                        )}
                        {(lane.key === "PACKING" || lane.key === "SHIPPING") && (
                          <Button size="sm" variant="ink" loading={busy} onClick={() => complete(o)}>
                            Hoàn tất
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {detail && <PickingModal order={detail} onClose={() => setDetail(null)} />}

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
    </div>
  );
}

/** Phiếu soạn hàng: danh sách món kèm mã vạch để nhân viên đi lấy. */
function PickingModal({ order, onClose }: { order: any; onClose: () => void }) {
  const q = useQuery({ queryKey: ["picking", order.id], queryFn: () => staffApi.picking(order.id) });
  const lines = q.data?.lines || [];
  return (
    <Modal size="lg" onClose={onClose} title={`Phiếu soạn ${order.code}`} subtitle={order.customer_name || "Khách lẻ"}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <StatusBadge map={ORDER_STATUS} value={order.status} />
        <StatusBadge map={PAYMENT_STATUS} value={order.payment_status} />
        <StatusBadge map={DELIVERY} value={order.delivery_method} />
      </div>
      {q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-2xl" />
          ))}
        </div>
      ) : (
        <ul className="list-rows">
          {lines.map((l: any) => (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <ProductImage
                src={l.image_url}
                emoji={l.emoji}
                alt={l.name}
                className="h-9 w-9 shrink-0 rounded-xl bg-ink-50 p-1"
                emojiClassName="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-lg"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-ink-900">{l.name}</div>
                <div className="truncate font-mono text-[11px] text-ink-400">{l.barcode || "không mã vạch"}</div>
              </div>
              <div className="shrink-0 font-display text-lg font-black text-ink-900">× {num(l.qty)}</div>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-500">Phí giao</dt>
          <dd className="font-semibold text-ink-900">{Number(order.shipping_fee) ? vnd(order.shipping_fee) : "0đ"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-display font-black text-ink-900">Khách trả</dt>
          <dd className="font-display text-xl font-black text-coral-600">{vnd(order.total_amount)}</dd>
        </div>
      </dl>
    </Modal>
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
