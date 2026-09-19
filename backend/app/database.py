from __future__ import annotations

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings

DB_URL = settings.sqlalchemy_url
connect_args = {}
engine_kwargs = {"pool_pre_ping": True}
if DB_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif DB_URL.startswith("postgresql"):
    # Serverless: mỗi lần gọi là một tiến trình ngắn, giữ pool vô ích — để pooler Supabase lo
    engine_kwargs = {"poolclass": NullPool}

engine = create_engine(DB_URL, connect_args=connect_args, **engine_kwargs)

if DB_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_schema():
    """Thêm cột mới trên DB đã có — create_all không ALTER bảng cũ."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if "products" in tables:
        cols = {c["name"] for c in insp.get_columns("products")}
        dialect = engine.dialect.name
        stmts: list[str] = []
        if "cost_confirmed" not in cols:
            if dialect == "sqlite":
                stmts.append("ALTER TABLE products ADD COLUMN cost_confirmed BOOLEAN NOT NULL DEFAULT 1")
            elif dialect == "postgresql":
                stmts.append("ALTER TABLE products ADD COLUMN cost_confirmed BOOLEAN NOT NULL DEFAULT TRUE")
            else:
                stmts.append("ALTER TABLE products ADD COLUMN cost_confirmed TINYINT(1) NOT NULL DEFAULT 1")
        if stmts:
            with engine.begin() as conn:
                for sql in stmts:
                    conn.execute(text(sql))
    if "promotions" in tables:
        cols = {c["name"] for c in insp.get_columns("promotions")}
        with engine.begin() as conn:
            if "scope" not in cols:
                conn.execute(text("ALTER TABLE promotions ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'ORDER'"))
            if "description" not in cols:
                conn.execute(text("ALTER TABLE promotions ADD COLUMN description TEXT"))
    # Phí giao theo km: địa chỉ khách cần toạ độ, phiếu giao ghi lại khoảng cách đã tính.
    for table, col in (("customer_addresses", "lat"), ("customer_addresses", "lng"), ("shipments", "distance_km")):
        if table in tables and col not in {c["name"] for c in insp.get_columns(table)}:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} FLOAT"))
    if "product_batches" in tables and "barcode" not in {c["name"] for c in insp.get_columns("product_batches")}:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE product_batches ADD COLUMN barcode VARCHAR(20)"))
    # Lô còn hàng từ trước khi có mã lô: cấp mã luôn để in tem dán bù.
    if "product_batches" in tables:
        from app.services.barcode import generate_lot_barcode

        with engine.begin() as conn:
            ids = conn.execute(text("SELECT id FROM product_batches WHERE barcode IS NULL")).scalars().all()
            for bid in ids:
                conn.execute(text("UPDATE product_batches SET barcode = :c WHERE id = :i"), {"c": generate_lot_barcode(bid), "i": bid})
    # Ngày sản xuất của từng lô (phiếu nhập ghi, lô hàng giữ lại để tra).
    for table in ("product_batches", "stock_receipt_items"):
        if table in tables and "mfg_date" not in {c["name"] for c in insp.get_columns(table)}:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN mfg_date DATE"))
    _unit_and_min_stock(tables)
    _relocate_store_hanoi(tables)


def _unit_and_min_stock(tables: set[str]):
    """Chạy một lần: thêm đơn vị hay dùng, và đổi mức tồn tối thiểu sang quy tắc 20%."""
    import math

    if "units" in tables:
        with engine.begin() as conn:
            have = {r[0].lower() for r in conn.execute(text("SELECT name FROM units"))}
            for name in ("Hộp", "Túi", "Vỉ", "Chục", "Cây", "Quả", "Hũ", "Nải", "Miếng"):
                if name.lower() not in have:
                    conn.execute(text("INSERT INTO units (name, is_base) VALUES (:n, :b)"), {"n": name, "b": True})
    if not {"settings", "products", "inventory"} <= tables:
        return
    with engine.begin() as conn:
        done = conn.execute(text("SELECT value FROM settings WHERE key = 'stock.min_rule'")).scalar()
        if done == "20pct":
            return
        pids = [r[0] for r in conn.execute(text("SELECT id FROM products"))]
        for pid in pids:
            last = None
            if "inventory_transactions" in tables:
                last = conn.execute(
                    text(
                        "SELECT balance_after FROM inventory_transactions WHERE product_id = :p AND type = 'IMPORT' "
                        "ORDER BY id DESC LIMIT 1"
                    ),
                    {"p": pid},
                ).scalar()
            if last is None:
                last = conn.execute(text("SELECT quantity FROM inventory WHERE product_id = :p AND warehouse_id = 1"), {"p": pid}).scalar()
            base = float(last or 0)
            conn.execute(
                text("UPDATE products SET min_stock = :m WHERE id = :p"),
                {"m": max(1, math.ceil(base * 0.2)) if base > 0 else 0, "p": pid},
            )
        conn.execute(
            text(
                "INSERT INTO settings (key, value, \"group\", updated_at) "
                "VALUES ('stock.min_rule', '20pct', 'stock', CURRENT_TIMESTAMP)"
            )
        )


def _relocate_store_hanoi(tables: set[str] | None = None):
    """DB cũ từng seed Q.5 / Thanh Xuân — chuyển trụ sở sang Cầu Diễn."""
    if tables is None:
        tables = set(inspect(engine).get_table_names())
    hn = "Cầu Diễn, Bắc Từ Liêm, Hà Nội"
    old_addr = "value LIKE '%HCM%' OR value LIKE '%Hồ Chí Minh%' OR value LIKE '%Q.5%' OR value LIKE '%Nguyễn Trãi%' OR value LIKE '%Thanh Xuân%'"
    with engine.begin() as conn:
        if "settings" in tables:
            conn.execute(
                text(f"UPDATE settings SET value = :v WHERE key = 'store.address' AND ({old_addr})"),
                {"v": hn},
            )
            conn.execute(
                text("UPDATE settings SET value = :v WHERE key = 'store.slogan' AND value LIKE '%xóm%'"),
                {"v": "Tươi mỗi ngày, gần ngay phố"},
            )
            conn.execute(text("UPDATE settings SET value = '21.0394' WHERE key = 'store.lat' AND value IN ('21.0019', '10.754', '10.7540')"))
            conn.execute(text("UPDATE settings SET value = '105.7647' WHERE key = 'store.lng' AND value IN ('105.8198', '106.666', '106.6660')"))
        if "warehouses" in tables:
            conn.execute(
                text(
                    "UPDATE warehouses SET address = :v WHERE address LIKE '%HCM%' OR address LIKE '%Q.5%' "
                    "OR address LIKE '%Nguyễn Trãi%' OR address LIKE '%Thanh Xuân%'"
                ),
                {"v": hn},
            )
        if "customer_addresses" in tables:
            conn.execute(
                text(
                    "UPDATE customer_addresses SET province = 'Hà Nội', district = 'Bắc Từ Liêm', ward = 'Cầu Diễn', "
                    "street = CASE WHEN street LIKE '%Nguyễn Trãi%' THEN 'Phạm Văn Đồng' ELSE street END "
                    "WHERE province LIKE '%Hồ Chí Minh%' OR province LIKE '%HCM%' "
                    "OR district LIKE '%Thanh Xuân%' OR street LIKE '%Nguyễn Trãi%'"
                )
            )
