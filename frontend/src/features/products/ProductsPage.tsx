import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Barcode, Camera, ImagePlus, ImageUp, Loader2, Package, Pencil, Plus, Tag } from "lucide-react";
import { staffApi } from "../../api/client";
import { dateFull, expiryNote, num, vnd } from "../../lib/format";
import { PRODUCT_TYPE } from "../../lib/labels";
import ProductImage from "../../components/ui/ProductImage";
import Button, { IconButton } from "../../components/ui/Button";
import DataTable, { type Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { EmptyState, Notice } from "../../components/ui/Feedback";
import { PAGE_SIZE, PageBody, PageFrame, PageHeader, Pager, SearchInput, Segmented, Toolbar } from "../../components/ui/Page";
import { Input, MoneyInput, Select, Toggle } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { shrinkImage } from "../../lib/image";
import { cn } from "../../lib/cn";

type Filter = "all" | "online" | "low" | "cost";

const BLANK = {
  name: "",
  sale_price: 0,
  cost_price: 0,
  min_stock: 0,
  base_unit_id: 1,
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
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<any>(null);

  const list = useQuery({
    queryKey: ["prods", term, filter, page],
    queryFn: () => staffApi.products({ q: term || undefined, filter, page, size: PAGE_SIZE, hide_expired: true }),
    placeholderData: keepPreviousData,
  });
  const pending = useQuery({ queryKey: ["pending-cost"], queryFn: staffApi.pendingCost, refetchInterval: 15000 });
  const cats = useQuery({ queryKey: ["cats"], queryFn: staffApi.categories });
  const units = useQuery({ queryKey: ["units"], queryFn: staffApi.units, staleTime: 300_000 });

  const items = list.data?.items || [];
  const waiting = pending.data?.items || [];
  const counts = list.data?.counts || { all: 0, online: 0, low: 0, cost: 0 };
  const pages = list.data?.pages || 1;
  const total = list.data?.total || 0;

  const reset = (fn: () => void) => {
    setPage(1);
    fn();
  };

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
              {p.next_lot?.barcode ? ` · ${p.next_lot.barcode}` : ""}
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
          {p.unit && <span className="ml-1 text-xs font-semibold text-ink-400">{p.unit.toLowerCase()}</span>}
          {p.low_stock && <span className="ml-1 text-[11px] font-bold">sắp hết</span>}
        </span>
      ),
    },
    {
      key: "exp",
      head: "Hạn dùng",
      cell: (p) => {
        const lot = p.next_lot;
        if (!lot) return <span className="text-ink-300">—</span>;
        const soon = lot.status === "expiring";
        return (
          <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums", soon ? "font-bold text-sun-700" : "text-ink-800")}>
            {dateFull(lot.expiry_date)}
            {soon && (
              <span className="group relative inline-flex" tabIndex={0} aria-label={expiryNote(lot.days)}>
                <AlertTriangle className="h-4 w-4 text-sun-500" />
                <span className="pointer-events-none absolute right-full top-1/2 z-20 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-forest-900 px-2 py-1 text-xs font-semibold text-white shadow-pop group-hover:block group-focus:block">
                  {expiryNote(lot.days)}
                </span>
              </span>
            )}
          </span>
        );
      },
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
    <PageFrame>
      <PageHeader
        className="mb-0"
        kicker="Kho hàng"
        title="Hàng hoá"
        actions={
          <Button icon={Plus} onClick={() => setForm({ ...BLANK })}>
            Thêm hàng
          </Button>
        }
      />

      <PageBody>
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
        <SearchInput value={term} onChange={(v) => reset(() => setTerm(v))} placeholder="Tìm tên hoặc mã SKU…" />
        <Segmented
          value={filter}
          onChange={(v) => reset(() => setFilter(v))}
          options={[
            { value: "all", label: "Tất cả", count: counts.all },
            { value: "online", label: "Trên web", count: counts.online },
            { value: "low", label: "Sắp hết", count: counts.low },
            { value: "cost", label: "Chờ giá vốn", count: counts.cost },
          ]}
        />
      </Toolbar>

      <DataTable
        rows={items}
        columns={columns}
        rowKey={(p) => p.id}
        rowClassName={(p) => (p.next_lot?.status === "expiring" ? "row-warn" : undefined)}
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
        footer={items.length > 0 && <Pager page={page} pages={pages} total={total} onPage={setPage} />}
      />

      {form && (
        <ProductForm
          value={form}
          categories={cats.data || []}
          units={units.data || []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refreshAll();
          }}
        />
      )}
      </PageBody>
    </PageFrame>
  );
}

