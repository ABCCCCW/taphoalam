import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { shopApi } from "../../api/client";
import ProductCard from "../../components/ui/ProductCard";
import HScroll from "../../components/ui/HScroll";
import Button from "../../components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/Feedback";
import { cn } from "../../lib/cn";

const SORTS = [
  { value: "-sold_count", label: "Bán chạy" },
  { value: "price", label: "Giá tăng dần" },
  { value: "-price", label: "Giá giảm dần" },
];

export default function CatalogPage() {
  const [sp, setSp] = useSearchParams();
  const cats = useQuery({ queryKey: ["cats"], queryFn: shopApi.categories });
  const category = sp.get("category") || "";
  const q = sp.get("q") || "";
  const sort = sp.get("sort") || "-sold_count";
  const data = useQuery({
    queryKey: ["cat", category, q, sort],
    queryFn: () => shopApi.products({ category_id: category || undefined, q: q || undefined, sort, size: 40 }),
  });
  const active = cats.data?.find((c: any) => String(c.id) === category);
  const items = data.data?.items || [];

  return (
    <div>
      <div className="bg-forest-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-3 py-6 sm:flex-row sm:items-end sm:px-4 sm:py-8">
          <div className="min-w-0">
            <div className="section-kicker !text-lime-400">Đi chợ</div>
            <h1 className="mt-1 break-words font-display text-2xl font-black sm:text-3xl md:text-4xl">
              {q ? `Kết quả “${q}”` : active ? `${active.icon} ${active.name}` : "Tất cả kệ hàng"}
            </h1>
            <p className="mt-1 text-sm text-white/60">
              {data.isPending ? "Đang xem kệ…" : `${items.length} món · giá lấy từ kho quầy`}
            </p>
          </div>
          <label className="flex w-full shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm sm:w-auto">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-lime-400" />
            <span className="sr-only">Sắp xếp</span>
            <select
              className="flex-1 cursor-pointer bg-transparent font-semibold outline-none sm:flex-none"
              value={sort}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                next.set("sort", e.target.value);
                setSp(next);
              }}
            >
              {SORTS.map((s) => (
                <option key={s.value} className="text-ink-900" value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-4">
        <HScroll className="mb-4">
          <button
            onClick={() => {
              const next = new URLSearchParams();
              if (q) next.set("q", q);
              if (sort && sort !== "-sold_count") next.set("sort", sort);
              setSp(next);
            }}
            className={cn(
              "chip shrink-0 whitespace-nowrap px-4 py-2 transition",
              !category && !q ? "bg-forest-900 text-white" : "border border-ink-200 bg-white hover:border-lime-400"
            )}
          >
            Tất cả
          </button>
          {cats.data?.map((c: any) => (
            <button
              key={c.id}
              onClick={() => {
                const next = new URLSearchParams();
                next.set("category", String(c.id));
                if (q) next.set("q", q);
                if (sort && sort !== "-sold_count") next.set("sort", sort);
                setSp(next);
              }}
              className={cn(
                "chip shrink-0 whitespace-nowrap px-4 py-2 transition",
                category === String(c.id)
                  ? "bg-lime-400 font-extrabold text-forest-900"
                  : "border border-ink-200 bg-white hover:border-lime-400"
              )}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </HScroll>

        {data.isPending ? (
          <div className="grid grid-cols-2 gap-2.5 pb-10 md:grid-cols-3 lg:grid-cols-4 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-3xl" />
            ))}
          </div>
        ) : data.isError ? (
          <div className="card">
            <ErrorState error={data.error} onRetry={data.refetch} />
          </div>
        ) : !items.length ? (
          <div className="card">
            <EmptyState
              emoji="🧺"
              title={q ? `Không có món nào khớp “${q}”` : "Kệ này đang trống"}
              action={
                <Link to="/catalog">
                  <Button onClick={() => setSp({})}>Xem tất cả kệ hàng</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 pb-10 md:grid-cols-3 lg:grid-cols-4 sm:gap-4">
            {items.map((p: any) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
