"""Điểm vào hàm Python trên Vercel: mọi /api/* được rewrite về đây, FastAPI tự định tuyến."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402,F401
