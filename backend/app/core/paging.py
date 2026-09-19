"""Phân trang API: mặc định 10 dòng, trần 200 (kệ POS)."""

DEFAULT_SIZE = 10
MAX_SIZE = 200


def clamp_page(page: int | None, size: int | None, *, default: int = DEFAULT_SIZE) -> tuple[int, int]:
    page = max(1, int(page or 1))
    size = min(MAX_SIZE, max(1, int(size or default)))
    return page, size


def page_meta(page: int, size: int, total: int) -> dict:
    pages = max(1, (total + size - 1) // size) if total else 1
    if page > pages:
        page = pages
    return {"page": page, "size": size, "total": total, "pages": pages}
