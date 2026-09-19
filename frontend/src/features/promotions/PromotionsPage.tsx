import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import type { Tone } from "../../lib/labels";
import Button, { IconButton } from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { CardSkeleton, EmptyState, ErrorState, Notice } from "../../components/ui/Feedback";
import { PageHeader, Segmented } from "../../components/ui/Page";
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

function valueText(p: Pick<Promo, "type" | "value" | "max_discount">) {
  if (p.type === "AMOUNT") return `−${vnd(p.value)}`;
  return `−${num(p.value)}%${p.max_discount ? ` · tối đa ${vnd(p.max_discount)}` : ""}`;
}

type Filter = "ALL" | "LIVE" | "UPCOMING" | "ENDED" | "NEAR";

export default function PromotionsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const q = useQuery<Promo[]>({ queryKey: ["promotions"], queryFn: staffApi.promotions });
  const rows = q.data || [];

  const counts = useMemo(
    () => ({
      LIVE: rows.filter((p) => p.state === "LIVE").length,
      UPCOMING: rows.filter((p) => p.state === "UPCOMING").length,
      ENDED: rows.filter((p) => p.state === "ENDED" || p.state === "USED_UP" || p.state === "OFF").length,
      NEAR: rows.filter((p) => p.scope === "NEAR_EXPIRY").length,
    }),
    [rows]
  );

  const shown = rows.filter((p) => {
    if (filter === "LIVE") return p.state === "LIVE";
    if (filter === "UPCOMING") return p.state === "UPCOMING";
    if (filter === "ENDED") return p.state === "ENDED" || p.state === "USED_UP" || p.state === "OFF";
    if (filter === "NEAR") return p.scope === "NEAR_EXPIRY";
    return true;
  });

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

  return (
    <div>
      <PageHeader
        kicker="Bán hàng"
        title="Khuyến mãi"
        desc="Mã chỉ hiện ở quầy và website trong khoảng ngày bắt đầu – kết thúc. Mã cận date tự trừ vào món còn ≤ 7 ngày hạn, không cần chọn."
        actions={
          <Button icon={Plus} onClick={() => setEditing("new")}>
            Tạo mã
          </Button>
        }
      />

      <Segmented
        className="mb-5"
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

      {q.isPending ? (
        <CardSkeleton count={6} />
      ) : q.isError ? (
        <div className="card">
          <ErrorState error={q.error} onRetry={q.refetch} />
        </div>
      ) : !shown.length ? (
        <div className="card">
          <EmptyState emoji="🏷️" title="Không có mã nào ở mục này" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article key={p.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-coral-100 text-coral-700">
                  <BadgePercent className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-black tracking-wide text-ink-900">{p.code}</div>
                  <div className="truncate text-sm text-ink-600">{p.name}</div>
                </div>
                <Badge tone={STATE[p.state].tone}>{STATE[p.state].label}</Badge>
              </div>

              <div className="mt-3 font-display text-xl font-black text-coral-600">{valueText(p)}</div>
              <div className="mt-1 text-xs text-ink-500">
                {p.scope === "NEAR_EXPIRY"
                  ? "Tự áp vào từng món cận date"
                  : p.min_order_amount > 0
                    ? `Đơn từ ${vnd(p.min_order_amount)}`
                    : "Không cần đơn tối thiểu"}
                {p.usage_limit ? ` · đã dùng ${num(p.used_count)}/${num(p.usage_limit)}` : p.used_count ? ` · đã dùng ${num(p.used_count)}` : ""}
              </div>
              {p.description && <p className="mt-2 text-xs leading-relaxed text-ink-400">{p.description}</p>}

              <div className="mt-auto flex items-center gap-2 pt-3">
                <span className="inline-flex flex-1 items-center gap-1.5 text-xs font-semibold text-ink-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {dmy(p.start_date)} → {dmy(p.end_date)}
                </span>
                <IconButton icon={Pencil} label="Sửa" onClick={() => setEditing(p)} />
                <IconButton icon={Trash2} label="Xoá" tone="danger" onClick={() => remove(p)} />
              </div>
            </article>
          ))}
        </div>
      )}

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
    </div>
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
      title={promo ? `Sửa mã ${promo.code}` : "Tạo mã khuyến mãi"}
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
        <div>
          <div className="mb-1.5 text-sm font-semibold text-ink-600">Loại mã</div>
          <Segmented
            value={f.scope}
            onChange={(v) => set({ scope: v, type: v === "NEAR_EXPIRY" ? "PERCENT" : f.type })}
            options={[
              { value: "ORDER", label: "Giảm cho đơn" },
              { value: "NEAR_EXPIRY", label: "Hàng cận date (tự áp)" },
            ]}
          />
        </div>
        {near && (
          <Notice tone="info">
            Món còn ≤ 7 ngày hạn dùng sẽ tự được trừ % này ngay khi cho vào giỏ, ở cả quầy và website.
          </Notice>
        )}
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
              hint="Để trống nếu không giới hạn"
              value={f.max_discount}
              onChange={(e) => set({ max_discount: e.target.value })}
            />
          )}
          {!near && (
            <MoneyInput
              label="Đơn tối thiểu"
              hint="Để trống = đơn nào cũng dùng được"
              value={f.min_order_amount}
              onChange={(e) => set({ min_order_amount: e.target.value })}
            />
          )}
          {!near && (
            <Input
              label="Số lượt dùng tối đa"
              type="number"
              min={1}
              hint="Để trống = không giới hạn"
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
          placeholder="Ghi chú ngắn cho thu ngân / khách"
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <Toggle
          checked={f.is_active}
          onChange={(v) => set({ is_active: v })}
          label="Đang bật"
          hint="Tắt thì mã không hiện dù còn trong hạn"
        />
      </div>
    </Modal>
  );
}
