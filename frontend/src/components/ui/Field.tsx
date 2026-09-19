import { forwardRef, useId } from "react";
import { cn } from "../../lib/cn";

type FieldProps = {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
};

/** Khung nhãn + gợi ý + lỗi chung cho mọi ô nhập. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-600">
          {label}
          {required && <span className="ml-0.5 text-coral-500">*</span>}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs font-semibold text-coral-600">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  wrapClass?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, prefix, suffix, className, wrapClass, ...rest },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClass}>
      {(id) => (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={!!error}
            className={cn("input", error && "input-err", prefix && "pl-10", suffix && "pr-12", className)}
            {...rest}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
});

/** Ô nhập tiền: gõ số trần, hiện dấu đ ở cuối, chặn số âm. */
export const MoneyInput = forwardRef<HTMLInputElement, InputProps>(function MoneyInput({ suffix = "đ", ...rest }, ref) {
  return <Input ref={ref} type="number" min={0} step={500} inputMode="numeric" suffix={suffix} {...rest} />;
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  options: { value: string | number; label: string }[];
  wrapClass?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, placeholder, options, className, wrapClass, ...rest },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClass}>
      {(id) => (
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          className={cn("input cursor-pointer appearance-none bg-[length:16px] pr-10", error && "input-err", className)}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.9rem center",
          }}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
  wrapClass?: string;
}>(function Textarea({ label, hint, error, required, className, wrapClass, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClass}>
      {(id) => (
        <textarea
          ref={ref}
          id={id}
          rows={3}
          aria-invalid={!!error}
          className={cn("input resize-y", error && "input-err", className)}
          {...rest}
        />
      )}
    </Field>
  );
});

/** Công tắc bật/tắt — thay cho checkbox trần trước đây. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200",
        "disabled:opacity-50",
        checked ? "border-lime-400 bg-lime-50" : "border-ink-200 bg-white hover:border-ink-300"
      )}
    >
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-lime-400" : "bg-ink-200"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[1.375rem]" : "left-0.5"
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-400">{hint}</span>}
      </span>
    </button>
  );
}

/** Ô chọn dạng thẻ lớn — cho bước nhận hàng / cách trả tiền. */
export function ChoiceCard({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
  tone = "lime",
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  tone?: "lime" | "coral";
}) {
  const on = tone === "coral" ? "border-coral-400 bg-coral-50 ring-coral-200" : "border-lime-400 bg-lime-50 ring-lime-200";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-2xl border-2 p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200",
        active ? `${on} ring-2` : "border-ink-200 bg-white hover:border-ink-300"
      )}
    >
      {Icon && (
        <span
          className={cn(
            "mb-2 grid h-10 w-10 place-items-center rounded-xl",
            active ? (tone === "coral" ? "bg-coral-500 text-white" : "bg-lime-400 text-forest-900") : "bg-ink-100 text-ink-500"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="block font-extrabold text-ink-900">{title}</span>
      {desc && <span className="mt-0.5 block text-sm text-ink-500">{desc}</span>}
    </button>
  );
}
