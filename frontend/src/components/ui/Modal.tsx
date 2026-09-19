import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

type Size = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE: Record<Size, string> = {
  sm: "max-w-[26rem]",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
};

export default function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  size = "md",
  footer,
  children,
  closeOnBackdrop = true,
}: {
  open?: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: Size;
  footer?: React.ReactNode;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* Esc + khoá cuộn chỉ gắn khi mở. Không phụ thuộc `onClose` — caller thường
     truyền arrow mới mỗi lần gõ, effect cũ từng focus lại panel nên ô nhập
     mất focus sau đúng một chữ. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = panel.current;
    const alreadyIn = root?.contains(document.activeElement);
    if (root && !alreadyIn) {
      const first = root.querySelector<HTMLElement>(
        "input:not([type='hidden']), textarea, select"
      );
      (first ?? root).focus();
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-forest-900/50 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white shadow-lift outline-none",
          "rounded-t-4xl animate-slide-up sm:rounded-4xl sm:animate-pop-in",
          SIZE[size]
        )}
      >
        {(title || subtitle) && (
          <header className="flex items-start gap-4 border-b border-ink-100 px-5 py-5 sm:px-6">
            <div className="min-w-0 flex-1 space-y-1.5">
              {title && <h2 className="font-display text-xl font-black leading-snug text-ink-900">{title}</h2>}
              {subtitle && <p className="text-sm leading-relaxed text-ink-500">{subtitle}</p>}
            </div>
            {/* Có chân Huỷ/Đóng rồi thì khỏi dấu X — hai chỗ đóng một việc. */}
            {!footer && (
              <button
                type="button"
                onClick={() => onCloseRef.current()}
                aria-label="Đóng"
                className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-800"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex flex-row items-center justify-end gap-3 border-t border-ink-100 bg-sand/50 px-5 pt-4 pb-6 sm:px-6 sm:pb-7">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
