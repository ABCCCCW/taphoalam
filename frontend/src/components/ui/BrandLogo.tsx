import { cn } from "../../lib/cn";

/** Logo tròn Lâm Ly Mart — dùng trên header, sidebar, đăng nhập. */
export default function BrandLogo({
  className,
  size = 40,
  alt = "Lâm Ly Mart",
}: {
  className?: string;
  size?: number;
  alt?: string;
}) {
  return (
    <img
      src="/logo-lam-mart.png"
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
