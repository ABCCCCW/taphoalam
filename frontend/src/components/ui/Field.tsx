import { forwardRef, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Eye, EyeOff, Info, Search } from "lucide-react";
import { cn } from "../../lib/cn";
import { asciiPassword, digitsOnly } from "../../lib/input";

type FieldProps = {
  label?: string;
  hint?: string;
  tip?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
};

/** Chữ i cạnh nhãn — rê chuột / focus mới hiện, không chiếm chỗ dưới ô. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-label={text}>
      <Info className="h-3.5 w-3.5 text-ink-400 transition group-hover:text-ink-700 group-focus-within:text-ink-700" aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-30 hidden w-56 rounded-xl bg-forest-900 px-2.5 py-2 text-left text-[11px] font-semibold leading-snug text-white shadow-pop group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

/** Khung nhãn + gợi ý + lỗi chung cho mọi ô nhập. */
export function Field({ label, hint, tip, error, required, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <div className="mb-1.5 flex items-center gap-1">
          <label htmlFor={id} className="text-sm font-semibold text-ink-600">
            {label}
            {required && <span className="ml-0.5 text-coral-500">*</span>}
          </label>
          {tip && <InfoTip text={tip} />}
        </div>
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
  tip?: string;
  error?: string | null;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  wrapClass?: string;
  /** Chỉ nhận chữ số — SĐT, PIN, số tài khoản. */
  digits?: boolean;
};

function dateVi(iso?: string | number | readonly string[]) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, tip, error, required, prefix, suffix, className, wrapClass, digits, onChange, inputMode, ...rest },
  ref
) {
  const isDate = rest.type === "date";
  const shown = isDate ? dateVi(rest.value) : "";
  return (
    <Field label={label} hint={hint} tip={tip} error={error} required={required} className={wrapClass}>
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
            inputMode={digits ? "numeric" : inputMode}
            className={cn(
              "input",
              error && "input-err",
              prefix && "pl-10",
              suffix && "pr-12",
              isDate && "input-date",
              className
            )}
            onChange={(e) => {
              if (digits) e.target.value = digitsOnly(e.target.value);
              onChange?.(e);
            }}
            {...rest}
          />
          {shown && (
            <span
              className={cn(
                "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium tabular-nums",
                rest.disabled ? "text-ink-400" : "text-ink-900"
              )}
            >
              {shown}
            </span>
          )}
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

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "digits" | "suffix">>(
  function PasswordInput({ className, onChange, ...rest }, ref) {
    const [show, setShow] = useState(false);
    return (
      <Field label={rest.label} hint={rest.hint} tip={rest.tip} error={rest.error} required={rest.required} className={rest.wrapClass}>
        {(id) => (
          <div className="relative">
            <input
              ref={ref}
              id={id}
              type={show ? "text" : "password"}
              autoComplete={rest.autoComplete}
              placeholder={rest.placeholder}
              value={rest.value}
              disabled={rest.disabled}
              aria-invalid={!!rest.error}
              className={cn("input pr-12", rest.error && "input-err", className)}
              onChange={(e) => {
                e.target.value = asciiPassword(e.target.value);
                onChange?.(e);
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        )}
      </Field>
    );
  }
);

/** Ô nhập tiền: gõ số trần, hiện dấu đ ở cuối, chặn số âm. */
export const MoneyInput = forwardRef<HTMLInputElement, InputProps>(function MoneyInput({ suffix = "đ", ...rest }, ref) {
  return <Input ref={ref} type="number" min={0} step={500} inputMode="numeric" suffix={suffix} {...rest} />;
});

export type SelectOption = {
  value: string | number;
  label: string;
  /** Dòng phụ nhỏ dưới tên, vd. mã vạch, đơn vị. */
  hint?: string;
  /** Chữ thêm để tìm mà không hiện ra, vd. mã vạch. */
  keywords?: string;
};

type SelectProps = {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  options: SelectOption[];
  value?: string | number | null;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  wrapClass?: string;
  /** Mặc định tự bật ô tìm khi danh sách dài hơn 7 dòng. */
  searchable?: boolean;
  searchPlaceholder?: string;
};

/** Bỏ dấu, về chữ thường: "Bánh Mỳ Đậu Đỏ" → "banh my dau do". */
export const fold = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Điểm khớp gần đúng; -1 là không khớp. Khớp đầu tên > đầu từ > giữa chữ > rải rác từng ký tự. */
function score(query: string, o: SelectOption) {
  const q = fold(query).trim();
  if (!q) return 0;
  const hay = fold(`${o.label} ${o.hint || ""} ${o.keywords || ""}`);
  const label = fold(o.label);
  const words = q.split(/\s+/);
  if (words.every((w) => hay.includes(w))) {
    if (label.startsWith(q)) return 100;
    if (label.split(/[^a-z0-9]+/).some((w) => w.startsWith(words[0]))) return 80;
    return 60;
  }
  // Gõ dính liền hoặc sót chữ: "cocacola" vẫn ra "Coca-Cola", "bnhmy" ra "Bánh mỳ".
  const compact = q.replace(/[^a-z0-9]/g, "");
  const flat = hay.replace(/[^a-z0-9]/g, "");
  if (compact && flat.includes(compact)) return 50;
  let i = 0;
  for (const ch of flat) if (ch === compact[i]) i++;
  return compact.length >= 3 && i === compact.length ? 20 : -1;
}

/**
 * Ô chọn dùng chung cho cả trang quản trị.
 *
 * Không dùng <select> gốc của trình duyệt: không trang trí được cho giống ô nhập, và
 * danh sách vài trăm mặt hàng thì chỉ cuộn chứ không gõ tìm được. Danh sách xổ ra được
 * gắn thẳng vào body để không bị khung cuộn / bảng bên ngoài cắt mất.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    required,
    placeholder,
    options,
    value,
    onChange,
    disabled,
    className,
    wrapClass,
    searchable,
    searchPlaceholder = "Gõ để tìm…",
  },
  ref
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const canSearch = searchable ?? options.length > 7;

  const current = options.find((o) => String(o.value) === String(value ?? ""));
  const rows = useMemo(() => {
    const base: (SelectOption & { empty?: boolean })[] = placeholder ? [{ value: "", label: placeholder, empty: true }] : [];
    if (!query.trim()) return [...base, ...options];
    return options
      .map((o) => ({ o, s: score(query, o) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.o);
  }, [options, query, placeholder]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 260 && above > below;
    setPos({
      left: r.left,
      width: Math.max(r.width, 240),
      maxH: Math.min(360, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  };

  const show = () => {
    if (disabled) return;
    place();
    setQuery("");
    const i = rows.findIndex((o) => String(o.value) === String(value ?? ""));
    setActive(Math.max(0, i));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const choose = (o: SelectOption) => {
    onChange?.({ target: { value: String(o.value) } });
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const onMove = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) choose(rows[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClass}>
      {(id) => (
        <>
          <button
            ref={(el) => {
              btn.current = el;
              if (typeof ref === "function") ref(el);
              else if (ref) ref.current = el;
            }}
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-invalid={!!error}
            onClick={() => (open ? close() : show())}
            onKeyDown={onKey}
            className={cn(
              "input flex items-center gap-2 text-left",
              open && "border-lime-500 ring-4 ring-lime-100",
              error && "input-err",
              className
            )}
          >
            <span className={cn("min-w-0 flex-1 truncate", !current && "text-ink-400")}>
              {current ? current.label : placeholder || "Chọn…"}
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition", open && "rotate-180")} />
          </button>
          {open &&
            pos &&
            createPortal(
              <div
                ref={pop}
                onKeyDown={onKey}
                style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
                className="fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-pop animate-fade-in"
              >
                {canSearch && (
                  <div className="relative shrink-0 border-b border-black/[.06] p-2">
                    <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="h-10 w-full rounded-xl bg-ink-50 pl-9 pr-3 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400 focus:bg-ink-100"
                    />
                  </div>
                )}
                <ul ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                  {rows.map((o, i) => {
                    const on = String(o.value) === String(value ?? "");
                    return (
                      <li
                        key={`${o.value}`}
                        data-i={i}
                        role="option"
                        aria-selected={on}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(o)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm",
                          i === active ? "bg-ink-100" : "",
                          (o as any).empty ? "text-ink-400" : "text-ink-900"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate", on && "font-bold")}>{o.label}</span>
                          {o.hint && <span className="block truncate text-xs text-ink-400">{o.hint}</span>}
                        </span>
                        {on && <Check className="h-4 w-4 shrink-0 text-ink-900" />}
                      </li>
                    );
                  })}
                  {!rows.length && (
                    <li className="px-3 py-6 text-center text-sm text-ink-400">Không thấy “{query}”. Thử gõ ngắn hơn.</li>
                  )}
                </ul>
              </div>,
              document.body
            )}
        </>
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
