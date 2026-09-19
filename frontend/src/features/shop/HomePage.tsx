import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { shopApi } from "../../api/client";
import ProductCard from "../../components/ui/ProductCard";
import ProductImage from "../../components/ui/ProductImage";
import { ArrowRight, Bike, QrCode, Store, Sparkles, Timer, ShieldCheck } from "lucide-react";
import { Skeleton } from "../../components/ui/Feedback";
import { vnd } from "../../lib/format";

export default function HomePage() {
  const cats = useQuery({ queryKey: ["cats"], queryFn: shopApi.categories });
  const hot = useQuery({ queryKey: ["hot"], queryFn: () => shopApi.products({ sort: "-sold_count", size: 8 }) });
  const mosaic = hot.data?.items?.slice(0, 6) || [];

  return (
    <div>
      <section className="px-3 sm:px-4 pt-4 sm:pt-6 md:pt-8">
        <div className="max-w-6xl mx-auto rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden bg-forest-900 text-white relative shadow-pop">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-lime-400/20 blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -bottom-24 h-64 w-64 rounded-full bg-coral-500/20 blur-3xl pointer-events-none" />
          <div className="relative grid lg:grid-cols-[1.15fr_.85fr] gap-6 lg:gap-8 p-5 sm:p-7 md:p-12 items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-lime-400 text-forest-900 px-3 py-1 text-[11px] sm:text-xs font-extrabold">
                <Sparkles className="h-3.5 w-3.5 shrink-0" /> Siêu thị mini trong phố
              </div>
              <h1 className="font-display font-black text-[1.75rem] leading-[1.15] sm:text-4xl md:text-[52px] md:leading-[1.05] mt-4 break-words">
                Đồ tươi mỗi ngày,<br />
                <span className="text-lime-400">giao nhanh trong phố.</span>
              </h1>
              <p className="mt-3 sm:mt-4 text-white/75 text-sm sm:text-lg max-w-md leading-relaxed">
                Website và quầy thu ngân dùng chung một kho. Đặt là giữ hàng — không lo hết giữa đường.
              </p>
              <div className="mt-5 sm:mt-7 flex flex-wrap gap-2 sm:gap-3">
                <Link to="/catalog" className="btn-lime px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base">Đi chợ ngay</Link>
                <Link to="/dang-nhap" className="btn bg-white/10 text-white hover:bg-white/15 px-5 py-3 sm:px-6 sm:py-3.5 border border-white/15 text-sm sm:text-base">Tích điểm</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 min-w-0">
              {(mosaic.length ? mosaic : [{ emoji: "🥤", name: "Nước ngọt" }, { emoji: "🍜", name: "Mì gói" }, { emoji: "🥬", name: "Rau củ" }, { emoji: "🥛", name: "Sữa tươi" }, { emoji: "🍪", name: "Bánh kẹo" }, { emoji: "🍎", name: "Trái cây" }]).map((p: any, i: number) => (
                <Link
                  key={p.id || i}
                  to={p.slug ? `/p/${p.slug}` : "/catalog"}
                  className={`rounded-2xl sm:rounded-3xl bg-white/10 border border-white/10 p-2.5 sm:p-3 hover:bg-white/15 transition min-w-0 ${i === 0 ? "sm:col-span-2 sm:row-span-2 sm:min-h-[160px]" : "min-h-[72px] sm:min-h-[92px]"}`}
                >
                  <div className={`${i === 0 ? "text-4xl sm:text-6xl h-20 sm:h-28" : "text-2xl sm:text-3xl h-12 sm:h-16"} flex items-center justify-center`}>
                    <ProductImage src={p.image_url} emoji={p.emoji} alt={p.name} className="h-full w-full" />
                  </div>
                  <div className={`mt-1.5 sm:mt-2 font-bold leading-tight line-clamp-2 ${i === 0 ? "text-sm sm:text-base" : "text-[11px] sm:text-xs"}`}>{p.name}</div>
                  {p.sale_price && <div className="text-lime-300 text-xs sm:text-sm font-extrabold mt-1">{vnd(p.sale_price)}</div>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-3 sm:px-4 mt-4 sm:mt-5 grid sm:grid-cols-3 gap-3">
        <Trust icon={<Bike className="h-5 w-5" />} title="Ship khu gần 15k" desc="Đặt trước 18h, giao buổi tối quanh Thanh Xuân." tone="coral" />
        <Trust icon={<Store className="h-5 w-5" />} title="Lấy tại quầy 0đ" desc="Giữ hàng 24 giờ, qua POS là nhận." tone="lime" />
        <Trust icon={<QrCode className="h-5 w-5" />} title="VietQR chuẩn NH" desc="Quét app ngân hàng, không cổng phí." tone="ink" />
      </section>

      <section className="mt-12 bg-white py-12 border-y border-black/[.04]">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="section-kicker">Kệ hàng</div>
              <h2 className="font-display font-black text-2xl sm:text-3xl mt-1">Chọn nhóm rồi đi chợ</h2>
            </div>
            <Link to="/catalog" className="hidden sm:inline-flex items-center gap-1 font-bold text-forest-800">
              Tất cả danh mục <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {cats.isPending &&
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-3xl" />)}
            {cats.data?.map((c: any) => (
              <Link key={c.id} to={`/catalog?category=${c.id}`} className="rounded-3xl bg-cream border border-black/[.04] p-4 text-center hover:-translate-y-1 hover:border-lime-400 hover:bg-lime-50 transition">
                <div className="text-3xl">{c.icon}</div>
                <div className="mt-2 text-sm font-bold leading-tight">{c.name}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-3 sm:px-4 mt-8 sm:mt-10 grid md:grid-cols-2 gap-4">
        <Link to="/catalog?q=rau" className="rounded-[1.5rem] sm:rounded-[1.75rem] bg-lime-400 p-5 sm:p-7 text-forest-900 relative overflow-hidden min-h-[160px] sm:min-h-[180px] hover:brightness-105 transition">
          <div className="absolute -right-4 -bottom-6 text-9xl opacity-30">🥬</div>
          <div className="relative">
            <div className="text-xs font-extrabold uppercase tracking-widest">Sáng nay nhập</div>
            <h3 className="font-display font-black text-2xl sm:text-3xl mt-1">Rau củ còn sương</h3>
            <span className="inline-flex mt-4 bg-forest-900 text-white rounded-2xl px-4 py-2 text-sm font-bold">Xem kệ rau</span>
          </div>
        </Link>
        <Link to="/catalog?q=mì" className="rounded-[1.5rem] sm:rounded-[1.75rem] bg-coral-500 p-5 sm:p-7 text-white relative overflow-hidden min-h-[160px] sm:min-h-[180px] hover:brightness-105 transition">
          <div className="absolute -right-4 -bottom-6 text-9xl opacity-20">🔥</div>
          <div className="relative">
            <div className="text-xs font-extrabold uppercase tracking-widest">Deal trong phố</div>
            <h3 className="font-display font-black text-2xl sm:text-3xl mt-1">Mì · nước · snack</h3>
            <p className="mt-2 font-bold max-w-xs opacity-90">Mã TET10 · giảm 10%</p>
            <span className="inline-flex mt-4 bg-white text-coral-600 rounded-2xl px-4 py-2 text-sm font-bold">Săn deal</span>
          </div>
        </Link>
      </section>

      <section className="max-w-6xl mx-auto px-3 sm:px-4 mt-10 sm:mt-14 pb-6">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="section-kicker">Bán chạy hôm nay</div>
            <h2 className="font-display font-black text-2xl sm:text-3xl mt-1">Đang cháy kệ</h2>
          </div>
          <Link to="/catalog" className="inline-flex items-center gap-1 font-bold text-forest-800 shrink-0 text-sm sm:text-base">
            Xem hết <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {hot.isPending
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-3xl" />)
            : hot.data?.items?.map((p: any) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      <section className="mt-10 bg-forest-900 text-white py-14">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="section-kicker !text-lime-400">Cách đặt</div>
          <h2 className="font-display font-black text-2xl sm:text-3xl mt-1">Ba bước, hàng đã giữ</h2>
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <Step n="01" icon={<Timer className="h-5 w-5" />} title="Bỏ vào giỏ" desc="Tìm không dấu, xem còn trên kệ thật — số bán được đã trừ hàng đang giữ." />
            <Step n="02" icon={<ShieldCheck className="h-5 w-5" />} title="Chốt là giữ" desc="Nhận tại quầy hoặc ship. Đơn online giữ hàng để thu ngân không bán mất." />
            <Step n="03" icon={<QrCode className="h-5 w-5" />} title="Trả tiền" desc="COD hoặc quét VietQR đúng mã đơn. Điểm tích dùng được cả lúc mua tại quầy." />
          </div>
        </div>
      </section>
    </div>
  );
}

function Trust({ icon, title, desc, tone }: { icon: any; title: string; desc: string; tone: string }) {
  const map: any = {
    coral: "bg-coral-50 border-coral-100",
    lime: "bg-lime-50 border-lime-100",
    ink: "bg-white border-black/[.06]",
  };
  const iconMap: any = {
    coral: "bg-coral-500 text-white",
    lime: "bg-lime-400 text-forest-900",
    ink: "bg-forest-900 text-white",
  };
  return (
    <div className={`rounded-3xl border p-4 flex gap-3 ${map[tone]}`}>
      <div className={`h-11 w-11 rounded-2xl grid place-items-center shrink-0 ${iconMap[tone]}`}>{icon}</div>
      <div>
        <div className="font-extrabold">{title}</div>
        <div className="text-sm text-ink-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: string; icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
      <div className="flex items-center justify-between">
        <span className="h-10 w-10 rounded-2xl bg-lime-400 text-forest-900 grid place-items-center">{icon}</span>
        <span className="font-mono text-white/30 text-xl">{n}</span>
      </div>
      <div className="font-extrabold text-lg mt-4">{title}</div>
      <p className="text-white/70 text-sm mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}
