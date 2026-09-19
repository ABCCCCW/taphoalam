import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import JsBarcode from "jsbarcode";
import { Barcode, Check, Plus, Printer, Trash2 } from "lucide-react";
import { staffApi } from "../../api/client";
import { dateFull, num, vnd } from "../../lib/format";
import ProductImage from "../../components/ui/ProductImage";
import Button from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Feedback";
import { PageFrame, PageHeader, SearchInput, Section } from "../../components/ui/Page";
import { useToast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";

const MAX_COPIES = 200;

/** Một dòng in: một lô (mã tem lô + HSD) hoặc một mặt hàng chưa có lô. */
type Job = {
  key: string;
  product_id: number;
  name: string;
  price: number;
  barcode?: string | null;
  expiry_date?: string | null;
  image_url?: string | null;
  emoji?: string;
  copies: number;
};

/** Một con tem 50×30mm cho máy in tem để bàn: tên, mã vạch, giá. */
function Label({ name, price, barcode, expiry }: { name: string; price: number; barcode?: string | null; expiry?: string | null }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svg.current || !barcode) return;
    try {
      JsBarcode(svg.current, barcode, { width: 1.2, height: 34, fontSize: 10, displayValue: true, margin: 0 });
    } catch {
      /* Mã không đúng chuẩn thì bỏ phần vạch, vẫn in tên và giá. */
    }
  }, [barcode]);
  return (
    <div className="flex h-[110px] w-[180px] break-inside-avoid flex-col items-center justify-between border border-ink-300 bg-white p-1.5 text-center">
      <div className="line-clamp-2 text-[11px] font-bold leading-tight text-ink-900">{name}</div>
      {barcode ? <svg ref={svg} /> : <div className="text-[9px] font-bold uppercase text-ink-400">chưa có mã vạch</div>}
      <div className="flex w-full items-baseline justify-between px-0.5">
        <span className="text-[9px] font-semibold text-ink-700">{expiry ? `HSD ${dateFull(expiry)}` : ""}</span>
        <span className="font-display text-sm font-black text-ink-900">{vnd(price)}</span>
      </div>
    </div>
  );
}

