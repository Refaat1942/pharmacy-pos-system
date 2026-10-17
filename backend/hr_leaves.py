"""HR: salary advances (سلف) and leaves (إجازات).

Advances are repaid in equal monthly installments taken by payroll generation
(hr._deduct_advances). Approved leave fills the attendance days with status
'leave'; annual / casual / sick leave is paid as a full day, unpaid leave is not.
"""
from datetime import date, timedelta
from typing import Literal, Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_current_user
from hr import _require_hr_tab

router = APIRouter(prefix="/api/hr", tags=["hr"])

LEAVE_TYPES = ("annual", "casual", "sick", "unpaid")
# Casual leave (عارضة) is part of the annual balance under Egyptian labour law.
FROM_BALANCE = ("annual", "casual")
MAX_LEAVE_DAYS = 120


def _employee_in_scope(cur, user, employee_id: int) -> dict:
    cur.execute("SELECT id, name, branch_id, annual_leave_days FROM employees WHERE id=%s", [employee_id])
    e = cur.fetchone()
    if not e:
        raise HTTPException(404, "Employee not found")
    if user.get("role") != "admin" and e["branch_id"] is not None and e["branch_id"] != user.get("branch_id"):
        raise HTTPException(403, "Employee belongs to another branch")
    return e


def _branch_filter(user, alias: str = "e") -> tuple[str, list]:
    if user.get("role") == "admin":
        return "", []
    return f" AND ({alias}.branch_id IS NULL OR {alias}.branch_id = %s)", [user.get("branch_id")]


# ─── Advances ──────────────────────────────────────────────────────────────
class AdvanceIn(BaseModel):
    employee_id: int
    amount: float = Field(gt=0)
    installments: int = Field(1, ge=1, le=36)
    given_on: Optional[date] = None
    notes: Optional[str] = None


