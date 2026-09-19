import { cn } from "../../lib/cn";
import { look, TONE_CLASS, type Tone } from "../../lib/labels";

export default function Badge({
  children,
  tone = "mute",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Nhãn enum: tra bảng dịch rồi tự chọn màu. */
export function StatusBadge({
  map,
  value,
  className,
}: {
  map: Record<string, { label: string; tone: Tone }>;
  value?: string | null;
  className?: string;
}) {
  const { label, tone } = look(map, value);
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
