"""Cash drawer / shift management."""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
import psycopg2, psycopg2.extras
from db import get_db_connection
from deps import get_current_user, get_active_branch_id

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


class OpenShiftIn(BaseModel):
    opening_cash: float = Field(ge=0)
    notes: Optional[str] = None
    shift_type: Optional[str] = None  # 'morning' | 'evening' | 'night' (auto if omitted)


class CloseShiftIn(BaseModel):
    counted_cash: float = Field(ge=0)
    counted_visa: float = Field(default=0, ge=0)
    notes: Optional[str] = None


def _count_pending_deliveries(cur, shift) -> int:
    cur.execute("""
        SELECT COUNT(*)::int AS cnt
        FROM invoices
        WHERE seller_id = %s AND branch_id = %s
          AND status = 'completed'
          AND (type = 'delivery'
               OR (type = 'digital'
                   AND NULLIF(TRIM(COALESCE(delivery_address, '')), '') IS NOT NULL))
          AND COALESCE(delivery_status, 'pending') <> 'delivered'
          AND created_at >= %s AND created_at <= now()
    """, [shift['user_id'], shift['branch_id'], shift['opened_at']])
    return int(cur.fetchone()['cnt'])


def assert_open_shift_for_sales(cur, user_id: int, branch_id: int) -> None:
    """Block POS sales until the cashier has an open shift on this branch."""
    cur.execute(
        """
        SELECT id FROM shifts
        WHERE user_id = %s AND branch_id = %s AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
        """,
        [user_id, branch_id],
    )
    if not cur.fetchone():
        raise HTTPException(
            400,
            "Open a cash drawer shift before making sales. Go to Cash Drawer / Shifts and open your shift.",
        )


def _compute_expected(cur, shift) -> dict:
    """Compute expected cash + payment breakdown for shift window."""
    cur.execute("""
        SELECT
          COALESCE(SUM(CASE WHEN payment_method='cash' THEN net_total ELSE 0 END), 0)::float AS cash_sales,
          COALESCE(SUM(CASE WHEN payment_method='visa' THEN net_total ELSE 0 END), 0)::float AS visa_sales,
          COALESCE(SUM(CASE WHEN payment_method='account' THEN net_total ELSE 0 END), 0)::float AS account_sales,
          COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','visa','account') THEN net_total ELSE 0 END), 0)::float AS other_sales,
          COALESCE(SUM(net_total), 0)::float AS total_sales,
          COUNT(*)::int AS invoice_count,
          COALESCE(SUM(cash_amount), 0)::float AS cash_collected,
          COALESCE(SUM(change_amount), 0)::float AS cash_change
        FROM invoices
        WHERE seller_id = %s AND branch_id = %s AND status = 'completed'
          AND created_at >= %s AND created_at <= COALESCE(%s, now())
    """, [shift['user_id'], shift['branch_id'], shift['opened_at'], shift.get('closed_at')])
    sales = dict(cur.fetchone())

    cur.execute("""
        SELECT COALESCE(SUM(total_returned), 0)::float AS returns_value,
               COUNT(*)::int AS returns_count
        FROM returns
        WHERE seller_id = %s AND branch_id = %s
          AND created_at >= %s AND created_at <= COALESCE(%s, now())
    """, [shift['user_id'], shift['branch_id'], shift['opened_at'], shift.get('closed_at')])
    rets = dict(cur.fetchone())

    cash_in = sales['cash_collected'] - sales['cash_change']
    expected_cash = float(shift['opening_cash']) + cash_in - rets['returns_value']
    return {
        **sales,
        **rets,
        "expected_cash": round(expected_cash, 2),
    }


@router.post("/open")
def open_shift(
    body: OpenShiftIn,
    current_user: dict = Depends(get_current_user),
    x_active_branch: Optional[str] = Header(default=None, alias="X-Active-Branch"),
):
    if not x_active_branch:
        raise HTTPException(400, "X-Active-Branch header is required to open a shift")
    try:
        active_branch_id = int(x_active_branch)
    except ValueError:
        raise HTTPException(400, "Invalid X-Active-Branch header")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM branches WHERE id=%s", [active_branch_id])
        if not cur.fetchone():
            raise HTTPException(400, "Branch not found")
        # Auto-detect shift type from server time if not provided
        shift_type = (body.shift_type or "").strip().lower() or None
        if shift_type and shift_type not in ("morning", "evening", "night"):
            raise HTTPException(400, "shift_type must be morning, evening, or night")
        if not shift_type:
            cur.execute(
                "SELECT shift_morning_start, shift_evening_start, shift_night_start "
                "FROM pharmacy_profile WHERE id=1"
            )
            row = cur.fetchone() or {}
            from datetime import time as _t
            m = row.get("shift_morning_start") or _t(6, 0)
            e = row.get("shift_evening_start") or _t(14, 0)
            n = row.get("shift_night_start")   or _t(22, 0)
            now_t = datetime.now().time()
            # Pick the latest configured start that is <= now. If now is before all starts
            # (e.g. 02:00 with defaults 06:00/14:00/22:00), wrap around to the latest start
            # of the previous day — typically the night shift.
            ranges = sorted([("morning", m), ("evening", e), ("night", n)], key=lambda x: x[1])
            shift_type = ranges[-1][0]  # wrap-around default
            for label, start in ranges:
                if now_t >= start:
                    shift_type = label
        try:
            cur.execute("""
                INSERT INTO shifts(user_id, branch_id, opening_cash, notes, shift_type)
                VALUES (%s, %s, %s, %s, %s) RETURNING *
            """, [current_user['user_id'], active_branch_id, body.opening_cash, body.notes, shift_type])
            row = dict(cur.fetchone())
            conn.commit()
            return row
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            raise HTTPException(400, "You already have an open shift; close it first")
    finally:
        cur.close(); conn.close()


