import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Boxes, HandCoins, PackageMinus, TriangleAlert } from "lucide-react";
import { staffApi } from "../../api/client";
import { day, num, vnd, when } from "../../lib/format";
import { ADJUST_TYPES, TX_TYPE } from "../../lib/labels";
import { useAuth } from "../../stores/authStore";
import ProductImage from "../../components/ui/ProductImage";
import Button, { IconButton } from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Skeleton, TableSkeleton } from "../../components/ui/Feedback";
import { PageHeader, SearchInput, Section, Segmented, StatCard, Toolbar } from "../../components/ui/Page";
import { Input, Select, Textarea } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

type Filter = "all" | "low" | "held" | "expired" | "expiring";

export default function InventoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  /* Thu ngân chỉ có quyền inventory.read: không thấy giá vốn, không ghi hao hụt. */
  const showValue = user?.role !== "CASHIER";
  const canAdjust = user?.role !== "CASHIER";

  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState("");
  const hsd = params.get("hsd");
  const [filter, setFilter] = useState<Filter>(hsd === "expired" || hsd === "expiring" ? hsd : "all");

  useEffect(() => {
    if (hsd === "expired" || hsd === "expiring") setFilter(hsd);
  }, [hsd]);
  const [histFor, setHistFor] = useState<any>(null);
  const [adjust, setAdjust] = useState<any>(null);

  const list = useQuery({
    queryKey: ["inv", term],
    queryFn: () => staffApi.inventory({ q: term || undefined }),
  });
  const rowsAll = list.data || [];

  const counts = useMemo(
    () => ({
      all: rowsAll.length,
      low: rowsAll.filter((r: any) => r.low_stock).length,
      held: rowsAll.filter((r: any) => Number(r.reserved) > 0).length,
      expired: rowsAll.filter((r: any) => r.expiry_status === "expired").length,
      expiring: rowsAll.filter((r: any) => r.expiry_status === "expiring").length,
    }),
    [rowsAll]
  );

  const totals = useMemo(
    () => ({
      value: rowsAll.reduce((s: number, r: any) => s + (Number(r.value) || 0), 0),
      reserved: rowsAll.reduce((s: number, r: any) => s + (Number(r.reserved) || 0), 0),
    }),
    [rowsAll]
  );

  const rows = useMemo(() => {
    if (filter === "low") return rowsAll.filter((r: any) => r.low_stock);
    if (filter === "held") return rowsAll.filter((r: any) => Number(r.reserved) > 0);
    if (filter === "expired") return rowsAll.filter((r: any) => r.expiry_status === "expired");
    if (filter === "expiring") return rowsAll.filter((r: any) => r.expiry_status === "expiring");
    return rowsAll;
  }, [rowsAll, filter]);

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
            className="h-9 w-9 shrink-0 rounded-xl bg-ink-50 p-1"
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
      align: "right",
      cell: (r) => (
        <span className={r.low_stock ? "font-black text-coral-600" : "font-bold text-ink-800"}>{num(r.quantity)}</span>
      ),
    },
    {
      key: "reserved",
      head: "Đang giữ",
      align: "right",
      cell: (r) =>
        Number(r.reserved) > 0 ? (
          <Badge tone="sun">{num(r.reserved)} giữ cho đơn online</Badge>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: "avail",
      head: "Quầy bán được",
      align: "right",
      cell: (r) => <span className="font-display font-black text-ink-900">{num(r.available)}</span>,
    },
    {
      key: "hsd",
      head: "Hạn gần nhất",
      cell: (r) =>
        r.expiry_date ? (
          <span className={r.expiry_status === "expired" ? "font-bold text-coral-600" : r.expiry_status === "expiring" ? "font-bold text-sun-700" : "text-ink-600"}>
            {day(r.expiry_date)}
          </span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    ...(showValue
      ? [
          {
            key: "value",
            head: "Giá trị vốn",
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
        <div className="flex items-center justify-end gap-0.5">
          <IconButton icon={BookOpen} label="Xem sổ cái kho" onClick={() => setHistFor(r)} />
          {canAdjust && (
            <IconButton
              icon={PackageMinus}
              label="Ghi hao hụt"
              tone="danger"
              onClick={() => setAdjust({ product_id: r.product_id, name: r.name, quantity: "1", type: "SHRINKAGE", note: "" })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        kicker="Kho hàng"
        title="Tồn kho"
      />

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
        <SearchInput value={term} onChange={setTerm} placeholder="Tìm mặt hàng trong kho…" />
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v);
            if (v === "expired" || v === "expiring") setParams({ hsd: v });
            else setParams({});
          }}
          options={[
            { value: "all", label: "Tất cả", count: counts.all },
            { value: "low", label: "Sắp hết", count: counts.low },
            { value: "expired", label: "Hết hạn", count: counts.expired },
            { value: "expiring", label: "Sắp hết hạn", count: counts.expiring },
            { value: "held", label: "Đang giữ", count: counts.held },
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
    </div>
  );
}

function HistoryModal({ row, onClose }: { row: any; onClose: () => void }) {
  const q = useQuery({ queryKey: ["inv-hist", row.product_id], queryFn: () => staffApi.history(row.product_id) });
  return (
    <Modal size="lg" onClose={onClose} title="Sổ cái kho" subtitle={row.name}>
      {q.isPending ? (
        <TableSkeleton rows={5} cols={3} />
      ) : !q.data?.length ? (
        <EmptyState emoji="📖" title="Sổ chưa có dòng nào" />
      ) : (
        <ul className="list-rows">
          {q.data.map((h: any) => (
            <li key={h.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge map={TX_TYPE} value={h.type} />
                  {h.channel && <span className="text-[11px] font-bold text-ink-400">{h.channel === "POS" ? "tại quầy" : "website"}</span>}
                </div>
                <div className="mt-1 text-xs text-ink-500">
                  {when(h.created_at)}
                  {h.note ? ` · ${h.note}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`font-display font-black ${h.quantity < 0 ? "text-coral-600" : "text-forest-700"}`}>
                  {h.quantity > 0 ? "+" : ""}
                  {num(h.quantity)}
                </div>
                <div className="text-[11px] font-semibold text-ink-400">còn {num(h.balance_after)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/**
 * Ghi hao hụt / hỏng / hết hạn.
 * Số nhập vào là số lượng bị mất, hệ thống tự trừ kho — trước đây ô này bắt
 * người dùng tự gõ số âm và không kiểm lý do, nên sổ cái đầy dòng trống nghĩa.
 */
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
