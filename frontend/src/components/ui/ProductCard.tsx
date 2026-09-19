import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Loader2, Plus } from "lucide-react";
import { num, vnd } from "../../lib/format";
import { shopApi } from "../../api/client";
import { useShopAuth } from "../../stores/shopAuthStore";
import { useToast } from "./Toast";
import ProductImage from "./ProductImage";
import { cn } from "../../lib/cn";

const TINTS = [
  "from-lime-100 to-lime-50",
  "from-sun-100 to-sun-50",
  "from-coral-100 to-coral-50",
];

export default function ProductCard({ p, compact = false }: { p: any; compact?: boolean }) {
  const { customer } = useShopAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const tint = TINTS[(p.id || 0) % TINTS.length];
  const out = Number(p.available || 0) <= 0;
  const step = p.product_type === "WEIGHTED" ? 0.1 : 1;

  const add = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    /* Trước đây gán window.location nên cả trang tải lại, mất luôn ô tìm và
       vị trí đang xem. */
    if (!customer) return nav("/dang-nhap");
    if (state === "busy") return;
    setState("busy");
    try {
      await shopApi.addCart(p.id, step);
      window.dispatchEvent(new Event("cart-changed"));
      setState("added");
      setTimeout(() => setState("idle"), 1400);
    } catch (err) {
      setState("idle");
      toast.error(err, "Chưa thêm được vào giỏ");
    }
  };

  return (
    <Link
      to={`/p/${p.slug}`}
      className="group card overflow-hidden transition hover:-translate-y-1 hover:shadow-pop"
    >
      <div
        className={cn(
          "relative flex items-center justify-center bg-gradient-to-br",
          tint,
          compact ? "h-24 text-4xl" : "h-28 text-4xl sm:h-40 sm:text-6xl"
        )}
      >
        <ProductImage
          src={p.image_url}
          emoji={p.emoji}
          alt={p.name}
          className="h-full w-full p-2 transition group-hover:scale-110"
          emojiClassName="drop-shadow-sm group-hover:scale-110 transition"
        />
        {p.sold_count > 20 && !out && (
          <span className="chip absolute left-2.5 top-2.5 bg-coral-500 text-[10px] font-bold text-white">
            Bán chạy
          </span>
        )}
        {out && (
          <span className="absolute inset-0 grid place-items-center bg-white/75 text-sm font-extrabold text-ink-700">
            Tạm hết
          </span>
        )}
      </div>

      <div className="min-w-0 p-2.5 sm:p-3.5">
        <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-400 sm:text-[11px]">
          {p.category || p.brand || "Tạp hoá"}
        </div>
        <div className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug sm:text-base">{p.name}</div>
        <div className="mt-2 flex min-w-0 items-end justify-between gap-1.5">
          <div className="min-w-0">
            <div className="break-words font-display text-base font-black leading-none text-coral-500 sm:text-lg">
              {vnd(p.sale_price)}
            </div>
            <div className="mt-1 text-[11px] text-ink-400">
              {out ? "Hết trên kệ" : `Còn ${num(p.available)}`}
              {p.rating_avg ? ` · ${Number(p.rating_avg).toFixed(1)}★` : ""}
            </div>
          </div>
          <button
            onClick={add}
            disabled={out || state === "busy"}
            aria-label={`Thêm ${p.name} vào giỏ`}
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-2xl font-black shadow-sm transition active:scale-90 sm:h-10 sm:w-10",
              "disabled:pointer-events-none disabled:bg-ink-100 disabled:text-ink-400 disabled:shadow-none",
              state === "added" ? "bg-forest-900 text-white" : "bg-lime-400 text-forest-900 hover:bg-lime-300"
            )}
          >
            {state === "added" ? (
              <Check className="h-5 w-5" strokeWidth={3} />
            ) : state === "busy" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" strokeWidth={3} />
            )}
          </button>
        </div>
      </div>
    </Link>
  );
}
