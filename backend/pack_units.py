"""Selling/buying unit math for packed products (Box → Strip → Tablet).

Stock is always stored in the SMALLEST unit:
* 1 level  (pack_size <= 1)                → stock in boxes/pieces.
* 2 levels (pack_size > 1)                 → stock in sub units (strips OR tablets).
* 3 levels (pack_size > 1 + mid_unit/size) → stock in tablets; a strip = mid_size tablets,
  a box = pack_size tablets (pack_size is a multiple of mid_size).

unit_type on sale/PO lines: "pack" = box, "mid" = strip (3-level only), "sub" = smallest unit.
"""
from __future__ import annotations

from typing import Optional

UNIT_TYPES = ("pack", "mid", "sub")


def pack_size_of(p: dict) -> int:
    return max(1, int(p.get("pack_size") or 1))


def has_mid(p: dict) -> bool:
    """True when the product has a valid middle unit (strip) between box and tablet."""
    pack = pack_size_of(p)
    mid = int(p.get("mid_size") or 0)
    return bool(p.get("mid_unit")) and 1 < mid < pack and pack % mid == 0


def normalize_unit_type(unit_type: Optional[str], p: dict) -> str:
    ut = (unit_type or "pack").strip().lower()
    if ut == "mid" and not has_mid(p):
        # A strip line on a product without a strip level falls back to the box.
        return "pack"
    if ut == "sub" and pack_size_of(p) <= 1:
        return "pack"
    return ut if ut in UNIT_TYPES else "pack"


def unit_multiple(p: dict, unit_type: Optional[str]) -> int:
    """Smallest units in ONE unit of the given type (what stock moves per 1 qty)."""
    ut = normalize_unit_type(unit_type, p)
    if ut == "mid":
        return int(p["mid_size"])
    if ut == "sub":
        return 1
    return pack_size_of(p)


def unit_label(p: dict, unit_type: Optional[str]) -> str:
    ut = normalize_unit_type(unit_type, p)
    if ut == "mid":
        return (p.get("mid_unit") or "strip").strip()
    if ut == "sub":
        return (p.get("sub_unit") or "").strip() or "piece"
    return (p.get("unit") or "").strip() or "unit"


def validate_mid(pack_size: Optional[int], mid_unit: Optional[str], mid_size: Optional[int]) -> Optional[str]:
    """Return an error message when a middle-unit definition is inconsistent, else None."""
    if not mid_unit and not mid_size:
        return None
    pack = max(1, int(pack_size or 1))
    mid = int(mid_size or 0)
    if not mid_unit:
        return "Middle unit name is required when the middle unit size is set"
    if mid <= 1 or mid >= pack:
        return "Middle unit size must be more than 1 and less than the units per box"
    if pack % mid:
        return f"Units per box ({pack}) must be a whole multiple of the middle unit size ({mid})"
    return None
