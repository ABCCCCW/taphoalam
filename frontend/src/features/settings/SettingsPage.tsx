import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Landmark, Plus, Save, UserPlus } from "lucide-react";
import { staffApi } from "../../api/client";
import { ROLE, ROLES, look } from "../../lib/labels";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader, Panel } from "../../components/ui/Page";
import { Input, Select } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

/** Khoá cấu hình kèm nhãn người đọc được — trước đây màn hình in thẳng `bank.bin`. */
const GROUPS = [
  {
    title: "Thông tin cửa hàng",
    desc: "",
    icon: Building2,
    fields: [
      { key: "store.name", label: "Tên cửa hàng", placeholder: "Lâm Ly Mart" },
      { key: "store.address", label: "Địa chỉ", placeholder: "12 Nguyễn Trãi, Thanh Xuân, Hà Nội" },
      { key: "store.phone", label: "Số điện thoại", placeholder: "0901234567", mono: true },
    ],
  },
  {
    title: "Tài khoản nhận chuyển khoản",
    desc: "",
    icon: Landmark,
    fields: [
      { key: "bank.bin", label: "Mã ngân hàng (BIN)", placeholder: "970436", mono: true },
      { key: "bank.name", label: "Tên ngân hàng", placeholder: "Vietcombank" },
      { key: "bank.account", label: "Số tài khoản", placeholder: "0123456789", mono: true },
      { key: "bank.account_name", label: "Tên chủ tài khoản", placeholder: "NGUYEN VAN LAM" },
    ],
  },
];

const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export default function SettingsPage() {
  const toast = useToast();
  const settings = useQuery({ queryKey: ["settings"], queryFn: staffApi.settings });
  const users = useQuery({ queryKey: ["users"], queryFn: staffApi.users });

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  /* Chờ dữ liệu về mới dựng bản nháp, nếu không ô nhập sẽ bị gán rỗng đè lên. */
  useEffect(() => {
    if (settings.data && draft === null) {
      setDraft(Object.fromEntries(KEYS.map((k) => [k, settings.data[k] ?? ""])));
    }
  }, [settings.data, draft]);

  const dirty = useMemo(() => {
    if (!draft || !settings.data) return false;
    return KEYS.some((k) => (draft[k] ?? "") !== (settings.data[k] ?? ""));
  }, [draft, settings.data]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await staffApi.saveSettings(draft);
      toast.success("Đã lưu cấu hình cửa hàng");
      await settings.refetch();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (settings.isError) return <ErrorState error={settings.error} onRetry={settings.refetch} />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        kicker="Hệ thống"
        title="Cấu hình"
        actions={
          <Button icon={Save} loading={busy} disabled={!dirty} onClick={save}>
            {dirty ? "Lưu thay đổi" : "Đã lưu"}
          </Button>
        }
      />

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <Panel
            key={g.title}
            title={
              <span className="inline-flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-coral-100 text-coral-600">
                  <g.icon className="h-4 w-4" />
                </span>
                {g.title}
              </span>
            }
            desc={g.desc}
            bodyClassName="p-5 grid gap-4 sm:grid-cols-2"
          >
            {settings.isPending || !draft
              ? g.fields.map((f) => <Skeleton key={f.key} className="h-[4.75rem] rounded-2xl" />)
              : g.fields.map((f) => (
                  <Input
                    key={f.key}
                    label={f.label}
                    placeholder={f.placeholder}
                    hint={f.hint}
                    className={f.mono ? "font-mono" : undefined}
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                ))}
          </Panel>
        ))}

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-coral-100 text-coral-600">
                <UserPlus className="h-4 w-4" />
              </span>
              Nhân viên
            </span>
          }
          actions={
            <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
              Thêm
            </Button>
          }
          bodyClassName="p-5"
        >
          {users.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : !users.data?.length ? (
            <EmptyState emoji="👥" title="Chưa có nhân viên nào" />
          ) : (
            <ul className="list-rows">
              {users.data.map((u: any) => (
                <li key={u.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sand font-display font-black text-ink-700">
                    {String(u.full_name || u.username).trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink-900">{u.full_name}</div>
                    <div className="truncate font-mono text-xs text-ink-400">{u.username}</div>
                  </div>
                  {u.is_active === false && <Badge tone="mute">Đã tắt</Badge>}
                  <Badge tone={look(ROLE, u.role).tone}>{look(ROLE, u.role).label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {adding && (
        <AddUser
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            users.refetch();
          }}
        />
      )}
    </div>
  );
}

function AddUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: "", username: "", password: "", role: "CASHIER", pin: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!f.full_name.trim()) next.full_name = "Cần tên để hiện trên hoá đơn";
    if (!/^[a-z0-9_]{3,}$/.test(f.username)) next.username = "Tên đăng nhập: chữ thường, số, gạch dưới, từ 3 ký tự";
    if (f.password.length < 6) next.password = "Mật khẩu ít nhất 6 ký tự";
    if (f.pin && !/^\d{4}$/.test(f.pin)) next.pin = "PIN phải đúng 4 số";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await staffApi.createUser({
        full_name: f.full_name.trim(),
        username: f.username.trim(),
        password: f.password,
        role: f.role,
        pin: f.pin || null,
      });
      toast.success(`Đã tạo tài khoản ${f.username}`);
      onDone();
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
      title="Thêm nhân viên"
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Huỷ
          </Button>
          <Button className="flex-1" loading={busy} onClick={submit}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Tên nhân viên"
          required
          autoFocus
          wrapClass="sm:col-span-2"
          placeholder="Nguyễn Thị Hoa"
          value={f.full_name}
          error={errors.full_name}
          onChange={(e) => setF({ ...f, full_name: e.target.value })}
        />
        <Input
          label="Tên đăng nhập"
          required
          className="font-mono"
          placeholder="hoa_thu_ngan"
          value={f.username}
          error={errors.username}
          onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })}
        />
        <Input
          label="Mật khẩu"
          required
          type="password"
          placeholder="ít nhất 6 ký tự"
          value={f.password}
          error={errors.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <Select
          label="Vai"
          wrapClass="sm:col-span-2"
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value })}
          options={ROLES}
        />
        <Input
          label="PIN đổi ca"
          className="font-mono tracking-[0.3em]"
          maxLength={4}
          inputMode="numeric"
          placeholder="1234"
          value={f.pin}
          error={errors.pin}
          onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })}
        />
      </div>
    </Modal>
  );
}
