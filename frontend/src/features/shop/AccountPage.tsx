import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, MapPin, Package, Store } from "lucide-react";
import { shopApi } from "../../api/client";
import { useShopAuth } from "../../stores/shopAuthStore";
import { vnd } from "../../lib/format";
import { TIER, look } from "../../lib/labels";
import Button from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Feedback";

/* Hạng lên theo tổng tiền đã chi (xem order_service), không theo điểm tích. */
const NEXT: Record<string, { tier: string; at: number }> = {
  MEMBER: { tier: "SILVER", at: 1_000_000 },
  SILVER: { tier: "GOLD", at: 5_000_000 },
};

export default function AccountPage() {
  const { customer, logout } = useShopAuth();
  const nav = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: shopApi.me, enabled: !!customer });
  const addrs = useQuery({ queryKey: ["addr"], queryFn: shopApi.addresses, enabled: !!customer });
  const c = me.data || customer;

  if (!c) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mb-3 text-6xl">😎</div>
        <h1 className="font-display text-3xl font-black">Tài khoản</h1>
        <p className="mt-2 text-ink-500">Đăng nhập để xem điểm và đơn đã đặt.</p>
        <Link to="/dang-nhap" className="btn-lime mt-6 inline-flex">
          Vào tiệm
        </Link>
      </div>
    );
  }

  const tier = look(TIER, c.tier);
  const next = NEXT[c.tier];
  const points = Number(c.loyalty_points || 0);
  const spent = Number(c.total_spent || 0);
  const pct = next ? Math.min(100, Math.round((spent / next.at) * 100)) : 100;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-3 py-8 sm:px-4">
      <div className="relative overflow-hidden rounded-4xl bg-forest-900 p-7 text-center text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime-400/20 blur-3xl" />
        <div className="relative">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime-400 font-display text-2xl font-black text-forest-900">
            {(c.name || "K").charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-3 break-words font-display text-2xl font-black">{c.name}</h1>
          <p className="font-mono text-white/60">{c.phone}</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4 text-left">
              <div className="text-xs text-white/50">Hạng thành viên</div>
              <div className="font-display text-xl font-black">{tier.label}</div>
            </div>
            <div className="rounded-2xl bg-lime-400 p-4 text-left text-forest-900">
              <div className="text-xs opacity-70">Điểm tích</div>
              <div className="font-display text-xl font-black">{points.toLocaleString("vi-VN")}</div>
            </div>
          </div>

          {next && (
            <div className="mt-4 text-left">
              <div className="flex justify-between text-xs text-white/60">
                <span>Lên hạng {look(TIER, next.tier).label}</span>
                <span>còn {vnd(Math.max(0, next.at - spent))}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-white/60">Đã chi {vnd(c.total_spent)} · 1 điểm = 1đ khi trả tại quầy</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 font-display font-black text-ink-900">
          <MapPin className="h-4 w-4 text-coral-500" /> Địa chỉ nhận hàng
        </div>
        {addrs.isPending ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : addrs.data?.length ? (
          <div className="space-y-2">
            {addrs.data.map((a: any) => (
              <div key={a.id} className="rounded-2xl bg-sand px-4 py-3 text-sm">
                <div className="font-bold text-ink-900">
                  {a.receiver_name} · <span className="font-mono font-semibold">{a.receiver_phone}</span>
                </div>
                <div className="text-ink-500">
                  {a.street}, {a.ward}, {a.district}, {a.province}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">
            Chưa lưu địa chỉ nào. Đặt đơn giao tận nơi là địa chỉ được lưu lại cho lần sau.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/orders">
          <Button block variant="ghost" size="lg" icon={Package}>
            Đơn của tôi
          </Button>
        </Link>
        <Link to="/catalog">
          <Button block size="lg" icon={Store}>
            Đi chợ tiếp
          </Button>
        </Link>
      </div>

      <Button
        block
        variant="quiet"
        icon={LogOut}
        onClick={() => {
          logout();
          nav("/");
        }}
      >
        Đăng xuất
      </Button>
    </div>
  );
}
