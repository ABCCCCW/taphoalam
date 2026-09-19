import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import ReportModal from "./ReportModal";
import { AlarmClock, ArrowRight, Banknote, BarChart3, CalendarX, ChevronRight, PackageMinus, PackageX, Receipt, Store, Truck, Wallet } from "lucide-react";
import { staffApi } from "../../api/client";
import { dateFull, day, expiryNote, num, vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import { PageBody, PageFrame, PageHeader } from "../../components/ui/Page";
import { C, Card, DeltaChip, Kpi, NoData, SplitBar } from "./kit";
import { ErrorState, Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";
import { cn } from "../../lib/cn";
import { look, ORDER_STATUS, TONE_CLASS } from "../../lib/labels";
import { PendingRow } from "../products/ProductsPage";

function whenExpires(days: number | null | undefined, expiry: string | null | undefined) {
  if (days == null) return expiry ? `Hạn ngày ${day(expiry)}` : "";
  if (days < -1) return `Hết hạn ${Math.abs(days)} ngày`;
  if (days === -1) return "Hết hạn hôm qua";
  if (days === 0) return "Hết hạn hôm nay";
  if (days === 1) return "Ngày mai hết hạn";
  return `Còn ${days} ngày`;
}

function LotRows({ lots, onPullOff }: { lots: any[]; onPullOff: (lot: any) => void }) {
  return (
    <ul className="-my-1 divide-y divide-ink-100">
      {lots.map((lot) => {
        const expired = lot.status === "expired";
        // Quá hạn hoặc còn ≤ 2 ngày thì đỏ, còn lại vàng
        const urgent = expired || (lot.days != null && lot.days <= 2);
        return (
          <li key={lot.id} className="flex items-center gap-3 py-2.5">
            <Thumb src={lot.image_url} emoji={lot.emoji} name={lot.name} className="h-10 w-10 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-ink-900">{lot.name}</div>
              <div className="text-xs tabular-nums text-ink-500">
                Còn {num(lot.quantity)} trên kệ · HSD {dateFull(lot.expiry_date)}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                urgent ? "bg-coral-50 text-coral-600" : "bg-sun-50 text-sun-700"
              )}
            >
              {expiryNote(lot.days)}
            </span>
            <button
              type="button"
              onClick={() => onPullOff(lot)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition active:scale-95",
                expired
                  ? "bg-coral-500 text-white hover:bg-coral-600"
                  : "border border-ink-200 text-ink-700 hover:border-coral-200 hover:bg-coral-50 hover:text-coral-700"
              )}
            >
              <PackageMinus className="h-3.5 w-3.5" />
              Bỏ kệ
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type ChoreKey = "expired" | "expiring" | "online" | "cost" | "low";

const TONE = {
  coral: {
    icon: "bg-coral-100 text-coral-600",
    solid: "bg-coral-500 text-white",
    rail: "bg-coral-500",
    active: "bg-coral-50 ring-coral-200",
    pill: "bg-coral-500 text-white",
  },
  sun: {
    icon: "bg-sun-100 text-sun-700",
    solid: "bg-sun-500 text-white",
    rail: "bg-sun-500",
    active: "bg-sun-50 ring-sun-500/30",
    pill: "bg-sun-500 text-white",
  },
  grape: {
    icon: "bg-grape-100 text-grape-700",
    solid: "bg-grape-500 text-white",
    rail: "bg-grape-500",
    active: "bg-grape-50 ring-grape-500/25",
    pill: "bg-grape-500 text-white",
  },
} as const;

export default function Dashboard() {
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["dash"], queryFn: staffApi.dashboard, refetchInterval: 60_000 });
  const pending = useQuery({ queryKey: ["pending-cost"], queryFn: staffApi.pendingCost });
  const [open, setOpen] = useState<ChoreKey | null>(null);
  // ?report=1 — đường cũ /admin/reports chuyển về đây và mở sẵn báo cáo
  const [sp, setSp] = useSearchParams();
  const showReport = sp.get("report") === "1";
  const setShowReport = (on: boolean) => {
    const next = new URLSearchParams(sp);
    if (on) next.set("report", "1");
    else next.delete("report");
    setSp(next, { replace: true });
  };

  if (q.isPending) {
    return (
      <PageFrame>
        <PageHeader className="mb-0" title="Tổng quan" />
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-[1.75rem] lg:h-full" />
          <Skeleton className="min-h-0 flex-1 rounded-[1.75rem]" />
        </div>
      </PageFrame>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const d = q.data;
  const expired = d.expired || [];
  const expiring = d.expiring || [];

  const pullOff = async (lot: any) => {
    const ok = await confirm({
      title: `Bỏ ${lot.name} khỏi kệ?`,
      body: (
        <>
          {whenExpires(lot.days, lot.expiry_date)}. Còn <b>{num(lot.quantity)}</b> trên kệ — bỏ đi thì trừ tồn, ghi sổ hàng hết hạn.
        </>
      ),
      confirmText: "Bỏ khỏi kệ",
      danger: true,
    });
    if (!ok) return;
    try {
      await staffApi.writeOffBatch(lot.id);
      toast.success(`Đã bỏ ${lot.name} khỏi kệ`);
      q.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  const lowItems: any[] = d.low_stock_items || [];
  const onlineItems: any[] = d.online_items || [];
  const costItems: any[] = pending.data?.items || [];

  const chores = (
    [
      expired.length > 0 && { key: "expired", icon: CalendarX, title: "Hết hạn", n: expired.length, tone: "coral" },
      expiring.length > 0 && { key: "expiring", icon: AlarmClock, title: "Sắp hết hạn", n: expiring.length, tone: "sun" },
      d.online_pending > 0 && { key: "online", icon: Truck, title: "Đơn online", n: d.online_pending, tone: "coral" },
      d.cost_pending > 0 && { key: "cost", icon: Receipt, title: "Chờ giá vốn", n: d.cost_pending, tone: "sun" },
      d.low_stock > 0 && { key: "low", icon: PackageX, title: "Sắp hết hàng", n: d.low_stock, tone: "grape" },
    ] as const
  ).filter(Boolean) as unknown as {
    key: ChoreKey;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    n: number;
    tone: keyof typeof TONE;
  }[];

  const approve = async (o: any) => {
    try {
      await staffApi.confirmOnline(o.id);
      toast.success(`Đã duyệt đơn ${o.code}`);
      q.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  // Chọn một việc bên trái thì danh sách chi tiết hiện ở khung bên phải; danh sách việc
  // không bao giờ bị đẩy đi hay che mất. Mặc định mở việc gấp nhất đang có.
  const sel: ChoreKey | null = (open && chores.some((c) => c.key === open) ? open : chores[0]?.key) ?? null;
  const selLots = sel === "expired" ? expired : sel === "expiring" ? expiring : [];
  const DETAIL: Record<ChoreKey, { title: string; desc: string; accent: keyof typeof TONE }> = {
    expired: { title: "Lô đã hết hạn", desc: `${num(expired.length)} lô · bỏ khỏi kệ để không bán nhầm`, accent: "coral" },
    expiring: { title: "Lô sắp hết hạn", desc: `${num(expiring.length)} lô · nên bán trước hoặc giảm giá`, accent: "sun" },
    online: { title: "Đơn online đang chờ", desc: `${num(onlineItems.length)} đơn · duyệt ngay tại đây`, accent: "coral" },
    cost: { title: "Hàng chờ giá vốn", desc: "Hàng ngoài quầy đã bán · điền giá vốn để báo cáo lãi đúng", accent: "sun" },
    low: { title: "Hàng sắp hết", desc: `${num(lowItems.length)} món · dưới mức tồn tối thiểu`, accent: "grape" },
  };
  const vsYesterday =
    d.revenue_yesterday > 0 ? Math.round(((d.revenue_today - d.revenue_yesterday) / d.revenue_yesterday) * 100) : null;

  const today = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const margin = d.revenue_today > 0 && d.profit_today != null ? Math.round((d.profit_today / d.revenue_today) * 100) : null;

  return (
    <PageFrame>
      <PageHeader
        className="mb-0"
        title="Tổng quan"
        desc={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={
          <>
            <button type="button" onClick={() => setShowReport(true)} className="btn-ghost h-10 rounded-xl px-3.5 text-sm">
              <BarChart3 className="h-4 w-4" /> Báo cáo
            </button>
            <Link to="/pos" className="btn-ink h-10 rounded-xl px-4 text-sm">
              <Store className="h-4 w-4" /> Mở quầy bán
            </Link>
          </>
        }
      />

      <PageBody className="gap-3 pb-4 xl:overflow-hidden">
        {/* Hôm nay */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="col-span-2 flex flex-col rounded-2xl bg-forest-900 p-4 text-white xl:col-span-1">
            <div className="flex items-center justify-between text-xs font-semibold text-white/60">
              Doanh thu hôm nay
              <DeltaChip value={vsYesterday} dark />
            </div>
            <div className="mt-2 font-display text-[1.9rem] font-black leading-none tracking-tight tabular-nums">{vnd(d.revenue_today)}</div>
            <div className="mt-1.5 text-xs text-white/55">Hôm qua {vnd(d.revenue_yesterday)}</div>
          </div>
          <Kpi label="Đơn hoàn tất" icon={Receipt} value={num(d.orders_today)} sub={d.orders_today ? `Trung bình ${vnd(d.aov)} / đơn` : "Chưa có đơn nào hôm nay"} />
          <Kpi
            label="Lãi gộp"
            icon={Banknote}
            value={d.profit_today != null ? vnd(d.profit_today) : "—"}
            sub={margin != null ? `Tỷ suất ${margin}% trên doanh thu` : "Chưa có doanh thu để tính"}
          />
          <Kpi label="Đã thu" icon={Wallet} value={vnd((d.cash_amount || 0) + (d.qr_amount || 0))}>
            <SplitBar
              parts={[
                { color: C.a, label: "Tiền mặt", value: d.cash_amount || 0 },
                { color: C.b, label: "Chuyển khoản", value: d.qr_amount || 0 },
              ]}
            />
          </Kpi>
        </div>

        {/* Bên trái chọn việc, bên phải xem chi tiết việc đó */}
        <div className="grid gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[23rem_minmax(0,1fr)]">
          <Card className="xl:min-h-0" bodyClassName="overflow-y-auto" title="Cần làm" sub={chores.length ? `${chores.length} việc đang chờ` : "Kệ và đơn đang ổn"}>
            {chores.length === 0 ? (
              <NoData title="Không có việc tồn" sub="Hàng còn hạn, đơn đã xử lý hết." />
            ) : (
              <div className="space-y-1">
                {chores.map((c) => {
                  const Icon = c.icon;
                  const active = sel === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setOpen(c.key)}
                      className={cn(
                        "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl py-2.5 pl-3.5 pr-3 text-left ring-1 transition",
                        active ? TONE[c.tone].active : "ring-transparent hover:bg-ink-50"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full transition", TONE[c.tone].rail, active ? "opacity-100" : "opacity-0")}
                      />
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl transition", active ? TONE[c.tone].solid : TONE[c.tone].icon)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">{c.title}</span>
                      <span
                        className={cn(
                          "grid h-7 min-w-[1.75rem] shrink-0 place-items-center rounded-full px-2 font-display text-sm font-black tabular-nums transition",
                          active ? TONE[c.tone].pill : "bg-ink-100 text-ink-700"
                        )}
                      >
                        {c.n}
                      </span>
                      <ChevronRight className={cn("h-4 w-4 shrink-0 transition", active ? "translate-x-0.5 text-ink-900" : "text-ink-300")} />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="min-h-[20rem] xl:min-h-0" bodyClassName="overflow-y-auto" title={
              sel ? (
                <span className="inline-flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", TONE[DETAIL[sel].accent].rail)} />
                  {DETAIL[sel].title}
                </span>
              ) : (
                "Chi tiết"
              )
            } sub={sel ? DETAIL[sel].desc : "Chọn một việc ở mục Cần làm"}>
            {!sel ? (
              <NoData title="Không có việc gì cần xử lý" sub="Kệ và đơn đang ổn." />
            ) : sel === "expired" || sel === "expiring" ? (
              selLots.length ? <LotRows lots={selLots} onPullOff={pullOff} /> : <NoData title="Không có lô nào cần bỏ" />
            ) : sel === "cost" ? (
              pending.isPending ? (
                <Skeleton className="h-32 rounded-xl" />
              ) : costItems.length ? (
                <div className="space-y-3">
                  {costItems.map((p) => (
                    <PendingRow
                      key={p.id}
                      p={p}
                      onDone={() => {
                        pending.refetch();
                        q.refetch();
                      }}
                    />
                  ))}
                </div>
              ) : (
                <NoData title="Đã chốt hết giá vốn" />
              )
            ) : sel === "low" ? (
              <ul className="divide-y divide-ink-100">
                {lowItems.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-2.5">
                    <Thumb src={it.image_url} emoji={it.emoji} name={it.name} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{it.name}</span>
                    <span className={cn("shrink-0 text-xs tabular-nums", it.quantity <= 0 ? "font-semibold text-coral-600" : "text-ink-500")}>
                      {it.quantity <= 0 ? "Hết sạch" : `Còn ${num(it.quantity)}`} · tối thiểu {num(it.min_stock)}
                    </span>
                  </li>
                ))}
                <li className="pt-3">
                  <Link to="/admin/receipts" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-700 hover:text-ink-900">
                    Tạo phiếu nhập hàng <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            ) : (
              <ul className="divide-y divide-ink-100">
                {onlineItems.map((o) => {
                  const st = look(ORDER_STATUS, o.status);
                  return (
                    <li key={o.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink-900">
                          {o.code} · {o.customer_name || "Khách"}
                        </div>
                        <div className="text-xs tabular-nums text-ink-500">{vnd(o.total)}</div>
                      </div>
                      <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold", TONE_CLASS[st.tone])}>{st.label}</span>
                      {o.status === "PENDING_CONFIRM" && (
                        <button type="button" onClick={() => approve(o)} className="btn-ink h-8 rounded-lg px-3 text-xs">
                          Duyệt
                        </button>
                      )}
                    </li>
                  );
                })}
                <li className="pt-3">
                  <Link to="/admin/online" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-700 hover:text-ink-900">
                    Soạn hàng, giao hàng ở trang Đơn online <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            )}
          </Card>
        </div>
      
      </PageBody>
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
    </PageFrame>
  );
}

function Thumb({ src, emoji, name, className }: { src?: string; emoji?: string; name: string; className?: string }) {
  return (
    <span className={cn("relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-ink-50", className)}>
      <ProductImage
        src={src}
        emoji={emoji}
        alt={name}
        fit="cover"
        className="absolute inset-0 h-full w-full"
        emojiClassName="absolute inset-0 grid place-items-center text-sm"
      />
    </span>
  );
}
