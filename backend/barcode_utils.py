"""Normalize scanned barcode values for product lookup."""
import re
from typing import List

_LOCAL_HYPHEN_SUFFIX = re.compile(r"^([^-]+)-(.+)$")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
# GS1 AIM symbology prefix, e.g. ]C1, ]E0
_AIM_PREFIX = re.compile(r"^\][A-Za-z]\d")
_LOCAL_WITH_SUFFIX = re.compile(r"\d{4,}-\d{1,4}")
_GTIN = re.compile(r"\d{8,14}")


def _is_gtin_like(value: str) -> bool:
    """True when the scan looks like an EAN/GTIN (all digits, 8+ chars)."""
    compact = re.sub(r"\s+", "", value)
    return compact.isdigit() and len(compact) >= 8


def sanitize_scanned_barcode(raw: str) -> str:
    """Strip control chars and common USB-scanner prefix/suffix wrappers."""
    s = (raw or "").strip()
    if not s:
        return ""
    s = _CONTROL_CHARS.sub("", s)
    # GS1 AIM identifier (]C1, ]E0, …) — payload follows the 3-char header.
    if _AIM_PREFIX.match(s) and len(s) > 3:
        s = s[3:]
    # Code 39 start/stop asterisks.
    s = s.strip("*")
    # Matching single-letter wrappers, e.g. C85947-13C (Code128 subset indicator).
    if (
        len(s) >= 3
        and s[0].isalpha()
        and s[-1] == s[0]
        and (s[1].isdigit() or s[1] in "-]")
    ):
        s = s[1:-1]
    # Single leading symbology letter before digits, e.g. C85947-13
    if len(s) >= 2 and s[0].isalpha() and s[1].isdigit():
        s = s[1:]
    # Single trailing symbology letter after digits, e.g. 85947-13C
    if len(s) >= 2 and s[-1].isalpha() and s[-2].isdigit():
        s = s[:-1]
    # Trim leftover non-alphanumeric edges from misconfigured wedges.
    s = re.sub(r"^[^0-9A-Za-z]+", "", s)
    s = re.sub(r"[^0-9A-Za-z-]+$", "", s)
    return s.strip()


def _embedded_tokens(raw: str) -> List[str]:
    """Pull barcode-like substrings from a noisy scan (wrappers, mixed text)."""
    found: List[str] = []
    seen: set[str] = set()
    for pattern in (_LOCAL_WITH_SUFFIX, _GTIN):
        for m in pattern.finditer(raw):
            v = m.group(0)
            key = v.upper()
            if key not in seen:
                seen.add(key)
                found.append(v)
    return found


def barcode_lookup_candidates(scanned: str) -> List[str]:
    """Build deduplicated lookup keys from a raw scanner value.

    Handles:
    - Local CODE-SUFFIX labels (85947-13) while master data stores 85947
    - International EAN/GTIN (6221025047038)
    - Scanner wrappers (C85947-13C, ]C1..., *...*, control chars)
    """
    raw = (scanned or "").strip()
    if not raw:
        return []
    result: List[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        v = value.strip()
        if not v:
            return
        key = v.upper()
        if key in seen:
            return
        seen.add(key)
        result.append(v)

    def expand(value: str) -> None:
        add(value)
        cleaned = sanitize_scanned_barcode(value)
        if cleaned and cleaned != value:
            add(cleaned)
        m = _LOCAL_HYPHEN_SUFFIX.match(cleaned or value)
        if m:
            base, suffix = m.group(1).strip(), m.group(2).strip()
            if base and suffix and not _is_gtin_like(cleaned or value):
                add(base)

    expand(raw)
    cleaned = sanitize_scanned_barcode(raw)
    for token in _embedded_tokens(cleaned or raw):
        expand(token)
    return result


def product_search_clause(q: str, *, table_prefix: str = "") -> tuple[str, list]:
    """SQL boolean expression + params matching name or barcode fields."""
    q = (q or "").strip()
    p = f"{table_prefix}." if table_prefix else ""
    parts: list[str] = []
    params: list = []
    like = f"%{q}%"
    parts.append(
        f"({p}name_ar ILIKE %s OR {p}name_en ILIKE %s "
        f"OR {p}barcode ILIKE %s OR {p}international_barcode ILIKE %s)"
    )
    params.extend([like, like, like, like])
    for cand in barcode_lookup_candidates(q):
        cu = cand.upper()
        parts.append(
            f"(UPPER(COALESCE({p}barcode, '')) = %s "
            f"OR UPPER(COALESCE({p}international_barcode, '')) = %s)"
        )
        params.extend([cu, cu])
    return f"({' OR '.join(parts)})", params
