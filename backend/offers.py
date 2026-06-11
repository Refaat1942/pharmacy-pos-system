"""Promotional offers — admin CRUD + POS active list."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import psycopg2.extras

from db import get_db_connection
from deps import get_current_user, get_active_branch_id, requires_feature
from offer_engine import OFFER_TYPES, apply_offers_to_cart

router = APIRouter(prefix="/api/offers", tags=["offers"])


class OfferProductIn(BaseModel):
    product_id: int


class OfferIn(BaseModel):
    name_en: str = Field(..., min_length=1, max_length=120)
    name_ar: Optional[str] = None
    offer_type: str
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    priority: int = 0
    active: bool = True
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    branch_ids: Optional[list[int]] = None
    product_ids: list[int] = Field(..., min_length=1)


class OfferPreviewIn(BaseModel):
    items: list[dict]


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _validate_offer_type(body: OfferIn):
    if body.offer_type not in OFFER_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid offer_type: {body.offer_type}")
    if body.offer_type in ("second_half", "direct_percent") and body.discount_percent is None:
        body.discount_percent = 50.0 if body.offer_type == "second_half" else 0.0
    if body.offer_type == "direct_amount" and (body.discount_amount is None or body.discount_amount <= 0):
        raise HTTPException(status_code=400, detail="discount_amount required for direct_amount offers")


def _check_product_overlap(cur, product_ids: list[int], exclude_offer_id: int | None = None):
    if not product_ids:
        return
    placeholders = ",".join(["%s"] * len(product_ids))
    params: list[Any] = list(product_ids)
    sql = f"""
        SELECT p.id, p.name_en, o.name_en AS offer_name
        FROM promo_offer_products pop
        JOIN promo_offers o ON o.id = pop.offer_id AND o.active = true
        JOIN products p ON p.id = pop.product_id
        WHERE pop.product_id IN ({placeholders})
    """
    if exclude_offer_id:
        sql += " AND o.id <> %s"
        params.append(exclude_offer_id)
    cur.execute(sql, params)
    row = cur.fetchone()
    if row:
        raise HTTPException(
            status_code=400,
            detail=f"Product '{row['name_en']}' is already in active offer '{row['offer_name']}'",
        )


def _serialize_offer(row: dict, products: list[dict] | None = None) -> dict:
    out = dict(row)
    out["product_ids"] = [p["id"] for p in (products or [])]
    out["products"] = products or []
    if out.get("branch_ids") is None:
        out["branch_ids"] = None
    return out


def _load_products(cur, offer_id: int) -> list[dict]:
    cur.execute(
        """
        SELECT p.id, p.name_en, p.name_ar, p.barcode, p.price, p.active
        FROM promo_offer_products pop
        JOIN products p ON p.id = pop.product_id
        WHERE pop.offer_id = %s
        ORDER BY p.name_en
        """,
        (offer_id,),
    )
    return [dict(r) for r in cur.fetchall()]


def _branch_ok(offer: dict, branch_id: int | None) -> bool:
    bids = offer.get("branch_ids")
    if not bids:
        return True
    if branch_id is None:
        return True
    return branch_id in bids


def _parse_date(val) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    return datetime.strptime(str(val)[:10], "%Y-%m-%d").date()


def _date_ok(offer: dict, today: date) -> bool:
    vf = _parse_date(offer.get("valid_from"))
    vt = _parse_date(offer.get("valid_to"))
    if vf and today < vf:
        return False
    if vt and today > vt:
        return False
    return True


@router.get("", dependencies=[Depends(requires_feature("offers"))])
def list_offers(current_user=Depends(get_current_user)):
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM promo_offers ORDER BY priority, id")
        rows = cur.fetchall()
        out = []
        for row in rows:
            products = _load_products(cur, row["id"])
            out.append(_serialize_offer(dict(row), products))
        return out
    finally:
        conn.close()


@router.get("/active", dependencies=[Depends(requires_feature("offers"))])
def active_offers(
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        today = date.today()
        cur.execute(
            "SELECT * FROM promo_offers WHERE active = true ORDER BY priority, id",
        )
        rows = cur.fetchall()
        out = []
        for row in rows:
            o = dict(row)
            if not _date_ok(o, today):
                continue
            if not _branch_ok(o, active_branch):
                continue
            products = _load_products(cur, o["id"])
            if not products:
                continue
            o["product_ids"] = [p["id"] for p in products]
            o["products"] = products
            out.append(o)
        return out
    finally:
        conn.close()


@router.post("", dependencies=[Depends(requires_feature("offers"))])
def create_offer(body: OfferIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    _validate_offer_type(body)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if body.active:
            _check_product_overlap(cur, body.product_ids)
        cur.execute(
            """
            INSERT INTO promo_offers
              (name_en, name_ar, offer_type, discount_percent, discount_amount,
               priority, active, valid_from, valid_to, branch_ids, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                body.name_en.strip(),
                (body.name_ar or "").strip() or None,
                body.offer_type,
                body.discount_percent,
                body.discount_amount,
                body.priority,
                body.active,
                body.valid_from or None,
                body.valid_to or None,
                body.branch_ids,
                current_user.get("user_id"),
            ),
        )
        offer_id = cur.fetchone()["id"]
        for pid in body.product_ids:
            cur.execute(
                "INSERT INTO promo_offer_products (offer_id, product_id) VALUES (%s,%s)",
                (offer_id, pid),
            )
        conn.commit()
        cur.execute("SELECT * FROM promo_offers WHERE id=%s", (offer_id,))
        row = dict(cur.fetchone())
        products = _load_products(cur, offer_id)
        return _serialize_offer(row, products)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/{offer_id}", dependencies=[Depends(requires_feature("offers"))])
