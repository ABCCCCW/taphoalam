import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Crown, KeyRound, Pencil, Plus, Power, ShoppingCart, UserRound, Warehouse } from "lucide-react";
import { staffApi } from "../../api/client";
import { when } from "../../lib/format";
import { cn } from "../../lib/cn";
import { ROLE, ROLES, look } from "../../lib/labels";
import { asciiPassword, passwordError } from "../../lib/input";
import { useAuth } from "../../stores/authStore";
import Button, { IconButton } from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/Feedback";
import { PAGE_SIZE, PageBody, PageFrame, PageHeader, Pager, SearchInput, Segmented, Toolbar } from "../../components/ui/Page";
import { Input, PasswordInput } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

const DEFAULT_STAFF_PASSWORD = "Nguyenbaolam";

type Filter = "" | "CASHIER" | "STOCKER" | "off";

export default function AccountsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [reset, setReset] = useState<any>(null);

  const q = useQuery({
    queryKey: ["users", term, filter, page],
    queryFn: () =>
      staffApi.users({
        q: term || undefined,
        role: filter && filter !== "off" ? filter : undefined,
        active: filter === "off" ? false : undefined,
        page,
        size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = q.data?.items || [];
  const pages = q.data?.pages || 1;
  const total = q.data?.total || 0;
  const nextCode = q.data?.next_username || "0003";

  const resetPage = (fn: () => void) => {
    setPage(1);
    fn();
  };

  const toggle = async (row: any) => {
    try {
      const next = !row.is_active;
      await staffApi.updateUser(row.id, { is_active: next });
      toast.success(next ? `Đã bật ${row.full_name}` : `Đã tắt ${row.full_name}`);
      q.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      head: "Nhân viên",
      primary: true,
      cell: (u) => (
        <div className="min-w-0">
          <div className="truncate font-bold text-ink-900">{u.full_name}</div>
          <div className="font-mono text-[11px] text-ink-400">{u.username}</div>
        </div>
      ),
    },
    { key: "role", head: "Vai", cell: (u) => <StatusBadge map={ROLE} value={u.role} /> },
    {
      key: "login",
      head: "Vào lần cuối",
      cell: (u) => <span className="whitespace-nowrap text-xs text-ink-400">{u.last_login_at ? when(u.last_login_at) : "Chưa vào"}</span>,
    },
    {
      key: "st",
      head: "Trạng thái",
      cell: (u) => (u.is_active === false ? <Badge tone="mute">Đã tắt</Badge> : <Badge tone="lime">Đang dùng</Badge>),
    },
    {
      key: "act",
      head: "",
      align: "right",
      desktopOnly: true,
      cell: (u) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Pencil} label="Sửa" onClick={() => setEdit(u)} />
          <IconButton icon={KeyRound} label="Mật khẩu" onClick={() => setReset(u)} />
          <IconButton
            icon={Power}
            label={u.is_active === false ? "Bật" : "Tắt"}
            tone={u.is_active === false ? "lime" : "danger"}
            disabled={u.id === user?.id}
            onClick={() => toggle(u)}
          />
        </div>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        className="mb-0"
        kicker="Hệ thống"
        title="Tài khoản"
        actions={
          <Button variant="ink" icon={Plus} onClick={() => setAdding(true)}>
            Thêm nhân viên
          </Button>
        }
      />

      <PageBody>
        <Toolbar>
          <SearchInput value={term} onChange={(v) => resetPage(() => setTerm(v))} placeholder="Tìm tên hoặc mã…" />
          <Segmented
            value={filter}
            onChange={(v) => resetPage(() => setFilter(v))}
            options={[
              { value: "", label: "Tất cả" },
              { value: "CASHIER", label: "Thu ngân" },
              { value: "STOCKER", label: "Kho" },
              { value: "off", label: "Đã tắt" },
            ]}
          />
        </Toolbar>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(u) => u.id}
          onRowClick={setEdit}
          loading={q.isPending}
          error={q.isError ? q.error : undefined}
          onRetry={q.refetch}
          empty={
            <EmptyState
              emoji="👥"
              title={term || filter ? "Không thấy tài khoản nào" : "Chưa có nhân viên nào"}
              action={
                term || filter ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      resetPage(() => {
                        setTerm("");
                        setFilter("");
                      })
                    }
                  >
                    Xoá bộ lọc
                  </Button>
                ) : (
                  <Button variant="ink" icon={Plus} onClick={() => setAdding(true)}>
                    Thêm nhân viên
                  </Button>
                )
              }
            />
          }
        />
        {rows.length > 0 && <Pager className="mt-4" page={page} pages={pages} total={total} onPage={setPage} />}
      </PageBody>

      {adding && (
        <StaffForm
          nextCode={nextCode}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            q.refetch();
          }}
        />
      )}
      {edit && (
        <StaffForm
          row={edit}
          nextCode={nextCode}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            q.refetch();
          }}
        />
      )}
      {reset && (
        <ResetPassword
          row={reset}
          onClose={() => setReset(null)}
          onDone={() => {
            setReset(null);
            q.refetch();
          }}
        />
      )}
    </PageFrame>
  );
}

