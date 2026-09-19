import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Coins, PiggyBank, TrendingUp, Warehouse } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader, Panel, Section, Segmented, StatCard, Toolbar } from "../../components/ui/Page";

const short = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
};

const dayShort = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function ReportsPage() {
  const [days, setDays] = useState(7);
  const [showAll, setShowAll] = useState(false);

  const rev = useQuery({ queryKey: ["revenue"], queryFn: staffApi.revenue });
  const profit = useQuery({ queryKey: ["profit"], queryFn: staffApi.profit });
  const val = useQuery({ queryKey: ["inv-value"], queryFn: staffApi.invValue });

  /* Backend trả toàn bộ lịch sử; cắt khoảng ngay trên máy để đổi mốc không phải gọi lại. */
  const series = useMemo(() => {
    const all = rev.data || [];
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    return all
      .filter((r: any) => new Date(r.date) >= from)
      .map((r: any) => ({ ...r, label: dayShort(r.date) }));
  }, [rev.data, days]);

  const totals = useMemo(
    () => ({
      revenue: series.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0),
      orders: series.reduce((s: number, r: any) => s + Number(r.orders || 0), 0),
      pos: series.reduce((s: number, r: any) => s + Number(r.pos || 0), 0),
      online: series.reduce((s: number, r: any) => s + Number(r.online || 0), 0),
    }),
    [series]
  );

  const shelfMargin = Number(val.data?.sale_value || 0) - Number(val.data?.cost_value || 0);
  const profitRows = profit.data || [];
  const shown = showAll ? profitRows : profitRows.slice(0, 20);

  const columns: Column<any>[] = [
    { key: "name", head: "Mặt hàng", primary: true, cell: (r) => <span className="font-bold text-ink-900">{r.name}</span> },
    { key: "qty", head: "Đã bán", align: "right", cell: (r) => <span className="text-ink-600">{num(r.qty)}</span> },
    {
      key: "rev",
      head: "Doanh thu",
      align: "right",
      cell: (r) => <span className="font-semibold text-ink-900">{vnd(r.revenue)}</span>,
    },
    { key: "cost", head: "Giá vốn", align: "right", cell: (r) => <span className="text-ink-500">{vnd(r.cost)}</span> },
    {
      key: "profit",
      head: "Lãi gộp",
      align: "right",
      cell: (r) => (
        <span className={`font-display font-black ${Number(r.profit) < 0 ? "text-coral-600" : "text-forest-700"}`}>
          {vnd(r.profit)}
        </span>
      ),
    },
    {
      key: "margin",
      head: "Tỷ suất",
      align: "right",
      cell: (r) => {
        const m = Number(r.revenue) > 0 ? (Number(r.profit) / Number(r.revenue)) * 100 : 0;
        return <Badge tone={m < 0 ? "coral" : m < 10 ? "sun" : "lime"}>{m.toFixed(0)}%</Badge>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        kicker="Sổ sách"
        title="Báo cáo"
      />

      <Section title="Tóm tắt" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {val.isPending ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          ) : (
            <>
              <StatCard
                label={`Doanh thu ${days} ngày`}
                value={vnd(totals.revenue)}
                icon={TrendingUp}
                sub={`${num(totals.orders)} đơn · quầy ${vnd(totals.pos)}`}
              />
              <StatCard label="Vốn đang nằm trên kệ" value={vnd(val.data?.cost_value)} tone="sky" icon={Warehouse} sub="theo giá vốn bình quân" />
              <StatCard
                label="Bán hết kệ sẽ thu"
                value={vnd(val.data?.sale_value)}
                tone="sun"
                icon={Coins}
                sub="tính theo giá bán hiện tại"
              />
              <StatCard label="Lãi tiềm năng trên kệ" value={vnd(shelfMargin)} tone="ink" icon={PiggyBank} sub="chênh giữa giá bán và giá vốn" />
            </>
          )}
        </div>
      </Section>

      <Panel
        className="mb-5"
        title="Doanh thu theo ngày"
        actions={
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7 ngày" },
              { value: 30, label: "30 ngày" },
              { value: 90, label: "90 ngày" },
            ]}
          />
        }
        bodyClassName="p-3 pr-4 sm:p-4"
      >
        {rev.isPending ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : !series.length ? (
          <EmptyState
            emoji="📉"
            title="Khoảng này chưa có đơn nào hoàn tất"
            action={
              days < 90 ? (
                <Button variant="ghost" onClick={() => setDays(90)}>
                  Xem 90 ngày
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="4 6" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: "#94A3B8" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={short}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fontWeight: 700, fill: "#94A3B8" }}
                />
                <Tooltip
                  formatter={(v: any, name: any) => [vnd(Number(v)), name]}
                  labelFormatter={(l) => `Ngày ${l}`}
                  cursor={{ fill: "rgba(24,24,27,.06)" }}
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 18px 40px -20px rgba(15,23,42,.35)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, fontWeight: 700 }}
                />
                <Bar dataKey="pos" fill="#3F3F46" name="Quầy" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="online" fill="#FF5A3C" name="Website" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Toolbar className="mb-3 justify-between">
        <h2 className="font-display text-lg font-black text-ink-900">Lãi gộp theo mặt hàng</h2>
        {profitRows.length > 20 && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Chỉ xem 20 món đầu" : `Xem hết ${profitRows.length} món`}
          </Button>
        )}
      </Toolbar>

      <DataTable
        rows={shown}
        columns={columns}
        rowKey={(r) => r.name}
        loading={profit.isPending}
        error={profit.isError ? profit.error : undefined}
        onRetry={profit.refetch}
        empty={
          <EmptyState
            emoji="🧮"
            title="Chưa có đơn hoàn tất nào để tính lãi"
          />
        }
        footer={
          shown.length > 0 && (
            <span className="text-xs font-semibold text-ink-500">
              Xếp theo lãi gộp giảm dần
            </span>
          )
        }
      />
    </div>
  );
}
