import { Search, X } from "lucide-react";
import { cn } from "../../lib/cn";

/** Đầu trang quản trị: tiêu đề lớn, một câu mô tả, chỗ đặt nút chính. */
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
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-black/[.06] pb-5", className)}>
      <div className="min-w-0">
        {kicker && <div className="mb-1 text-sm font-semibold text-coral-600">{kicker}</div>}
        <h1 className="font-display text-[1.75rem] font-black leading-none tracking-tight text-ink-900 sm:text-[2rem]">
          {title}
        </h1>
        {desc && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Hàng công cụ trên bảng: ô tìm, bộ lọc, nút phụ. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>;
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
    <div className={cn("relative min-w-0 flex-1 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input py-2.5 pl-10 pr-9"
      />
      {value && (
        <button
          type="button"
          aria-label="Xoá tìm kiếm"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Nhóm nút lọc dạng viên thuốc. */
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
    <div className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-2xl bg-ink-100 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] font-bold transition",
              on ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-black",
                  on ? "bg-lime-400 text-forest-900" : "bg-ink-200 text-ink-600"
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

/** Một khu chức năng: thanh tiêu đề + dải màu, thân nền khác để khỏi dính các khối bên cạnh. */
export function Section({
  title,
  desc,
  actions,
  accent = "coral",
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  desc?: string;
  actions?: React.ReactNode;
  accent?: keyof typeof SECTION_RAIL;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden rounded-[1.75rem] border border-black/[.07] bg-white shadow-card", className)}>
      <i className={cn("absolute inset-y-0 left-0 w-1.5", SECTION_RAIL[accent])} aria-hidden />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[.06] bg-sand py-3.5 pl-6 pr-4 sm:pl-7 sm:pr-5">
        <div className="min-w-0">
          <h2 className="font-display text-base font-black leading-tight text-ink-900">{title}</h2>
          {desc && <p className="mt-0.5 text-xs font-semibold text-ink-500">{desc}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("bg-[#FFF9F1] p-4 sm:p-5", bodyClassName)}>{children}</div>
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
    <section className={cn("relative overflow-hidden rounded-[1.75rem] border border-black/[.07] bg-white shadow-card", className)}>
      {(title || actions) && (
        <>
          <i className="absolute inset-y-0 left-0 w-1.5 bg-coral-500" aria-hidden />
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[.06] bg-sand py-3.5 pl-6 pr-4 sm:pl-7 sm:pr-5">
            <div className="min-w-0">
              {title && <h2 className="font-display text-base font-black text-ink-900">{title}</h2>}
              {desc && <p className="mt-0.5 text-xs font-semibold text-ink-500">{desc}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </header>
        </>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