export default function LabelsPage() {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [params, setParams] = useSearchParams();
  const receiptId = Number(params.get("receipt")) || null;
  const [fromReceipt, setFromReceipt] = useState<string | null>(null);

  // Vừa duyệt phiếu nhập: nạp sẵn mỗi lô một dòng, số tem = số hộp đã nhập.
  useEffect(() => {
    if (!receiptId) return;
    staffApi
      .receiptLabels(receiptId)
      .then((r) => {
        setJobs(
          r.items.map((it: any) => ({
            key: it.barcode || `p${it.product_id}`,
            product_id: it.product_id,
            name: it.name,
            price: it.price,
            barcode: it.barcode,
            expiry_date: it.expiry_date,
            image_url: it.image_url,
            emoji: it.emoji,
            copies: Math.max(1, Math.min(MAX_COPIES, it.copies)),
          }))
        );
        setFromReceipt(r.code);
      })
      .catch((e) => toast.error(e))
      .finally(() => setParams({}, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);
  const [printing, setPrinting] = useState(false);

  const list = useQuery({
    queryKey: ["prods-labels", term],
    queryFn: () => staffApi.products({ q: term || undefined, size: 200 }),
    placeholderData: keepPreviousData,
  });
  const items: any[] = list.data?.items || [];
  const total = jobs.reduce((s, j) => s + j.copies, 0);
  const missing = jobs.filter((j) => !j.barcode);

  /* Gọi print sau khi React vẽ xong tờ tem — in trước lúc vẽ thì ra trang trắng. */
  useEffect(() => {
    if (!printing) return;
    const t = window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 150);
    return () => window.clearTimeout(t);
  }, [printing]);

  // Chọn từ danh sách: in tem theo lô đang bán (mã lô + HSD, số tem = số còn trong lô);
  // hàng chưa có lô thì in mã hàng.
  const toggle = (p: any) =>
    setJobs((cur) =>
      cur.some((j) => j.product_id === p.id)
        ? cur.filter((j) => j.product_id !== p.id)
        : [
            ...cur,
            {
              key: p.next_lot?.barcode || `p${p.id}`,
              product_id: p.id,
              name: p.name,
              price: Number(p.sale_price),
              barcode: p.next_lot?.barcode || p.barcode,
              expiry_date: p.next_lot?.expiry_date,
              image_url: p.image_url,
              emoji: p.emoji,
              copies: Math.max(1, Math.min(MAX_COPIES, Math.round(p.next_lot?.quantity || 10))),
            },
          ]
    );
  const drop = (key: string) => setJobs((cur) => cur.filter((j) => j.key !== key));
  const setCopies = (key: string, n: number) =>
    setJobs((cur) => cur.map((j) => (j.key === key ? { ...j, copies: Math.max(1, Math.min(MAX_COPIES, Math.round(n) || 1)) } : j)));

  const giveBarcode = async (j: Job) => {
    try {
      const r = await staffApi.generateBarcode(j.product_id);
      setJobs((cur) => cur.map((x) => (x.key === j.key ? { ...x, barcode: r.barcode } : x)));
      toast.success(`Đã cấp mã ${r.barcode} cho ${j.name}`);
      list.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  const print = () => {
    if (jobs.length) setPrinting(true);
  };

  return (
    <PageFrame>
      <PageHeader className="mb-0" kicker="Kho hàng" title="In tem mã vạch" />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:overflow-hidden">
        <Section
          title="Mặt hàng"
          desc="Bấm để thêm vào danh sách in"
          accent="ink"
          className="min-h-[24rem] lg:h-full lg:min-h-0"
          bodyClassName="flex flex-col !p-0 !overflow-hidden"
        >
          {/* Ô tìm đứng yên; chỉ danh sách bên dưới cuộn. */}
          <div className="shrink-0 border-b border-black/[.06] p-3">
            <SearchInput value={term} onChange={setTerm} placeholder="Tìm tên, SKU hoặc mã vạch…" className="flex-none sm:w-full sm:max-w-none" />
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
            {list.isPending
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)
              : items.map((p) => {
                  const on = jobs.some((j) => j.product_id === p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => toggle(p)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ring-1 transition",
                          on ? "bg-white ring-2 ring-forest-900" : "ring-transparent hover:bg-white hover:ring-black/[.08]"
                        )}
                      >
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-ink-50">
                          <ProductImage
                            src={p.image_url}
                            emoji={p.emoji}
                            alt={p.name}
                            fit="cover"
                            className="absolute inset-0 h-full w-full"
                            emojiClassName="absolute inset-0 grid place-items-center text-lg"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink-900">{p.name}</span>
                          <span
                            className={cn(
                              "block truncate font-mono text-[0.6875rem]",
                              p.next_lot?.barcode || p.barcode ? "text-ink-400" : "text-sun-700"
                            )}
                          >
                            {p.next_lot?.barcode
                              ? `Lô ${p.next_lot.barcode} · HSD ${dateFull(p.next_lot.expiry_date)}`
                              : p.barcode || "chưa có mã vạch"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full transition",
                            on ? "bg-forest-900 text-white" : "bg-ink-100 text-ink-500"
                          )}
                        >
                          {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
            {!list.isPending && !items.length && (
              <li className="py-10 text-center text-sm font-semibold text-ink-400">Không thấy mặt hàng nào.</li>
            )}
          </ul>
        </Section>

        <Section
          title="Danh sách in"
          desc={
            jobs.length
              ? `${fromReceipt ? `Phiếu ${fromReceipt} · ` : ""}${num(jobs.length)} dòng · ${num(total)} tem`
              : undefined
          }
          accent="ink"
          className="min-h-[28rem] lg:h-full lg:min-h-0"
          bodyClassName="flex flex-col gap-4"
          actions={
            jobs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setJobs([]);
                  setFromReceipt(null);
                }}
              >
                Xoá hết
              </Button>
            )
          }
          footer={
            <>
              {missing.length > 0 && (
                <span className="mr-auto text-xs font-semibold text-sun-700">{missing.length} món chưa có mã vạch</span>
              )}
              <Button icon={Printer} disabled={!jobs.length} loading={printing} onClick={print}>
                {jobs.length ? `In ${num(total)} tem` : "In tem"}
              </Button>
            </>
          }
        >
          {!jobs.length ? (
            <div className="grid h-full place-items-center py-12 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-ink-400">
                  <Barcode className="h-7 w-7" />
                </div>
                <div className="mt-3 font-display text-base font-black text-ink-900">Chưa chọn mặt hàng</div>
                <p className="mt-1 text-sm font-semibold text-ink-500">Chọn một hoặc nhiều món bên trái.</p>
              </div>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-ink-100 rounded-2xl bg-white px-3 ring-1 ring-black/[.05]">
                {jobs.map((j) => (
                  <li key={j.key} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-ink-50">
                      <ProductImage
                        src={j.image_url}
                        emoji={j.emoji}
                        alt={j.name}
                        fit="cover"
                        className="absolute inset-0 h-full w-full"
                        emojiClassName="absolute inset-0 grid place-items-center text-lg"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink-900">{j.name}</div>
                      {j.barcode ? (
                        <div className="truncate font-mono text-[0.6875rem] text-ink-400">
                          {j.barcode}
                          {j.expiry_date ? ` · HSD ${dateFull(j.expiry_date)}` : ""} · {vnd(j.price)}
                        </div>
                      ) : (
                        <button type="button" onClick={() => giveBarcode(j)} className="text-xs font-bold text-sun-700 underline underline-offset-2">
                          Chưa có mã — cấp mã ngay
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={MAX_COPIES}
                        inputMode="numeric"
                        value={j.copies}
                        onChange={(e) => setCopies(j.key, Number(e.target.value))}
                        className="h-9 w-14 rounded-xl bg-ink-100 text-center text-sm font-black tabular-nums outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-forest-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        aria-label="Số tem"
                      />
                      <button
                        type="button"
                        onClick={() => drop(j.key)}
                        className="grid h-9 w-9 place-items-center rounded-full text-ink-400 transition hover:bg-coral-50 hover:text-coral-600"
                        aria-label="Bỏ khỏi danh sách"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="min-h-0 flex-1">
                <div className="mb-2 text-xs font-semibold text-ink-500">Mẫu tem (50 × 30 mm)</div>
                <div className="flex flex-wrap content-start gap-3 rounded-2xl bg-ink-100 p-4">
                  {jobs.flatMap((j) =>
                    Array.from({ length: j.copies }).map((_, i) => (
                      <Label key={`${j.key}-${i}`} name={j.name} price={j.price} barcode={j.barcode} expiry={j.expiry_date} />
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </Section>
      </div>

      {/* Tờ in thật: đưa ra thẳng body để @media print ẩn được mọi thứ còn lại. */}
      {jobs.length > 0 &&
        createPortal(
          <div className="print-area print-only label-sheet">
            {jobs.flatMap((j) =>
              Array.from({ length: j.copies }).map((_, i) => (
                <Label key={`${j.key}-${i}`} name={j.name} price={j.price} barcode={j.barcode} expiry={j.expiry_date} />
              ))
            )}
          </div>,
          document.body
        )}
    </PageFrame>
  );
}