/** Đoán đơn vị từ tên hàng — chỉ gợi ý lúc thêm mới, người dùng đổi được. */
const UNIT_HINTS: [RegExp, string][] = [
  [/\(kg\)|\bkg\b|thịt|cá |ức gà|táo|cam |xoài tươi|nho |cà chua|khoai/i, "Kg"],
  [/\bbó\b|rau |cải |hành lá|ngò/i, "Bó"],
  [/vỉ|trứng/i, "Vỉ"],
  [/nải|chuối/i, "Nải"],
  [/đậu hũ|đậu phụ/i, "Miếng"],
  [/bia|lon|coca|pepsi|7up|fanta|mirinda|sprite|red ?bull|bò húc/i, "Lon"],
  [/chai|nước suối|aquafina|lavie|sting|nước mắm|nước tương|xì dầu|dầu ăn|dầu |tương ớt|sauce|sốt|giấm/i, "Chai"],
  [/hũ|butter|bơ |muối|mayonnaise|mứt/i, "Hũ"],
  [/sữa|hộp|yogurt|sữa chua|choco ?pie|cookies|trà |cà phê hoà tan|g7/i, "Hộp"],
  [/mì|miến|phở|bún|snack|bánh|kẹo|chips|cracker|gói/i, "Gói"],
  [/túi|gạo/i, "Túi"],
];
function guessUnit(name: string, units: any[]): number | null {
  const hit = UNIT_HINTS.find(([re]) => re.test(name));
  if (!hit) return null;
  return units.find((u: any) => u.name.toLowerCase() === hit[1].toLowerCase())?.id ?? null;
}

