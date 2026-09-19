import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "lime" | "coral" | "ink" | "ghost" | "soft" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  lime: "bg-lime-400 text-forest-900 shadow-sm hover:bg-lime-300 focus-visible:ring-lime-300/60",
  coral: "bg-coral-500 text-white shadow-sm hover:bg-coral-600 focus-visible:ring-coral-200",
  ink: "bg-forest-900 text-white hover:bg-forest-800 focus-visible:ring-forest-200",
  ghost: "border border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50 focus-visible:ring-ink-200",
  soft: "bg-lime-100 text-forest-800 hover:bg-lime-200 focus-visible:ring-lime-200",
  danger: "bg-coral-50 text-coral-600 hover:bg-coral-100 focus-visible:ring-coral-200",
  quiet: "text-ink-500 hover:bg-ink-100 hover:text-ink-800 focus-visible:ring-ink-200",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-xl px-3 text-[13px]",
  md: "h-11 gap-2 rounded-2xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-2xl px-6 text-base",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  block?: boolean;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "lime", size = "md", loading, icon: Icon, block, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-extrabold transition duration-150",
        "active:scale-[.97] focus-visible:outline-none focus-visible:ring-4",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANT[variant],
        SIZE[size],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn("animate-spin", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
      ) : (
        Icon && <Icon className={cn("shrink-0", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
      )}
      {children}
    </button>
  );
});

export default Button;

/** Nút chỉ có icon — dùng cho thao tác phụ trong hàng bảng. */
export function IconButton({
  icon: Icon,
  label,
  className,
  tone = "quiet",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "quiet" | "danger" | "lime";
}) {
  const tones = {
    quiet: "text-ink-400 hover:bg-ink-100 hover:text-ink-800",
    danger: "text-ink-400 hover:bg-coral-50 hover:text-coral-600",
    lime: "text-forest-700 hover:bg-lime-100",
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition active:scale-95",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200",
        "disabled:pointer-events-none disabled:opacity-40",
        tones[tone],
        className
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
