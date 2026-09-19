from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class Hub:
    def __init__(self):
        self.scanner: dict[str, list[WebSocket]] = defaultdict(list)
        self.staff: list[WebSocket] = []

    async def connect_scanner(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self.scanner[session_id].append(ws)

    def disconnect_scanner(self, session_id: str, ws: WebSocket):
        if ws in self.scanner.get(session_id, []):
            self.scanner[session_id].remove(ws)

    async def push_scan(self, session_id: str, barcode: str, product: dict | None) -> int:
        return await self.push_json(session_id, {"type": "scan", "barcode": barcode, "product": product})

    async def push_json(self, session_id: str, payload: dict) -> int:
        """Gửi tới mọi máy quầy đang nghe phiên này; trả về số máy nhận được."""
        dead = []
        sent = 0
        for ws in self.scanner.get(session_id, []):
            try:
                await ws.send_json(payload)
                sent += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_scanner(session_id, ws)
        return sent

    async def connect_staff(self, ws: WebSocket):
        await ws.accept()
        self.staff.append(ws)

    def disconnect_staff(self, ws: WebSocket):
        if ws in self.staff:
            self.staff.remove(ws)

    async def notify_staff(self, payload: dict):
        dead = []
        for ws in self.staff:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_staff(ws)


hub = Hub()