function StaffForm({
  row,
  nextCode,
  onClose,
  onDone,
}: {
  row?: any;
  nextCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    full_name: row?.full_name || "",
    username: row?.username || "",
    password: row ? "" : DEFAULT_STAFF_PASSWORD,
    role: row?.role || "CASHIER",
  });
  const owner = row?.role === "ADMIN";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!f.full_name.trim()) next.full_name = "Cần tên để hiện trên hoá đơn";
    if (!row && f.username && !/^[a-z0-9_]{3,}$/.test(f.username)) next.username = "Tên đăng nhập: chữ thường, số, gạch dưới, từ 3 ký tự";
    if (!row) {
      const pwErr = passwordError(asciiPassword(f.password));
      if (pwErr) next.password = pwErr;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (row) {
        await staffApi.updateUser(row.id, {
          full_name: f.full_name.trim(),
          role: owner ? undefined : f.role,
        });
        toast.success(`Đã lưu ${f.full_name.trim()}`);
      } else {
        const created = await staffApi.createUser({
          full_name: f.full_name.trim(),
          username: f.username.trim() || null,
          password: asciiPassword(f.password),
          role: f.role,
        });
        toast.success(`Đã tạo tài khoản ${created.username}`);
      }
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={row ? `Sửa nhân viên · ${row.username}` : "Thêm nhân viên"}
      footer={
        <>
          <Button variant="ghost" className="flex-1 sm:flex-none sm:px-6" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="ink" className="flex-1 sm:flex-none sm:px-8" loading={busy} onClick={submit}>
            {row ? "Lưu thay đổi" : "Tạo tài khoản"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          label="Họ và tên"
          required
          autoFocus
          placeholder="Nguyễn Thị Hoa"
          value={f.full_name}
          error={errors.full_name}
          onChange={(e) => setF({ ...f, full_name: e.target.value })}
        />

        {/* Chủ tiệm chỉ có một: không chọn được, và vai của chủ tiệm không đổi. */}
        {!owner && (
          <div>
            <div className="mb-1.5 text-sm font-semibold text-ink-600">Vai trò</div>
            <div role="radiogroup" aria-label="Vai trò" className="grid grid-cols-2 gap-2">
              {STAFF_ROLES.map((r) => {
                const Icon = ROLE_ICON[r.value] || UserRound;
                const on = f.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setF({ ...f, role: r.value })}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
                      on ? "border-forest-900 bg-ink-50 ring-1 ring-forest-900" : "border-ink-200 hover:border-ink-300 hover:bg-ink-50/60"
                    )}
                  >
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", on ? "bg-forest-900 text-white" : "bg-ink-100 text-ink-600")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-ink-900">{look(ROLE, r.value).label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tên đăng nhập"
            className="font-mono"
            placeholder={nextCode}
            value={row ? row.username : f.username}
            disabled={!!row}
            error={errors.username}
            onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })}
          />
          {!row && (
            <PasswordInput
              label="Mật khẩu"
              required
              value={f.password}
              error={errors.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

const STAFF_ROLES = ROLES.filter((r) => r.value !== "ADMIN");

const ROLE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CASHIER: ShoppingCart,
  STOCKER: Warehouse,
  ADMIN: Crown,
};

function ResetPassword({ row, onClose, onDone }: { row: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState(DEFAULT_STAFF_PASSWORD);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const pw = asciiPassword(password);
    const err = passwordError(pw);
    setError(err || "");
    if (err) return;
    setBusy(true);
    try {
      await staffApi.resetUserPassword(row.id, pw);
      toast.success(`Đã đặt lại mật khẩu ${row.username}`);
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="sm"
      onClose={onClose}
      title={`Mật khẩu · ${row.username}`}
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
      <PasswordInput
        label="Mật khẩu mới"
        required
        autoFocus
        value={password}
        error={error}
        onChange={(e) => setPassword(e.target.value)}
      />
    </Modal>
  );
}
