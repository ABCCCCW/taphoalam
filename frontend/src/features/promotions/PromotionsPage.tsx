import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, CalendarClock, Hourglass, Pencil, Plus, Ticket, Trash2, Zap } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import type { Tone } from "../../lib/labels";
import { cn } from "../../lib/cn";
import Button, { IconButton } from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import DataTable, { type Column } from "../../components/ui/DataTable";
import { EmptyState } from "../../components/ui/Feedback";
import { PageBody, PageFrame, PageHeader, SearchInput, Segmented, StatCard, Toolbar } from "../../components/ui/Page";
import { Input, MoneyInput, Textarea, Toggle } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";

type Promo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  scope: "ORDER" | "NEAR_EXPIRY";
  type: "PERCENT" | "AMOUNT";
  value: number;
  min_order_amount: number;
  max_discount?: number | null;
  usage_limit?: number | null;
  used_count: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  state: "LIVE" | "UPCOMING" | "ENDED" | "USED_UP" | "OFF";
};

const STATE: Record<Promo["state"], { label: string; tone: Tone }> = {
  LIVE: { label: "Đang chạy", tone: "lime" },
  UPCOMING: { label: "Sắp tới", tone: "sky" },
  ENDED: { label: "Đã hết hạn", tone: "mute" },
  USED_UP: { label: "Hết lượt", tone: "sun" },
  OFF: { label: "Đã tắt", tone: "mute" },
};

const dmy = (iso: string) => iso.split("-").reverse().join("/");

type Filter = "ALL" | "LIVE" | "UPCOMING" | "ENDED" | "NEAR";

const isOver = (p: Promo) => p.state === "ENDED" || p.state === "USED_UP" || p.state === "OFF";
const ORDER_OF: Record<Promo["state"], number> = { LIVE: 0, UPCOMING: 1, USED_UP: 2, OFF: 3, ENDED: 4 };

/** Số ngày từ hôm nay tới ngày ISO (âm = đã qua). */
function daysTo(iso: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - t.getTime()) / 86400000);
}

function timing(p: Promo): { text: string; urgent?: boolean } {
  if (p.state === "UPCOMING") {
    const d = daysTo(p.start_date);
    return { text: d <= 1 ? "Bắt đầu ngày mai" : `Bắt đầu sau ${d} ngày` };
  }
  if (p.state === "LIVE") {
    const d = daysTo(p.end_date);
    return { text: d <= 0 ? "Kết thúc hôm nay" : `Còn ${d} ngày`, urgent: d <= 2 };
  }
  if (p.state === "ENDED") return { text: `Kết thúc ${dmy(p.end_date)}` };
  return { text: STATE[p.state].label };
}

function condition(p: Promo) {
  if (p.scope === "NEAR_EXPIRY") return "Tự trừ vào món còn ≤ 7 ngày hạn";
  return p.min_order_amount > 0 ? `Đơn từ ${vnd(p.min_order_amount)}` : "Mọi đơn";
}