def update_offer(offer_id: int, body: OfferIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    _validate_offer_type(body)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM promo_offers WHERE id=%s", (offer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Offer not found")
        if body.active:
            _check_product_overlap(cur, body.product_ids, exclude_offer_id=offer_id)
        cur.execute(
            """
            UPDATE promo_offers SET
              name_en=%s, name_ar=%s, offer_type=%s, discount_percent=%s, discount_amount=%s,
              priority=%s, active=%s, valid_from=%s, valid_to=%s, branch_ids=%s,
              updated_at=NOW()
            WHERE id=%s
            """,
            (
                body.name_en.strip(),
                (body.name_ar or "").strip() or None,
                body.offer_type,
                body.discount_percent,
                body.discount_amount,
                body.priority,
                body.active,
                body.valid_from or None,
                body.valid_to or None,
                body.branch_ids,
                offer_id,
            ),
        )
        cur.execute("DELETE FROM promo_offer_products WHERE offer_id=%s", (offer_id,))
        for pid in body.product_ids:
            cur.execute(
                "INSERT INTO promo_offer_products (offer_id, product_id) VALUES (%s,%s)",
                (offer_id, pid),
            )
        conn.commit()
        cur.execute("SELECT * FROM promo_offers WHERE id=%s", (offer_id,))
        row = dict(cur.fetchone())
        products = _load_products(cur, offer_id)
        return _serialize_offer(row, products)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{offer_id}", dependencies=[Depends(requires_feature("offers"))])
def delete_offer(offer_id: int, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("DELETE FROM promo_offers WHERE id=%s RETURNING id", (offer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Offer not found")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/preview", dependencies=[Depends(requires_feature("offers"))])
def preview_offers(body: OfferPreviewIn, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        today = date.today()
        cur.execute("SELECT * FROM promo_offers WHERE active = true ORDER BY priority, id")
        offers = []
        for row in cur.fetchall():
            o = dict(row)
            if not _date_ok(o, today):
                continue
            cur.execute(
                "SELECT product_id FROM promo_offer_products WHERE offer_id=%s",
                (o["id"],),
            )
            o["product_ids"] = [r["product_id"] for r in cur.fetchall()]
            offers.append(o)
        enriched, used_ids, total = apply_offers_to_cart(body.items, offers)
        return {"items": enriched, "offer_ids": used_ids, "offer_savings": total}
    finally:
        conn.close()
