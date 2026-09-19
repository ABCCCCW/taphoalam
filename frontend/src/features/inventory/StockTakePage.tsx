import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Eraser, Scale } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, when } from "../../lib/format";
import { DOC_STATUS } from "../../lib/labels";
import { useAuth } from "../../stores/authStore";
import ProductImage from "../../components/ui/ProductImage";
import Button from "../../components/ui/Button";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Skeleton, TableSkeleton } from "../../components/ui/Feedback";
import { PageHeader, Panel, SearchInput, Toolbar } from "../../components/ui/Page";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";
import { cn } from "../../lib/cn";

export default function StockTakePage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  /* Backend chỉ cho ADMIN cân bằng kho. Nhân viên kho đếm và lưu phiếu, chủ
     tiệm mới chốt — trước đây nút gộp làm một nên kho bấm là nhận 403 câm. */
  const canBalance = user?.role === "ADMIN";

  const [term, setTerm] = useState("");
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const inv = useQuery({ queryKey: ["inv-take"], queryFn: () => staffApi.inventory() });
  const takes = useQuery({ queryKey: ["takes"], queryFn: staffApi.stockTakes });

  const rows = useMemo(() => {
    const all = inv.data || [];
    const t = term.trim().toLowerCase();
    if (!t) return all;
    return all.filter((r: any) => String(r.name).toLowerCase().includes(t) || String(r.sku).toLowerCase().includes(t));
  }, [inv.data, term]);

  const sheet = useMemo(() => {
    const all = inv.data || [];
    return Object.entries(counted)
      .filter(([, v]) => v !== "")
      .map(([pid, v]) => {
        const row = all.find((r: any) => r.product_id === Number(pid));
        const system = Number(row?.quantity ?? 0);
        const actual = Number(v);
        return { product_id: Number(pid), name: row?.name || "", system, actual, diff: actual - system };
      });
  }, [counted, inv.data]);

  const off = sheet.filter((s) => s.diff !== 0);
  const short = off.filter((s) => s.diff < 0);
  const over = off.filter((s) => s.diff > 0);

  const submit = async (balance: boolean) => {
    if (!sheet.length) return;
    if (balance) {
      const ok = await confirm({
        title: "Cân bằng kho theo số vừa đếm?",
        body: (
          <>
            Đã đếm <b>{sheet.length}</b> mặt hàng, lệch <b>{off.length}</b> món
            {off.length > 0 && (
              <>
                {" "}
                (thiếu {num(short.reduce((s, x) => s + Math.abs(x.diff), 0))}, thừa{" "}
                {num(over.reduce((s, x) => s + x.diff, 0))})
              </>
            )}
            . Tồn kho sẽ được ghi lại đúng số đếm tay và mỗi món lệch ghi một dòng vào sổ cái. Việc này không hoàn lại
            được.
          </>
        ),
        confirmText: "Cân bằng kho",
        danger: off.length > 0,
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const take = await staffApi.createTake({
        items: sheet.map((s) => ({ product_id: s.product_id, actual_quantity: s.actual })),
      });
      if (balance) {
        const res = await staffApi.balanceTake(take.id);
        toast.success(`Đã cân bằng phiếu ${take.code}, lệch giá trị ${num(res.total_diff_value)}đ`);
      } else {
        toast.success(`Đã lưu phiếu kiểm kê ${take.code} · chờ chủ tiệm cân bằng`);
      }
      setCounted({});
      takes.refetch();
      inv.refetch();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const balanceExisting = async (t: any) => {
    const offCount = t.items?.filter((i: any) => i.diff !== 0).length || 0;
    const ok = await confirm({
      title: `Cân bằng phiếu ${t.code}?`,
      body: `Phiếu có ${t.items?.length || 0} mặt hàng, ${offCount} món lệch. Tồn kho sẽ được ghi lại theo số đã đếm.`,
      confirmText: "Cân bằng kho",
      danger: offCount > 0,
    });
    if (!ok) return;
    try {
      await staffApi.balanceTake(t.id);
      toast.success(`Đã cân bằng phiếu ${t.code}`);
      takes.refetch();
      inv.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Kho hàng"
        title="Kiểm kê"
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={term} onChange={setTerm} placeholder="Tìm mặt hàng cần đếm…" />
            {Object.keys(counted).length > 0 && (
              <Button variant="ghost" size="sm" icon={Eraser} onClick={() => setCounted({})}>
                Xoá số đã đếm
              </Button>
            )}
          </Toolbar>

          {inv.isPending ? (
            <div className="tbl-wrap">
              <TableSkeleton rows={8} cols={4} />
            </div>
          ) : !rows.length ? (
            <div className="card">
              <EmptyState
                emoji="🔍"
                title="Không tìm thấy mặt hàng"
                action={
                  <Button variant="ghost" onClick={() => setTerm("")}>
                    Xoá từ khoá
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="tbl-wrap">
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Mặt hàng</th>
                      <th className="text-right">Máy nói</th>
                      <th className="text-right">Đếm tay</th>
                      <th className="text-right">Lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => {
                      const raw = counted[r.product_id];
                      const touched = raw !== undefined && raw !== "";
                      const diff = touched ? Number(raw) - Number(r.quantity) : 0;
                      return (
                        <tr key={r.product_id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <ProductImage
                                src={r.image_url}
                                emoji={r.emoji}
                                alt={r.name}
                                className="h-9 w-9 shrink-0 rounded-xl bg-ink-50 p-1"
                                emojiClassName="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-lg"
                              />
                              <div className="min-w-0">
                                <div className="truncate font-bold text-ink-900">{r.name}</div>
                                <div className="truncate font-mono text-[11px] text-ink-400">{r.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right font-semibold text-ink-600">{num(r.quantity)}</td>
                          <td className="text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              inputMode="decimal"
                              placeholder="—"
                              aria-label={`Số đếm tay của ${r.name}`}
                              value={raw ?? ""}
                              onChange={(e) =>
                                setCounted((prev) => ({ ...prev, [r.product_id]: e.target.value }))
                              }
                              className={cn(
                                "input w-24 py-1.5 text-right font-bold",
                                touched && diff !== 0 && "border-coral-400 bg-coral-50"
                              )}
                            />
                          </td>
                          <td className="text-right">
                            {!touched ? (
                              <span className="text-ink-300">chưa đếm</span>
                            ) : diff === 0 ? (
                              <Badge tone="lime">khớp</Badge>
                            ) : (
                              <Badge tone="coral">
                                {diff > 0 ? "+" : ""}
                                {num(diff)}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-6">
          <Panel title="Phiếu đang đếm" bodyClassName="p-5 space-y-4">
            {!sheet.length ? (
              <p className="text-sm text-ink-500">Chưa đếm món nào.</p>
            ) : (
              <>
                <dl className="space-y-2 text-sm">
                  <Row label="Đã đếm" value={`${sheet.length} mặt hàng`} />
                  <Row label="Khớp số" value={`${sheet.length - off.length} món`} tone="lime" />
                  <Row label="Thiếu so với máy" value={num(short.reduce((s, x) => s + Math.abs(x.diff), 0))} tone="coral" />
                  <Row label="Thừa so với máy" value={num(over.reduce((s, x) => s + x.diff, 0))} tone="sun" />
                </dl>
                {off.length > 0 && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-sand/60 p-3 text-xs">
                    {off.map((s) => (
                      <li key={s.product_id} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-ink-600">{s.name}</span>
                        <span className={cn("shrink-0 font-black", s.diff < 0 ? "text-coral-600" : "text-sun-700")}>
                          {s.diff > 0 ? "+" : ""}
                          {num(s.diff)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="space-y-2">
              <Button
                block
                variant="ghost"
                icon={ClipboardCheck}
                disabled={!sheet.length}
                loading={busy}
                onClick={() => submit(false)}
              >
                Lưu phiếu
              </Button>
              {canBalance && (
                <Button block icon={Scale} disabled={!sheet.length} loading={busy} onClick={() => submit(true)}>
                  Lưu & cân bằng kho
                </Button>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-black text-ink-900">Phiếu kiểm kê trước</h2>
      {takes.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-3xl" />
          ))}
        </div>
      ) : !takes.data?.length ? (
        <div className="card">
          <EmptyState emoji="📋" title="Chưa có phiếu kiểm kê" />
        </div>
      ) : (
        <ul className="space-y-2">
          {takes.data.map((t: any) => {
            const offCount = t.items?.filter((i: any) => i.diff !== 0).length || 0;
            return (
              <li key={t.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-ink-900">{t.code}</span>
                    <StatusBadge map={DOC_STATUS} value={t.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {when(t.created_at)} · {t.items?.length || 0} mặt hàng ·{" "}
                    {offCount ? `${offCount} món lệch` : "khớp hết"}
                  </div>
                </div>
                {t.status === "DRAFT" && canBalance && (
                  <Button size="sm" icon={Scale} onClick={() => balanceExisting(t)}>
                    Cân bằng
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "lime" | "coral" | "sun" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd
        className={cn(
          "font-display font-black",
          tone === "lime" && "text-forest-700",
          tone === "coral" && "text-coral-600",
          tone === "sun" && "text-sun-700",
          !tone && "text-ink-900"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
