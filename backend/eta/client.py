"""HTTP client for EtaMiddleware (EtaDocument API)."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from eta.signing import auth_headers, sign_get_request


class EtaMiddlewareError(Exception):
    def __init__(self, message: str, *, http_status: int | None = None, body: Any = None):
        super().__init__(message)
        self.http_status = http_status
        self.body = body


def _http_request(method: str, url: str, headers: dict[str, str], body: bytes | None = None, *, timeout: float = 30.0) -> tuple[int, str]:
    req = Request(url, data=body, headers=headers, method=method)
    with urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


class EtaMiddlewareClient:
    def __init__(self, *, base_url: str, auth_key: str, secret_key: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.auth_key = auth_key
        self.secret_key = secret_key
        self.timeout = timeout

    def submit_documents(self, documents: list[dict]) -> dict:
        payload = {"Documents": documents}
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        headers = auth_headers(self.auth_key, self.secret_key, body)
        url = f"{self.base_url}/EtaDocument/Documents"
        status, text = _http_request("POST", url, headers, body.encode("utf-8"), timeout=self.timeout)
        try:
            data = json.loads(text)
        except Exception:
            data = {"raw": text}
        if status >= 400:
            raise EtaMiddlewareError(
                f"HTTP {status} from EtaMiddleware",
                http_status=status,
                body=data,
            )
        return data

    def get_qr_url(self, unique_id: str) -> dict:
        qs = urlencode({"UniqueId": unique_id})
        url = f"{self.base_url}/EtaDocument/QrCode?{qs}"
        headers = sign_get_request(self.auth_key, self.secret_key)
        status, text = _http_request("GET", url, headers, timeout=self.timeout)
        try:
            data = json.loads(text)
        except Exception:
            data = {"raw": text}
        if status >= 400:
            raise EtaMiddlewareError(
                f"HTTP {status} from EtaMiddleware QrCode",
                http_status=status,
                body=data,
            )
        return data

    def test_connection(self) -> dict:
        """Signed POST with empty Documents — expect validation error, not auth failure."""
        body = json.dumps({"Documents": []}, separators=(",", ":"))
        headers = auth_headers(self.auth_key, self.secret_key, body)
        url = f"{self.base_url}/EtaDocument/Documents"
        try:
            status, text = _http_request("POST", url, headers, body.encode("utf-8"), timeout=self.timeout)
        except Exception as exc:
            return {
                "http_status": None,
                "reachable": False,
                "auth_ok": False,
                "response": {"error": str(exc)},
                "error_codes": [],
            }

        try:
            data = json.loads(text)
        except Exception:
            data = {"raw": text}

        errors = data.get("Errors") or data.get("ErrorDetails") or []
        err_codes: list[str] = []
        if isinstance(errors, list):
            for e in errors:
                if isinstance(e, dict):
                    err_codes.append(str(e.get("Code") or ""))
                elif isinstance(e, str) and ":" in e:
                    err_codes.append(e.split(":", 1)[0].strip())

        auth_fail = any(
            c in err_codes
            for c in ("ERR_AUTH_REQ", "ERR_AUTH_INV", "ERR_HMAC_REQ", "ERR_HMAC_INV", "ERR_IP_DENY")
        )

        return {
            "http_status": status,
            "reachable": True,
            "auth_ok": not auth_fail and status < 500,
            "response": data,
            "error_codes": err_codes,
        }
