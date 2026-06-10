"""Normalize scanned barcode values for product lookup."""
import re
from typing import List

_LOCAL_HYPHEN_SUFFIX = re.compile(r"^([^-]+)-(.+)$")


def _is_gtin_like(value: str) -> bool:
    """True when the scan looks like an EAN/GTIN (all digits, 8+ chars)."""
    compact = re.sub(r"\s+", "", value)
    return compact.isdigit() and len(compact) >= 8


def barcode_lookup_candidates(scanned: str) -> List[str]:
    """Build deduplicated lookup keys from a raw scanner value.

  Local pharmacy labels often encode ``CODE-SUFFIX`` (e.g. ``85947-13``) while
  master data stores only ``85947``. International barcodes (EAN/GTIN) are
  returned unchanged.
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

    add(raw)
    m = _LOCAL_HYPHEN_SUFFIX.match(raw)
    if m:
        base, suffix = m.group(1).strip(), m.group(2).strip()
        if base and suffix and not _is_gtin_like(raw):
            add(base)
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