export default function PromotionsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const q = useQuery<Promo[]>({ queryKey: ["promotions"], queryFn: staffApi.promotions });
  const rows = q.data || [];

  const counts = useMemo(
    () => ({
      LIVE: rows.filter((p) => p.state === "LIVE").length,
      UPCOMING: rows.filter((p) => p.state === "UPCOMING").length,
      ENDED: rows.filter(isOver).length,
      NEAR: rows.filter((p) => p.scope === "NEAR_EXPIRY").length,
    }),
    [rows]
  );

  const next = useMemo(
    () => rows.filter((p) => p.state === "UPCOMING").sort((a, b) => a.start_date.localeCompare(b.start_date))[0],
    [rows]
  );
  const usedTotal = rows.reduce((s, p) => s + (p.used_count || 0), 0);
  const nearLive = rows.find((p) => p.scope === "NEAR_EXPIRY" && p.state === "LIVE");

  const shown = useMemo(() => {
    const k = term.trim().toLowerCase();
    return rows
      .filter((p) => {
        if (filter === "LIVE") return p.state === "LIVE";
        if (filter === "UPCOMING") return p.state === "UPCOMING";
        if (filter === "ENDED") return isOver(p);
        if (filter === "NEAR") return p.scope === "NEAR_EXPIRY";
        return true;
      })
      .filter((p) => !k || p.code.toLowerCase().includes(k) || p.name.toLowerCase().includes(k))
      .sort((a, b) => {
        const byState = ORDER_OF[a.state] - ORDER_OF[b.state];
        if (byState) return byState;
        // Đang chạy: sắp hết trước. Sắp tới: gần nhất trước. Đã hết: mới hết trước.
        if (a.state === "LIVE") return a.end_date.localeCompare(b.end_date);
        if (a.state === "UPCOMING") return a.start_date.localeCompare(b.start_date);
        return b.end_date.localeCompare(a.end_date);
      });
  }, [rows, filter, term]);

  const remove = async (p: Promo) => {
    const ok = await confirm({
      title: `Xoá mã ${p.code}?`,
      body: p.used_count
        ? "Mã đã dùng trong hoá đơn nên sẽ chỉ bị tắt, vẫn giữ để tra cứu."
        : "Mã chưa dùng lần nào, xoá hẳn khỏi danh sách.",
      confirmText: p.used_count ? "Tắt mã" : "Xoá",
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await staffApi.deletePromotion(p.id);
      toast.success(r.archived ? `Đã tắt ${p.code}` : `Đã xoá ${p.code}`);
      q.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  const columns: Column<Promo>[] = [
    {
      key: "code",
      head: "Mã",
      primary: true,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
              p.scope === "NEAR_EXPIRY" ? "bg-sun-100 text-sun-700" : "bg-coral-100 text-coral-700"
            )}
          >
            {p.scope === "NEAR_EXPIRY" ? <Hourglass className="h-4 w-4" /> : <BadgePercent className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-sm font-black tracking-wide text-ink-900">{p.code}</div>
            <div className="max-w-[16rem] truncate text-xs text-ink-500" title={p.description || p.name}>
              {p.name}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "value",
      head: "Mức giảm",
      cell: (p) => (
        <div>
          <div className="font-display font-black text-coral-600">
            {p.type === "AMOUNT" ? `−${vnd(p.value)}` : `−${num(p.value)}%`}
          </div>
          {p.type === "PERCENT" && p.max_discount ? (
            <div className="text-[11px] text-ink-400">tối đa {vnd(p.max_discount)}</div>
          ) : null}
        </div>
      ),
    },
    { key: "cond", head: "Điều kiện", cell: (p) => <span className="text-sm text-ink-600">{condition(p)}</span> },
    {
      key: "time",
      head: "Thời gian",
      cell: (p) => {
        const t = timing(p);
        return (
          <div>
            <div className="whitespace-nowrap text-sm font-semibold text-ink-700">
              {dmy(p.start_date)} → {dmy(p.end_date)}
            </div>
            <div className={cn("text-[11px] font-semibold", t.urgent ? "text-coral-600" : "text-ink-400")}>{t.text}</div>
          </div>
        );
      },
    },
    {
      key: "used",
      head: "Đã dùng",
      align: "right",
      cell: (p) =>
        p.usage_limit ? (
          <div className="ml-auto w-24">
            <div className="text-sm font-bold tabular-nums text-ink-800">
              {num(p.used_count)}
              <span className="font-semibold text-ink-400">/{num(p.usage_limit)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className={cn("h-full rounded-full", p.used_count >= p.usage_limit ? "bg-sun-500" : "bg-lime-400")}
                style={{ width: `${Math.min(100, (p.used_count / p.usage_limit) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-sm font-bold tabular-nums text-ink-800">{num(p.used_count)}</span>
        ),
    },
    { key: "state", head: "Trạng thái", cell: (p) => <Badge tone={STATE[p.state].tone}>{STATE[p.state].label}</Badge> },
    {
      key: "act",
      head: "",
      desktopOnly: true,
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <IconButton icon={Pencil} label="Sửa" onClick={() => setEditing(p)} />
          {p.scope !== "NEAR_EXPIRY" && <IconButton icon={Trash2} label="Xoá" tone="danger" onClick={() => remove(p)} />}
        </div>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        className="mb-0"
        kicker="Bán hàng"
        title="Khuyến mãi"
        desc="Mã chỉ hiện ở quầy và website trong khoảng ngày bắt đầu – kết thúc. Mã cận date tự trừ vào món còn ≤ 7 ngày hạn, không cần chọn."
        actions={
          <Button icon={Plus} onClick={() => setEditing("new")}>
            Tạo mã
          </Button>
        }
      />

      <PageBody>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Đang chạy" value={num(counts.LIVE)} sub="Khách đang dùng được" icon={Zap} />
          <StatCard
            label="Mã kế tiếp"
            value={next ? next.code : "—"}
            sub={next ? `${next.name} · ${timing(next).text.toLowerCase()}` : "Chưa lên lịch mã nào"}
            tone="sky"
            icon={CalendarClock}
          />
          <StatCard label="Lượt đã dùng" value={num(usedTotal)} sub="Cộng dồn mọi mã" tone="sun" icon={Ticket} />
          <StatCard
            label="Giảm cận date"
            value={nearLive ? `−${num(nearLive.value)}%` : "Tắt"}
            sub={nearLive ? `Đến ${dmy(nearLive.end_date)}` : "Không tự giảm hàng sắp hết hạn"}
            tone="ink"
            icon={Hourglass}
          />
        </div>

        <Toolbar>
          <SearchInput value={term} onChange={setTerm} placeholder="Tìm mã hoặc tên chương trình…" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: "Tất cả", count: rows.length },
              { value: "LIVE", label: "Đang chạy", count: counts.LIVE },
              { value: "UPCOMING", label: "Sắp tới", count: counts.UPCOMING },
              { value: "ENDED", label: "Đã hết / tắt", count: counts.ENDED },
              { value: "NEAR", label: "Cận date", count: counts.NEAR },
            ]}
          />
        </Toolbar>

        <DataTable
          rows={shown}
          columns={columns}
          rowKey={(p) => p.id}
          onRowClick={(p) => setEditing(p)}
          rowClassName={(p) => (isOver(p) ? "opacity-60" : undefined)}
          loading={q.isPending}
          error={q.isError ? q.error : undefined}
          onRetry={q.refetch}
          empty={
            <EmptyState
              emoji="🏷️"
              title={term ? "Không có mã nào khớp từ khoá" : "Không có mã nào ở mục này"}
              action={
                term ? (
                  <Button variant="ghost" onClick={() => setTerm("")}>
                    Xoá từ khoá
                  </Button>
                ) : (
                  <Button icon={Plus} onClick={() => setEditing("new")}>
                    Tạo mã
                  </Button>
                )
              }
            />
          }
        />

        {editing && (
          <PromoForm
            promo={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              q.refetch();
            }}
          />
        )}
      </PageBody>
    </PageFrame>
  );
}

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function PromoForm({ promo, onClose, onDone }: { promo: Promo | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    code: promo?.code || "",
    name: promo?.name || "",
    description: promo?.description || "",
    scope: promo?.scope || ("ORDER" as Promo["scope"]),
    type: promo?.type || ("PERCENT" as Promo["type"]),
    value: promo ? String(promo.value) : "10",
    min_order_amount: promo ? String(promo.min_order_amount || "") : "",
    max_discount: promo?.max_discount ? String(promo.max_discount) : "",
    usage_limit: promo?.usage_limit ? String(promo.usage_limit) : "",
    start_date: promo?.start_date || todayIso(),
    end_date: promo?.end_date || todayIso(),
    is_active: promo ? promo.is_active : true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const near = f.scope === "NEAR_EXPIRY";
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!f.code.trim()) next.code = "Cần mã";
    if (!f.name.trim()) next.name = "Cần tên hiển thị";
    const value = Number(f.value);
    if (!value || value <= 0) next.value = "Mức giảm phải lớn hơn 0";
    else if (f.type === "PERCENT" && value > 100) next.value = "Tối đa 100%";
    if (!f.start_date) next.start_date = "Chọn ngày bắt đầu";
    if (!f.end_date) next.end_date = "Chọn ngày kết thúc";
    else if (f.start_date && f.end_date < f.start_date) next.end_date = "Phải sau ngày bắt đầu";
    setErrors(next);
    if (Object.keys(next).length) return;

    const body = {
      code: f.code.trim().toUpperCase(),
      name: f.name.trim(),
      description: f.description.trim() || null,
      scope: f.scope,
      type: near ? "PERCENT" : f.type,
      value,
      min_order_amount: near ? 0 : Number(f.min_order_amount) || 0,
      max_discount: near || f.type === "AMOUNT" ? null : Number(f.max_discount) || null,
      usage_limit: near ? null : Number(f.usage_limit) || null,
      start_date: f.start_date,
      end_date: f.end_date,
      is_active: f.is_active,
    };
    setBusy(true);
    try {
      if (promo) await staffApi.updatePromotion(promo.id, body);
      else await staffApi.createPromotion(body);
      toast.success(promo ? `Đã lưu ${body.code}` : `Đã tạo ${body.code}`);
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={promo ? (promo.scope === "NEAR_EXPIRY" ? "Giảm hàng cận date" : `Sửa mã ${promo.code}`) : "Tạo mã khuyến mãi"}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Huỷ
          </Button>
          <Button className="flex-1" loading={busy} onClick={submit}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Mã"
            required
            className="font-mono uppercase"
            placeholder="TRUNGTHU26"
            value={f.code}
            error={errors.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
          />
          <Input
            label="Tên hiển thị"
            required
            placeholder="Tết Trung Thu"
            value={f.name}
            error={errors.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        {!near && (
          <div>
            <div className="mb-1.5 text-sm font-semibold text-ink-600">Kiểu giảm</div>
            <Segmented
              value={f.type}
              onChange={(v) => set({ type: v })}
              options={[
                { value: "PERCENT", label: "Theo %" },
                { value: "AMOUNT", label: "Số tiền cố định" },
              ]}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {f.type === "AMOUNT" && !near ? (
            <MoneyInput label="Giảm" required value={f.value} error={errors.value} onChange={(e) => set({ value: e.target.value })} />
          ) : (
            <Input
              label="Giảm"
              required
              type="number"
              min={1}
              max={100}
              suffix="%"
              value={f.value}
              error={errors.value}
              onChange={(e) => set({ value: e.target.value })}
            />
          )}
          {!near && f.type === "PERCENT" && (
            <MoneyInput
              label="Giảm tối đa"
              placeholder="Không giới hạn"
              value={f.max_discount}
              onChange={(e) => set({ max_discount: e.target.value })}
            />
          )}
          {!near && (
            <MoneyInput
              label="Đơn tối thiểu"
              placeholder="Mọi đơn"
              value={f.min_order_amount}
              onChange={(e) => set({ min_order_amount: e.target.value })}
            />
          )}
          {!near && (
            <Input
              label="Số lượt dùng tối đa"
              type="number"
              min={1}
              placeholder="Không giới hạn"
              value={f.usage_limit}
              onChange={(e) => set({ usage_limit: e.target.value })}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Ngày bắt đầu"
            required
            type="date"
            value={f.start_date}
            error={errors.start_date}
            onChange={(e) => set({ start_date: e.target.value })}
          />
          <Input
            label="Ngày kết thúc"
            required
            type="date"
            min={f.start_date}
            value={f.end_date}
            error={errors.end_date}
            onChange={(e) => set({ end_date: e.target.value })}
          />
        </div>

        <Textarea
          label="Mô tả"
          rows={2}
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <Toggle
          checked={f.is_active}
          onChange={(v) => set({ is_active: v })}
          label="Đang bật"
        />
      </div>
    </Modal>
  );
}
