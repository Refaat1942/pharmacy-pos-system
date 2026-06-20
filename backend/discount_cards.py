"""Discount card programs and issued cards API."""
from __future__ import annotations

from datetime import date
from typing import Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_current_user, requires_feature, requires_feature_option
from excel_utils import xlsx_response
from insurance_audit import log_insurance_audit
from insurance_constants import DEFAULT_CARD_COMPATIBILITY, DEFAULT_CARD_RULES

router = APIRouter(prefix="/api/discount-cards", tags=["discount_cards"])


def _admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


class ProgramIn(BaseModel):
    name_ar: Optional[str] = None
    name_en: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1, max_length=50)
    card_type: str = "promotional"
    status: str = "active"
    rules: Optional[dict] = None
    compatibility: Optional[dict] = None
    notes: Optional[str] = None


class CardIn(BaseModel):
    program_id: int
    card_number: str = Field(..., min_length=1, max_length=100)
    customer_id: Optional[int] = None
    expiry_date: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


@router.get("/programs", dependencies=[Depends(requires_feature("discount_cards"))])
def list_programs(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM discount_card_programs ORDER BY name_en")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/programs", dependencies=[
    Depends(requires_feature("discount_cards")),
    Depends(requires_feature_option("discount_cards", "manage")),
])
def create_program(body: ProgramIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO discount_card_programs
               (name_ar, name_en, code, card_type, status, rules, compatibility, notes)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                body.name_ar, body.name_en, body.code.strip().upper(), body.card_type,
                body.status,
                psycopg2.extras.Json({**DEFAULT_CARD_RULES, **(body.rules or {})}),
                psycopg2.extras.Json({**DEFAULT_CARD_COMPATIBILITY, **(body.compatibility or {})}),
                body.notes,
            ),
        )
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="card_program", entity_id=row["id"], action="create",
                            user_id=current_user.get("user_id"), new_value=row)
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(400, "Program code already exists") from e
        raise
    finally:
        conn.close()


@router.put("/programs/{program_id}", dependencies=[
    Depends(requires_feature("discount_cards")),
    Depends(requires_feature_option("discount_cards", "manage")),
])
def update_program(program_id: int, body: ProgramIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM discount_card_programs WHERE id=%s", (program_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(404, "Program not found")
        cur.execute(
            """UPDATE discount_card_programs SET
               name_ar=%s, name_en=%s, code=%s, card_type=%s, status=%s,
               rules=%s, compatibility=%s, notes=%s, updated_at=NOW()
               WHERE id=%s RETURNING *""",
            (
                body.name_ar, body.name_en, body.code.strip().upper(), body.card_type,
                body.status,
                psycopg2.extras.Json({**DEFAULT_CARD_RULES, **(body.rules or {})}),
                psycopg2.extras.Json({**DEFAULT_CARD_COMPATIBILITY, **(body.compatibility or {})}),
                body.notes, program_id,
            ),
        )
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="card_program", entity_id=program_id, action="update",
                            user_id=current_user.get("user_id"), old_value=dict(old), new_value=row)
        conn.commit()
        return row
    finally:
        conn.close()


