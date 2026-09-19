import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Boxes, HandCoins, PackageMinus, PackagePlus, Scale, ShoppingCart, TriangleAlert } from "lucide-react";
import { staffApi } from "../../api/client";
import { dateFull, num, vnd, when } from "../../lib/format";
import { ADJUST_TYPES, TX_TYPE, look } from "../../lib/labels";
import { cn } from "../../lib/cn";
import { useAuth } from "../../stores/authStore";
import ProductImage from "../../components/ui/ProductImage";
import Button from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Skeleton, TableSkeleton } from "../../components/ui/Feedback";
import { PAGE_SIZE, PageBody, PageFrame, PageHeader, Pager, SearchInput, Section, Segmented, StatCard, Toolbar } from "../../components/ui/Page";
import { Input, Select, Textarea } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import KhoTabs from "./KhoTabs";

type Filter = "all" | "low" | "held" | "expired" | "expiring";

/** "còn 12 ngày" / "hết hạn hôm nay" / "quá hạn 3 ngày" */
function daysLeft(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
  if (n < 0) return `quá hạn ${-n} ngày`;
  if (n === 0) return "hết hạn hôm nay";
  return `còn ${n} ngày`;
}

export default function InventoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  /* Thu ngân chỉ có quyền inventory.read: không thấy giá vốn, không ghi hao hụt. */
  const showValue = user?.role !== "CASHIER";
  const canAdjust = user?.role !== "CASHIER";

  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const hsd = params.get("hsd");
  const [filter, setFilter] = useState<Filter>(hsd === "expired" || hsd === "expiring" ? hsd : "all");

  useEffect(() => {
    if (hsd === "expired" || hsd === "expiring") {
      setFilter(hsd);
      setPage(1);
    }
  }, [hsd]);
  const [histFor, setHistFor] = useState<any>(null);
  const [adjust, setAdjust] = useState<any>(null);

  const list = useQuery({
    queryKey: ["inv", term, filter, page],
    queryFn: () => staffApi.inventory({ q: term || undefined, filter, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items || [];
  const counts = list.data?.summary || { all: 0, low: 0, held: 0, expired: 0, expiring: 0, reserved: 0, value: 0 };
  const totals = { value: counts.value || 0, reserved: counts.reserved || 0 };
  const pages = list.data?.pages || 1;
  const total = list.data?.total || 0;

  const reset = (fn: () => void) => {
    setPage(1);
    fn();
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      head: "Mặt hàng",
      primary: true,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <ProductImage
            src={r.image_url}
            emoji={r.emoji}
            alt={r.name}
            fit="cover"
            className="h-10 w-10 shrink-0 rounded-xl bg-ink-50 ring-1 ring-black/[.05]"
            emojiClassName="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-lg"
          />
          <div className="min-w-0">
            <div className="truncate font-bold text-ink-900">{r.name}</div>
            <div className="truncate font-mono text-[11px] text-ink-400">{r.sku}</div>
          </div>
        </div>
      ),
    },
    {
      key: "qty",
      head: "Trong kho",
      hint: "Tổng số đang có trong kho, tính cả phần đã giữ cho đơn online",
      align: "right",
      cell: (r) => (
        <span className={r.low_stock ? "font-black text-coral-600" : "font-bold text-ink-800"}>{num(r.quantity)}</span>
      ),
    },
    {
      key: "reserved",
      head: "Giữ cho đơn online",
      hint: "Khách đã đặt trên website nhưng chưa lấy / chưa giao — phần này không được bán ở quầy",
      align: "right",
      cell: (r) =>
        Number(r.reserved) > 0 ? (
          <Badge tone="sun">{num(r.reserved)}</Badge>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: "avail",
      head: "Còn bán được",
      hint: "= Trong kho − Giữ cho đơn online. Số quầy và website còn bán được",
      align: "right",
      cell: (r) => <span className="font-display font-black text-ink-900">{num(r.available)}</span>,
    },
    {
      key: "hsd",
      head: "Hạn gần nhất",
      hint: "Hạn dùng của lô sẽ bán ra trước (lô hết hạn sớm nhất còn hàng)",
      cell: (r) =>
        r.expiry_date ? (
          <div className="leading-tight">
            <div className={r.expiry_status === "expired" ? "font-bold text-coral-600" : r.expiry_status === "expiring" ? "font-bold text-sun-700" : "text-ink-700"}>
              {dateFull(r.expiry_date)}
            </div>
            <div className="text-[11px] text-ink-400">{daysLeft(r.expiry_date)}</div>
          </div>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    ...(showValue
      ? [
          {
            key: "value",
            head: "Giá trị vốn",
            hint: "Số trong kho × giá vốn",
            align: "right" as const,
            cell: (r: any) => <span className="text-ink-600">{vnd(r.value)}</span>,
          },
        ]
      : []),
    {
      key: "act",
      head: "",
      align: "right",
      desktopOnly: true,
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setHistFor(r)}
            title="Xem lịch sử nhập, bán, điều chỉnh của món này"
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
          >
            <BookOpen className="h-3.5 w-3.5" /> Lịch sử
          </button>
          {canAdjust && (
            <button
              type="button"
              onClick={() => setAdjust({ product_id: r.product_id, name: r.name, quantity: "1", type: "SHRINKAGE", note: "" })}
              title="Trừ hàng hỏng, vỡ, mất, hết hạn khỏi kho"
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-coral-200 bg-coral-50 px-2.5 text-xs font-semibold text-coral-700 transition hover:bg-coral-100"
            >
              <PackageMinus className="h-3.5 w-3.5" /> Báo hỏng/mất
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader className="mb-0" title="Kho" actions={<KhoTabs />} />

      <PageBody>

      <Section title="Tóm tắt kho" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {list.isPending ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          ) : (
            <>
              <StatCard label="Mặt hàng đang theo" value={num(counts.all)} icon={Boxes} sub={`${counts.low} món dưới mức tối thiểu`} />
              <StatCard
                label="Đang giữ cho đơn online"
                value={num(totals.reserved)}
                tone="sun"
                icon={HandCoins}
                sub={counts.held ? `${counts.held} mặt hàng bị giữ` : "Không món nào bị giữ"}
              />
              {showValue ? (
                <StatCard label="Giá trị vốn trên kệ" value={vnd(totals.value)} tone="ink" icon={Boxes} sub="Tính theo giá vốn bình quân" />
              ) : (
                <StatCard label="Sắp hết hàng" value={num(counts.low)} tone="coral" icon={TriangleAlert} sub="mặt hàng cần nhập thêm" />
              )}
            </>
          )}
        </div>
      </Section>

      <Toolbar>
        <SearchInput value={term} onChange={(v) => reset(() => setTerm(v))} placeholder="Tìm mặt hàng trong kho…" />
        <Segmented
          value={filter}
          onChange={(v) =>
            reset(() => {
              setFilter(v);
              if (v === "expired" || v === "expiring") setParams({ hsd: v });
              else setParams({});
            })
          }
          options={[
            { value: "all", label: "Tất cả", count: counts.all },
            { value: "low", label: "Sắp hết", count: counts.low },
            { value: "expired", label: "Hết hạn", count: counts.expired },
            { value: "expiring", label: "Sắp hết hạn", count: counts.expiring },
            { value: "held", label: "Giữ cho đơn online", count: counts.held },
          ]}
        />
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.product_id}
        onRowClick={setHistFor}
        loading={list.isPending}
        error={list.isError ? list.error : undefined}
        onRetry={list.refetch}
        empty={
          <EmptyState
            emoji={filter === "low" || filter === "expired" || filter === "expiring" ? "✅" : "📥"}
            title={
              filter === "low"
                ? "Không món nào sắp hết"
                : filter === "expired"
                  ? "Không món nào hết hạn"
                  : filter === "expiring"
                    ? "Không món nào sắp hết hạn"
                    : filter === "held"
                      ? "Không có hàng đang bị giữ"
                      : term
                        ? "Không tìm thấy mặt hàng"
                        : "Kho chưa có gì"
            }
          />
        }
        footer={rows.length > 0 && <Pager page={page} pages={pages} total={total} onPage={setPage} />}
      />

      {histFor && <HistoryModal row={histFor} onClose={() => setHistFor(null)} />}

      {adjust && (
        <AdjustModal
          value={adjust}
          onClose={() => setAdjust(null)}
          onSaved={(msg) => {
            setAdjust(null);
            toast.success(msg);
            list.refetch();
          }}
        />
      )}
      </PageBody>
    </PageFrame>
  );
}

/* Nhóm loại giao dịch để lọc và tô màu: vào kho / ra do bán / ra do hao hụt / điều chỉnh */
const TX_GROUP: Record<string, "in" | "sale" | "loss" | "adjust"> = {
  IMPORT: "in", SALE_RETURN: "in", FOUND: "in", CANCEL: "in",
  SALE: "sale",
  DAMAGED: "loss", EXPIRED: "loss", SHRINKAGE: "loss", SUPPLIER_RETURN: "loss",
  ADJUST: "adjust",
};
const TX_LOOK = {
  in: { icon: PackagePlus, dot: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  sale: { icon: ShoppingCart, dot: "bg-sky-50 text-sky-700 ring-sky-100" },
  loss: { icon: PackageMinus, dot: "bg-coral-50 text-coral-700 ring-coral-100" },
  adjust: { icon: Scale, dot: "bg-grape-50 text-grape-700 ring-grape-100" },
} as const;
const TX_REF: Record<string, string> = { stock_receipt: "Phiếu nhập", order: "Đơn", stocktake: "Phiếu kiểm kê", seed: "Tồn đầu kỳ" };

function HistoryModal({ row, onClose }: { row: any; onClose: () => void }) {
  const q = useQuery({ queryKey: ["inv-hist", row.product_id], queryFn: () => staffApi.history(row.product_id) });
  const [kind, setKind] = useState<"all" | "in" | "sale" | "loss">("all");
  const rows: any[] = q.data || [];
  const sum = (g: string) => rows.filter((h) => TX_GROUP[h.type] === g).reduce((a, h) => a + Math.abs(Number(h.quantity)), 0);
  const shown = rows.filter((h) => kind === "all" || TX_GROUP[h.type] === kind);

  // gom theo ngày, mới nhất lên đầu
  const days: { day: string; items: any[] }[] = [];
  for (const h of shown) {
    const d = dateFull(h.created_at);
    const last = days[days.length - 1];
    if (last && last.day === d) last.items.push(h);
    else days.push({ day: d, items: [h] });
  }

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <ProductImage
            src={row.image_url}
            emoji={row.emoji}
            alt={row.name}
            fit="cover"
            className="h-11 w-11 shrink-0 rounded-xl bg-ink-50"
            emojiClassName="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-50 text-xl"
          />
          <span className="min-w-0">
            <span className="block truncate">{row.name}</span>
            <span className="block text-xs font-medium text-ink-500">Lịch sử nhập · bán · điều chỉnh</span>
          </span>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <HistStat label="Đang còn" value={num(row.quantity)} strong />
        <HistStat label="Đã nhập" value={`+${num(sum("in"))}`} tone="text-emerald-700" />
        <HistStat label="Đã bán" value={`−${num(sum("sale"))}`} tone="text-sky-700" />
        <HistStat label="Hỏng / mất" value={`−${num(sum("loss"))}`} tone="text-coral-700" />
      </div>

      <div className="mt-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "Tất cả", count: rows.length },
            { value: "in", label: "Nhập", count: rows.filter((h) => TX_GROUP[h.type] === "in").length },
            { value: "sale", label: "Bán", count: rows.filter((h) => TX_GROUP[h.type] === "sale").length },
            { value: "loss", label: "Hỏng / mất", count: rows.filter((h) => TX_GROUP[h.type] === "loss").length },
          ]}
        />
      </div>

      {q.isPending ? (
        <div className="mt-4">
          <TableSkeleton rows={5} cols={3} />
        </div>
      ) : !shown.length ? (
        <div className="mt-4">
          <EmptyState emoji="📖" title={rows.length ? "Không có dòng nào thuộc loại này" : "Món này chưa có giao dịch nào"} />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {days.map((g) => (
            <section key={g.day}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">{g.day}</h3>
              <ul className="divide-y divide-ink-100 rounded-2xl ring-1 ring-black/[.06]">
                {g.items.map((h) => {
                  const grp = TX_GROUP[h.type] || "adjust";
                  const L = TX_LOOK[grp];
                  const Icon = L.icon;
                  const label = look(TX_TYPE, h.type).label;
                  const ref = h.ref_type && TX_REF[h.ref_type];
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1", L.dot)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink-900">
                          {label}
                          {h.channel && <span className="font-normal text-ink-500"> · {h.channel === "POS" ? "tại quầy" : "website"}</span>}
                        </div>
                        <div className="truncate text-xs text-ink-500">
                          {new Date(h.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          {ref && ` · ${ref}${h.ref_id && h.ref_type !== "seed" ? ` #${h.ref_id}` : ""}`}
                          {grp === "in" && Number(h.unit_cost) > 0 && ` · giá vốn ${vnd(h.unit_cost)}`}
                          {h.note && ` · ${h.note}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={cn("font-display text-base font-black tabular-nums", Number(h.quantity) < 0 ? "text-coral-600" : "text-emerald-700")}>
                          {Number(h.quantity) > 0 ? "+" : "−"}
                          {num(Math.abs(Number(h.quantity)))}
                        </div>
                        <div className="text-[11px] tabular-nums text-ink-400">còn {num(h.balance_after)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

function HistStat({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5", strong ? "bg-forest-900 text-white" : "bg-ink-50")}>
      <div className={cn("text-[11px]", strong ? "text-white/60" : "text-ink-500")}>{label}</div>
      <div className={cn("mt-0.5 font-display text-lg font-black tabular-nums", !strong && (tone || "text-ink-900"))}>{value}</div>
    </div>
  );
}

function AdjustModal({
  value,
  onClose,
  onSaved,
}: {
  value: any;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lost = Number(f.quantity) || 0;

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!(lost > 0)) next.quantity = "Số lượng hao hụt phải lớn hơn 0";
    if (!String(f.note || "").trim()) next.note = "Bắt buộc ghi lý do để còn truy được sổ";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await staffApi.adjust({
        product_id: f.product_id,
        quantity: f.type === "ADJUST" ? lost : -lost,
        type: f.type,
        note: String(f.note).trim(),
      });
      onSaved(`Đã ghi sổ ${num(lost)} ${f.name}`);
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
      title="Ghi hao hụt"
      subtitle={f.name}
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
      <div className="space-y-4">
        <Select
          label="Lý do"
          value={f.type}
          onChange={(e) => setF({ ...f, type: e.target.value })}
          options={ADJUST_TYPES}
        />
        <Input
          label={f.type === "ADJUST" ? "Số lượng cộng thêm" : "Số lượng bị mất"}
          required
          type="number"
          min={0}
          step={0.1}
          value={f.quantity}
          error={errors.quantity}
          onChange={(e) => setF({ ...f, quantity: e.target.value })}
          autoFocus
        />
        <Textarea
          label="Lý do cụ thể"
          required
          rows={2}
          placeholder="Vd. rau héo phải bỏ, hộp sữa bị bẹp"
          value={f.note}
          error={errors.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
        />
      </div>
    </Modal>
  );
}
