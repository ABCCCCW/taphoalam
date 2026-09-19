import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Loader2, Plus } from "lucide-react";
import { num, vnd } from "../../lib/format";
import { shopApi } from "../../api/client";
import { useShopAuth } from "../../stores/shopAuthStore";
import { useToast } from "./Toast";
import ProductImage from "./ProductImage";
import { cn } from "../../lib/cn";

export default function ProductCard({ p, compact = false }: { p: any; compact?: boolean }) {
  const { customer } = useShopAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-black/[.06] bg-white transition hover:border-black/[.12] hover:shadow-card"
    >
      <div
        className={cn(
          "relative overflow-hidden bg-sand",
          compact ? "aspect-[5/4] text-4xl" : "aspect-square text-5xl sm:text-6xl"
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <ProductImage
            src={p.image_url}
            emoji={p.emoji}
            alt={p.name}
            fit="cover"
            className="h-full w-full transition duration-300 group-hover:scale-105"
            emojiClassName="drop-shadow-sm group-hover:scale-105 transition duration-300"
          />
        </div>
        {p.sold_count > 20 && !out && (
          <span className="absolute left-2 top-2 rounded-md bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Bán chạy
          </span>
        )}
        {out && (
          <span className="absolute inset-0 grid place-items-center bg-white/75 text-sm font-extrabold text-ink-700">
            Tạm hết
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
        <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-400 sm:text-[11px]">
          {p.category || p.brand || "Tạp hoá"}
        </div>
        <div className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-ink-900">{p.name}</div>
        <div className="mt-auto flex min-w-0 items-end justify-between gap-1.5 pt-2">
          <div className="min-w-0">
            <div className="break-words font-display text-base font-black leading-none text-forest-900 sm:text-[17px]">
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
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl font-black transition active:scale-90",
              "disabled:pointer-events-none disabled:bg-ink-100 disabled:text-ink-400 disabled:shadow-none",
              state === "added" ? "bg-coral-500 text-white" : "bg-forest-900 text-white hover:bg-coral-500"
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
