from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Lâm Ly Mart"
    secret_key: str = "taphoa-dev-secret-change-me"
    webhook_secret: str = "taphoa-demo-secret"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    database_url: str = "sqlite:///./taphoa.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_warehouse_id: int = 1
    qr_ttl_minutes: int = 5
    online_cod_reserve_hours: int = 24
    online_qr_reserve_minutes: int = 30
    # Vercel: schema đã tạo sẵn bằng scripts/migrate_to_postgres.py, khỏi dò bảng mỗi lần cold start
    skip_schema_sync: bool = False

    @property
    def sqlalchemy_url(self) -> str:
        """Supabase đưa chuỗi dạng postgres:// hoặc postgresql:// — SQLAlchemy cần tên driver."""
        url = self.database_url.strip()
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        return url


settings = Settings()
