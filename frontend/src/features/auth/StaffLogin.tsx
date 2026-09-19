import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { staffApi } from "../../api/client";
import { useAuth } from "../../stores/authStore";
import { homeFor } from "../../lib/roles";
import Button from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { Notice } from "../../components/ui/Feedback";
import BrandLogo from "../../components/ui/BrandLogo";

export default function StaffLogin() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"pw" | "pin" | null>(null);
  const { setAuth } = useAuth();
  const nav = useNavigate();

  const enter = (d: any) => {
    setAuth(d.access_token, d.user, d.refresh_token);
    nav(homeFor(d.user.role));
  };

  const signIn = async () => {
    if (!username.trim() || !password) {
      setErr("Điền tài khoản và mật khẩu đã nhé");
      return;
    }
    setErr("");
    setBusy("pw");
    try {
      enter(await staffApi.login(username.trim(), password));
    } catch (e: any) {
      setErr(e.message || "Không đăng nhập được");
    } finally {
      setBusy(null);
    }
  };

  const signInPin = async () => {
    if (pin.length !== 4) {
      setErr("PIN gồm 4 số");
      return;
    }
    setErr("");
    setBusy("pin");
    try {
      enter(await staffApi.pin(pin));
    } catch (e: any) {
      setErr(e.message || "PIN không đúng");
      setPin("");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-dvh bg-cream md:grid-cols-[1.05fr_.95fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-lime-400 p-12 text-forest-900 md:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-coral-500/25 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <BrandLogo size={44} className="h-11 w-11" />
          <span className="font-display text-xl font-black">Lâm Ly Mart POS</span>
        </div>

        <div className="relative">
          <h2 className="font-display text-[3.25rem] font-black leading-[1.02] tracking-tight">
            Quẹt.
            <br />
            Chốt.
            <br />
            Xong.
          </h2>
          <p className="mt-4 max-w-sm font-semibold leading-relaxed text-forest-800/80">
            Quầy và website dùng chung một kho. Khách đặt online là hàng được giữ, thu ngân không bán mất phần đó.
          </p>
        </div>

        <div className="relative rounded-3xl bg-forest-900/10 p-4 text-sm">
          <div className="text-[11px] font-black uppercase tracking-[.16em] text-forest-800/60">Tài khoản thử</div>
          <ul className="mt-2 space-y-0.5 font-mono font-semibold">
            <li>admin / admin123 · PIN 0000</li>
            <li>cashier / cashier123 · PIN 1234</li>
            <li>stocker / stocker123 · PIN 4321</li>
          </ul>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col justify-center px-6 py-10 sm:px-10 md:px-14">
        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 transition hover:text-forest-900"
          >
            <ArrowLeft className="h-4 w-4" /> Về trang khách
          </Link>

          <h1 className="font-display text-3xl font-black text-forest-900">Đăng nhập nhân viên</h1>

          <form
            className="mt-7 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
          >
            <Input
              label="Tài khoản"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErr("");
              }}
            />
            <Input
              label="Mật khẩu"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErr("");
              }}
            />
            {err && <Notice tone="danger">{err}</Notice>}
            <Button block size="lg" type="submit" icon={LogIn} loading={busy === "pw"}>
              Vào hệ thống
            </Button>
          </form>

          <div className="mt-9 rounded-3xl border border-black/[.06] bg-white p-4">
            <div className="text-sm font-semibold text-ink-500">Đổi ca nhanh</div>
            <div className="mt-3 text-center font-mono text-2xl font-black tracking-[0.55em] text-forest-800" aria-label="Mã PIN 4 số">
              {(pin + "••••").slice(0, 4)}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy === "pin"}
                  className={
                    k === "OK"
                      ? "h-11 rounded-xl bg-coral-500 text-sm font-black text-white disabled:opacity-40"
                      : "h-11 rounded-xl bg-sand text-sm font-bold text-ink-800 hover:bg-lime-100 disabled:opacity-40"
                  }
                  onClick={() => {
                    if (k === "⌫") {
                      setPin((p) => p.slice(0, -1));
                      setErr("");
                      return;
                    }
                    if (k === "OK") {
                      signInPin();
                      return;
                    }
                    setPin((p) => (p + k).slice(0, 4));
                    setErr("");
                  }}
                >
                  {k === "OK" ? (busy === "pin" ? "…" : "Vào") : k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
