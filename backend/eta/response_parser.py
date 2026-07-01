"""Parse EtaMiddleware submit / QrCode JSON responses."""
from __future__ import annotations

from typing import Any


def _first_str(data: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        val = data.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def parse_accepted_document(data: Any, *, unique_id: str | None = None) -> tuple[str | None, str | None]:
    """Return (eta_uuid, qr_url) from a submit or QrCode response."""
    if not isinstance(data, dict):
        return None, None

    uuid = _first_str(data, ("Uuid", "UUID", "uuid", "DocumentUuid", "EtaUuid"))
    qr_url = _first_str(data, ("QrUrl", "QRUrl", "qr_url", "QrCodeUrl", "Url"))

    for key in ("AcceptedDocuments", "Documents", "acceptedDocuments", "Data"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            item_uid = _first_str(item, ("UniqueId", "uniqueId"))
            if unique_id and item_uid and item_uid != unique_id:
                continue
            if not uuid:
                uuid = _first_str(item, ("Uuid", "UUID", "uuid", "DocumentUuid"))
            if not qr_url:
                qr_url = _first_str(item, ("QrUrl", "QRUrl", "qr_url", "Url"))

    return uuid, qr_url


def response_error_summary(data: Any) -> str:
    if not isinstance(data, dict):
        return str(data)[:500]
    codes: list[str] = []
    for key in ("Errors", "ErrorDetails"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                code = item.get("Code") or item.get("code")
                msg = item.get("Message") or item.get("message") or ""
                if code:
                    codes.append(f"{code}: {msg}".strip(": "))
            elif isinstance(item, str):
                codes.append(item)
    if codes:
        return "; ".join(codes)[:2000]
    if data.get("Message"):
        return str(data["Message"])[:2000]
    return str(data)[:500]
