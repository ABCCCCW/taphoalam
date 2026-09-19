import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { staffApi } from "../../api/client";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { digitsOnly } from "../../lib/input";
import { cn } from "../../lib/cn";

const PIN_LEN = 6;

const FIELDS = [
  { key: "bank.name", label: "Tên ngân hàng", placeholder: "Vietcombank" },
  { key: "bank.bin", label: "Mã ngân hàng (BIN)", placeholder: "970436", mono: true, digits: true, maxLength: 6 },
  { key: "bank.account", label: "Số tài khoản", placeholder: "0123456789", mono: true, digits: true, maxLength: 19 },
  { key: "bank.account_name", label: "Tên chủ tài khoản", placeholder: "NGUYEN VAN LAM" },
] as const;

/** Tài khoản nhận VietQR — mở bằng PIN, sửa trong popup. */
export default function BankModal({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState<string | null>(null);
  return pin ? <BankForm pin={pin} onClose={onClose} /> : <PinStep onOk={setPin} onClose={onClose} />;
}

function PinStep({ onOk, onClose }: { onOk: (pin: string) => void; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const check = async (value: string) => {
    if (value.length !== PIN_LEN || busy) return;
    setBusy(true);
    try {
      await staffApi.unlockSettings(value);
      onOk(value);
    } catch {
      setError("Mã PIN không đúng");
      setPin("");
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal size="sm" onClose={onClose} title="Nhập mã PIN">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === PIN_LEN) check(pin);
        }}
      >
        <label className="relative block cursor-text">
          <input
            ref={ref}
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Mã PIN 6 số"
            maxLength={PIN_LEN}
            value={pin}
            disabled={busy}
            onChange={(e) => {
              const v = digitsOnly(e.target.value).slice(0, PIN_LEN);
              setPin(v);
              setError(null);
              if (v.length === PIN_LEN) check(v);
            }}
            className="peer absolute inset-0 h-full w-full opacity-0"
          />
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "grid h-14 place-items-center rounded-2xl border-2 bg-white transition",
                  error ? "border-coral-400" : i === pin.length ? "border-lime-500 ring-4 ring-lime-100" : "border-ink-200"
                )}
              >
                {i < pin.length && <span className="h-3 w-3 rounded-full bg-ink-900" />}
              </span>
            ))}
          </div>
        </label>
        <p className={cn("mt-3 h-4 text-center text-xs font-semibold", error ? "text-coral-600" : "text-ink-400")}>
          {error || (busy ? "Đang kiểm tra…" : "")}
        </p>
      </form>
    </Modal>
  );
}

function BankForm({ pin, onClose }: { pin: string; onClose: () => void }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ["settings"], queryFn: staffApi.settings });
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data && !draft) setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, q.data[f.key] ?? ""])));
  }, [q.data, draft]);

  const dirty = !!draft && !!q.data && FIELDS.some((f) => (draft[f.key] ?? "") !== (q.data[f.key] ?? ""));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await staffApi.saveSettings(draft, pin);
      toast.success("Đã lưu tài khoản nhận tiền");
      await q.refetch();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="md"
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-100 text-coral-600">
            <Landmark className="h-4 w-4" />
          </span>
          Tài khoản ngân hàng
        </span>
      }
      footer={
        <>
          <Button variant="ghost" className="flex-1 sm:flex-none sm:px-6" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="ink" className="flex-1 sm:flex-none sm:px-8" loading={busy} disabled={!dirty} onClick={save}>
            Lưu
          </Button>
        </>
      }
    >
      {!draft ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Skeleton key={f.key} className="h-[4.5rem] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              digits={"digits" in f ? f.digits : undefined}
              maxLength={"maxLength" in f ? f.maxLength : undefined}
              className={"mono" in f && f.mono ? "font-mono" : undefined}
              wrapClass={f.key === "bank.account_name" ? "sm:col-span-2" : undefined}
              value={draft[f.key] ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [f.key]: f.key === "bank.account_name" ? e.target.value.toUpperCase() : e.target.value,
                })
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
