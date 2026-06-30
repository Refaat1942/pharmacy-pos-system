"""HMAC-SHA256 request signing for EtaMiddleware API v2."""
from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Any


def unix_timestamp() -> str:
    return str(int(time.time()))


def sign_request(auth_key: str, secret_key: str, body: str, timestamp: str | None = None) -> tuple[str, str]:
    """Return (timestamp, base64_signature). body must be the exact JSON string sent."""
    ts = timestamp or unix_timestamp()
    payload = auth_key + ts + (body or "")
    digest = hmac.new(secret_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return ts, base64.b64encode(digest).decode("ascii")


def auth_headers(auth_key: str, secret_key: str, body: str) -> dict[str, str]:
    ts, signature = sign_request(auth_key, secret_key, body)
    return {
        "EtaAuthentication": auth_key,
        "EtaTimestamp": ts,
        "EtaSignature": signature,
        "EtaAPIVersion": "2",
        "Content-Type": "application/json",
    }


def sign_get_request(auth_key: str, secret_key: str) -> dict[str, str]:
    ts, signature = sign_request(auth_key, secret_key, "")
    return {
        "EtaAuthentication": auth_key,
        "EtaTimestamp": ts,
        "EtaSignature": signature,
        "EtaAPIVersion": "2",
    }
