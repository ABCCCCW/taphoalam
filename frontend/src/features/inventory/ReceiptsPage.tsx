import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, ChevronDown, PackageCheck, Plus, Printer, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { staffApi } from "../../api/client";
import { day, num, vnd, when } from "../../lib/format";
import { DOC_STATUS } from "../../lib/labels";
import Button, { IconButton } from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Notice, Skeleton } from "../../components/ui/Feedback";
import { PageBody, PageFrame, PageHeader, Panel } from "../../components/ui/Page";
import { Input, MoneyInput, Select, Textarea } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Confirm";
import { cn } from "../../lib/cn";

type Line = { key: number; product_id: number | ""; quantity: string; unit_cost: string; expiry_date: string };

const blankLine = (): Line => ({ key: Date.now() + Math.random(), product_id: "", quantity: "10", unit_cost: "", expiry_date: "" });

export default function ReceiptsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();

  const receipts = useQuery({ queryKey: ["receipts"], queryFn: staffApi.receipts });
  const prods = useQuery({ queryKey: ["prods-all"], queryFn: () => staffApi.products({ size: 300 }) });
  const sups = useQuery({ queryKey: ["suppliers"], queryFn: staffApi.suppliers });

  const [supplier, setSupplier] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [addingSup, setAddingSup] = useState(false);

  const items: any[] = prods.data?.items || [];
  const byId = useMemo(() => new Map<number, any>(items.map((p) => [p.id, p])), [items]);

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0),
    0
  );
  const filled = lines.filter((l) => l.product_id !== "" && Number(l.quantity) > 0);

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickProduct = (key: number, id: number | "") => {
    /* Chọn hàng thì lấy luôn giá vốn đang lưu làm gợi ý, khỏi gõ lại. */
    const p = id === "" ? null : byId.get(Number(id));
    setLine(key, {
      product_id: id,
      unit_cost: p && Number(p.cost_price) > 0 ? String(Math.round(p.cost_price)) : "",
      expiry_date: p?.suggested_expiry || "",
    });
  };

  const resetDraft = () => {
    setLines([blankLine()]);
    setSupplier("");
    setNote("");
    setErrors({});
  };

  const save = async () => {
    const next: Record<string, string> = {};
    if (!filled.length) next.lines = "Thêm ít nhất một dòng hàng có số lượng";
    const dup = filled.map((l) => l.product_id);
    if (new Set(dup).size !== dup.length) next.lines = "Một mặt hàng bị chọn hai lần — gộp vào một dòng nhé";
    if (filled.some((l) => !(Number(l.unit_cost) > 0))) next.lines = "Dòng nào cũng cần giá nhập lớn hơn 0";
    if (filled.some((l) => !l.expiry_date)) next.lines = "Mỗi lô phải có hạn sử dụng — để còn biết món nào phải xuống kệ";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const r = await staffApi.createReceipt({
        supplier_id: supplier === "" ? null : Number(supplier),
        note: note.trim() || null,
        items: filled.map((l) => ({
          product_id: Number(l.product_id),
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
          expiry_date: l.expiry_date,
        })),
      });
      toast.success(`Đã lưu phiếu nháp ${r.code} · ${vnd(r.total_amount)}`);
      resetDraft();
      receipts.refetch();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async (r: any) => {
    const ok = await confirm({
      title: `Xác nhận nhập kho phiếu ${r.code}?`,
      body: (
        <>
          Tồn kho sẽ tăng thêm{" "}
          <b>{num(r.items?.reduce((s: number, i: any) => s + Number(i.quantity), 0) || 0)}</b> món và giá vốn bình quân
          được tính lại. Phiếu đã xác nhận chỉ huỷ được bằng phiếu trả nhà cung cấp.
        </>
      ),
      confirmText: "Nhập kho & in tem",
    });
    if (!ok) return;
    try {
      await staffApi.confirmReceipt(r.id);
      toast.success(`Đã nhập kho phiếu ${r.code} — in tem dán từng hộp`);
      receipts.refetch();
      // Mỗi lô vừa nhập có mã riêng: sang In tem với đủ số tem bằng số lượng nhập.
      nav(`/admin/labels?receipt=${r.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  const doCancel = async (r: any) => {
    const ok = await confirm({
      title: `Huỷ phiếu ${r.code}?`,
      body:
        r.status === "CONFIRMED"
          ? "Phiếu đã nhập kho: huỷ sẽ trừ lại số hàng đã nhập và ghi một dòng trả nhà cung cấp vào sổ."
          : "Phiếu nháp này sẽ bị đánh dấu đã huỷ.",
      confirmText: "Huỷ phiếu",
      danger: true,
    });
    if (!ok) return;
    try {
      await staffApi.cancelReceipt(r.id);
      toast.success(`Đã huỷ phiếu ${r.code}`);
      receipts.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <PageFrame>
      <PageHeader
        className="mb-0"
        kicker="Kho hàng"
        title="Nhập hàng"
      />

      <PageBody>

      <Panel
        className="mb-6"
        title="Phiếu nhập mới"
        bodyClassName="p-5 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-end gap-2">
            <Select
              label="Nhà cung cấp"
              wrapClass="flex-1"
              placeholder="Không ghi nhà cung cấp"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value === "" ? "" : Number(e.target.value))}
              searchable
              searchPlaceholder="Gõ tên nhà cung cấp…"
              options={(sups.data || []).map((s: any) => ({ value: s.id, label: s.name, hint: s.phone || undefined }))}
            />
            <Button variant="soft" icon={Plus} className="shrink-0" onClick={() => setAddingSup(true)}>
              Thêm NCC
            </Button>
          </div>
          <Textarea
            label="Ghi chú phiếu"
            rows={2}
            placeholder="Vd. hàng chợ Long Biên, trả tiền sau 7 ngày"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="hidden gap-2 rounded-xl border-b-2 border-lime-400 bg-sand px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-forest-900 lg:grid lg:grid-cols-[1fr_6.5rem_8rem_9rem_6.5rem_2.25rem]">
            <span>Mặt hàng</span>
            <span className="text-right">Số lượng</span>
            <span className="text-right">Giá nhập</span>
            <span>Hạn dùng *</span>
            <span className="text-right">Thành tiền</span>
            <span />
          </div>
          {lines.map((l) => {
            const line = (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0);
            return (
              <div
                key={l.key}
                className="grid gap-2 rounded-2xl border border-ink-200 bg-sand/50 p-2 lg:grid-cols-[1fr_6.5rem_8rem_9rem_6.5rem_2.25rem] lg:items-center lg:rounded-none lg:border-0 lg:border-b lg:border-ink-200 lg:bg-transparent lg:px-0 lg:py-2.5 lg:even:bg-sand/50"
              >
                <Select
                  placeholder={prods.isPending ? "Đang tải hàng…" : "Chọn mặt hàng"}
                  value={l.product_id}
                  onChange={(e) => pickProduct(l.key, e.target.value === "" ? "" : Number(e.target.value))}
                  searchPlaceholder="Gõ tên hoặc mã vạch…"
                  options={items.map((p: any) => ({
                    value: p.id,
                    label: p.name,
                    hint: [p.next_lot?.barcode || p.barcode, p.category].filter(Boolean).join(" · ") || undefined,
                    keywords: [p.barcode, p.next_lot?.barcode].filter(Boolean).join(" ") || undefined,
                  }))}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className="text-right"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                />
                <MoneyInput
                  className="text-right"
                  placeholder="0"
                  value={l.unit_cost}
                  onChange={(e) => setLine(l.key, { unit_cost: e.target.value })}
                />
                <Input
                  type="date"
                  required
                  aria-label="Hạn sử dụng"
                  value={l.expiry_date}
                  onChange={(e) => setLine(l.key, { expiry_date: e.target.value })}
                />
                <div className="px-1 text-right font-display text-sm font-black text-ink-900 lg:px-0">
                  {line > 0 ? vnd(line) : <span className="text-ink-300">—</span>}
                </div>
                <IconButton
                  icon={Trash2}
                  label="Bỏ dòng này"
                  tone="danger"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                />
              </div>
            );
          })}
          {errors.lines && <Notice tone="danger">{errors.lines}</Notice>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <Button variant="ghost" icon={Plus} onClick={() => setLines((prev) => [...prev, blankLine()])}>
            Thêm dòng
          </Button>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Tổng tiền nhập</div>
              <div className="font-display text-2xl font-black text-ink-900">{vnd(subtotal)}</div>
            </div>
            <Button loading={busy} disabled={!filled.length} onClick={save}>
              Lưu phiếu nháp
            </Button>
          </div>
        </div>
      </Panel>

      <h2 className="mb-3 font-display text-lg font-black text-ink-900">Phiếu đã lập</h2>

      {receipts.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-3xl" />
          ))}
        </div>
      ) : !receipts.data?.length ? (
        <div className="card">
          <EmptyState emoji="🧾" title="Chưa có phiếu nhập nào" />
        </div>
      ) : (
        <ul className="space-y-2">
          {receipts.data.map((r: any) => {
            const open = openRow === r.id;
            return (
              <li key={r.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setOpenRow(open ? null : r.id)}
                  >
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition", open && "rotate-180")} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-ink-900">{r.code}</span>
                        <StatusBadge map={DOC_STATUS} value={r.status} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-400">
                        {when(r.created_at)} · {r.supplier || "không ghi nhà cung cấp"} · {r.items?.length || 0} dòng
                      </div>
                    </div>
                  </button>
                  <div className="font-display text-lg font-black text-ink-900">{vnd(r.total_amount)}</div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.status === "DRAFT" && (
                      <Button size="sm" icon={PackageCheck} onClick={() => doConfirm(r)}>
                        Nhập kho
                      </Button>
                    )}
                    {r.status === "CONFIRMED" && (
                      <Button size="sm" variant="ghost" icon={Printer} onClick={() => nav(`/admin/labels?receipt=${r.id}`)}>
                        In tem
                      </Button>
                    )}
                    {r.status !== "CANCELLED" && (
                      <Button size="sm" variant="danger" icon={Ban} onClick={() => doCancel(r)}>
                        Huỷ
                      </Button>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-t-2 border-ink-200 bg-sand/40 px-4 py-3">
                    {r.items?.length ? (
                      <ul className="list-rows text-sm">
                        {r.items.map((i: any, idx: number) => (
                          <li key={idx} className="flex items-baseline justify-between gap-3 py-1.5">
                            <span className="min-w-0 truncate text-ink-700">
                              {i.product_name}{" "}
                              <span className="text-ink-400">
                                × {num(i.quantity)}
                                {i.expiry_date ? ` · HSD ${day(i.expiry_date)}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold text-ink-900">{vnd(i.line_total)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-ink-400">Phiếu không có dòng hàng nào.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </PageBody>

      {addingSup && (
        <SupplierModal
          onClose={() => setAddingSup(false)}
          onDone={(s) => {
            setAddingSup(false);
            sups.refetch();
            setSupplier(s.id);
          }}
        />
      )}
    </PageFrame>
  );
}

/* Thêm nhanh NCC ngay trong phiếu nhập — lưu xong chọn luôn vào phiếu. */
function SupplierModal({ onClose, onDone }: { onClose: () => void; onDone: (s: any) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!f.name.trim()) next.name = "Cần tên nhà cung cấp";
    const phone = f.phone.replace(/\s/g, "");
    if (phone && !/^0\d{9,10}$/.test(phone)) next.phone = "Số điện thoại 10–11 số, bắt đầu bằng 0";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const s = await staffApi.createSupplier({
        name: f.name.trim(),
        phone: phone || null,
        address: f.address.trim() || null,
      });
      toast.success(`Đã thêm nhà cung cấp ${s.name} · mã ${s.code}`);
      onDone(s);
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
      title="Thêm nhà cung cấp"
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
          label="Tên nhà cung cấp"
          required
          autoFocus
          placeholder="Vd. Đại lý Vinamilk Cầu Giấy"
          value={f.name}
          error={errors.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          label="Số điện thoại"
          className="font-mono"
          digits
          maxLength={11}
          placeholder="Số điện thoại liên hệ"
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
