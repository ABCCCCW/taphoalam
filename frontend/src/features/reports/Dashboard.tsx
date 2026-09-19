import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlarmClock, ArrowRight, CalendarX, ChevronDown, PackageMinus, PackageX, Receipt, Truck } from "lucide-react";
import { staffApi } from "../../api/client";
import { day, num, vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import { PageHeader, Section } from "../../components/ui/Page";
import { ErrorState, Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";
import { cn } from "../../lib/cn";

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
    <ul className="list-rows max-h-72 overflow-y-auto">
      {lots.map((lot) => (
        <li key={lot.id} className="flex items-center gap-2.5 px-4 py-2.5">
          <ProductImage
            src={lot.image_url}
            emoji={lot.emoji}
            alt={lot.name}
            className="h-8 w-8 shrink-0"
            emojiClassName="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sand text-sm"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-900">{lot.name}</span>
          <span className={`shrink-0 text-[11px] font-semibold ${lot.status === "expired" ? "text-coral-600" : "text-sun-700"}`}>
            {whenExpires(lot.days, lot.expiry_date)} · {num(lot.quantity)}
          </span>
          <button
            type="button"
            onClick={() => onPullOff(lot)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-coral-500 px-3 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-coral-600 active:scale-95"
          >
            <PackageMinus className="h-3.5 w-3.5" />
            Bỏ kệ
          </button>
        </li>
      ))}
    </ul>
  );
}

const TONE = {
  coral: { icon: "bg-coral-100 text-coral-600", rail: "bg-coral-500", on: "ring-2 ring-coral-200" },
  sun: { icon: "bg-sun-100 text-sun-700", rail: "bg-sun-500", on: "ring-2 ring-sun-500/40" },
  grape: { icon: "bg-grape-100 text-grape-700", rail: "bg-grape-500", on: "ring-2 ring-grape-500/40" },
} as const;

export default function Dashboard() {
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["dash"], queryFn: staffApi.dashboard, refetchInterval: 60_000 });
  const [open, setOpen] = useState<"expired" | "expiring" | null>(null);

  if (q.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader className="mb-0" title="Tổng quan" />
        <Skeleton className="h-64 rounded-[1.75rem]" />
        <Skeleton className="h-56 rounded-[1.75rem]" />
      </div>
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

  const chores: {
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    hint: string;
    n: number;
    tone: keyof typeof TONE;
    to?: string;
    fold?: "expired" | "expiring";
  }[] = [
    expired.length > 0 && {
      key: "expired",
      icon: CalendarX,
      title: "Hết hạn",
      hint: "Bỏ khỏi kệ ngay",
      n: expired.length,
      tone: "coral" as const,
      fold: "expired" as const,
    },
    expiring.length > 0 && {
      key: "expiring",
      icon: AlarmClock,
      title: "Sắp hết hạn",
      hint: "Bấm để xem món",
      n: expiring.length,
      tone: "sun" as const,
      fold: "expiring" as const,
    },
    d.online_pending > 0 && {
      key: "online",
      icon: Truck,
      title: "Đơn online",
      hint: "Đang chờ soạn",
      n: d.online_pending,
      tone: "coral" as const,
      to: "/admin/online",
    },
    d.cost_pending > 0 && {
      key: "cost",
      icon: Receipt,
      title: "Chờ giá vốn",
      hint: "Chốt trên Hàng hoá",
      n: d.cost_pending,
      tone: "sun" as const,
      to: "/admin/products",
    },
    d.low_stock > 0 && {
      key: "low",
      icon: PackageX,
      title: "Sắp hết hàng",
      hint: "Cần nhập thêm",
      n: d.low_stock,
      tone: "grape" as const,
      to: "/admin/inventory",
    },
  ].filter(Boolean) as any[];

  const openLots = open === "expired" ? expired : open === "expiring" ? expiring : [];

  const salesBits = [
    { label: "Số đơn", value: num(d.orders_today), hint: null as string | null },
    { label: "Tiền mặt", value: vnd(d.cash_amount), hint: d.qr_amount ? `CK ${vnd(d.qr_amount)}` : null },
    d.profit_today != null
      ? { label: "Lãi gộp", value: vnd(d.profit_today), hint: null }
      : { label: "Sắp hết hàng", value: num(d.low_stock), hint: "món dưới mức" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Tổng quan"
        actions={
          <Link to="/admin/reports" className="btn-ghost">
            Báo cáo <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <Section
        title="Bán hôm nay"
        actions={
          <Link to="/pos" className="btn-coral">
            Ra quầy bán
          </Link>
        }
      >
        <div className="rounded-2xl bg-coral-50 px-5 py-5 ring-1 ring-coral-100 sm:px-6">
          <div className="text-sm font-extrabold text-coral-600">Doanh thu</div>
          <div className="mt-1.5 font-display text-[2rem] font-black leading-none tracking-tight text-ink-900 sm:text-4xl">
            {vnd(d.revenue_today)}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {salesBits.map((bit) => (
            <div key={bit.label} className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/[.05]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{bit.label}</div>
              <div className="mt-1.5 font-display text-xl font-black leading-none text-ink-900">{bit.value}</div>
              {bit.hint && <div className="mt-1.5 text-[11px] font-semibold text-ink-400">{bit.hint}</div>}
            </div>
          ))}
        </div>
      </Section>

      {chores.length > 0 && (
        <Section title="Cần làm" accent="sun">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chores.map((c) => {
              const Icon = c.icon;
              const expanded = c.fold && open === c.fold;
              const tone = TONE[c.tone];
              const inner = (
                <>
                  <i className={cn("absolute inset-y-0 left-0 w-1.5", tone.rail)} aria-hidden />
                  <div className="flex items-start justify-between gap-3 pl-2">
                    <span className={cn("grid h-10 w-10 place-items-center rounded-2xl", tone.icon)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-display text-3xl font-black leading-none text-ink-900">{c.n}</span>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-2 pl-2">
                    <div>
                      <div className="text-sm font-extrabold text-ink-900">{c.title}</div>
                      <div className="mt-0.5 text-xs font-semibold text-ink-500">{c.hint}</div>
                    </div>
                    {c.fold && (
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition", expanded && "rotate-180")} />
                    )}
                  </div>
                </>
              );
              const cls = cn(
                "relative h-full overflow-hidden rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/[.05] transition hover:ring-black/[.12]",
                expanded && tone.on
              );
              return c.fold ? (
                <button key={c.key} type="button" aria-expanded={!!expanded} onClick={() => setOpen((cur) => (cur === c.fold ? null : c.fold))} className={cls}>
                  {inner}
                </button>
              ) : (
                <Link key={c.key} to={c.to} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
          {openLots.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[.05]">
              <div className="border-b border-ink-100 px-4 py-3 text-sm font-extrabold text-ink-900">
                {open === "expired" ? "Hết hạn — bỏ khỏi kệ" : "Sắp hết hạn"}
              </div>
              <LotRows lots={openLots} onPullOff={pullOff} />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
