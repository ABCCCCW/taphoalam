import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, Users } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import { CHANNEL, TIER } from "../../lib/labels";
import Button from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/Feedback";
import { PAGE_SIZE, PageBody, PageFrame, PageHeader, Pager, SearchInput, Section, StatCard, Toolbar } from "../../components/ui/Page";
import { Input } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

export default function CustomersPage() {
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: ["customers", term, page],
    queryFn: () => staffApi.customers({ q: term || undefined, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = q.data?.items || [];
  const pages = q.data?.pages || 1;
  const total = q.data?.total || 0;

  const totals = useMemo(
    () => ({
      spent: rows.reduce((s: number, c: any) => s + Number(c.total_spent || 0), 0),
      points: rows.reduce((s: number, c: any) => s + Number(c.loyalty_points || 0), 0),
    }),
    [rows]
  );

  const columns: Column<any>[] = [
    {
      key: "name",
      head: "Khách",
      primary: true,
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-bold text-ink-900">{c.name}</div>
          <div className="font-mono text-[11px] text-ink-400">{c.code}</div>
        </div>
      ),
    },
    {
      key: "phone",
      head: "Số điện thoại",
      cell: (c) => <span className="font-mono text-sm text-ink-700">{c.phone || "—"}</span>,
    },
    { key: "tier", head: "Hạng", cell: (c) => <StatusBadge map={TIER} value={c.tier} /> },
    { key: "source", head: "Nguồn", cell: (c) => <StatusBadge map={CHANNEL} value={c.source} /> },
    {
      key: "points",
      head: "Điểm",
      align: "right",
      cell: (c) => <span className="font-display font-black text-ink-900">{num(c.loyalty_points)}</span>,
    },
    {
      key: "spent",
      head: "Đã chi",
      align: "right",
      cell: (c) => <span className="font-display font-black text-ink-900">{vnd(c.total_spent)}</span>,
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        className="mb-0"
        kicker="Sổ sách"
        title="Khách hàng"
        actions={
          <Button variant="ink" icon={Plus} onClick={() => setAdding(true)}>
            Thêm khách
          </Button>
        }
      />

      <PageBody>

      <Section title="Tóm tắt sổ khách" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Khách đang hiện" value={num(total)} icon={Users} />
          <StatCard label="Tổng đã chi" value={vnd(totals.spent)} tone="sun" />
          <StatCard label="Điểm đang giữ" value={num(totals.points)} tone="ink" icon={Sparkles} />
        </div>
      </Section>

      <Toolbar>
        <SearchInput
          value={term}
          onChange={(v) => {
            setPage(1);
            setTerm(v);
          }}
          placeholder="Tìm theo tên hoặc số điện thoại…"
        />
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        loading={q.isPending}
        error={q.isError ? q.error : undefined}
        onRetry={q.refetch}
        empty={
          <EmptyState
            emoji="🙋"
            title={term ? "Không tìm thấy khách nào" : "Sổ khách còn trống"}
            action={
              term ? (
                <Button variant="ghost" onClick={() => setTerm("")}>
                  Xoá từ khoá
                </Button>
              ) : (
                <Button variant="ink" icon={Plus} onClick={() => setAdding(true)}>
                  Thêm khách
                </Button>
              )
            }
          />
        }
      />
      {rows.length > 0 && <Pager className="mt-4" page={page} pages={pages} total={total} onPage={setPage} />}

      {adding && (
        <AddCustomer
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            q.refetch();
          }}
        />
      )}
      </PageBody>
    </PageFrame>
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
          digits
          maxLength={10}
          placeholder="Số điện thoại 10 số"
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
