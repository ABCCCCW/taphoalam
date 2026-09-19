import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { staffApi } from "../../api/client";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { ErrorState, Skeleton } from "../../components/ui/Feedback";
import { Segmented } from "../../components/ui/Page";
import { useToast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { C, DeltaChip, Legend, NoData, TrendChart, delta, dm, num, vnd } from "./kit";

const RANGES = [
  { value: 7, label: "7 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
];

/** Báo cáo doanh thu gọn, mở nổi trên Tổng quan. Chi tiết đầy đủ nằm trong file Excel. */
export default function ReportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["report-summary", days], queryFn: () => staffApi.summary(days), placeholderData: (p) => p });
  const d = q.data;
  const t = d?.totals;
  const p = d?.previous;
  const top: any[] = (d?.products || []).slice(0, 8);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      await staffApi.exportReport(days);
    } catch (e) {
      toast.error(e, "Chưa xuất được file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="2xl"
      onClose={onClose}
      title="Báo cáo doanh thu"
      subtitle={d ? `${dm(d.from)} – ${dm(d.to)}/${d.to.slice(0, 4)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="ink" icon={FileSpreadsheet} loading={busy} disabled={!d} onClick={exportXlsx}>
            Xuất Excel
          </Button>
        </>
      }
    >
      <div className={cn("space-y-4 transition-opacity", q.isFetching && q.isPlaceholderData && "opacity-60")}>
        <Segmented value={days} onChange={setDays} options={RANGES} />

        {q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : !d ? (
          <Skeleton className="h-80 rounded-2xl" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Doanh thu" value={vnd(t.revenue)} chip={<DeltaChip value={delta(t.revenue, p.revenue)} />} />
              <Stat label="Lãi gộp" value={vnd(t.profit)} chip={<DeltaChip value={delta(t.profit, p.profit)} />} />
              <Stat label="Số đơn" value={num(t.orders)} chip={<DeltaChip value={delta(t.orders, p.orders)} />} />
              <Stat label="Trung bình mỗi đơn" value={vnd(t.aov)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-2xl ring-1 ring-black/[.06] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-900">Doanh thu theo ngày</h3>
                  <Legend items={[{ color: C.a, label: "Quầy" }, { color: C.b, label: "Website" }]} />
                </div>
                {t.orders ? <TrendChart data={d.daily} height={250} /> : <NoData />}
              </div>

              <div className="rounded-2xl ring-1 ring-black/[.06] p-4">
                <h3 className="mb-2 text-sm font-bold text-ink-900">Bán nhiều nhất</h3>
                {top.length ? (
                  <ol className="divide-y divide-ink-100">
                    {top.map((r, i) => (
                      <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                        <span className="w-4 shrink-0 text-xs tabular-nums text-ink-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{r.name}</span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="block font-semibold text-ink-900">{vnd(r.revenue)}</span>
                          <span className="block text-[11px] text-ink-500">{num(r.qty)} đã bán</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <NoData title="Chưa bán món nào" />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, chip }: { label: string; value: string; chip?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-ink-50/70 p-3.5">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-xl font-black leading-none tabular-nums text-ink-900">{value}</span>
        {chip}
      </div>
    </div>
  );
}
