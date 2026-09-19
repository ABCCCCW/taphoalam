import { createContext, useContext } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "../../lib/cn";

/** Mục menu đang mở (icon + tên nhóm) — layout quản trị cung cấp để đầu trang tự có icon. */
export const PageMeta = createContext<{ icon?: React.ComponentType<{ className?: string }>; group?: string }>({});

export const PAGE_SIZE = 10;

/** Khung trang quản trị: vỏ cố định, chỉ phần thân cuộn. */
export function PageFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex h-full min-h-0 flex-col gap-4 overflow-hidden", className)}>{children}</div>;
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [&>*:not(.tbl-wrap)]:shrink-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Dãy nút trang theo tổng trang thật (`ceil(total / size)`).
 * ≤ 9 trang: hiện hết. Nhiều hơn: đầu + quanh trang đang mở + trang cuối.
 */
export function pageItems(cur: number, last: number): Array<number | "…"> {
  const end = Math.max(1, last);
  const now = Math.min(Math.max(1, cur), end);
  if (end <= 9) return Array.from({ length: end }, (_, i) => i + 1);

  const mark = new Set<number>([1, end, now]);
  for (let n = now - 1; n <= now + 1; n++) {
    if (n >= 1 && n <= end) mark.add(n);
  }
  if (now <= 4) {
    mark.add(2);
    mark.add(3);
    mark.add(4);
    mark.add(5);
  }
  if (now >= end - 3) {
    mark.add(end - 1);
    mark.add(end - 2);
    mark.add(end - 3);
    mark.add(end - 4);
  }

  const nums = [...mark].filter((n) => n >= 1 && n <= end).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("…");
    out.push(n);
  }
  return out;
}

const PAGE_BTN =
  "grid h-9 min-w-9 place-items-center rounded-xl px-2 text-[13px] font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-300/60";

