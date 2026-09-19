import { cn } from "../../lib/cn";
import { ErrorState, TableSkeleton } from "./Feedback";

export type Column<T> = {
  key: string;
  head: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Cột nhận diện hàng — làm tiêu đề thẻ khi xem trên điện thoại. */
  primary?: boolean;
  /** Không hiện trong thẻ điện thoại (thao tác phụ, cột nhiễu). */
  desktopOnly?: boolean;
  className?: string;
  headClassName?: string;
};

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Bỏ qua khi bấm đúng nút/link/ô nhập trong hàng — không nuốt cả dòng. */
function fromControl(e: React.SyntheticEvent) {
  const t = e.target;
  const el = t instanceof Element ? t : (t as Node).parentElement;
  if (!el) return false;
  const hit = el.closest("button, a, input, textarea, select, label");
  return !!(hit && (e.currentTarget as Element).contains(hit));
}

/**
 * Bảng dữ liệu dùng chung.
 *
 * Trên máy tính là bảng thường. Dưới 768px bảng đổi thành danh sách thẻ —
 * trước đây các trang quản trị bắt cuộn ngang một bảng 6 cột trên điện thoại,
 * nhân viên kho gần như không dùng nổi.
 */
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  loading,
  error,
  onRetry,
  empty,
  footer,
  className,
}: {
  rows?: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("tbl-wrap", className)}>
        <TableSkeleton rows={6} cols={Math.min(columns.length, 5)} />
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn("tbl-wrap", className)}>
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (!rows?.length) {
    return <div className={cn("tbl-wrap", className)}>{empty}</div>;
  }

  const card = columns.filter((c) => !c.desktopOnly);
  const title = columns.find((c) => c.primary) || columns[0];
  const actions = columns.filter((c) => c.desktopOnly);

  return (
    <div className={cn("tbl-wrap", className)}>
      {/* Máy tính */}
      <div className="hidden overflow-x-auto md:block">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn(ALIGN[c.align || "left"], c.headClassName)}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick ? "Xem chi tiết" : undefined}
                onClick={
                  onRowClick
                    ? (e) => {
                        if (fromControl(e)) return;
                        onRowClick(row);
                      }
                    : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (fromControl(e)) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn(ALIGN[c.align || "left"], c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Điện thoại */}
      <ul className="list-rows md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={
              onRowClick
                ? (e) => {
                    if (fromControl(e)) return;
                    onRowClick(row);
                  }
                : undefined
            }
            className={cn("px-4 py-3.5", onRowClick && "cursor-pointer active:bg-lime-50")}
          >
            <div className="font-bold text-ink-900">{title.cell(row)}</div>
            <dl className="mt-2 grid gap-1.5">
              {card
                .filter((c) => c.key !== title.key)
                .map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-400">{c.head}</dt>
                    <dd className="min-w-0 text-right text-sm text-ink-800">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
            {actions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{actions.map((c) => c.cell(row))}</div>
            )}
          </li>
        ))}
      </ul>

      {footer && <div className="border-t-2 border-ink-200 bg-sand px-4 py-3">{footer}</div>}
    </div>
  );
}
