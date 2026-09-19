import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../../lib/cn";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; text: string };

type Ctx = {
  success: (text: string) => void;
  error: (e: unknown, fallback?: string) => void;
  info: (text: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

const STYLE: Record<
  Kind,
  {
    wrap: string;
    iconWrap: string;
    kicker: string;
    kickerCls: string;
    icon: React.ComponentType<{ className?: string }>;
    ms: number;
  }
> = {
  success: {
    wrap: "border-lime-200 bg-white",
    iconWrap: "bg-lime-100 text-forest-800",
    kicker: "Xong",
    kickerCls: "text-forest-700",
    icon: CheckCircle2,
    ms: 3400,
  },
  error: {
    wrap: "border-coral-200 bg-white",
    iconWrap: "bg-coral-50 text-coral-600",
    kicker: "Chưa được",
    kickerCls: "text-coral-600",
    icon: XCircle,
    ms: 6200,
  },
  info: {
    wrap: "border-ink-200 bg-white",
    iconWrap: "bg-ink-100 text-ink-700",
    kicker: "Nhắc",
    kickerCls: "text-ink-500",
    icon: Info,
    ms: 4500,
  },
};

function asMessage(e: unknown, fallback: string) {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return fallback;
}

/**
 * Thông báo nổi thay cho `alert()`.
 *
 * POS và các trang kho trước đây dùng `alert()`: nó chặn cả bàn phím, mà quầy
 * bán hàng thì gõ liên tục. Toast tự tắt, không chặn thao tác nào.
 * Trùng nội dung thì gộp lại (không chồng 3 tấm sát nhau), tối đa 3 tấm.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback((id: number, kind: Kind) => {
    const prev = timers.current.get(id);
    if (prev) window.clearTimeout(prev);
    timers.current.set(id, window.setTimeout(() => dismiss(id), STYLE[kind].ms));
  }, [dismiss]);

  const push = useCallback((kind: Kind, raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setItems((list) => {
      const dup = list.find((t) => t.kind === kind && t.text === text);
      if (dup) {
        arm(dup.id, kind);
        return [...list.filter((t) => t.id !== dup.id), dup];
      }
      const id = ++seq.current;
      arm(id, kind);
      const next = [...list, { id, kind, text }];
      if (next.length <= 3) return next;
      next.slice(0, next.length - 3).forEach((drop) => {
        const t = timers.current.get(drop.id);
        if (t) window.clearTimeout(t);
        timers.current.delete(drop.id);
      });
      return next.slice(-3);
    });
  }, [arm]);

  const api = useMemo<Ctx>(
    () => ({
      success: (text) => push("success", text),
      info: (text) => push("info", text),
      error: (e, fallback = "Có lỗi xảy ra, thử lại nhé.") => push("error", asMessage(e, fallback)),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-stretch gap-3 p-4 safe-bottom sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[22.5rem] sm:items-stretch">
          {items.map((t) => {
            const { wrap, iconWrap, kicker, kickerCls, icon: Icon } = STYLE[t.kind];
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  "pointer-events-auto flex w-full items-start gap-3 rounded-3xl border px-4 py-3.5 shadow-lift animate-slide-in",
                  wrap
                )}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-2xl", iconWrap)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[11px] font-extrabold uppercase tracking-wider", kickerCls)}>
                    {kicker}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-ink-800">{t.text}</p>
                </div>
                <button
                  type="button"
                  aria-label="Đóng"
                  className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-800"
                  onClick={() => dismiss(t.id)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast cần ToastProvider ở trên cây component");
  return ctx;
}
