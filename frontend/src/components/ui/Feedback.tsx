import { AlertTriangle, RefreshCw } from "lucide-react";
import Button from "./Button";
import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-xl bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,#EEF1EA_25%,#F7F9F4_50%,#EEF1EA_75%)]",
        className
      )}
    />
  );
}

/** Khung xương cho bảng — giữ chiều cao để trang không nhảy khi dữ liệu về. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div>
      <div className="flex items-center gap-3 border-b-2 border-lime-400 bg-sand px-3.5 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={cn("h-2.5", c === 0 ? "w-28" : "ml-auto w-16")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={cn(
            "flex items-center gap-3 border-b border-ink-200 px-3.5 py-3 last:border-b-0",
            r % 2 === 1 && "bg-sand/70"
          )}
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          {Array.from({ length: cols - 1 }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5", c === 0 ? "flex-1" : "w-20")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-3xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  emoji = "🫙",
  title,
  desc,
  action,
  className,
}: {
  emoji?: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center px-6 py-14 text-center", className)}>
      <div>
        <div className="text-5xl">{emoji}</div>
        <p className="mt-3 font-display text-lg font-black text-ink-900">{title}</p>
        {desc && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{desc}</p>}
        {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

/** Hộp nhắc trong form / modal — không nhồi chữ sát nhau như một dòng phụ. */
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-ink-200 bg-ink-50 text-ink-700",
    warn: "border-sun-100 bg-sun-50 text-sun-700",
    danger: "border-coral-200 bg-coral-50 text-coral-700",
    ok: "border-lime-200 bg-lime-50 text-forest-800",
  };
  return (
    <div className={cn("rounded-2xl border px-4 py-3", tones[tone], className)}>
      {title && <p className="text-sm font-extrabold leading-snug text-ink-900">{title}</p>}
      {children != null && children !== false && (
        <div className={cn("text-sm leading-relaxed", title && "mt-1")}>{children}</div>
      )}
    </div>
  );
}

export function ErrorState({
  error,
  title = "Hỏng ở đâu rồi",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const msg = error instanceof Error ? error.message : "Không tải được dữ liệu";
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral-50 text-coral-500">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="mt-3 font-display text-lg font-black text-ink-900">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{msg}</p>
        {onRetry && (
          <Button variant="ghost" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Bọc một truy vấn react-query: tự lo khung xương, lỗi và trạng thái rỗng.
 * Nhờ vậy từng trang không phải tự viết lại ba nhánh này nữa.
 */
export function QueryState<T>({
  query,
  empty,
  skeleton,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: T; refetch: () => void };
  empty?: React.ReactNode;
  skeleton?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <>{skeleton ?? <TableSkeleton />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const data = query.data as T;
  const isEmpty = Array.isArray(data) ? data.length === 0 : data == null;
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children(data)}</>;
}
