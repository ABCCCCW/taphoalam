import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { shopApi } from "../../api/client";
import ProductCard from "../../components/ui/ProductCard";
import { ArrowRight, ArrowUpRight, Bike, QrCode, Store, ShieldCheck, ShoppingBasket, Wallet } from "lucide-react";
import ProductImage from "../../components/ui/ProductImage";
import { Skeleton } from "../../components/ui/Feedback";
import { vnd } from "../../lib/format";

/* Khung chung cho mọi khối trên trang chủ — cùng bề rộng, cùng lề với header,
   để mép các khối thẳng hàng với nhau. */
const WRAP = "shop-wrap";

/* Nền nhạt xoay vòng cho ô danh mục, để kệ hàng có màu mà không loè loẹt */
const CAT_TINTS = ["bg-[#fff0e6]", "bg-[#fdf4d7]", "bg-[#fbe9e7]", "bg-[#eef1f5]", "bg-[#f3efe4]", "bg-[#fde8ea]", "bg-[#e7f4e4]", "bg-[#eaf1fb]", "bg-[#f6ecdf]"];

export default function HomePage() {
  const cats = useQuery({ queryKey: ["cats"], queryFn: shopApi.categories });
  const hot = useQuery({ queryKey: ["hot"], queryFn: () => shopApi.products({ sort: "-sold_count", size: 12 }) });
  const showcase = (hot.data?.items || []).filter((p: any) => p.image_url).slice(0, 3);

  return (
    <div className="pb-8">
      {/* Hero + hai ô khuyến mãi nằm cùng một hàng, không chừa khoảng trống */}
      <section className={`${WRAP} pt-3 sm:pt-5`}>
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative overflow-hidden rounded-2xl bg-forest-900 text-white lg:col-span-8">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-coral-500/25 blur-3xl" />
            <div className="relative grid h-full gap-6 p-5 sm:p-7 lg:p-8 2xl:grid-cols-[minmax(0,1fr)_minmax(0,40%)]">
            <div className="flex min-w-0 flex-col">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-coral-500" /> Siêu thị mini · Cầu Diễn
              </span>
              <h1 className="mt-3 font-display text-[1.75rem] font-black leading-[1.1] sm:text-4xl lg:text-[2.75rem]">
                Đồ tươi mỗi ngày,
                <br />
                <span className="text-coral-400">giao nhanh trong phố.</span>
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
                Website và quầy thu ngân dùng chung một kho. Đặt là giữ hàng — không lo hết giữa đường.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
                <Link to="/catalog" className="btn bg-white px-4 py-3 text-sm text-forest-900 hover:bg-lime-100 sm:px-5">
                  Đi chợ ngay <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/dang-nhap" className="btn border border-white/15 px-4 py-3 text-sm text-white hover:bg-white/10 sm:px-5">
                  <span>Tích điểm<span className="hidden sm:inline"> thành viên</span></span>
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 border-t border-white/10 pt-5 sm:mt-auto sm:grid-cols-3 sm:gap-4 lg:pt-6">
                <Perk icon={<Bike className="h-4 w-4" />} title="Ship khu gần 15k" desc="Đặt trước 18h, giao buổi tối" />
                <Perk icon={<Store className="h-4 w-4" />} title="Lấy tại quầy 0đ" desc="Giữ hàng 24 giờ" />
                <Perk icon={<QrCode className="h-4 w-4" />} title="VietQR chuẩn NH" desc="Không mất phí cổng" />
              </div>
            </div>

            {/* Ảnh hàng bán chạy lấp phần bên phải hero trên màn rộng */}
            {showcase.length === 3 && (
              /* Đặt tuyệt đối để cụm ảnh theo chiều cao phần chữ, không kéo hero cao thêm */
              <div className="relative hidden 2xl:block">
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-3">
                {showcase.map((p: any, i: number) => (
                  <Link
                    key={p.id}
                    to={`/p/${p.slug}`}
                    className={`group flex min-h-0 min-w-0 flex-col rounded-xl bg-white p-2.5 text-forest-900 shadow-lift transition hover:-translate-y-1 ${i === 0 ? "row-span-2" : ""}`}
                  >
                    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-lime-50">
                      <ProductImage src={p.image_url} emoji={p.emoji} alt={p.name} fit="cover" className="h-full w-full transition duration-300 group-hover:scale-105" />
                    </div>
                    <div className="mt-2 flex min-w-0 items-center justify-between gap-2 px-0.5">
                      <span className="truncate text-xs font-semibold">{p.name}</span>
                      <span className="shrink-0 rounded-md bg-coral-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{vnd(p.sale_price)}</span>
                    </div>
                  </Link>
                ))}
              </div>
              </div>
            )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
            <Promo
              to="/catalog?q=rau"
              kicker="Sáng nay nhập"
              title="Rau củ còn sương"
              cta="Xem kệ rau"
              emoji="🥬"
              className="bg-[#e6f2e1] text-[#1d3a17]"
            />
            <Promo
              to="/catalog?q=mì"
              kicker="Deal trong phố · mã TET10"
              title="Mì · nước · snack −10%"
              cta="Săn deal"
              emoji="🔥"
              className="bg-coral-500 text-white"
            />
          </div>
        </div>
      </section>

      {/* Danh mục */}
      <section className={`${WRAP} mt-6 sm:mt-8`}>
        <SectionHead title="Danh mục" link={{ to: "/catalog", label: "Tất cả" }} />
        {/* Một hàng duy nhất: đủ chỗ thì các ô giãn đều, thiếu chỗ (điện thoại) thì vuốt ngang */}
        <div className="hide-scroll -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          {cats.isPending &&
            Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-[96px] min-w-[92px] flex-1 rounded-xl" />)}
          {cats.data?.map((c: any, i: number) => (
            <Link
              key={c.id}
              to={`/catalog?category=${c.id}`}
              className="group flex min-w-[92px] flex-1 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-black/[.06] bg-white px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-forest-900/20 hover:shadow-card"
            >
              <span className={`grid h-12 w-12 place-items-center rounded-full text-2xl transition group-hover:scale-110 sm:h-14 sm:w-14 sm:text-3xl ${CAT_TINTS[i % CAT_TINTS.length]}`}>{c.icon}</span>
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-ink-700 sm:text-xs">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Bán chạy */}
      <section className={`${WRAP} mt-6 sm:mt-8`}>
        <SectionHead title="Bán chạy hôm nay" sub="Xếp theo số lượng đã bán" link={{ to: "/catalog", label: "Xem hết" }} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {hot.isPending
            ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)
            : hot.data?.items?.map((p: any) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      <section className={`${WRAP} mt-6 sm:mt-8`}>
        <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          <Step n="01" icon={<ShoppingBasket className="h-4 w-4" />} title="Bỏ vào giỏ" meta="Trừ hàng đang giữ" />
          <Step n="02" icon={<ShieldCheck className="h-4 w-4" />} title="Chốt là giữ" meta="Quầy hoặc ship" />
          <Step n="03" icon={<Wallet className="h-4 w-4" />} title="Trả tiền" meta="COD / VietQR" />
        </div>
      </section>
    </div>
  );
}

function SectionHead({ title, sub, link }: { title: string; sub?: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-black tracking-tight sm:text-2xl">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-500 sm:text-sm">{sub}</p>}
      </div>
      {link && (
        <Link to={link.to} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-forest-800 hover:text-coral-600">
          {link.label} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function Perk({ icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-coral-400">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-bold">{title}</div>
        <div className="truncate text-xs text-white/55">{desc}</div>
      </div>
    </div>
  );
}

function Promo({
  to,
  kicker,
  title,
  cta,
  emoji,
  className,
}: {
  to: string;
  kicker: string;
  title: string;
  cta: string;
  emoji: string;
  className: string;
}) {
  return (
    <Link
      to={to}
      className={`group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl p-5 transition hover:brightness-[1.03] ${className}`}
    >
      <span className="pointer-events-none absolute -bottom-5 -right-2 text-[6.5rem] leading-none opacity-25 transition group-hover:scale-110">
        {emoji}
      </span>
      <div className="relative">
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">{kicker}</div>
        <h3 className="mt-1 font-display text-xl font-black leading-tight sm:text-2xl">{title}</h3>
      </div>
      <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold">
        {cta} <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </Link>
  );
}

function Step({ n, icon, title, meta }: { n: string; icon: any; title: string; meta: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/[.06] bg-white px-4 py-4 shadow-card sm:px-5 sm:py-5">
      <i className="absolute inset-y-0 left-0 w-1 bg-coral-500" aria-hidden />
      <div className="flex items-center gap-3 pl-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-900 text-white">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xs font-black text-coral-500">{n}</span>
            <span className="font-display text-base font-black tracking-tight text-ink-900">{title}</span>
          </div>
          <div className="mt-0.5 text-xs font-semibold text-ink-500">{meta}</div>
        </div>
      </div>
    </div>
  );
}
