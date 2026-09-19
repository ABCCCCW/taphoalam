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
    _relocate_store_hanoi(tables)


def _relocate_store_hanoi(tables: set[str] | None = None):
    """DB cũ từng seed Q.5 / TP.HCM — chuyển trụ sở sang Hà Nội."""
    if tables is None:
        tables = set(inspect(engine).get_table_names())
    hn = "12 Nguyễn Trãi, Thanh Xuân, Hà Nội"
    with engine.begin() as conn:
        if "settings" in tables:
            conn.execute(
                text(
                    "UPDATE settings SET value = :v WHERE key = 'store.address' AND "
                    "(value LIKE '%HCM%' OR value LIKE '%Hồ Chí Minh%' OR value LIKE '%Q.5%')"
                ),
                {"v": hn},
            )
            conn.execute(
                text("UPDATE settings SET value = :v WHERE key = 'store.slogan' AND value LIKE '%xóm%'"),
                {"v": "Tươi mỗi ngày, gần ngay phố"},
            )
        if "warehouses" in tables:
            conn.execute(
                text("UPDATE warehouses SET address = :v WHERE address LIKE '%HCM%' OR address LIKE '%Q.5%'"),
                {"v": hn},
            )
        if "customer_addresses" in tables:
            conn.execute(
                text(
                    "UPDATE customer_addresses SET province = 'Hà Nội', district = 'Thanh Xuân', ward = 'Nhân Chính' "
                    "WHERE province LIKE '%Hồ Chí Minh%' OR province LIKE '%HCM%'"
                )
            )
