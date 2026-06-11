"""Loyalty program API — settings, members, transactions, calculator, exports."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_current_user, requires_feature, requires_feature_option
from excel_utils import xlsx_response
from loyalty_engine import (
    DEFAULT_LOYALTY_SETTINGS,
    LOYALTY_PROFILE_COLS,
    get_customer_points,
    is_loyalty_operational,
    load_loyalty_settings,
    preview_loyalty,
    tenant_has_loyalty_feature,
    _record_transaction,
)

router = APIRouter(prefix="/api/loyalty", tags=["loyalty"])


def _admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


class LoyaltySettingsPatch(BaseModel):
    loyalty_enabled: Optional[bool] = None
    loyalty_points_per_egp: Optional[float] = Field(None, ge=0, le=1000)
    loyalty_egp_per_point: Optional[float] = Field(None, ge=0, le=1000)
    loyalty_min_redeem: Optional[int] = Field(None, ge=0, le=1_000_000)
    loyalty_min_sale_egp: Optional[float] = Field(None, ge=0, le=1_000_000)
    loyalty_earn_on_account: Optional[bool] = None
    loyalty_max_redeem_pct: Optional[float] = Field(None, ge=0, le=100)


class CalculateRequest(BaseModel):
    customer_id: Optional[int] = None
    net_total: float = Field(..., ge=0)
    redeem_points: int = Field(0, ge=0)
    payment_method: str = "cash"
    credit_portion: float = Field(0, ge=0)


class AdjustRequest(BaseModel):
    points: int = Field(..., description="Positive to add, negative to deduct")
    notes: Optional[str] = None


@router.get("/status", dependencies=[Depends(requires_feature("loyalty"))])
def loyalty_status(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        settings = load_loyalty_settings(cur)
        return {
            "feature_enabled": tenant_has_loyalty_feature(current_user),
            "operational": is_loyalty_operational(cur, current_user),
            "settings": settings,
        }
    finally:
        conn.close()


@router.get("/settings", dependencies=[Depends(requires_feature("loyalty")), Depends(requires_feature_option("loyalty", "admin_settings"))])
def get_settings(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        return load_loyalty_settings(cur)
    finally:
        conn.close()


@router.put("/settings", dependencies=[Depends(requires_feature("loyalty")), Depends(requires_feature_option("loyalty", "admin_settings"))])
def update_settings(body: LoyaltySettingsPatch, current_user=Depends(get_current_user)):
    _admin(current_user)
    data = body.model_dump(exclude_unset=True)
    if not data:
        return {"ok": True}

    fields = []
    values = []
    for k, v in data.items():
        if k not in LOYALTY_PROFILE_COLS:
            continue
        fields.append(f"{k} = %s")
        values.append(v)
    if not fields:
        return {"ok": True}

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO pharmacy_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
        cur.execute(
            f"UPDATE pharmacy_profile SET {', '.join(fields)}, updated_at = NOW() WHERE id = 1",
            values,
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/calculate", dependencies=[Depends(requires_feature("loyalty"))])
def calculate_loyalty(body: CalculateRequest, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if not is_loyalty_operational(cur, current_user):
            return {"active": False, **DEFAULT_LOYALTY_SETTINGS}
        settings = load_loyalty_settings(cur)
        balance = 0
        if body.customer_id:
            balance = get_customer_points(cur, body.customer_id)
        result = preview_loyalty(
            settings=settings,
            customer_points=balance,
            net_total=body.net_total,
            redeem_points=body.redeem_points,
            payment_method=body.payment_method,
            credit_portion=body.credit_portion,
        )
        return {"active": True, "settings": settings, **result}
    finally:
        conn.close()


def _members_query(q: str, min_points: int | None, max_points: int | None):
    where = ["c.active = true"]
    params: list = []
    if q:
        where.append("(c.name ILIKE %s OR c.phone ILIKE %s OR c.code ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like])
    if min_points is not None:
        where.append("COALESCE(c.loyalty_points, 0) >= %s")
        params.append(min_points)
    if max_points is not None:
        where.append("COALESCE(c.loyalty_points, 0) <= %s")
        params.append(max_points)
    sql = f"""
        SELECT c.id, c.code, c.name, c.phone, c.email, c.region,
               COALESCE(c.loyalty_points, 0) AS loyalty_points,
               (SELECT COALESCE(SUM(i.net_total), 0) FROM invoices i
                WHERE i.customer_id = c.id AND i.type != 'return') AS total_sales,
               (SELECT COUNT(*)::int FROM invoices i
                WHERE i.customer_id = c.id AND i.type != 'return') AS sale_count,
               (SELECT MAX(i.created_at) FROM invoices i
                WHERE i.customer_id = c.id AND i.type != 'return') AS last_sale_at,
               (SELECT COALESCE(SUM(lt.points), 0) FROM loyalty_transactions lt
                WHERE lt.customer_id = c.id AND lt.kind = 'earn') AS lifetime_earned
        FROM customers c
        WHERE {' AND '.join(where)}
        ORDER BY c.name ASC
        LIMIT 2000
    """
    return sql, params


@router.get("/members", dependencies=[Depends(requires_feature("loyalty"))])
def list_members(
    q: str = "",
    min_points: Optional[int] = None,
    max_points: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql, params = _members_query(q, min_points, max_points)
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/members/export", dependencies=[Depends(requires_feature("loyalty")), Depends(requires_feature_option("loyalty", "members_export"))])
def export_members(
    q: str = "",
    min_points: Optional[int] = None,
    max_points: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql, params = _members_query(q, min_points, max_points)
        cur.execute(sql, params)
        rows = cur.fetchall()
        headers = [
            "Code", "Name", "Phone", "Points", "Total Sales (EGP)",
            "Sales Count", "Lifetime Earned", "Last Sale",
        ]
        data = [
            [
                r.get("code") or "",
                r.get("name") or "",
                r.get("phone") or "",
                int(r.get("loyalty_points") or 0),
                round(float(r.get("total_sales") or 0), 2),
                int(r.get("sale_count") or 0),
                int(r.get("lifetime_earned") or 0),
                r.get("last_sale_at").strftime("%Y-%m-%d %H:%M") if r.get("last_sale_at") else "",
            ]
            for r in rows
        ]
        stamp = datetime.now().strftime("%Y%m%d")
        return xlsx_response(headers, data, f"loyalty-members-{stamp}.xlsx")
    finally:
        conn.close()


def _transactions_query(
    q: str,
    kind: str,
    customer_id: Optional[int],
    date_from: Optional[str],
    date_to: Optional[str],
):
    where = ["1=1"]
    params: list = []
    if q:
        where.append("(c.name ILIKE %s OR c.phone ILIKE %s OR c.code ILIKE %s OR i.invoice_number ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like, like])
    if kind:
        where.append("lt.kind = %s")
        params.append(kind)
    if customer_id:
        where.append("lt.customer_id = %s")
        params.append(customer_id)
    if date_from:
        where.append("DATE(lt.created_at) >= %s")
        params.append(date_from)
    if date_to:
        where.append("DATE(lt.created_at) <= %s")
        params.append(date_to)
    sql = f"""
        SELECT lt.*, c.name AS customer_name, c.code AS customer_code, c.phone AS customer_phone,
               i.invoice_number,
               u.name_en AS recorded_by_name
        FROM loyalty_transactions lt
        JOIN customers c ON c.id = lt.customer_id
        LEFT JOIN invoices i ON i.id = lt.invoice_id
        LEFT JOIN users u ON u.id = lt.recorded_by
        WHERE {' AND '.join(where)}
        ORDER BY lt.created_at DESC, lt.id DESC
        LIMIT 5000
    """
    return sql, params


@router.get("/transactions", dependencies=[Depends(requires_feature("loyalty"))])
def list_transactions(
    q: str = "",
    kind: str = "",
    customer_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql, params = _transactions_query(q, kind, customer_id, date_from, date_to)
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/transactions/export", dependencies=[Depends(requires_feature("loyalty"))])
def export_transactions(
    q: str = "",
    kind: str = "",
    customer_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql, params = _transactions_query(q, kind, customer_id, date_from, date_to)
        cur.execute(sql, params)
        rows = cur.fetchall()
        headers = [
            "Date", "Customer", "Code", "Phone", "Kind", "Points",
            "Balance After", "Invoice", "Sale Amount", "Notes", "By",
        ]
        data = [
            [
                r["created_at"].strftime("%Y-%m-%d %H:%M") if r.get("created_at") else "",
                r.get("customer_name") or "",
                r.get("customer_code") or "",
                r.get("customer_phone") or "",
                r.get("kind") or "",
                int(r.get("points") or 0),
                int(r.get("balance_after") or 0),
                r.get("invoice_number") or "",
                round(float(r.get("sale_amount") or 0), 2) if r.get("sale_amount") is not None else "",
                r.get("notes") or "",
                r.get("recorded_by_name") or "",
            ]
            for r in rows
        ]
        stamp = datetime.now().strftime("%Y%m%d")
        return xlsx_response(headers, data, f"loyalty-transactions-{stamp}.xlsx")
    finally:
        conn.close()


@router.get("/customers/{customer_id}/summary", dependencies=[Depends(requires_feature("loyalty"))])
def customer_loyalty_summary(customer_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT id, code, name, phone, COALESCE(loyalty_points, 0) AS loyalty_points
               FROM customers WHERE id=%s AND active=true""",
            (customer_id,),
        )
        cust = cur.fetchone()
        if not cust:
            raise HTTPException(status_code=404, detail="Customer not found")
        cur.execute(
            """SELECT lt.*, i.invoice_number FROM loyalty_transactions lt
               LEFT JOIN invoices i ON i.id = lt.invoice_id
               WHERE lt.customer_id=%s ORDER BY lt.created_at DESC LIMIT 50""",
            (customer_id,),
        )
        txns = [dict(r) for r in cur.fetchall()]
        return {"customer": dict(cust), "transactions": txns}
    finally:
        conn.close()


@router.post("/customers/{customer_id}/adjust", dependencies=[Depends(requires_feature("loyalty"))])
def adjust_points(customer_id: int, body: AdjustRequest, current_user=Depends(get_current_user)):
    _admin(current_user)
    if body.points == 0:
        raise HTTPException(status_code=400, detail="Points adjustment cannot be zero")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM customers WHERE id=%s AND active=true", (customer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Customer not found")
        _record_transaction(
            cur,
            customer_id,
            "adjust",
            body.points,
            notes=body.notes or "Manual adjustment",
            user_id=current_user.get("user_id"),
        )
        conn.commit()
        return {"ok": True, "balance": get_customer_points(cur, customer_id)}
    except ValueError as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
