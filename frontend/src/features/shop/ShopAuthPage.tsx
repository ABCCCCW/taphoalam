import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { shopApi, staffApi } from "../../api/client";
import { useShopAuth } from "../../stores/shopAuthStore";
import { useAuth } from "../../stores/authStore";
import { homeFor } from "../../lib/roles";
import Button from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { Notice } from "../../components/ui/Feedback";
import { cn } from "../../lib/cn";
import BrandLogo from "../../components/ui/BrandLogo";

const STAFF_USERS = new Set(["admin", "cashier", "stocker"]);

export default function ShopAuthPage() {
  const [mode, setMode] = useState<"login" | "reg">("login");
  const [phone, setPhone] = useState("0901234567");
  const [password, setPassword] = useState("khach123");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { setAuth } = useShopAuth();
  const { setAuth: setStaffAuth } = useAuth();
  const nav = useNavigate();

  const switchMode = (m: "login" | "reg") => {
    setMode(m);
    setErr("");
    setErrors({});
  };

  const go = async () => {
    const ident = phone.trim();
    const staff = STAFF_USERS.has(ident.toLowerCase());

    /* Tài khoản nhân viên gõ vào đây vẫn cho đi tiếp, nên chỉ soát định dạng
       số điện thoại khi đúng là khách. */
    const next: Record<string, string> = {};
    if (!staff && !/^0\d{9}$/.test(ident)) next.phone = "Số điện thoại 10 số, bắt đầu bằng 0";
    if (password.length < 6) next.password = "Mật khẩu từ 6 ký tự";
    if (mode === "reg" && name.trim().length < 2) next.name = "Điền tên để quán gọi cho đúng";
    setErrors(next);
    setErr("");
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (mode === "login" && staff) {
        const d = await staffApi.login(ident.toLowerCase(), password);
        setStaffAuth(d.access_token, d.user, d.refresh_token);
        nav(homeFor(d.user.role));
        return;
      }
      const data =
        mode === "login"
          ? await shopApi.login(ident, password)
          : await shopApi.register({ name: name.trim(), phone: ident, password });
      setAuth(data.access_token, data.customer);
      nav("/");
    } catch (e: any) {
      setErr(
        staff
          ? "Tài khoản nhân viên. Thử admin / admin123 — hoặc vào trang Nhân viên / POS."
          : e.message || "Không vào được, kiểm lại số và mật khẩu nhé"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-6 px-3 py-8 sm:px-4 sm:py-12 md:grid-cols-2 md:gap-8">
      <div className="relative min-h-0 overflow-hidden rounded-4xl bg-forest-900 p-6 text-white sm:p-8 md:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-lime-400/20 blur-3xl" />
        <div className="relative">
          <BrandLogo size={72} className="h-[4.5rem] w-[4.5rem]" />
          <h2 className="mt-4 font-display text-2xl font-black sm:text-3xl">
            Có tài khoản là <span className="text-lime-400">tích điểm</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Mỗi 10.000đ được 1 điểm, dùng luôn ở quầy. Đơn đặt online là hàng được giữ, tới lấy không sợ hết.
          </p>
          <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm leading-relaxed">
            <div className="font-bold text-lime-400">Khách hàng (trang này)</div>
            <div className="mt-1 font-mono text-white/80">0901234567 / khach123</div>
            <div className="mt-3 font-bold text-lime-400">Nhân viên / POS</div>
            <div className="mt-1 font-mono text-white/80">admin / admin123</div>
            <Link to="/admin/login" className="mt-3 inline-block font-bold text-lime-400 hover:underline">
              → Đăng nhập nhân viên
            </Link>
          </div>
        </div>
      </div>

      <form
        className="card min-w-0 p-5 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <div className="mb-6 flex rounded-2xl bg-sand p-1">
          {(["login", "reg"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={cn(
                "flex-1 rounded-xl py-2 font-bold transition",
                mode === m ? "bg-white shadow-sm" : "text-ink-400 hover:text-ink-600"
              )}
              onClick={() => switchMode(m)}
            >
              {m === "login" ? "Đăng nhập" : "Đăng ký"}
            </button>
          ))}
        </div>

        <h1 className="font-display text-2xl font-black">{mode === "login" ? "Vào tiệm" : "Tạo tài khoản"}</h1>

        <div className="mt-5 space-y-3">
          {mode === "reg" && (
            <Input
              label="Tên bạn"
              required
              placeholder="Nguyễn An"
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Input
            label="Số điện thoại"
            required
            className="font-mono"
            inputMode="tel"
            autoComplete="username"
            placeholder="0901234567"
            value={phone}
            error={errors.phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Mật khẩu"
            required
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="Ít nhất 6 ký tự"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <Notice tone="danger">{err}</Notice>}
          <Button block size="lg" type="submit" loading={busy}>
            {mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </Button>
          <p className="text-center text-sm text-ink-400">
            Nhân viên?{" "}
            <Link to="/admin/login" className="font-bold text-forest-800 hover:text-coral-500">
              Vào POS / admin
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
