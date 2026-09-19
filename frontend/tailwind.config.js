/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Be Vietnam Pro", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Nunito", "Be Vietnam Pro", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        /* Tông chủ đạo là than chì (tối, trung tính) thay cho xanh lá. Giữ tên "lime"
           để khỏi sửa hàng trăm class: ở đây nó là thang xám sáng dùng để làm nổi. */
        lime: {
          50: "#FAFAFA",
          100: "#F4F4F5",
          200: "#EAEAEC",
          300: "#E4E4E7",
          400: "#D4D4D8",
          500: "#A1A1AA",
          600: "#71717A",
          700: "#52525B",
        },
        coral: {
          50: "#FFF1EC",
          100: "#FFD8CC",
          200: "#FFC0AC",
          300: "#FFA588",
          400: "#FF8A6B",
          500: "#FF5A3C",
          600: "#E63E20",
          700: "#BC2E14",
        },
        forest: {
          50: "#F4F4F5",
          100: "#E4E4E7",
          200: "#D4D4D8",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
        },
        ink: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        /* Tông trạng thái — dùng cho nhãn đơn, phiếu kho, sổ cái */
        grape: { 50: "#F5F0FF", 100: "#E8DEFF", 500: "#8B5CF6", 700: "#6D28D9" },
        sky: { 50: "#EFF8FF", 100: "#D8EDFF", 500: "#3B9EF7", 700: "#1D6FBF" },
        sun: { 50: "#FFF8E6", 100: "#FFEDBF", 500: "#F5A524", 700: "#B4740B" },
        cream: "#FFF6EC",
        sand: "#F4F1E7",
      },
      boxShadow: {
        pop: "0 18px 50px -20px rgba(24,24,27,.35)",
        card: "0 1px 2px rgba(15,23,42,.04), 0 12px 32px -18px rgba(15,23,42,.22)",
        lift: "0 24px 60px -24px rgba(24,24,27,.42)",
        inset: "inset 0 1px 0 rgba(255,255,255,.6)",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(100%)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        "fade-in": "fade-in .15s ease-out",
        "pop-in": "pop-in .18s cubic-bezier(.2,.9,.3,1.2)",
        "slide-up": "slide-up .22s cubic-bezier(.2,.9,.3,1)",
        "slide-in": "slide-in .2s ease-out",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
