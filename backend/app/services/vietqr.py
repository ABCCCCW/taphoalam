from __future__ import annotations

import base64
import io

import qrcode


def tlv(id_: str, value: str) -> str:
    return f"{id_}{len(value):02d}{value}"


def crc16(data: str) -> int:
    crc = 0xFFFF
    for ch in data.encode("utf-8"):
        crc ^= ch << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def build_vietqr(bank_bin: str, account: str, amount: int, content: str) -> str:
    beneficiary = tlv("00", "A000000727") + tlv("01", tlv("00", bank_bin) + tlv("01", account)) + tlv("02", "QRIBFTTA")
    payload = (
        tlv("00", "01")
        + tlv("01", "12")
        + tlv("38", beneficiary)
        + tlv("53", "704")
        + tlv("54", str(int(amount)))
        + tlv("58", "VN")
        + tlv("62", tlv("08", content[:25]))
        + "6304"
    )
    return payload + f"{crc16(payload):04X}"


def qr_data_uri(payload: str) -> str:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
