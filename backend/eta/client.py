"""HTTP client for EtaMiddleware (EtaDocument API)."""
from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from eta.signing import auth_headers, sign_get_request

_AUTH_CODES = frozenset({
    "ERR_AUTH_REQ", "ERR_AUTH_INV", "ERR_HMAC_REQ", "ERR_HMAC_INV", "ERR_IP_DENY",
})


class EtaMiddlewareError(Exception):
    def __init__(self, message: str, *, http_status: int | None = None, body: Any = None):
        super().__init__(message)
        self.http_status = http_status
        self.body = body


def _http_request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None = None,
    *,
    timeout: float = 30.0,
) -> tuple[int, str]:
    """Return (status_code, response_text). Never raises on HTTP 4xx/5xx."""
    hdrs = {**headers, "User-Agent": "FratelanzaPOS/2.0 (ETA integration)"}
    req = Request(url, data=body, headers=hdrs, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        return exc.code, raw
    except URLError as exc:
        raise ConnectionError(str(exc.reason or exc)) from exc


def _extract_error_codes(data: Any) -> list[str]:
    codes: list[str] = []
    if not isinstance(data, dict):
        return codes

    for key in ("Errors", "ErrorDetails"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                code = item.get("Code")
                if code:
                    codes.append(str(code))
            elif isinstance(item, str):
                if ":" in item:
                    codes.append(item.split(":", 1)[0].strip())
                else:
                    codes.append(item.strip())

    blob = json.dumps(data, ensure_ascii=False)
    for code in _AUTH_CODES:
        if code in blob and code not in codes:
            codes.append(code)
    return codes


def _diagnose_connection(status: int | None, data: dict, err_codes: list[str]) -> dict[str, Any]:
    auth_fail = any(c in _AUTH_CODES for c in err_codes) or status in (401, 403)
    reachable = status is not None

    # ETA returns IsSuccess=true with VAL_* codes for empty/invalid test payloads — auth still OK.
    if isinstance(data, dict) and data.get("IsSuccess") is True and not any(c in _AUTH_CODES for c in err_codes):
        auth_fail = False

    if isinstance(data, dict) and data.get("raw") and not data.get("IsSuccess"):
        auth_fail = True

    hint = ""
    if not reachable:
        hint = "Cannot reach the server (DNS, firewall, or SSL). Check Base URL and VPS outbound HTTPS."
    elif "ERR_IP_DENY" in err_codes:
        hint = "Your server IP is not whitelisted. Send the VPS public IP to the ETA developer."
    elif "ERR_HMAC_INV" in err_codes or "ERR_HMAC_REQ" in err_codes:
        hint = "HMAC signature rejected. Re-save Auth key and Secret key exactly as provided (no spaces)."
    elif "ERR_AUTH_INV" in err_codes or "ERR_AUTH_REQ" in err_codes:
        hint = "Auth key rejected or missing. Re-paste the full key from credential.txt and Save."
    elif status == 404:
        hint = "URL not found. Base URL should be https://testeta.misrapp.com/api (include /api)."
    elif status is not None and status >= 500:
        hint = (
            "EtaMiddleware returned a server error (HTTP 500). "
            "Your request reached their API; this is usually a middleware bug or invalid test payload — "
            "ask the developer to check server logs for your VPS IP and auth key."
        )
    elif auth_fail:
        hint = "Authentication failed. Verify keys and ask developer to confirm sandbox account is active."
    elif reachable and status is not None and status < 500 and not auth_fail:
        hint = "Connection and authentication OK. Empty test payload may show validation errors — that is normal."

    auth_ok = reachable and not auth_fail and (status is not None and status < 500)

    return {
        "http_status": status,
        "reachable": reachable,
        "auth_ok": auth_ok,
        "hint": hint,
        "error_codes": err_codes,
    }


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
        if status >= 400 and not data.get("IsSuccess"):
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
        """Signed POST — auth OK if we get a structured response without auth error codes."""
        body = json.dumps({"Documents": []}, separators=(",", ":"))
        headers = auth_headers(self.auth_key, self.secret_key, body)
        url = f"{self.base_url}/EtaDocument/Documents"

        try:
            status, text = _http_request("POST", url, headers, body.encode("utf-8"), timeout=self.timeout)
        except ConnectionError as exc:
            return {
                "http_status": None,
                "reachable": False,
                "auth_ok": False,
                "hint": f"Network error: {exc}. Check Base URL and that the VPS can reach testeta.misrapp.com on port 443.",
                "response": {"error": str(exc)},
                "error_codes": [],
            }

        try:
            data = json.loads(text) if text.strip() else {}
        except Exception:
            data = {"raw": text}

        err_codes = _extract_error_codes(data)
        result = _diagnose_connection(status, data if isinstance(data, dict) else {}, err_codes)
        result["response"] = data
        result["request_url"] = url
        return result
