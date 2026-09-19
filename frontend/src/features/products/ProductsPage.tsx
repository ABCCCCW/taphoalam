import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, Package, Pencil, Plus, Tag } from "lucide-react";
import { staffApi } from "../../api/client";
import { num, vnd } from "../../lib/format";
import { PRODUCT_TYPE, PRODUCT_TYPES } from "../../lib/labels";
import ProductImage from "../../components/ui/ProductImage";
import Button, { IconButton } from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Notice } from "../../components/ui/Feedback";
import { PageHeader, SearchInput, Segmented, Toolbar } from "../../components/ui/Page";
import { Input, MoneyInput, Select, Toggle } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

type Filter = "all" | "online" | "low" | "cost";

const BLANK = {
  name: "",
  sale_price: 0,
  cost_price: 0,
  min_stock: 10,
  is_online: true,
  product_type: "STANDARD",
  emoji: "🛒",
  category_id: "" as number | "",
  barcode: "",
};

export default function ProductsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<any>(null);

  const list = useQuery({
    queryKey: ["prods", term],
    queryFn: () => staffApi.products({ q: term || undefined, size: 200 }),
  });
  const pending = useQuery({ queryKey: ["pending-cost"], queryFn: staffApi.pendingCost, refetchInterval: 15000 });
  const cats = useQuery({ queryKey: ["cats"], queryFn: staffApi.categories });

  const items = list.data?.items || [];
  const waiting = pending.data?.items || [];

  const counts = useMemo(
    () => ({
      all: items.length,
      online: items.filter((p: any) => p.is_online).length,
      low: items.filter((p: any) => p.low_stock).length,
      cost: items.filter((p: any) => p.cost_confirmed === false).length,
    }),
    [items]
  );

  const rows = useMemo(() => {
    if (filter === "online") return items.filter((p: any) => p.is_online);
    if (filter === "low") return items.filter((p: any) => p.low_stock);
    if (filter === "cost") return items.filter((p: any) => p.cost_confirmed === false);
    return items;
  }, [items, filter]);

  const refreshAll = () => {
    list.refetch();
    pending.refetch();
    qc.invalidateQueries({ queryKey: ["inv"] });
  };

  const makeBarcode = async (p: any) => {
    try {
      const r = await staffApi.generateBarcode(p.id);
      toast.success(`Đã cấp mã ${r.barcode || ""} cho ${p.name}`);
      list.refetch();
    } catch (e) {
      toast.error(e);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      head: "Mặt hàng",
      primary: true,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <ProductImage
            src={p.image_url}
            emoji={p.emoji}
            alt={p.name}
            className="h-10 w-10 shrink-0 rounded-xl bg-ink-50 p-1"
            emojiClassName="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-50 text-xl"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-bold text-ink-900">{p.name}</span>
              {/* Chỉ gắn nhãn khi khác «đếm cái» — hàng cân kg cần thấy ngay. */}
              {p.product_type !== "STANDARD" && <StatusBadge map={PRODUCT_TYPE} value={p.product_type} />}
            </div>
            <div className="truncate font-mono text-[11px] text-ink-400">
              {p.sku}
              {p.barcode ? ` · ${p.barcode}` : " · chưa có mã vạch"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "sale",
      head: "Giá bán",
      align: "right",
      cell: (p) => <span className="font-display font-black text-ink-900">{vnd(p.sale_price)}</span>,
    },
    {
      key: "cost",
      head: "Giá vốn",
      align: "right",
      cell: (p) =>
        p.cost_confirmed === false ? (
          <Badge tone="sun">Chờ chốt</Badge>
        ) : (
          <span className="text-ink-600">{vnd(p.cost_price)}</span>
        ),
    },
    {
      key: "stock",
      head: "Bán được",
      align: "right",
      cell: (p) => (
        <span className={p.low_stock ? "font-black text-coral-600" : "font-bold text-ink-800"}>
          {num(p.available)}
          {p.low_stock && <span className="ml-1 text-[11px] font-bold">sắp hết</span>}
        </span>
      ),
    },
    {
      key: "web",
      head: "Website",
      align: "center",
      cell: (p) => (p.is_online ? <Badge tone="lime">Đang bán</Badge> : <Badge tone="mute">Ẩn</Badge>),
    },
    {
      key: "act",
      head: "",
      align: "right",
      desktopOnly: true,
      cell: (p) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton icon={Pencil} label="Sửa mặt hàng" tone="lime" onClick={() => setForm({ ...p, category_id: p.category_id ?? "" })} />
          {!p.barcode && <IconButton icon={Barcode} label="Cấp mã vạch nội bộ" onClick={() => makeBarcode(p)} />}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        kicker="Kho hàng"
        title="Hàng hoá"
        actions={
          <Button icon={Plus} onClick={() => setForm({ ...BLANK })}>
            Thêm hàng
          </Button>
        }
      />

      {waiting.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-3xl border border-coral-200 bg-white">
          <header className="flex flex-wrap items-center gap-2 px-5 pt-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-coral-500 text-white">
              <Tag className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-black text-ink-900">Quầy vừa bắn về · {waiting.length} món</h2>
            </div>
          </header>
          <div className="space-y-3 p-5">
            {waiting.map((p: any) => (
              <PendingRow key={p.id} p={p} onDone={refreshAll} />
            ))}
          </div>
        </section>
      )}

      <Toolbar>
        <SearchInput value={term} onChange={setTerm} placeholder="Tìm tên hoặc mã SKU…" />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tất cả", count: counts.all },
            { value: "online", label: "Trên web", count: counts.online },
            { value: "low", label: "Sắp hết", count: counts.low },
            { value: "cost", label: "Chờ giá vốn", count: counts.cost },
          ]}
        />
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => setForm({ ...p, category_id: p.category_id ?? "" })}
        loading={list.isPending}
        error={list.isError ? list.error : undefined}
        onRetry={list.refetch}
        empty={
          <EmptyState
            emoji="📦"
            title={term ? "Không tìm thấy mặt hàng nào" : "Kho còn trống"}
            action={
              term ? (
                <Button variant="ghost" onClick={() => setTerm("")}>
                  Xoá từ khoá
                </Button>
              ) : (
                <Button icon={Plus} onClick={() => setForm({ ...BLANK })}>
                  Thêm hàng
                </Button>
              )
            }
          />
        }
        footer={
          rows.length > 0 && (
            <span className="text-xs font-semibold text-ink-500">
              {rows.length} mặt hàng
              {filter !== "all" && ` (đang lọc trên ${items.length})`}
            </span>
          )
        }
      />

      {form && (
        <ProductForm
          value={form}
          categories={cats.data || []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function ProductForm({
  value,
  categories,
  onClose,
  onSaved,
}: {
  value: any;
  categories: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<any>(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const editing = !!f.id;

  const set = (k: string, v: any) => {
    setF((prev: any) => ({ ...prev, [k]: v }));
    setErrors((prev) => (prev[k] ? { ...prev, [k]: "" } : prev));
  };

  const save = async () => {
    /* Kiểm ngay trên máy: backend có chặn nhưng để người dùng biết sai ô nào. */
    const next: Record<string, string> = {};
    if (!String(f.name || "").trim()) next.name = "Cần tên để thu ngân tìm được";
    if (!(Number(f.sale_price) > 0)) next.sale_price = "Giá bán phải lớn hơn 0";
    if (Number(f.cost_price) < 0) next.cost_price = "Giá vốn không âm được";
    if (Number(f.min_stock) < 0) next.min_stock = "Mức tối thiểu không âm được";
    if (Number(f.cost_price) > Number(f.sale_price) && Number(f.sale_price) > 0) {
      next.cost_price = "Giá vốn cao hơn giá bán — bán là lỗ, kiểm lại nhé";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await staffApi.saveProduct(
        {
          name: String(f.name).trim(),
          sale_price: Number(f.sale_price),
          cost_price: Number(f.cost_price) || 0,
          min_stock: Number(f.min_stock) || 0,
          is_online: !!f.is_online,
          product_type: f.product_type || "STANDARD",
          emoji: String(f.emoji || "🛒").trim() || "🛒",
          category_id: f.category_id === "" ? null : Number(f.category_id),
          barcode: String(f.barcode || "").trim() || null,
        },
        f.id
      );
      toast.success(editing ? `Đã lưu ${f.name}` : `Đã thêm ${f.name} vào kho`);
      onSaved();
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
      title={editing ? `Sửa ${value.name}` : "Thêm mặt hàng"}
      subtitle={editing ? value.sku : undefined}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Huỷ
          </Button>
          <Button className="flex-1" loading={busy} onClick={save}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Tên hàng"
          required
          wrapClass="sm:col-span-2"
          placeholder="Vd. Sữa tươi Vinamilk 180ml"
          value={f.name || ""}
          error={errors.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus
        />
        <MoneyInput
          label="Giá bán"
          required
          value={f.sale_price ?? 0}
          error={errors.sale_price}
          onChange={(e) => set("sale_price", Number(e.target.value))}
        />
        <MoneyInput
          label="Giá vốn"
          value={f.cost_price ?? 0}
          error={errors.cost_price}
          onChange={(e) => set("cost_price", Number(e.target.value))}
        />
        <Select
          label="Danh mục"
          placeholder="Chưa phân nhóm"
          value={f.category_id ?? ""}
          onChange={(e) => set("category_id", e.target.value === "" ? "" : Number(e.target.value))}
          options={categories.map((c: any) => ({ value: c.id, label: `${c.icon || ""} ${c.name}`.trim() }))}
        />
        <Select
          label="Kiểu bán"
          value={f.product_type || "STANDARD"}
          onChange={(e) => set("product_type", e.target.value)}
          options={PRODUCT_TYPES}
        />
        <Input
          label="Mức tồn tối thiểu"
          type="number"
          min={0}
          value={f.min_stock ?? 0}
          error={errors.min_stock}
          onChange={(e) => set("min_stock", Number(e.target.value))}
        />
        <Input
          label="Emoji thay ảnh"
          value={f.emoji || ""}
          placeholder="🥛"
          onChange={(e) => set("emoji", e.target.value)}
        />
        <Input
          label="Mã vạch"
          wrapClass="sm:col-span-2"
          className="font-mono"
          placeholder="Mã vạch"
          value={f.barcode || ""}
          onChange={(e) => set("barcode", e.target.value)}
        />
        <div className="sm:col-span-2">
          <Toggle
            checked={!!f.is_online}
            onChange={(v) => set("is_online", v)}
            label="Bán trên website"
          />
        </div>
      </div>
    </Modal>
  );
}

/**
 * Một món quầy bán ngoài kệ, đang chờ kho chốt giá vốn.
 * Ghi cả số còn cầm trên tay để tồn khớp lại với thực tế.
 */
function PendingRow({ p, onDone }: { p: any; onDone: () => void }) {
  const toast = useToast();
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("0");
  const [sale, setSale] = useState(String(Math.round(p.sale_price || 0)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!(Number(cost) >= 0) || cost === "") {
      setErr("Điền giá vốn đã nhé");
      return;
    }
    if (!(Number(sale) > 0)) {
      setErr("Giá bán phải lớn hơn 0");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await staffApi.confirmCost(p.id, {
        cost_price: Number(cost),
        sale_price: Number(sale),
        quantity: Number(qty) || 0,
      });
      toast.success(`Đã chốt giá vốn cho ${p.name}`);
      onDone();
    } catch (e: any) {
      setErr(e?.message || "Chốt không được, thử lại nhé");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/[.05] bg-white p-4">
      <div className="flex items-center gap-3">
        <ProductImage
          src={p.image_url}
          emoji={p.emoji}
          alt={p.name}
          className="h-10 w-10 shrink-0 rounded-xl bg-ink-50 p-1"
          emojiClassName="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-50 text-xl"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink-900">{p.name}</div>
          <div className="truncate font-mono text-[11px] text-ink-400">
            {p.barcode || "không mã vạch"} · quầy bán {vnd(p.sale_price)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <MoneyInput label="Giá vốn" required placeholder="7000" value={cost} onChange={(e) => setCost(e.target.value)} />
        <MoneyInput label="Giá bán" value={sale} onChange={(e) => setSale(e.target.value)} />
        <Input
          label="Còn trên kệ"
          type="number"
          min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Button loading={busy} onClick={submit} className="sm:mb-[1.6rem]">
          Chốt
        </Button>
      </div>
      {err && <Notice tone="danger" className="mt-3">{err}</Notice>}
    </div>
  );
}