@router.get("/cards", dependencies=[Depends(requires_feature("discount_cards"))])
def list_cards(program_id: Optional[int] = None, q: Optional[str] = None, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        clauses = []
        params: list = []
        if program_id:
            clauses.append("dc.program_id = %s")
            params.append(program_id)
        if q:
            clauses.append("(dc.card_number ILIKE %s OR cu.name ILIKE %s)")
            params.extend([f"%{q}%", f"%{q}%"])
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        cur.execute(
            f"""SELECT dc.*, dp.name_en AS program_name, dp.code AS program_code,
                       cu.name AS customer_name
                FROM discount_cards dc
                JOIN discount_card_programs dp ON dp.id = dc.program_id
                LEFT JOIN customers cu ON cu.id = dc.customer_id
                {where}
                ORDER BY dc.issued_at DESC LIMIT 500""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/cards/lookup", dependencies=[Depends(requires_feature("discount_cards"))])
def lookup_card(card_number: str, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT dc.*, dp.name_en AS program_name, dp.name_ar AS program_name_ar,
                      dp.rules, dp.compatibility, dp.status AS program_status
               FROM discount_cards dc
               JOIN discount_card_programs dp ON dp.id = dc.program_id
               WHERE dc.card_number = %s AND dc.status = 'active'""",
            (card_number.strip(),),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Card not found")
        return dict(row)
    finally:
        conn.close()


@router.post("/cards", dependencies=[
    Depends(requires_feature("discount_cards")),
    Depends(requires_feature_option("discount_cards", "manage")),
])
def create_card(body: CardIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM discount_card_programs WHERE id=%s", (body.program_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Program not found")
        cur.execute(
            """INSERT INTO discount_cards
               (program_id, card_number, customer_id, expiry_date, status, notes)
               VALUES (%s,%s,%s,%s,%s,%s) RETURNING *""",
            (body.program_id, body.card_number.strip(), body.customer_id,
             body.expiry_date or None, body.status, body.notes),
        )
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="discount_card", entity_id=row["id"], action="create",
                            user_id=current_user.get("user_id"), new_value=row)
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(400, "Card number already exists") from e
        raise
    finally:
        conn.close()


@router.put("/cards/{card_id}", dependencies=[
    Depends(requires_feature("discount_cards")),
    Depends(requires_feature_option("discount_cards", "manage")),
])
def update_card(card_id: int, body: CardIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """UPDATE discount_cards SET
               program_id=%s, card_number=%s, customer_id=%s, expiry_date=%s,
               status=%s, notes=%s
               WHERE id=%s RETURNING *""",
            (body.program_id, body.card_number.strip(), body.customer_id,
             body.expiry_date or None, body.status, body.notes, card_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Card not found")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


@router.get("/dashboard", dependencies=[
    Depends(requires_feature("discount_cards")),
    Depends(requires_feature_option("discount_cards", "dashboard")),
])
def card_dashboard(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        today = date.today()
        cur.execute("SELECT COUNT(*)::int AS cnt FROM discount_cards WHERE status='active'")
        active = cur.fetchone()["cnt"]
        cur.execute(
            """SELECT COUNT(*)::int AS cnt FROM discount_cards
               WHERE expiry_date IS NOT NULL AND expiry_date < %s""",
            (today,),
        )
        expired = cur.fetchone()["cnt"]
        cur.execute(
            """SELECT COUNT(*)::int AS uses,
                      COALESCE(SUM(discount_amount), 0)::float AS total_discount
               FROM discount_card_usage
               WHERE used_at >= date_trunc('month', CURRENT_DATE)"""
        )
        usage = dict(cur.fetchone())
        cur.execute(
            """SELECT dc.card_number, dp.name_en AS program_name,
                      COUNT(u.id)::int AS uses,
                      COALESCE(SUM(u.discount_amount), 0)::float AS discount
               FROM discount_card_usage u
               JOIN discount_cards dc ON dc.id = u.card_id
               JOIN discount_card_programs dp ON dp.id = dc.program_id
               WHERE u.used_at >= date_trunc('month', CURRENT_DATE)
               GROUP BY dc.id, dc.card_number, dp.name_en
               ORDER BY discount DESC LIMIT 5"""
        )
        top_cards = [dict(r) for r in cur.fetchall()]
        return {"active_cards": active, "expired_cards": expired, "month_usage": usage, "top_cards": top_cards}
    finally:
        conn.close()


@router.get("/usage/export", dependencies=[
    Depends(requires_feature("discount_cards")),
    Depends(requires_feature_option("discount_cards", "reports")),
])
def export_usage(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT u.used_at, dc.card_number, dp.name_en AS program,
                      cu.name AS customer, u.discount_amount, i.invoice_number
               FROM discount_card_usage u
               JOIN discount_cards dc ON dc.id = u.card_id
               JOIN discount_card_programs dp ON dp.id = dc.program_id
               LEFT JOIN customers cu ON cu.id = u.customer_id
               LEFT JOIN invoices i ON i.id = u.invoice_id
               ORDER BY u.used_at DESC LIMIT 5000"""
        )
        rows = [[
            str(r["used_at"])[:19], r["card_number"], r["program"],
            r["customer"] or "", r["discount_amount"], r["invoice_number"] or "",
        ] for r in cur.fetchall()]
        return xlsx_response(
            ["Date", "Card", "Program", "Customer", "Discount", "Invoice"],
            rows,
            "discount-card-usage.xlsx",
        )
    finally:
        conn.close()
