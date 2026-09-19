import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { shopApi } from "../../api/client";
import ProductCard from "../../components/ui/ProductCard";
import Button from "../../components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/Feedback";
import { cn } from "../../lib/cn";

const TINTS = [
  "bg-[#fff0e6]",
  "bg-[#fdf4d7]",
  "bg-[#fbe9e7]",
  "bg-[#eef1f5]",
  "bg-[#f3efe4]",
  "bg-[#fde8ea]",
  "bg-[#e7f4e4]",
  "bg-[#eaf1fb]",
  "bg-[#f6ecdf]",
];

export default function CatalogPage() {
  const [sp, setSp] = useSearchParams();
  const cats = useQuery({ queryKey: ["cats"], queryFn: shopApi.categories });
  const category = sp.get("category") || "";
  const q = sp.get("q") || "";
  const data = useQuery({
    queryKey: ["cat", category, q],
    queryFn: () => shopApi.products({ category_id: category || undefined, q: q || undefined, sort: "-sold_count", size: 40 }),
  });
  const active = cats.data?.find((c: any) => String(c.id) === category);
  const items = data.data?.items || [];

  const apply = (patch: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp);
    patch(next);
    setSp(next);
  };

  const title = q ? `“${q}”` : active ? active.name : "Tất cả kệ hàng";

  return (
    <div className="shop-wrap pb-8 pt-4 sm:pt-6">
      <h1 className="sr-only">{title}</h1>
      <nav className="overflow-hidden rounded-2xl border border-black/[.07] bg-white p-1.5 shadow-card">
        <div className="grid grid-cols-5 gap-1 md:grid-cols-10">
          <CatTile
            icon="🛒"
            label="Tất cả"
            tint="bg-sand"
            on={!category}
            onClick={() => apply((next) => next.delete("category"))}
          />
          {cats.isPending &&
            Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          {cats.data?.map((c: any, i: number) => (
            <CatTile
              key={c.id}
              icon={c.icon}
              label={c.name}
              tint={TINTS[i % TINTS.length]}
              on={category === String(c.id)}
              onClick={() => apply((next) => next.set("category", String(c.id)))}
            />
          ))}
        </div>
      </nav>

      {data.isPending ? (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
          ))}
        </div>
      ) : data.isError ? (
        <div className="card mt-5">
          <ErrorState error={data.error} onRetry={data.refetch} />
        </div>
      ) : !items.length ? (
        <div className="card mt-5">
          <EmptyState
            emoji="🧺"
            title={q ? `Không có món nào khớp “${q}”` : "Kệ này đang trống"}
            action={
              <Link to="/catalog">
                <Button onClick={() => setSp({})}>Xem tất cả</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((p: any) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function CatTile({
  icon,
  label,
  tint,
  on,
  onClick,
}: {
  icon: string;
  label: string;
  tint: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 transition",
        on ? "bg-coral-500 text-white" : "text-ink-800 hover:bg-sand"
      )}
    >
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg text-lg",
          on ? "bg-white/20" : tint
        )}
      >
        {icon}
      </span>
      <span className="line-clamp-2 px-0.5 text-center text-[10px] font-extrabold leading-tight sm:text-[11px]">
        {label}
      </span>
    </button>
  );
}
