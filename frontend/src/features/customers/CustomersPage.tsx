import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Plus, Sparkles, Users } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import { TIER } from "../../lib/labels";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/Badge";
import { CardSkeleton, EmptyState, ErrorState } from "../../components/ui/Feedback";
import { PageHeader, SearchInput, Section, StatCard, Toolbar } from "../../components/ui/Page";
import { Input } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

export default function CustomersPage() {
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: ["customers", term],
    queryFn: () => staffApi.customers(term ? { q: term } : undefined),
  });
  const rows = q.data || [];

  const totals = useMemo(
    () => ({
      spent: rows.reduce((s: number, c: any) => s + Number(c.total_spent || 0), 0),
      points: rows.reduce((s: number, c: any) => s + Number(c.loyalty_points || 0), 0),
    }),
    [rows]
  );

  return (
    <div>
      <PageHeader
        kicker="Sổ sách"
        title="Khách hàng"
        actions={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            Thêm khách
          </Button>
        }
      />

      <Section title="Tóm tắt sổ khách" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Khách đang hiện" value={num(rows.length)} icon={Users} sub={term ? "đúng với từ khoá đang tìm" : "50 khách gần nhất"} />
          <StatCard label="Tổng đã chi" value={vnd(totals.spent)} tone="sun" sub="cộng cả quầy và website" />
          <StatCard label="Điểm đang giữ" value={num(totals.points)} tone="ink" icon={Sparkles} sub="1 điểm đổi 1đ khi mua tại quầy" />
        </div>
      </Section>

      <Toolbar>
        <SearchInput value={term} onChange={setTerm} placeholder="Tìm theo tên hoặc số điện thoại…" />
      </Toolbar>

      {q.isPending ? (
        <CardSkeleton count={6} />
      ) : q.isError ? (
        <div className="card">
          <ErrorState error={q.error} onRetry={q.refetch} />
        </div>
      ) : !rows.length ? (
        <div className="card">
          <EmptyState
            emoji="🙋"
            title={term ? "Không tìm thấy khách nào" : "Sổ khách còn trống"}
            action={
              term ? (
                <Button variant="ghost" onClick={() => setTerm("")}>
                  Xoá từ khoá
                </Button>
              ) : (
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  Thêm khách
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c: any) => (
            <article key={c.id} className="card p-4 transition hover:-translate-y-0.5 hover:shadow-pop">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-lime-100 font-display text-lg font-black text-forest-800">
                  {String(c.name || "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink-900">{c.name}</div>
                  <a
                    href={c.phone ? `tel:${c.phone}` : undefined}
                    className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-ink-500 hover:text-coral-600"
                  >
                    <Phone className="h-3 w-3" />
                    {c.phone || "chưa có số"}
                  </a>
                </div>
                <StatusBadge map={TIER} value={c.tier} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-sand/60 px-3 py-2">
                  <dt className="text-[10px] font-extrabold uppercase tracking-wider text-ink-400">Điểm</dt>
                  <dd className="font-display text-lg font-black text-ink-900">{num(c.loyalty_points)}</dd>
                </div>
                <div className="rounded-2xl bg-sand/60 px-3 py-2">
                  <dt className="text-[10px] font-extrabold uppercase tracking-wider text-ink-400">Đã chi</dt>
                  <dd className="font-display text-lg font-black text-ink-900">{vnd(c.total_spent)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      {adding && (
        <AddCustomer
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            q.refetch();
          }}
        />
      )}
    </div>
  );
}

function AddCustomer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!f.name.trim()) next.name = "Cần tên để gọi khách";
    const phone = f.phone.replace(/\s/g, "");
    if (phone && !/^0\d{9}$/.test(phone)) next.phone = "Số điện thoại phải 10 số, bắt đầu bằng 0";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const c = await staffApi.createCustomer({
        name: f.name.trim(),
        phone: phone || null,
        address: f.address.trim() || null,
      });
      toast.success(`Đã thêm khách ${c.name} · mã ${c.code}`);
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
      title="Thêm khách"
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
      <div className="space-y-4">
        <Input
          label="Tên khách"
          required
          autoFocus
          placeholder="Nguyễn An"
          value={f.name}
          error={errors.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          label="Số điện thoại"
          className="font-mono"
          inputMode="numeric"
          placeholder="0901234567"
          value={f.phone}
          error={errors.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
        />
        <Input
          label="Địa chỉ"
          placeholder="Số nhà, đường, phường"
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
        />
      </div>
    </Modal>
  );
}
