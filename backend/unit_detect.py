"""Find items that are really sold loose (strips / tablets / sachets) but are set
up as whole boxes only, and convert them.

Detection reads the item name (English and Arabic): "30 Tabs", "3x10 caps",
"20 F.C. Tablets", "١٠ أكياس", "علبة ٢٠ قرص"... It suggests the units per box,
the strip size and the loose prices. Applying a suggestion rescales the stock
mathematically: N boxes become N × pack smallest units, lot by lot, so nothing
is lost and the box price / cost stay the same.
"""
import math
import re
from typing import List, Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_active_branch_id, get_current_user, require_user_feature
from inventory import log_movement
from pack_units import validate_mid
from stock_batches import ensure_batches_migrated, sync_product_from_batches

router = APIRouter(prefix="/api/inventory/unit-suggestions", tags=["inventory"])

_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

# Dosage form → (sub unit label shown to the cashier, typical strip size or None)
_FORMS = [
    (r"(?:f\.?\s?c\.?\s*)?(?:tabs?|tablets?|tab\.|caplets?|قرص|اقراص|أقراص|حبه|حبة|حبوب)", "قرص", 10),
    (r"(?:caps?|capsules?|cap\.|كبسول[هة]?|كبسولات)", "كبسولة", 10),
    (r"(?:sachets?|sach|sachet|كيس|اكياس|أكياس|ظرف|اظرف|أظرف)", "كيس", None),
    (r"(?:supp?s?|suppositor(?:y|ies)|لبوس[هة]?|لبوسات)", "لبوسة", 5),
    (r"(?:amps?|ampoules?|ampules?|امبول[هة]?|أمبول[هة]?|امبولات|أمبولات)", "أمبول", None),
    (r"(?:vials?|فيال|فيالات)", "فيال", None),
    (r"(?:lozenges?|استحلاب)", "قرص استحلاب", None),
    (r"(?:eff(?:ervescent)?\.?\s*tabs?|فوار)", "قرص فوار", None),
    (r"(?:pens?|قلم|اقلام)", "قلم", None),
]
# Things you never split: liquids, creams, single devices.
_NO_SPLIT = re.compile(
    r"\b(?:syrup|susp(?:ension)?|cream|oint(?:ment)?|gel|drops?|lotion|spray|inhaler|"
    r"shampoo|solution|sol\.|ml|emulsion|mouthwash|powder\s+for|vaccine)\b"
    r"|شراب|معلق|كريم|مرهم|جل|نقط|نقاط|قطرة|لوشن|بخاخ|شامبو|محلول|غسول|مل\b",
    re.I,
)
_STRIPS = re.compile(r"(\d{1,2})\s*[x×*]\s*(\d{1,3})", re.I)
_MAX_PACK = 500


def _form_and_count(text: str):
    """Return (sub_unit, count, strips, per_strip, typical_strip) from a name."""
    t = (text or "").translate(_AR_DIGITS).lower()
    m = _STRIPS.search(t)
    for pat, label, typical in _FORMS:
        fm = re.search(pat, t, re.I)
        if not fm:
            continue
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if 1 <= a <= 20 and 1 <= b <= 100 and a * b <= _MAX_PACK:
                return label, a * b, a, b, typical
        # number right before (or right after) the form word: "30 tabs", "tabs 30", "/20 tab"
        near = re.search(rf"(\d{{1,3}})\s*(?:/|-)?\s*{pat}", t, re.I) or re.search(rf"{pat}\s*(\d{{1,3}})\b", t, re.I)
        if near:
            n = int(near.group(1))
            if 2 <= n <= 100:  # a bare "400 tab" is more likely a strength than a count
                return label, n, None, None, typical
        return label, None, None, None, typical
    return None


def _suggest(p: dict) -> Optional[dict]:
    text = " ".join(str(p.get(k) or "") for k in ("name_en", "name_ar", "unit", "sub_unit"))
    if _NO_SPLIT.search(text):
        return None
    found = _form_and_count(text)
    if not found:
        return None
    label, count, strips, per_strip, typical = found
    mid_size = None
    confidence = "high" if count else "needs_count"
    if per_strip and strips and strips > 1:
        mid_size = per_strip
    elif count and typical and count > typical and count % typical == 0:
        mid_size = typical
        confidence = "medium"
    price = float(p.get("price") or 0)
    out = {
        "product_id": p["id"],
        "name_en": p.get("name_en"),
        "name_ar": p.get("name_ar"),
        "barcode": p.get("barcode"),
        "stock_boxes": int(p.get("stock") or 0),
        "price": price,
        "unit": p.get("unit"),
        "sub_unit": label,
        "pack_size": count,
        "mid_unit": "شريط" if mid_size else None,
        "mid_size": mid_size,
        "confidence": confidence,
    }
    out.update(_prices(price, count, mid_size))
    return out


def _round_up_quarter(x: float) -> float:
    """Loose prices in Egypt are charged in 25-piaster steps, never below the box share."""
    return math.ceil(round(x * 4, 6)) / 4