@router.get("/current")
def current_shift(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT s.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM shifts s LEFT JOIN branches b ON b.id = s.branch_id
            WHERE s.user_id=%s AND s.status='open'
            ORDER BY s.opened_at DESC LIMIT 1
        """, [current_user['user_id']])
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        cur.close(); conn.close()


@router.post("/{shift_id}/close")
def close_shift(
    shift_id: int,
    body: CloseShiftIn,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM shifts WHERE id=%s", [shift_id])
        shift = cur.fetchone()
        if not shift:
            raise HTTPException(404, "Shift not found")
        shift = dict(shift)
        if shift['status'] != 'open':
            raise HTTPException(400, "Shift already closed")
        if shift['user_id'] != current_user['user_id'] and current_user.get('role') != 'admin':
            raise HTTPException(403, "Cannot close another user's shift")
        pending_deliveries = _count_pending_deliveries(cur, shift)
        if pending_deliveries > 0:
            raise HTTPException(
                400,
                f"Cannot close shift: {pending_deliveries} delivery order(s) not yet marked delivered",
            )
        exp = _compute_expected(cur, shift)
        expected = exp['expected_cash']
        variance = round(body.counted_cash - expected, 2)
        variance_visa = round(body.counted_visa - exp['visa_sales'], 2)
        cur.execute("""
            UPDATE shifts
            SET closed_at=now(), closing_cash=%s, expected_cash=%s,
                variance=%s, counted_visa=%s, variance_visa=%s,
                status='closed',
                notes = COALESCE(NULLIF(%s,''), notes)
            WHERE id=%s RETURNING *
        """, [body.counted_cash, expected, variance, body.counted_visa, variance_visa, body.notes, shift_id])
        row = dict(cur.fetchone())
        conn.commit()
        return {**row, "breakdown": exp, "variance": variance, "expected_cash": expected, "variance_visa": variance_visa}
    finally:
        cur.close(); conn.close()


@router.get("/{shift_id}/report")
def shift_report(shift_id: int, current_user: dict = Depends(get_current_user)):
    """X report (open) or Z report (closed) — payment breakdown + variance."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT s.*, u.username AS user_name, u.name_en AS user_name_en, u.name_ar AS user_name_ar, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM shifts s
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN branches b ON b.id = s.branch_id
            WHERE s.id=%s
        """, [shift_id])
        shift = cur.fetchone()
        if not shift:
            raise HTTPException(404, "Shift not found")
        shift = dict(shift)
        if shift['user_id'] != current_user['user_id'] and current_user.get('role') != 'admin':
            raise HTTPException(403, "Forbidden")
        exp = _compute_expected(cur, shift)
        pending_deliveries = _count_pending_deliveries(cur, shift)
        return {
            "report_type": "Z" if shift['status'] == 'closed' else "X",
            "shift": shift,
            "breakdown": exp,
            "pending_deliveries": pending_deliveries,
        }
    finally:
        cur.close(); conn.close()


@router.get("")
def list_shifts(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    is_admin = current_user.get('role') == 'admin'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where = ["1=1"]; params = []
        if not is_admin:
            where.append("s.user_id = %s"); params.append(current_user['user_id'])
        elif user_id:
            where.append("s.user_id = %s"); params.append(user_id)
        if date_from:
            where.append("s.opened_at >= %s::date"); params.append(date_from)
        if date_to:
            where.append("s.opened_at < (%s::date + INTERVAL '1 day')"); params.append(date_to)
        cur.execute(f"""
            SELECT s.*, u.username AS user_name, u.name_en AS user_name_en, u.name_ar AS user_name_ar,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM shifts s
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN branches b ON b.id = s.branch_id
            WHERE {' AND '.join(where)}
            ORDER BY s.opened_at DESC LIMIT 200
        """, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()
