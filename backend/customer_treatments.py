"""Customer treatment reminders and staff notes."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_active_branch_id, get_current_user, requires_feature_option

router = APIRouter(prefix="/api", tags=["customer-treatments"])


def _user_id(user) -> int | None:
    return user.get("user_id") or user.get("id")


def _user_display(user) -> str:
    return (
        (user.get("name_en") or user.get("name_ar") or user.get("username") or "Staff")
        .strip() or "Staff"
    )


def _is_admin(user) -> bool:
    return user.get("role") == "admin"


def _add_months(d: date, months: int = 1) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    dim = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(d.day, dim))


VALID_RECURRENCE = ("weekly", "monthly", "custom")


def _validate_recurrence(recurrence: str, recurrence_days: int | None) -> tuple[str, int | None]:
    rec = (recurrence or "monthly").strip().lower()
    if rec not in VALID_RECURRENCE:
        raise HTTPException(status_code=400, detail="Invalid recurrence")
    if rec == "custom":
        days = int(recurrence_days or 0)
        if days < 1 or days > 365:
            raise HTTPException(status_code=400, detail="Custom interval must be 1–365 days")
        return rec, days
    return rec, None


def _advance_reminder_date(from_date: date, recurrence: str, recurrence_days: int | None) -> date:
    rec = (recurrence or "monthly").strip().lower()
    if rec == "weekly":
        return from_date + timedelta(days=7)
    if rec == "custom":
        return from_date + timedelta(days=max(1, int(recurrence_days or 30)))
    return _add_months(from_date, 1)


def _can_access_customer(cur, customer_id: int, user) -> bool:
    if _is_admin(user):
        return True
    ub = user.get("branch_id")
    if ub is None:
        return False
    cur.execute(
        "SELECT 1 FROM customer_branches WHERE customer_id=%s AND branch_id=%s LIMIT 1",
        [customer_id, ub],
    )
    return cur.fetchone() is not None


def _require_customer_access(cur, customer_id: int, user) -> None:
    cur.execute("SELECT id FROM customers WHERE id=%s AND active=true", [customer_id])
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Customer not found")
    if not _can_access_customer(cur, customer_id, user):
        raise HTTPException(status_code=403, detail="Not authorized for this customer")


def _load_plan_items(cur, plan_id: int) -> list[dict]:
    cur.execute(
        """SELECT id, product_id, product_name, quantity, dose_text, sort_order
             FROM customer_treatment_items
            WHERE plan_id=%s
            ORDER BY sort_order ASC, id ASC""",
        [plan_id],
    )
    return [dict(r) for r in cur.fetchall()]


def _serialize_plan(row: dict, items: list[dict]) -> dict:
    out = dict(row)
    if out.get("next_reminder_date"):
        out["next_reminder_date"] = out["next_reminder_date"].isoformat()
    for k in ("created_at", "updated_at", "handled_at", "last_loaded_at"):
        if out.get(k):
            out[k] = out[k].isoformat()
    out["items"] = items
    return out


class StaffNoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class StaffNoteUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class TreatmentItemIn(BaseModel):
    product_id: Optional[int] = None
    product_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=9999)
    dose_text: Optional[str] = Field(default=None, max_length=500)


class TreatmentPlanIn(BaseModel):
    title: str = Field(default="Monthly treatment", min_length=1, max_length=200)
    next_reminder_date: date
    recurrence: str = Field(default="monthly", max_length=20)
    recurrence_days: Optional[int] = Field(default=None, ge=1, le=365)
    notes: Optional[str] = Field(default=None, max_length=2000)
    items: list[TreatmentItemIn] = Field(min_length=1)


class TreatmentPlanUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    next_reminder_date: Optional[date] = None
    recurrence: Optional[str] = Field(default=None, max_length=20)
    recurrence_days: Optional[int] = Field(default=None, ge=1, le=365)
    notes: Optional[str] = Field(default=None, max_length=2000)
    active: Optional[bool] = None
    items: Optional[list[TreatmentItemIn]] = None


@router.get(
    "/customers/v2/{customer_id}/staff-notes",
    dependencies=[Depends(requires_feature_option("customers", "manage"))],
)
def list_staff_notes(customer_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _require_customer_access(cur, customer_id, current_user)
        cur.execute(
            """SELECT id, customer_id, body, created_by, author_name, created_at, updated_at
                 FROM customer_staff_notes
                WHERE customer_id=%s
                ORDER BY created_at DESC, id DESC""",
            [customer_id],
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get("created_at"):
                r["created_at"] = r["created_at"].isoformat()
            if r.get("updated_at"):
                r["updated_at"] = r["updated_at"].isoformat()
        return rows
    finally:
        cur.close()
        conn.close()


@router.post(
    "/customers/v2/{customer_id}/staff-notes",
    dependencies=[Depends(requires_feature_option("customers", "manage"))],
)
def add_staff_note(customer_id: int, body: StaffNoteIn, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _require_customer_access(cur, customer_id, current_user)
        cur.execute(
            """INSERT INTO customer_staff_notes (customer_id, body, created_by, author_name)
               VALUES (%s, %s, %s, %s) RETURNING *""",
            [customer_id, body.body.strip(), _user_id(current_user), _user_display(current_user)],
        )
        row = dict(cur.fetchone())
        conn.commit()
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
        return row
    finally:
        cur.close()
        conn.close()


@router.put(
    "/customers/v2/staff-notes/{note_id}",
    dependencies=[Depends(requires_feature_option("customers", "manage"))],
)
def update_staff_note(note_id: int, body: StaffNoteUpdate, current_user=Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """UPDATE customer_staff_notes
                  SET body=%s, updated_at=NOW()
                WHERE id=%s RETURNING *""",
            [body.body.strip(), note_id],
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Note not found")
        conn.commit()
        out = dict(row)
        if out.get("created_at"):
            out["created_at"] = out["created_at"].isoformat()
        if out.get("updated_at"):
            out["updated_at"] = out["updated_at"].isoformat()
        return out
    finally:
        cur.close()
        conn.close()


@router.delete(
    "/customers/v2/staff-notes/{note_id}",
    dependencies=[Depends(requires_feature_option("customers", "manage"))],
)
def delete_staff_note(note_id: int, current_user=Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM customer_staff_notes WHERE id=%s RETURNING id", [note_id])
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Note not found")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


@router.get(
    "/customers/v2/{customer_id}/treatments",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def list_customer_treatments(customer_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _require_customer_access(cur, customer_id, current_user)
        cur.execute(
            """SELECT p.*, c.name AS customer_name, c.code AS customer_code
                 FROM customer_treatment_plans p
                 JOIN customers c ON c.id = p.customer_id
                WHERE p.customer_id=%s
                ORDER BY p.next_reminder_date ASC, p.id DESC""",
            [customer_id],
        )
        rows = [dict(r) for r in cur.fetchall()]
        out = []
        for r in rows:
            out.append(_serialize_plan(r, _load_plan_items(cur, r["id"])))
        return out
    finally:
        cur.close()
        conn.close()


@router.post(
    "/customers/v2/{customer_id}/treatments",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def create_treatment_plan(
    customer_id: int,
    body: TreatmentPlanIn,
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _require_customer_access(cur, customer_id, current_user)
        recurrence, recurrence_days = _validate_recurrence(body.recurrence, body.recurrence_days)
        cur.execute(
            """INSERT INTO customer_treatment_plans
               (customer_id, title, next_reminder_date, recurrence, recurrence_days, notes, branch_id, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            [
                customer_id,
                body.title.strip(),
                body.next_reminder_date,
                recurrence,
                recurrence_days,
                body.notes,
                active_branch,
                _user_id(current_user),
            ],
        )
        plan = dict(cur.fetchone())
        for idx, it in enumerate(body.items):
            cur.execute(
                """INSERT INTO customer_treatment_items
                   (plan_id, product_id, product_name, quantity, dose_text, sort_order)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                [
                    plan["id"],
                    it.product_id,
                    it.product_name.strip(),
                    it.quantity,
                    it.dose_text,
                    idx,
                ],
            )
        conn.commit()
        items = _load_plan_items(cur, plan["id"])
        return _serialize_plan(plan, items)
    finally:
        cur.close()
        conn.close()


@router.put(
    "/customer-treatments/{plan_id}",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def update_treatment_plan(plan_id: int, body: TreatmentPlanUpdate, current_user=Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM customer_treatment_plans WHERE id=%s", [plan_id])
        plan = cur.fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        fields = []
        params: list = []
        if body.title is not None:
            fields.append("title=%s")
            params.append(body.title.strip())
        if body.next_reminder_date is not None:
            fields.append("next_reminder_date=%s")
            params.append(body.next_reminder_date)
        if body.recurrence is not None:
            rec, rec_days = _validate_recurrence(body.recurrence, body.recurrence_days)
            fields.append("recurrence=%s")
            params.append(rec)
            fields.append("recurrence_days=%s")
            params.append(rec_days)
        elif body.recurrence_days is not None:
            cur.execute("SELECT recurrence FROM customer_treatment_plans WHERE id=%s", [plan_id])
            existing_rec = (cur.fetchone() or {}).get("recurrence") or "monthly"
            if existing_rec != "custom":
                raise HTTPException(status_code=400, detail="recurrence_days only applies to custom recurrence")
            _, rec_days = _validate_recurrence("custom", body.recurrence_days)
            fields.append("recurrence_days=%s")
            params.append(rec_days)
        if body.notes is not None:
            fields.append("notes=%s")
            params.append(body.notes)
        if body.active is not None:
            fields.append("active=%s")
            params.append(body.active)
        if fields:
            fields.append("updated_at=NOW()")
            params.append(plan_id)
            cur.execute(
                f"UPDATE customer_treatment_plans SET {', '.join(fields)} WHERE id=%s RETURNING *",
                params,
            )
            plan = cur.fetchone()
        if body.items is not None:
            cur.execute("DELETE FROM customer_treatment_items WHERE plan_id=%s", [plan_id])
            for idx, it in enumerate(body.items):
                cur.execute(
                    """INSERT INTO customer_treatment_items
                       (plan_id, product_id, product_name, quantity, dose_text, sort_order)
                       VALUES (%s,%s,%s,%s,%s,%s)""",
                    [plan_id, it.product_id, it.product_name.strip(), it.quantity, it.dose_text, idx],
                )
        conn.commit()
        items = _load_plan_items(cur, plan_id)
        return _serialize_plan(dict(plan), items)
    finally:
        cur.close()
        conn.close()


@router.delete(
    "/customer-treatments/{plan_id}",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def delete_treatment_plan(plan_id: int, current_user=Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM customer_treatment_plans WHERE id=%s RETURNING id", [plan_id])
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


def _due_where(user, active_branch):
    where = [
        "p.active = true",
        "p.status = 'pending'",
        "p.next_reminder_date <= CURRENT_DATE",
    ]
    params: list = []
    if not _is_admin(user):
        ub = user.get("branch_id")
        if ub is None:
            raise HTTPException(status_code=403, detail="No branch assigned")
        where.append(
            "(p.branch_id = %s OR p.branch_id IS NULL) AND EXISTS "
            "(SELECT 1 FROM customer_branches cb WHERE cb.customer_id=p.customer_id AND cb.branch_id=%s)"
        )
        params.extend([ub, ub])
    elif active_branch is not None:
        where.append("(p.branch_id = %s OR p.branch_id IS NULL)")
        params.append(active_branch)
    return where, params


@router.get(
    "/customer-treatments/due",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def list_due_treatments(
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where, params = _due_where(current_user, active_branch)
        cur.execute(
            f"""SELECT p.*, c.name AS customer_name, c.code AS customer_code,
                       c.phone AS customer_phone, c.discount_percent, c.discount_notes
                  FROM customer_treatment_plans p
                  JOIN customers c ON c.id = p.customer_id
                 WHERE {' AND '.join(where)}
                 ORDER BY p.next_reminder_date ASC, p.id ASC
                 LIMIT 100""",
            params,
        )
        rows = [dict(r) for r in cur.fetchall()]
        out = []
        for r in rows:
            out.append(_serialize_plan(r, _load_plan_items(cur, r["id"])))
        return out
    finally:
        cur.close()
        conn.close()


@router.get(
    "/customer-treatments/due/count",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def due_treatment_count(
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where, params = _due_where(current_user, active_branch)
        cur.execute(
            f"""SELECT COUNT(*) AS cnt
                  FROM customer_treatment_plans p
                 WHERE {' AND '.join(where)}""",
            params,
        )
        cnt = int(cur.fetchone()["cnt"])
        return {"count": cnt, "new": cnt}
    finally:
        cur.close()
        conn.close()


@router.patch(
    "/customer-treatments/{plan_id}/status",
    dependencies=[Depends(requires_feature_option("customers", "treatment_reminders"))],
)
def update_treatment_status(
    plan_id: int,
    status: str,
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    if status not in ("pending", "loaded", "dismissed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM customer_treatment_plans WHERE id=%s FOR UPDATE", [plan_id])
        plan = cur.fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        _require_customer_access(cur, plan["customer_id"], current_user)

        now = datetime.now()
        recurrence = plan.get("recurrence") or "monthly"
        recurrence_days = plan.get("recurrence_days")
        new_status = status

        if status == "loaded":
            next_date = _advance_reminder_date(plan["next_reminder_date"], recurrence, recurrence_days)
            new_status = "pending"
            cur.execute(
                """UPDATE customer_treatment_plans
                      SET status=%s, next_reminder_date=%s, active=true,
                          handled_by=%s, handled_at=%s, last_loaded_at=%s, updated_at=NOW()
                    WHERE id=%s""",
                [new_status, next_date, _user_id(current_user), now, now, plan_id],
            )
        elif status == "dismissed":
            next_date = _advance_reminder_date(plan["next_reminder_date"], recurrence, recurrence_days)
            cur.execute(
                """UPDATE customer_treatment_plans
                      SET status='pending', next_reminder_date=%s,
                          handled_by=%s, handled_at=%s, updated_at=NOW()
                    WHERE id=%s""",
                [next_date, _user_id(current_user), now, plan_id],
            )
        else:
            cur.execute(
                """UPDATE customer_treatment_plans
                      SET status='pending', handled_by=NULL, handled_at=NULL, updated_at=NOW()
                    WHERE id=%s""",
                [plan_id],
            )
        conn.commit()
        return {"ok": True, "status": new_status if status == "loaded" else status}
    finally:
        cur.close()
        conn.close()