@router.get("/advances/employees")
def advance_roster(current_user=Depends(get_current_user)):
    """Active employees a payroll user may give an advance to."""
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        extra, params = _branch_filter(current_user)
        cur.execute(f"SELECT e.id, e.name, e.base_salary FROM employees e WHERE e.active = true {extra} ORDER BY e.name", params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.get("/advances")
def list_advances(employee_id: Optional[int] = None, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        extra, params = _branch_filter(current_user)
        if employee_id:
            extra += " AND a.employee_id=%s"
            params.append(employee_id)
        cur.execute(f"""
            SELECT a.*, e.name AS employee_name,
                   COALESCE((SELECT SUM(d.amount) FROM advance_deductions d WHERE d.advance_id=a.id), 0) AS repaid,
                   COALESCE((SELECT SUM(d.amount) FROM advance_deductions d
                             JOIN salary_slips s ON s.id=d.slip_id
                             WHERE d.advance_id=a.id AND s.status='paid'), 0) AS repaid_paid
            FROM employee_advances a JOIN employees e ON e.id=a.employee_id
            WHERE 1=1 {extra}
            ORDER BY a.given_on DESC, a.id DESC LIMIT 1000
        """, params)
        rows = []
        for r in cur.fetchall():
            r = dict(r)
            r["remaining"] = round(float(r["amount"]) - float(r["repaid"]), 2)
            r["installment"] = round(float(r["amount"]) / max(1, int(r["installments"])), 2)
            rows.append(r)
        return rows
    finally:
        cur.close(); conn.close()


@router.post("/advances")
def create_advance(body: AdvanceIn, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _employee_in_scope(cur, current_user, body.employee_id)
        cur.execute("""
            INSERT INTO employee_advances(employee_id, amount, installments, given_on, notes, created_by)
            VALUES (%s,%s,%s,COALESCE(%s, CURRENT_DATE),%s,%s) RETURNING *
        """, [body.employee_id, round(body.amount, 2), body.installments, body.given_on,
              (body.notes or "").strip() or None, current_user.get("user_id")])
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        cur.close(); conn.close()


@router.post("/advances/{aid}/cancel")
def cancel_advance(aid: int, current_user=Depends(get_current_user)):
    """Cancel an advance entered by mistake — only while nothing was taken on a paid slip.
    Installments on draft slips are released from those slips."""
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM employee_advances WHERE id=%s FOR UPDATE", [aid])
        a = cur.fetchone()
        if not a:
            raise HTTPException(404, "Advance not found")
        _employee_in_scope(cur, current_user, a["employee_id"])
        if a["status"] != "active":
            raise HTTPException(400, "Advance is already cancelled")
        cur.execute("""
            SELECT 1 FROM advance_deductions d JOIN salary_slips s ON s.id=d.slip_id
            WHERE d.advance_id=%s AND s.status='paid' LIMIT 1
        """, [aid])
        if cur.fetchone():
            raise HTTPException(400, "Part of this advance was already deducted from a paid salary")
        cur.execute("SELECT slip_id, amount FROM advance_deductions WHERE advance_id=%s", [aid])
        for d in cur.fetchall():
            cur.execute("""
                UPDATE salary_slips SET advance_deduction=advance_deduction-%s, net_amount=net_amount+%s
                WHERE id=%s
            """, [d["amount"], d["amount"], d["slip_id"]])
        cur.execute("DELETE FROM advance_deductions WHERE advance_id=%s", [aid])
        cur.execute("UPDATE employee_advances SET status='cancelled' WHERE id=%s", [aid])
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()


# ─── Leaves ────────────────────────────────────────────────────────────────
class LeaveIn(BaseModel):
    employee_id: int
    leave_type: Literal["annual", "casual", "sick", "unpaid"] = "annual"
    start_date: date
    end_date: date
    notes: Optional[str] = None


def _used_balance(cur, employee_id: int, year: int, exclude_id: Optional[int] = None) -> int:
    cur.execute("""
        SELECT COALESCE(SUM(days), 0)::int AS used FROM employee_leaves
        WHERE employee_id=%s AND status='approved' AND leave_type = ANY(%s)
          AND EXTRACT(YEAR FROM start_date) = %s AND id <> COALESCE(%s, -1)
    """, [employee_id, list(FROM_BALANCE), year, exclude_id])
    return int(cur.fetchone()["used"])


@router.get("/leaves")
def list_leaves(year: Optional[int] = None, employee_id: Optional[int] = None,
                current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "attendance")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        extra, params = _branch_filter(current_user)
        if year:
            extra += " AND EXTRACT(YEAR FROM l.start_date)=%s"
            params.append(year)
        if employee_id:
            extra += " AND l.employee_id=%s"
            params.append(employee_id)
        cur.execute(f"""
            SELECT l.*, e.name AS employee_name, u.name_ar AS created_by_name
            FROM employee_leaves l JOIN employees e ON e.id=l.employee_id
            LEFT JOIN users u ON u.id=l.created_by
            WHERE 1=1 {extra}
            ORDER BY l.start_date DESC, l.id DESC LIMIT 2000
        """, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.get("/leaves/balances")
def leave_balances(year: Optional[int] = None, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "attendance")
    year = year or date.today().year
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        extra, params = _branch_filter(current_user)
        cur.execute(f"""
            SELECT e.id, e.name, COALESCE(e.annual_leave_days, 21) AS entitlement,
                   COALESCE(SUM(l.days) FILTER (WHERE l.leave_type IN ('annual','casual')), 0)::int AS used,
                   COALESCE(SUM(l.days) FILTER (WHERE l.leave_type = 'casual'), 0)::int AS casual,
                   COALESCE(SUM(l.days) FILTER (WHERE l.leave_type = 'sick'), 0)::int AS sick,
                   COALESCE(SUM(l.days) FILTER (WHERE l.leave_type = 'unpaid'), 0)::int AS unpaid
            FROM employees e
            LEFT JOIN employee_leaves l ON l.employee_id=e.id AND l.status='approved'
                 AND EXTRACT(YEAR FROM l.start_date) = %s
            WHERE e.active = true {extra}
            GROUP BY e.id ORDER BY e.name
        """, [year] + params)
        rows = []
        for r in cur.fetchall():
            r = dict(r)
            r["remaining"] = int(r["entitlement"]) - int(r["used"])
            rows.append(r)
        return {"year": year, "rows": rows}
    finally:
        cur.close(); conn.close()


@router.post("/leaves")
def create_leave(body: LeaveIn, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "attendance")
    if body.end_date < body.start_date:
        raise HTTPException(400, "End date is before start date")
    days = (body.end_date - body.start_date).days + 1
    if days > MAX_LEAVE_DAYS:
        raise HTTPException(400, f"A leave cannot be longer than {MAX_LEAVE_DAYS} days")
    if body.start_date.year != body.end_date.year:
        raise HTTPException(400, "Split a leave that crosses the new year into two")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        e = _employee_in_scope(cur, current_user, body.employee_id)
        cur.execute("SELECT id FROM employees WHERE id=%s FOR UPDATE", [e["id"]])
        cur.execute("""
            SELECT start_date, end_date FROM employee_leaves
            WHERE employee_id=%s AND status='approved' AND start_date <= %s AND end_date >= %s LIMIT 1
        """, [e["id"], body.end_date, body.start_date])
        clash = cur.fetchone()
        if clash:
            raise HTTPException(400, f"Overlaps another leave ({clash['start_date']} → {clash['end_date']})")
        if body.leave_type in FROM_BALANCE:
            left = int(e["annual_leave_days"] if e["annual_leave_days"] is not None else 21) \
                - _used_balance(cur, e["id"], body.start_date.year)
            if days > left:
                raise HTTPException(400, f"Only {max(left, 0)} day(s) left in the annual balance")
        cur.execute("""
            INSERT INTO employee_leaves(employee_id, leave_type, start_date, end_date, days, notes, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, [e["id"], body.leave_type, body.start_date, body.end_date, days,
              (body.notes or "").strip() or None, current_user.get("user_id")])
        leave = dict(cur.fetchone())
        paid = body.leave_type != "unpaid"
        skipped = []
        d = body.start_date
        while d <= body.end_date:
            # A day the employee actually came in stays a working day.
            cur.execute("""
                INSERT INTO attendance(employee_id, work_date, status, notes, leave_id, paid_leave, edited_by, edited_at)
                VALUES (%s,%s,'leave',%s,%s,%s,%s,now())
                ON CONFLICT (employee_id, work_date) DO UPDATE SET
                  status='leave', check_in=NULL, check_out=NULL, hours=NULL,
                  notes=EXCLUDED.notes, leave_id=EXCLUDED.leave_id, paid_leave=EXCLUDED.paid_leave,
                  edited_by=EXCLUDED.edited_by, edited_at=now()
                WHERE attendance.status <> 'present' OR attendance.check_in IS NULL
                RETURNING id
            """, [e["id"], d, f"leave:{body.leave_type}", leave["id"], paid, current_user.get("user_id")])
            if not cur.fetchone():
                skipped.append(str(d))
            d += timedelta(days=1)
        if skipped:
            if len(skipped) == days:
                raise HTTPException(400, "The employee worked every day of this leave")
            cur.execute("UPDATE employee_leaves SET days=%s WHERE id=%s RETURNING *",
                        [days - len(skipped), leave["id"]])
            leave = dict(cur.fetchone())
        conn.commit()
        return {**leave, "skipped_worked_days": skipped}
    finally:
        cur.close(); conn.close()


@router.post("/leaves/{lid}/cancel")
def cancel_leave(lid: int, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "attendance")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM employee_leaves WHERE id=%s FOR UPDATE", [lid])
        leave = cur.fetchone()
        if not leave:
            raise HTTPException(404, "Leave not found")
        _employee_in_scope(cur, current_user, leave["employee_id"])
        if leave["status"] != "approved":
            raise HTTPException(400, "Leave is already cancelled")
        cur.execute("DELETE FROM attendance WHERE leave_id=%s AND status='leave'", [lid])
        cur.execute("UPDATE employee_leaves SET status='cancelled' WHERE id=%s", [lid])
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()
