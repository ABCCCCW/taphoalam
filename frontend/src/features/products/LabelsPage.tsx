import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { Barcode, Minus, Plus, Printer } from "lucide-react";
import { staffApi } from "../../api/client";
import { vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import Button from "../../components/ui/Button";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader, Panel, SearchInput } from "../../components/ui/Page";
import { useToast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";

const MAX_COPIES = 120;

/** Một con tem: tên, mã vạch, giá. Khổ 50×30mm cho máy in tem để bàn. */
function Label({ name, price, barcode }: { name: string; price: number; barcode?: string | null }) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svg.current || !barcode) return;
    try {
      JsBarcode(svg.current, barcode, {
        width: 1.2,
        height: 34,
        fontSize: 10,
        displayValue: true,
        margin: 0,
      });
    } catch {
      /* Mã không đúng chuẩn EAN/CODE128 thì bỏ phần vạch, vẫn in tên và giá. */
    }
  }, [barcode]);

  return (
    <div className="flex h-[110px] w-[180px] break-inside-avoid flex-col items-center justify-between border border-ink-300 bg-white p-1.5 text-center">
      <div className="line-clamp-2 text-[11px] font-bold leading-tight text-ink-900">{name}</div>
      {barcode ? (
        <svg ref={svg} />
      ) : (
        <div className="text-[9px] font-bold uppercase text-ink-400">chưa có mã vạch</div>
      )}
      <div className="font-display text-sm font-black text-ink-900">{vnd(price)}</div>
    </div>
  );
}

export default function LabelsPage() {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [copies, setCopies] = useState(10);
  const [sheet, setSheet] = useState<{ name: string; price: number; barcode?: string | null; copies: number } | null>(
    null
  );
  const wantPrint = useRef(false);

  const list = useQuery({
    queryKey: ["prods", term],
    queryFn: () => staffApi.products({ q: term || undefined, size: 200 }),
  });
  const items = list.data?.items || [];

  /* Gọi print sau khi React đã vẽ xong tờ tem — in trước lúc vẽ thì ra trang trắng. */
  useEffect(() => {
    if (!sheet || !wantPrint.current) return;
    wantPrint.current = false;
    const t = window.setTimeout(() => window.print(), 120);
    return () => window.clearTimeout(t);
  }, [sheet]);

  const preview = useMemo(() => {
    if (!sheet) return [];
    return Array.from({ length: Math.min(sheet.copies, 12) });
  }, [sheet]);

  const build = async (print: boolean) => {
    if (!selected) return;
    const n = Math.max(1, Math.min(MAX_COPIES, Math.round(copies) || 1));
    try {
      const info = await staffApi.labels(selected.id, n);
      const next = {
        name: info.name || selected.name,
        price: Number(info.price ?? selected.sale_price),
        barcode: info.barcode ?? selected.barcode,
        copies: n,
      };
      if (!next.barcode) {
        toast.info(`${next.name} chưa có mã vạch — bấm cấp mã ở trang Hàng hoá trước nhé`);
      }
      wantPrint.current = print;
      setSheet(next);
    } catch (e) {
      toast.error(e);
    }
  };

  const bump = (d: number) => setCopies((c) => Math.max(1, Math.min(MAX_COPIES, (Math.round(c) || 1) + d)));

  return (
    <div>
      <PageHeader
        kicker="Kho hàng"
        title="In tem mã vạch"
      />

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr] lg:items-start">
        <Panel title="Chọn mặt hàng" bodyClassName="p-4 space-y-4">
          <SearchInput value={term} onChange={setTerm} placeholder="Tìm tên hoặc SKU…" className="sm:max-w-none" />

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {list.isPending ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)
            ) : !items.length ? (
              <EmptyState emoji="🏷️" title="Không tìm thấy mặt hàng nào" className="py-6" />
            ) : (
              items.map((p: any) => {
                const on = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelected(p);
                      const n = Math.max(1, Math.min(MAX_COPIES, Math.round(copies) || 1));
                      staffApi
                        .labels(p.id, n)
                        .then((info) => {
                          setSheet({
                            name: info.name || p.name,
                            price: Number(info.price ?? p.sale_price),
                            barcode: info.barcode ?? p.barcode,
                            copies: n,
                          });
                        })
                        .catch(() => setSheet(null));
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-2xl p-2 text-left transition",
                      on ? "bg-lime-100 ring-2 ring-lime-400" : "hover:bg-sand"
                    )}
                  >
                    <ProductImage
                      src={p.image_url}
                      emoji={p.emoji}
                      alt={p.name}
                      className="h-9 w-9 shrink-0 rounded-xl bg-white p-1"
                      emojiClassName="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-900">{p.name}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-400">
                        {p.barcode || "chưa có mã vạch"}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-sm font-black text-ink-900">{vnd(p.sale_price)}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-ink-100 pt-4">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Số tem</div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={Minus} onClick={() => bump(-1)} aria-label="Bớt một tem" />
              <input
                type="number"
                min={1}
                max={MAX_COPIES}
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
                onBlur={() => setCopies((c) => Math.max(1, Math.min(MAX_COPIES, Math.round(c) || 1)))}
                className="input w-20 py-2 text-center font-display text-lg font-black"
                aria-label="Số tem cần in"
              />
              <Button variant="ghost" size="sm" icon={Plus} onClick={() => bump(1)} aria-label="Thêm một tem" />
              <div className="ml-auto flex gap-1">
                {[10, 24, 48].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCopies(n)}
                    className="rounded-xl bg-ink-100 px-2.5 py-1.5 text-xs font-extrabold text-ink-600 transition hover:bg-ink-200"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="ghost" icon={Barcode} disabled={!selected} onClick={() => build(false)}>
              Xem trước
            </Button>
            <Button icon={Printer} disabled={!selected} onClick={() => build(true)}>
              In tem
            </Button>
          </div>
        </Panel>

        <Panel
          title="Xem trước"
          desc={sheet ? `${sheet.copies} con · hiện 12 con đầu` : undefined}
          bodyClassName="p-4"
        >
          {!sheet ? (
            <EmptyState
              emoji="🏷️"
              title={selected ? `Đã chọn ${selected.name}` : "Chưa chọn mặt hàng"}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {preview.map((_, i) => (
                <Label key={i} name={sheet.name} price={sheet.price} barcode={sheet.barcode} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Tờ in thật: đưa ra thẳng body để @media print ẩn được mọi thứ còn lại. */}
      {sheet &&
        createPortal(
          <div className="print-area print-only flex flex-wrap gap-2 p-2">
            {Array.from({ length: sheet.copies }).map((_, i) => (
              <Label key={i} name={sheet.name} price={sheet.price} barcode={sheet.barcode} />
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