def _prices(price: float, pack: Optional[int], mid: Optional[int]) -> dict:
    if not pack or pack <= 1 or price <= 0:
        return {"sub_price": None, "mid_price": None}
    return {
        "sub_price": _round_up_quarter(price / pack),
        "mid_price": _round_up_quarter(price * mid / pack) if mid else None,
    }


@router.get("")
def unit_suggestions(include_count_missing: bool = True, current_user=Depends(get_current_user),
                     active_branch=Depends(get_active_branch_id)):
    """Box-only items whose name says they hold tablets / capsules / sachets…"""
    require_user_feature(current_user, "inventory")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where, params = ["active = true", "COALESCE(pack_size, 1) <= 1"], []
    if active_branch is not None:
        where.append("branch_id = %s")
        params.append(active_branch)
    cur.execute(
        f"""SELECT id, name_en, name_ar, barcode, unit, sub_unit, price, stock, branch_id
            FROM products WHERE {' AND '.join(where)} ORDER BY name_en LIMIT 5000""",
        params,
    )
    rows = []
    for p in cur.fetchall():
        s = _suggest(dict(p))
        if s and (s["pack_size"] or include_count_missing):
            rows.append(s)
    conn.close()
    order = {"high": 0, "medium": 1, "needs_count": 2}
    rows.sort(key=lambda r: (order[r["confidence"]], (r["name_en"] or "").lower()))
    return {"rows": rows, "count": len(rows)}


class ApplyItem(BaseModel):
    product_id: int
    pack_size: int = Field(ge=2, le=_MAX_PACK)
    sub_unit: str = Field(min_length=1, max_length=30)
    mid_unit: Optional[str] = None
    mid_size: Optional[int] = None
    sub_price: Optional[float] = Field(None, ge=0)
    mid_price: Optional[float] = Field(None, ge=0)


class ApplyIn(BaseModel):
    items: List[ApplyItem]
    all_branches: bool = True  # same barcode in other branches gets the same packaging


def _convert(cur, pid: int, it: ApplyItem, user_id) -> Optional[dict]:
    cur.execute("SELECT * FROM products WHERE id=%s FOR UPDATE", (pid,))
    p = cur.fetchone()
    if not p or int(p["pack_size"] or 1) > 1:
        return None  # already loose-sellable: never rescale twice
    mid_unit = (it.mid_unit or "").strip() or None
    mid_size = it.mid_size if mid_unit else None
    err = validate_mid(it.pack_size, mid_unit, mid_size)
    if err:
        raise HTTPException(status_code=400, detail=f"{p['name_en']}: {err}")
    price = float(p["price"] or 0)
    auto = _prices(price, it.pack_size, mid_size)
    sub_price = it.sub_price if it.sub_price else auto["sub_price"]
    mid_price = (it.mid_price if it.mid_price else auto["mid_price"]) if mid_size else None
    ensure_batches_migrated(cur, pid)
    old_stock = int(p["stock"] or 0)
    # Boxes → smallest units, every lot (oversold negative lots too).
    cur.execute("UPDATE product_batches SET quantity = quantity * %s WHERE product_id=%s", (it.pack_size, pid))
    cur.execute(
        """UPDATE products SET pack_size=%s, sub_unit=%s, sub_price=%s, mid_unit=%s, mid_size=%s, mid_price=%s
           WHERE id=%s""",
        (it.pack_size, it.sub_unit.strip(), sub_price, mid_unit, mid_size, mid_price, pid),
    )
    new_stock = sync_product_from_batches(cur, pid)
    if new_stock != old_stock:
        log_movement(
            cur, pid, p["branch_id"], "adjustment", new_stock - old_stock, new_stock,
            reference_type="unit_change",
            reason=f"Sold loose: 1 box = {it.pack_size} {it.sub_unit}; {old_stock} box(es) → {new_stock}",
            user_id=user_id, reason_code="count",
        )
    return {"product_id": pid, "branch_id": p["branch_id"], "old_stock": old_stock, "new_stock": new_stock}


@router.post("/apply")
def apply_suggestions(req: ApplyIn, current_user=Depends(get_current_user)):
    require_user_feature(current_user, "inventory")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can change item packaging")
    if not req.items:
        raise HTTPException(status_code=400, detail="Nothing selected")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        done = []
        for it in req.items:
            targets = [it.product_id]
            if req.all_branches:
                cur.execute(
                    """SELECT o.id FROM products o JOIN products p ON p.id=%s
                       WHERE o.id <> p.id AND COALESCE(o.barcode,'') <> '' AND o.barcode = p.barcode
                         AND COALESCE(o.pack_size, 1) <= 1""",
                    (it.product_id,),
                )
                targets += [r["id"] for r in cur.fetchall()]
            for pid in targets:
                r = _convert(cur, pid, it, current_user.get("user_id"))
                if r:
                    done.append(r)
        conn.commit()
        return {"converted": len(done), "items": done}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()