/** Chân danh sách: số dòng đang xem + dãy số trang. */
export function Pager({
  page,
  pages,
  total,
  size = PAGE_SIZE,
  onPage,
  className,
}: {
  page: number;
  pages: number;
  total?: number;
  size?: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const last = Math.max(1, pages || 1);
  const cur = Math.min(Math.max(1, page), last);
  const items = pageItems(cur, last);
  const from = total ? Math.min((cur - 1) * size + 1, total) : 0;
  const to = total ? Math.min(cur * size, total) : 0;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <span className="text-xs font-semibold text-ink-500">
        {total != null ? (total === 0 ? "0 dòng" : `${from}–${to} / ${total} dòng`) : `\u00a0`}
      </span>
      {last > 1 && (
        <nav aria-label="Phân trang" className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-label="Trang trước"
            disabled={cur <= 1}
            onClick={() => onPage(cur - 1)}
            className={cn(PAGE_BTN, cur <= 1 ? "text-ink-300" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {items.map((it, i) =>
            it === "…" ? (
              <span key={`gap-${i}`} className="grid h-9 min-w-7 place-items-center text-sm font-bold text-ink-400">
                …
              </span>
            ) : (
              <button
                key={it}
                type="button"
                aria-label={`Trang ${it}`}
                aria-current={it === cur ? "page" : undefined}
                onClick={() => onPage(it)}
                className={cn(
                  PAGE_BTN,
                  it === cur
                    ? "bg-lime-400 text-forest-900 shadow-sm"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                )}
              >
                {it}
              </button>
            )
          )}
          <button
            type="button"
            aria-label="Trang sau"
            disabled={cur >= last}
            onClick={() => onPage(cur + 1)}
            className={cn(PAGE_BTN, cur >= last ? "text-ink-300" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * Đầu trang quản trị: một thanh trắng gọn — ô icon của mục menu, tên nhóm nhỏ ở trên,
 * tiêu đề, mô tả một dòng; nút chính nằm bên phải cùng hàng.
 */
export function PageHeader({
  kicker,
  title,
  desc,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  desc?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const meta = useContext(PageMeta);
  const Icon = meta.icon;
  const group = meta.group || kicker;
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/[.06] sm:px-5",
        className,
        "mb-0"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-50 text-coral-600 ring-1 ring-coral-100">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          {group && <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{group}</div>}
          <h1 className="truncate font-display text-xl font-black leading-tight tracking-tight text-ink-900">{title}</h1>
          {desc && <p className="truncate text-xs text-ink-500">{desc}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Hàng công cụ trên bảng: khay sand kẻ viền, ô tìm trắng, chip lọc coral. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-ink-300 bg-sand p-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Tìm…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 w-full sm:w-80 sm:flex-none", className)}>
      <span className="pointer-events-none absolute left-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-coral-50 text-coral-600">
        <Search className="h-4 w-4" />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border-2 border-ink-200 bg-white py-2.5 pl-11 pr-9 text-sm font-semibold text-ink-900 outline-none placeholder:font-medium placeholder:text-ink-400 focus:border-coral-400 focus:ring-4 focus:ring-coral-100"
      />
      {value && (
        <button
          type="button"
          aria-label="Xoá tìm kiếm"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-800"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const CHIP =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-extrabold transition";

/** Thanh tab trang (Tồn kho / Kiểm kê). Cùng chip coral với Segmented. */
export const TAB_BAR = "inline-flex max-w-full gap-1 overflow-x-auto";

export function tabClass(on: boolean) {
  return cn(
    CHIP,
    on ? "bg-coral-500 text-white shadow-sm" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:ring-ink-300 hover:text-ink-900"
  );
}

/** Nhóm nút lọc — đang chọn tô coral, không viên thuốc xám. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: NoInfer<T>) => void;
  options: { value: NoInfer<T>; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex max-w-full min-w-0 gap-1 overflow-x-auto", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              CHIP,
              on
                ? "bg-coral-500 text-white shadow-sm"
                : "bg-white text-ink-600 ring-1 ring-ink-200 hover:ring-ink-300 hover:text-ink-900"
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "min-w-5 rounded-lg px-1.5 text-center text-[10px] font-black tabular-nums",
                  on ? "bg-white/25 text-white" : o.count ? "bg-coral-500 text-white" : "bg-sand text-ink-400"
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const STAT_ACCENT = {
  lime: "bg-lime-400",
  coral: "bg-coral-500",
  sky: "bg-sky-500",
  sun: "bg-sun-500",
  grape: "bg-grape-500",
  ink: "bg-ink-800",
} as const;

/** Thẻ số liệu — một dải màu bên trái, không rải gradient pastel. */
export function StatCard({
  label,
  value,
  sub,
  tone = "lime",
  icon: Icon,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: keyof typeof STAT_ACCENT;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-black/[.05] bg-white p-4 shadow-card">
      <i className={cn("absolute inset-y-0 left-0 w-1", STAT_ACCENT[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="text-sm font-semibold text-ink-500">{label}</div>
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sand text-ink-500">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-1.5 pl-2 font-display text-[1.45rem] font-black leading-none tracking-tight text-ink-900">
        {value}
      </div>
      {sub && (
        <div
          className={cn(
            "mt-2 pl-2 text-xs font-semibold",
            trend === "up" && "text-sun-700",
            trend === "down" && "text-coral-600",
            !trend && "text-ink-400"
          )}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Số liệu chính của ngày — một chỗ nổi, phần còn lại im. */
export function HeroMetric({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="relative h-full overflow-hidden rounded-3xl border border-black/[.05] bg-white px-5 py-5 shadow-card sm:px-6 sm:py-6">
      <i className="absolute inset-y-0 left-0 w-1.5 bg-coral-500" aria-hidden />
      <div className="relative flex min-h-0 flex-wrap items-end justify-between gap-3 pl-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-500">{label}</div>
          <div className="mt-1.5 font-display text-3xl font-black leading-none tracking-tight text-ink-900 sm:text-4xl">
            {value}
          </div>
          {sub && <div className="mt-2 text-sm font-semibold text-ink-500">{sub}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}

const SECTION_RAIL = {
  coral: "bg-coral-500",
  sun: "bg-sun-500",
  grape: "bg-grape-500",
  ink: "bg-ink-800",
} as const;

/** Một khu chức năng: thẻ trắng, tiêu đề có chấm màu nhận diện, thân cuộn riêng. */
export function Section({
  title,
  desc,
  actions,
  accent = "coral",
  fill = false,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  desc?: string;
  actions?: React.ReactNode;
  accent?: keyof typeof SECTION_RAIL;
  fill?: boolean;
  /** Thanh nút đứng yên ở đáy khung, không cuộn theo nội dung. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.06]",
        fill && "h-full",
        className
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold leading-tight text-ink-900">
            <i className={cn("h-2 w-2 shrink-0 rounded-full", SECTION_RAIL[accent])} aria-hidden />
            {title}
          </h2>
          {desc && <p className="mt-0.5 text-xs text-ink-500">{desc}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5", bodyClassName)}>
        {children}
      </div>
      {footer && (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Khối trắng có tiêu đề — biểu đồ, danh sách phụ, nhóm cấu hình. */
export function Panel({
  title,
  desc,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  desc?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.06]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-bold text-ink-900">{title}</h2>}
            {desc && <p className="mt-0.5 text-xs text-ink-500">{desc}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
