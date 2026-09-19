/**
 * Thành phần dùng chung cho Tổng quan và Báo cáo.
 *
 * Màu biểu đồ đã chạy qua bộ kiểm tra bảng màu (độ sáng, độ đậm màu, tách biệt
 * với người mù màu, tương phản với nền): xanh = Quầy / Tiền mặt, cam = Website /
 * Chuyển khoản. Than chì của thương hiệu bị loại vì là xám — không đủ để phân biệt
 * chuỗi. Chữ và nhãn luôn dùng màu chữ, màu chỉ nằm trên vạch dữ liệu.
 */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { num, vnd } from "../../lib/format";
import { cn } from "../../lib/cn";

export const C = {
  a: "#2F6FDB",
  b: "#FF5A3C",
  grid: "#EEEEF0",
  axis: "#71717A",
  surface: "#FFFFFF",
} as const;

export const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(".", ",")}tr`;
  if (a >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
};

export const dm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

/** % thay đổi so với kỳ trước; null khi kỳ trước bằng 0 (không so được). */
export const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

export function Card({
  title,
  sub,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl bg-white ring-1 ring-black/[.06]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-bold text-ink-900">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1 px-5 pb-5 pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DeltaChip({ value, invert = false, dark = false }: { value: number | null; invert?: boolean; dark?: boolean }) {
  if (value == null) return null;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
        dark
          ? good ? "bg-white/15 text-white" : "bg-coral-500/30 text-coral-100"
          : good ? "bg-emerald-50 text-emerald-700" : "bg-coral-50 text-coral-700"
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value)}%
    </span>
  );
}

export function Kpi({
  label,
  value,
  sub,
  chip,
  icon: Icon,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  chip?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-white p-4 ring-1 ring-black/[.06]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-500">{label}</span>
        {Icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-50 text-ink-500">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-[1.6rem] font-black leading-none tracking-tight tabular-nums text-ink-900">{value}</span>
        {chip}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-500">{sub}</div>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  );
}

/** Chú thích màu — luôn có khi ≥ 2 chuỗi, chữ dùng màu chữ, ô màu nằm cạnh. */
export function Legend({ items }: { items: { color: string; label: string; value?: React.ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} aria-hidden />
          {it.label}
          {it.value != null && <b className="font-semibold tabular-nums text-ink-900">{it.value}</b>}
        </li>
      ))}
    </ul>
  );
}

/** Thanh chia tỉ lệ 2 phần (tiền mặt / chuyển khoản, quầy / website). */
export function SplitBar({ parts }: { parts: { color: string; label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-ink-100">
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <i
                key={p.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
                title={`${p.label}: ${vnd(p.value)}`}
              />
            ))}
      </div>
      <div className="mt-2">
        <Legend
          items={parts.map((p) => ({
            color: p.color,
            label: p.label,
            value: total > 0 ? `${Math.round((p.value / total) * 100)}%` : "—",
          }))}
        />
      </div>
    </div>
  );
}

function TipBox({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + Number(p.value || 0), 0);
  return (
    <div className="min-w-[10rem] rounded-xl bg-forest-900 px-3 py-2 text-xs text-white shadow-pop">
      <div className="mb-1 font-semibold text-white/70">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
            {p.name}
          </span>
          <b className="tabular-nums">{vnd(p.value)}</b>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1 flex justify-between border-t border-white/15 pt-1 font-bold">
          <span>Tổng</span>
          <span className="tabular-nums">{vnd(total)}</span>
        </div>
      )}
    </div>
  );
}

const axisTick = { fontSize: 11, fill: C.axis };

/**
 * Cột doanh thu theo ngày, xếp chồng Quầy + Website. Cột ≤ 24px, bo 4px ở đầu,
 * khe 2px màu nền giữa hai phần, lưới mảnh liền nét.
 */
export function TrendChart({ data, height = 240 }: { data: any[]; height?: number }) {
  const many = data.length > 31;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap={many ? "18%" : "28%"}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dm}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            tick={axisTick}
            interval={Math.max(0, Math.ceil(data.length / 10) - 1)}
          />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={40} tick={axisTick} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(24,24,27,.04)" }} content={<TipBox labelFmt={(l: string) => `Ngày ${dm(l)}`} />} />
          <Bar dataKey="pos" name="Quầy" stackId="r" fill={C.a} stroke={C.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="online" name="Website" stackId="r" fill={C.b} stroke={C.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Thanh ngang xếp hạng (danh mục, mặt hàng): giá trị ở đầu thanh, không cần trục. */
export function RankBars({
  rows,
  valueKey = "revenue",
  label,
  sub,
  lead,
  limit = 6,
}: {
  rows: any[];
  valueKey?: string;
  label: (r: any) => React.ReactNode;
  sub?: (r: any) => React.ReactNode;
  lead?: (r: any) => React.ReactNode;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((r) => Number(r[valueKey] || 0)));
  return (
    <ul className="space-y-3">
      {shown.map((r, i) => (
        <li key={i} className="flex items-center gap-3">
          {lead && <span className="shrink-0">{lead(r)}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-ink-900">{label(r)}</span>
              <span className="shrink-0 font-semibold tabular-nums text-ink-900">{vnd(r[valueKey])}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                <i className="block h-full rounded-full" style={{ width: `${(Number(r[valueKey] || 0) / max) * 100}%`, background: C.b }} />
              </div>
              {sub && <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-ink-500">{sub(r)}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function NoData({ title = "Chưa có đơn hoàn tất trong khoảng này", sub }: { title?: string; sub?: string }) {
  return (
    <div className="grid h-full min-h-[8rem] place-items-center rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-4 py-6 text-center">
      <div>
        <div className="text-sm font-semibold text-ink-700">{title}</div>
        {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
      </div>
    </div>
  );
}

export { num, vnd };
