import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { shopApi, staffApi } from "../../api/client";
import { useShopAuth } from "../../stores/shopAuthStore";
import { useAuth } from "../../stores/authStore";
import { homeFor } from "../../lib/roles";
import { asciiPassword, digitsOnly, isVnPhone, passwordError } from "../../lib/input";
import Button from "../../components/ui/Button";
import { Input, PasswordInput } from "../../components/ui/Field";
import { Notice } from "../../components/ui/Feedback";
import { cn } from "../../lib/cn";
import BrandLogo from "../../components/ui/BrandLogo";

const isPhone = (s: string) => isVnPhone(s);

export default function ShopAuthPage() {
  const [mode, setMode] = useState<"login" | "reg">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
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
    setPhone("");
    setPassword("");
    setName("");
  };

  const setIdent = (raw: string) => {
    if (mode === "reg" || /^\d/.test(raw)) setPhone(digitsOnly(raw).slice(0, 10));
    else setPhone(raw.replace(/\s/g, "").toLowerCase());
  };

  const go = async () => {
    const ident = phone.trim();
    const staff = mode === "login" && !isPhone(ident);
    const pw = asciiPassword(password);

    const next: Record<string, string> = {};
    if (!ident) next.phone = mode === "reg" ? "Nhập số điện thoại" : "Nhập số điện thoại hoặc tên đăng nhập";
    else if (mode === "reg" && !isPhone(ident)) next.phone = "Số điện thoại 10 số, bắt đầu bằng 0";
    const pwErr = passwordError(pw);
    if (pwErr) next.password = pwErr;
    if (mode === "reg" && name.trim().length < 2) next.name = "Điền tên để quán gọi cho đúng";
    setErrors(next);
    setErr("");
    if (Object.keys(next).length) return;

    const staffLogin = async (username: string) => {
      const d = await staffApi.login(username, pw);
      setStaffAuth(d.access_token, d.user, d.refresh_token);
      nav(homeFor(d.user.role), { replace: true });
    };

    setBusy(true);
    try {
      if (staff) return await staffLogin(ident.toLowerCase());
      if (mode === "reg") {
        const data = await shopApi.register({ name: name.trim(), phone: ident, password: pw });
        setAuth(data.access_token, data.customer);
        return nav("/");
      }
      try {
        const data = await shopApi.login(ident, pw);
        setAuth(data.access_token, data.customer);
        nav("/");
      } catch (e) {
        try {
          await staffLogin(ident);
        } catch {
          throw e;
        }
      }
    } catch (e: any) {
      setErr(
        staff
          ? "Sai tên đăng nhập hoặc mật khẩu nhân viên."
          : e.message || "Không vào được, kiểm lại số và mật khẩu nhé"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-3 py-10 sm:px-4 sm:py-14">
      <BrandLogo size={64} className="h-16 w-16" />
      <h1 className="mt-4 font-display text-2xl font-black tracking-tight sm:text-3xl">
        {mode === "login" ? "Vào tiệm" : "Tạo tài khoản"}
      </h1>

      <form
        className="card mt-6 w-full min-w-0 p-5 sm:p-7"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <div className="mb-5 flex rounded-2xl bg-sand p-1">
          {(["login", "reg"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={cn(
                "flex-1 rounded-xl py-2 text-sm font-bold transition",
                mode === m ? "bg-white shadow-sm" : "text-ink-400 hover:text-ink-600"
              )}
              onClick={() => switchMode(m)}
            >
              {m === "login" ? "Đăng nhập" : "Đăng ký"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "reg" && (
            <Input
              label="Tên bạn"
              required
              autoComplete="name"
              placeholder="Tên sẽ hiện trên đơn"
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Input
            label={mode === "login" ? "Số điện thoại / tên đăng nhập" : "Số điện thoại"}
            required
            className="font-mono"
            digits={mode === "reg"}
            maxLength={mode === "reg" ? 10 : undefined}
            autoComplete={mode === "reg" ? "tel" : "username"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={mode === "reg" ? "Số điện thoại 10 số" : "Số điện thoại"}
            value={phone}
            error={errors.phone}
            onChange={(e) => setIdent(e.target.value)}
          />
          <PasswordInput
            label="Mật khẩu"
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "reg" ? "Từ 6 ký tự, không dấu" : "Mật khẩu"}
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <Notice tone="danger">{err}</Notice>}
          <Button block size="lg" type="submit" variant="ink" loading={busy}>
            {mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </Button>
        </div>
      </form>
    </div>
  );
}
