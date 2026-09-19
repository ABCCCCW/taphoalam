"""Chép toàn bộ dữ liệu từ taphoa.db (SQLite) sang Postgres (Supabase).

    cd backend
    DATABASE_URL='postgresql://postgres.xxx:MATKHAU@aws-0-xxx.pooler.supabase.com:6543/postgres' \\
        python -m scripts.migrate_to_postgres [--source sqlite:///./taphoa.db] [--reset]

--reset xoá sạch bảng đích trước khi chép (chạy lại nhiều lần không bị trùng khoá).
"""
from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import create_engine, inspect, text

# Script chạy riêng, không cần FastAPI khởi tạo schema lên DB đích
os.environ.setdefault("SKIP_SCHEMA_SYNC", "1")

from app.config import settings  # noqa: E402
from app.database import Base  # noqa: E402
import app.models  # noqa: E402,F401  (đăng ký mọi bảng vào Base.metadata)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="sqlite:///./taphoa.db")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()

    target_url = settings.sqlalchemy_url
    if not target_url.startswith("postgresql"):
        sys.exit("DATABASE_URL phải là chuỗi Postgres của Supabase")

    src = create_engine(args.source)
    dst = create_engine(target_url)
    src_tables = set(inspect(src).get_table_names())
    tables = Base.metadata.sorted_tables

    if args.reset:
        print("Xoá bảng cũ trên Postgres…")
        Base.metadata.drop_all(dst)
    Base.metadata.create_all(dst)

    with src.connect() as s, dst.begin() as d:
        for t in tables:
            if t.name not in src_tables:
                print(f"  - {t.name}: không có trong SQLite, bỏ qua")
                continue
            src_cols = {c["name"] for c in inspect(src).get_columns(t.name)}
            cols = [c for c in t.columns if c.name in src_cols]
            rows = [dict(r._mapping) for r in s.execute(t.select().with_only_columns(*cols))]
            if rows:
                for i in range(0, len(rows), 500):
                    d.execute(t.insert(), rows[i : i + 500])
            print(f"  ✓ {t.name}: {len(rows)} dòng")

        # Id tự tăng: đẩy sequence lên sau id lớn nhất đã chép
        for t in tables:
            pk = list(t.primary_key.columns)
            if len(pk) == 1 and pk[0].autoincrement is not False and str(pk[0].type) == "INTEGER":
                d.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence('{t.name}', '{pk[0].name}'), "
                        f"COALESCE((SELECT MAX({pk[0].name}) FROM {t.name}), 0) + 1, false)"
                    )
                )

        # Supabase mở REST API công khai cho schema public; bật RLS (không policy) để chặn nó.
        # Backend nối bằng user postgres nên không bị RLS ảnh hưởng.
        for t in tables:
            d.execute(text(f'ALTER TABLE "{t.name}" ENABLE ROW LEVEL SECURITY'))

    print("Xong.")


if __name__ == "__main__":
    main()