function ProductForm({
  value,
  categories,
  units,
  onClose,
  onSaved,
}: {
  value: any;
  categories: any[];
  units: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<any>(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const editing = !!f.id;
  const [unitTouched, setUnitTouched] = useState(false);
  // Ảnh mới chọn/chụp, chưa tải lên — tải sau khi lưu mặt hàng (lúc đó mới có id).
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const set = (k: string, v: any) => {
    setF((prev: any) => ({ ...prev, [k]: v }));
    setErrors((prev) => (prev[k] ? { ...prev, [k]: "" } : prev));
  };

  // Hạn dùng của lô đang bán. Hàng mới chưa có tồn thì kèm số lượng đang có trong tay.
  const onHand = Number(f.quantity || 0);
  const [lot, setLot] = useState({
    expiry_date: f.next_lot?.expiry_date || "",
    quantity: "",
  });
  const lotChanged = lot.expiry_date !== (f.next_lot?.expiry_date || "");
  const willHaveStock = onHand > 0 || Number(lot.quantity) > 0;

  const save = async () => {
    /* Kiểm ngay trên máy: backend có chặn nhưng để người dùng biết sai ô nào. */
    const next: Record<string, string> = {};
    if (!String(f.name || "").trim()) next.name = "Cần tên để thu ngân tìm được";
    if (!(Number(f.sale_price) > 0)) next.sale_price = "Giá bán phải lớn hơn 0";
    if (Number(f.cost_price) < 0) next.cost_price = "Giá vốn không âm được";
    if (!photo && !f.image_url) next.image = "Cần ảnh sản phẩm — chụp trực tiếp hoặc chọn ảnh có sẵn";
    if (willHaveStock && !lot.expiry_date) next.expiry_date = "Hàng đang có trên kệ thì phải có hạn sử dụng";
    if (Number(f.cost_price) > Number(f.sale_price) && Number(f.sale_price) > 0) {
      next.cost_price = "Giá vốn cao hơn giá bán — bán là lỗ, kiểm lại nhé";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const saved = await staffApi.saveProduct(
        {
          name: String(f.name).trim(),
          sale_price: Number(f.sale_price),
          cost_price: Number(f.cost_price) || 0,
          // Không nhập tay nữa: backend tự đặt = 20% số tồn mỗi lần nhập hàng.
          min_stock: Number(f.min_stock) || 0,
          base_unit_id: Number(f.base_unit_id) || 1,
          is_online: !!f.is_online,
          product_type: f.product_type || "STANDARD",
          emoji: f.emoji || "🛒",
          category_id: f.category_id === "" ? null : Number(f.category_id),
          barcode: String(f.barcode || "").trim() || null,
        },
        f.id
      );
      const pid = saved?.id ?? f.id;
      if (photo) await staffApi.uploadProductImage(pid, photo.blob);
      if (lot.expiry_date && willHaveStock && (lotChanged || Number(lot.quantity) > 0)) {
        await staffApi.setShelfLot(pid, {
          expiry_date: lot.expiry_date,
          quantity: onHand > 0 ? undefined : Number(lot.quantity) || undefined,
        });
      }
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
        <PhotoPicker
          current={photo?.url || f.image_url}
          error={errors.image}
          onPick={(blob) => {
            setPhoto({ blob, url: URL.createObjectURL(blob) });
            setErrors((prev) => ({ ...prev, image: "" }));
          }}
          nameField={
            <Input
              label="Tên hàng"
              required
              wrapClass="min-w-0 flex-1"
              className="h-11"
              placeholder="Vd. Sữa tươi Vinamilk 180ml"
              value={f.name || ""}
              error={errors.name}
              onChange={(e) => {
                set("name", e.target.value);
                // Hàng mới, chưa tự chọn đơn vị: đoán theo tên (bia → lon, nước suối → chai…).
                if (!editing && !unitTouched) {
                  const guess = guessUnit(e.target.value, units);
                  if (guess) set("base_unit_id", guess);
                }
              }}
              autoFocus
            />
          }
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
          label="Đơn vị"
          value={f.base_unit_id ?? 1}
          onChange={(e) => {
            setUnitTouched(true);
            set("base_unit_id", Number(e.target.value));
          }}
          searchable
          searchPlaceholder="Lon, chai, kg, bó…"
          options={units.map((u: any) => ({
            value: u.id,
            label: u.name,
            hint: u.by_weight ? "Bán theo cân" : undefined,
          }))}
        />
        {/* Mã hệ thống = mã của lô đang bán, in trên tem dán từng hộp. Chỉ xem, không sửa. */}
        <Input
          label="Mã hệ thống (tem)"
          className="font-mono"
          wrapClass={onHand > 0 ? undefined : "sm:col-span-2"}
          tip="Mã riêng của lô đang bán, cấp khi duyệt phiếu nhập — in tem ở màn In tem mã vạch."
          readOnly
          disabled
          placeholder="Cấp khi nhập hàng / ghi hạn"
          value={f.next_lot?.barcode || ""}
        />
        {onHand <= 0 && (
          <Input
            label="Số lượng đang có"
            type="number"
            min={0}
            placeholder="0"
            value={lot.quantity}
            onChange={(e) => setLot({ ...lot, quantity: e.target.value })}
          />
        )}
        <Input
          label="Hạn sử dụng"
          type="date"
          required={willHaveStock}
          value={lot.expiry_date}
          error={errors.expiry_date}
          onChange={(e) => {
            setLot({ ...lot, expiry_date: e.target.value });
            setErrors((prev) => ({ ...prev, expiry_date: "" }));
          }}
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
 * Ô ảnh cạnh tên: bấm vào chọn Chụp (camera thật) hoặc Tải (thư viện).
 * Ảnh mới đè ảnh cũ — không nút lẻ bên ngoài.
 */
function PhotoPicker({
  current,
  error,
  onPick,
  nameField,
}: {
  current?: string | null;
  error?: string;
  onPick: (b: Blob) => void;
  nameField: React.ReactNode;
}) {
  const toast = useToast();
  const lib = useRef<HTMLInputElement>(null);
  const tile = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (blob: Blob) => {
    setBusy(true);
    try {
      onPick(await shrinkImage(blob));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const fromLib = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File này không phải ảnh");
      return;
    }
    await apply(file);
  };

  const openMenu = () => {
    const r = tile.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({ top: r.bottom + 6, left: r.left });
  };

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tile.current?.contains(t) || pop.current?.contains(t)) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  return (
    <div className="sm:col-span-2">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <div className="mb-1.5 text-sm font-semibold text-ink-600">
            Ảnh<span className="ml-0.5 text-coral-500">*</span>
          </div>
          <button
            ref={tile}
            type="button"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={!!menu}
            aria-label={current ? "Đổi ảnh" : "Chọn ảnh"}
            onClick={openMenu}
            className={cn(
              "relative block h-11 w-11 overflow-hidden rounded-2xl bg-sand transition hover:ring-2 hover:ring-ink-300",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-300/60",
              error ? "ring-2 ring-coral-400" : "ring-1 ring-ink-200",
              busy && "opacity-60"
            )}
          >
            {current ? (
              <img src={current} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center">
                <ImagePlus className="h-4 w-4 text-ink-300" />
              </span>
            )}
            {busy && (
              <span className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 className="h-4 w-4 animate-spin text-ink-500" />
              </span>
            )}
          </button>
        </div>
        {nameField}
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-coral-600">{error}</p>}
      <input ref={lib} type="file" accept="image/*" className="hidden" onChange={fromLib} />
      {menu &&
        createPortal(
          <div
            ref={pop}
            role="menu"
            style={{ top: menu.top, left: menu.left }}
            className="fixed z-[70] min-w-[10.5rem] overflow-hidden rounded-2xl border border-black/[.08] bg-white py-1 shadow-pop animate-fade-in"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-bold text-ink-800 hover:bg-ink-50"
              onClick={() => {
                setMenu(null);
                setCamOn(true);
              }}
            >
              <Camera className="h-4 w-4 text-ink-500" />
              Chụp ảnh
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-bold text-ink-800 hover:bg-ink-50"
              onClick={() => {
                setMenu(null);
                lib.current?.click();
              }}
            >
              <ImageUp className="h-4 w-4 text-ink-500" />
              Tải ảnh
            </button>
          </div>,
          document.body
        )}
      {camOn && (
        <CameraCapture
          onClose={() => setCamOn(false)}
          onShot={async (blob) => {
            setCamOn(false);
            await apply(blob);
          }}
        />
      )}
    </div>
  );
}

async function openRearCamera() {
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const c of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Không mở được camera");
}

/** Overlay camera — máy tính không dùng input file (Chrome bỏ qua capture). */
function CameraCapture({ onClose, onShot }: { onClose: () => void; onShot: (b: Blob) => void }) {
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const onCloseRef = useRef(onClose);
  const toastRef = useRef(toast);
  onCloseRef.current = onClose;
  toastRef.current = toast;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    (async () => {
      try {
        const s = await openRearCamera();
        if (dead) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        await el.play();
        if (!dead) setReady(true);
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : "Không mở được camera");
        onCloseRef.current();
      }
    })();
    return () => {
      dead = true;
      document.removeEventListener("keydown", onKey, true);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  const snap = () => {
    const el = video.current;
    if (!el || !el.videoWidth || busy) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.drawImage(el, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Chụp không được — thử lại");
        setBusy(false);
        return;
      }
      onShot(blob);
    }, "image/jpeg", 0.92);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-forest-900/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-black shadow-lift">
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          className="block w-full bg-black object-cover"
          style={{ height: "min(70dvh, 28rem)", maxWidth: "100%" }}
        />
      </div>
      <div className="mt-4 flex w-full max-w-lg gap-3">
        <Button variant="ghost" className="flex-1 bg-white" onClick={onClose}>
          Huỷ
        </Button>
        <Button className="flex-1" loading={busy} disabled={!ready} onClick={snap}>
          Chụp
        </Button>
      </div>
    </div>,
    document.body
  );
}

/**
 * Một món quầy bán ngoài kệ, đang chờ kho chốt giá vốn.
 * Ghi cả số còn cầm trên tay để tồn khớp lại với thực tế.
 */
export function PendingRow({ p, onDone }: { p: any; onDone: () => void }) {
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
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyInput
          label="Giá vốn"
          required
          placeholder="7000"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
        <MoneyInput
          label="Giá bán"
          value={sale}
          onChange={(e) => setSale(e.target.value)}
        />
        <Input
          label="Còn trên kệ"
          type="number"
          min={0}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex h-full flex-col justify-end">
          <Button loading={busy} onClick={submit} className="h-11 w-full">
            Chốt
          </Button>
        </div>
      </div>
      {err && <Notice tone="danger" className="mt-3">{err}</Notice>}
    </div>
  );
}
