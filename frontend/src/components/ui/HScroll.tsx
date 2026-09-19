import { useEffect, useRef } from "react";

export default function HScroll({ children, className = "" }: { children: any; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY + e.deltaX;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className={`flex gap-2 overflow-x-auto hide-scroll min-w-0 py-1 ${className}`}
    >
      {children}
    </div>
  );
}
