from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional
from datetime import date, datetime, timedelta
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _check_role(user):
    if user.get("role") not in ("admin", "pharmacist"):
        raise HTTPException(403, "Reports require admin or pharmacist role")


def _resolve_report_branch(request: Request, user: dict) -> Optional[int]:
    """Reports-specific scope: admin defaults to ALL branches; non-admin pinned to own.

    Admin sends X-Active-Branch=<id> to scope to one branch, or omits/sets 'all' for all.
    Cannot reuse the global get_active_branch_id, which (intentionally) defaults
    admin to their own branch when no header is sent — wrong default for reports.
    """
    if user.get("role") != "admin":
        return user.get("branch_id")
    raw = request.headers.get("X-Active-Branch")
    if not raw or raw in ("0", "all", "ALL"):
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _branch_filter(user, active_branch_id: Optional[int]) -> tuple[str, list]:
    """Returns (sql_clause, params). None scope = all branches (admin only)."""
    if user.get("role") == "admin":
        if active_branch_id:
            return " AND branch_id = %s", [active_branch_id]
        return "", []
    return " AND branch_id = %s", [user.get("branch_id")]


def _date_range(date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date]:
    today = date.today()
    try:
        df = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else today.replace(day=1)
        dt = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else today
    except ValueError:
        raise HTTPException(400, "Invalid date format (use YYYY-MM-DD)")
    if df > dt:
        df, dt = dt, df
    return df, dt


@router.get("/pnl")
def profit_and_loss(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # Sales totals
        cur.execute(f"""
            SELECT
              COALESCE(SUM(i.net_total), 0)::float AS gross_revenue,
              COALESCE(SUM(i.discount), 0)::float AS total_discount,
              COALESCE(SUM(i.subtotal), 0)::float AS subtotal,
              COUNT(*)::int AS invoice_count
            FROM invoices i
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
        """, [df, dt] + bp)
        sales = dict(cur.fetchone())

        # COGS via invoice_items joined to products
        cur.execute(f"""
            SELECT COALESCE(SUM(ii.quantity * COALESCE(p.cost, 0)), 0)::float AS cogs
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            LEFT JOIN products p ON p.id = ii.product_id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
        """, [df, dt] + bp)
        cogs = cur.fetchone()['cogs']

        # Returns
        cur.execute(f"""
            SELECT COALESCE(SUM(total_returned), 0)::float AS returns_value,
                   COUNT(*)::int AS returns_count
            FROM returns r
            WHERE r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'r.branch_id')}
        """, [df, dt] + bp)
        returns = dict(cur.fetchone())

        net_revenue = sales['gross_revenue'] - returns['returns_value']
        gross_profit = net_revenue - cogs
        margin_pct = (gross_profit / net_revenue * 100) if net_revenue > 0 else 0

        return {
            "date_from": str(df),
            "date_to": str(dt),
            "gross_revenue": round(sales['gross_revenue'], 2),
            "total_discount": round(sales['total_discount'], 2),
            "returns_value": round(returns['returns_value'], 2),
            "net_revenue": round(net_revenue, 2),
            "cogs": round(cogs, 2),
            "gross_profit": round(gross_profit, 2),
            "margin_pct": round(margin_pct, 2),
            "invoice_count": sales['invoice_count'],
            "returns_count": returns['returns_count'],
        }
    finally:
        cur.close()
        conn.close()


@router.get("/sales-by-category")
def sales_by_category(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"""
            SELECT
              COALESCE(p.category, 'Uncategorized') AS category,
              SUM(ii.quantity)::int AS qty,
              SUM(ii.total)::float AS revenue,
              SUM(ii.quantity * COALESCE(p.cost, 0))::float AS cost,
              (SUM(ii.total) - SUM(ii.quantity * COALESCE(p.cost, 0)))::float AS profit
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            LEFT JOIN products p ON p.id = ii.product_id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            GROUP BY COALESCE(p.category, 'Uncategorized')
            ORDER BY revenue DESC
        """, [df, dt] + bp)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.get("/sales-by-branch")
def sales_by_branch(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    df, dt = _date_range(date_from, date_to)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT
              b.id AS branch_id,
              b.name_en, b.name_ar,
              COALESCE(s.revenue, 0)::float AS revenue,
              COALESCE(s.invoice_count, 0)::int AS invoice_count,
              COALESCE(r.returns_value, 0)::float AS returns_value,
              COALESCE(s.revenue, 0)::float - COALESCE(r.returns_value, 0)::float AS net_revenue
            FROM branches b
            LEFT JOIN (
                SELECT branch_id,
                       SUM(net_total) AS revenue,
                       COUNT(*) AS invoice_count
                FROM invoices
                WHERE status = 'completed' AND created_at >= %s::date AND created_at < (%s::date + INTERVAL '1 day')
                GROUP BY branch_id
            ) s ON s.branch_id = b.id
            LEFT JOIN (
                SELECT branch_id, SUM(total_returned) AS returns_value
                FROM returns
                WHERE created_at >= %s::date AND created_at < (%s::date + INTERVAL '1 day')
                GROUP BY branch_id
            ) r ON r.branch_id = b.id
            ORDER BY revenue DESC NULLS LAST
        """, [df, dt, df, dt])
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.get("/sales-by-payment")
def sales_by_payment(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"""
            SELECT * FROM (
                SELECT
                  COALESCE(payment_method, 'unknown') AS payment_method,
                  COALESCE(type, 'unknown') AS sale_type,
                  COUNT(*)::int AS invoice_count,
                  SUM(net_total)::float AS revenue
                FROM invoices i
                WHERE status = 'completed'
                  AND created_at >= %s::date AND created_at < (%s::date + INTERVAL '1 day')
                  {bf.replace('branch_id', 'i.branch_id')}
                GROUP BY payment_method, type
                UNION ALL
                SELECT
                  'return' AS payment_method,
                  'return' AS sale_type,
                  COUNT(*)::int AS invoice_count,
                  (-SUM(total_returned))::float AS revenue
                FROM returns r
                WHERE r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
                  {bf.replace('branch_id', 'r.branch_id')}
                HAVING COUNT(*) > 0
            ) combined
            ORDER BY revenue DESC
        """, [df, dt] + bp + [df, dt] + bp)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.get("/product-profitability")
def product_profitability(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(20, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"""
            SELECT
              p.id, p.name_ar, p.name_en, p.barcode,
              COALESCE(p.category, 'Uncategorized') AS category,
              SUM(ii.quantity)::int AS qty,
              SUM(ii.total)::float AS revenue,
              SUM(ii.quantity * COALESCE(p.cost, 0))::float AS cost,
              (SUM(ii.total) - SUM(ii.quantity * COALESCE(p.cost, 0)))::float AS profit,
              CASE WHEN SUM(ii.total) > 0
                   THEN ((SUM(ii.total) - SUM(ii.quantity * COALESCE(p.cost, 0))) / SUM(ii.total) * 100)::float
                   ELSE 0 END AS margin_pct
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            JOIN products p ON p.id = ii.product_id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            GROUP BY p.id, p.name_ar, p.name_en, p.barcode, p.category
            ORDER BY profit DESC
            LIMIT %s
        """, [df, dt] + bp + [limit])
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.get("/monthly-trend")
def monthly_trend(
    request: Request,
    months: int = Query(12, ge=1, le=36),
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"""
            WITH months AS (
                SELECT generate_series(
                    DATE_TRUNC('month', CURRENT_DATE) - (%s - 1) * INTERVAL '1 month',
                    DATE_TRUNC('month', CURRENT_DATE),
                    INTERVAL '1 month'
                )::date AS month_start
            ),
            bounds AS (
                SELECT (DATE_TRUNC('month', CURRENT_DATE) - (%s - 1) * INTERVAL '1 month')::date AS start_month
            ),
            sales AS (
                SELECT DATE_TRUNC('month', i.created_at)::date AS month_start,
                       SUM(i.net_total) AS revenue,
                       COUNT(*) AS invoice_count
                FROM invoices i, bounds b
                WHERE i.status = 'completed'
                  AND i.created_at >= b.start_month
                  {bf.replace('branch_id', 'i.branch_id')}
                GROUP BY DATE_TRUNC('month', i.created_at)
            ),
            cogs_cte AS (
                SELECT DATE_TRUNC('month', i.created_at)::date AS month_start,
                       SUM(ii.quantity * COALESCE(p.cost, 0)) AS cogs
                FROM invoice_items ii
                JOIN invoices i ON i.id = ii.invoice_id
                LEFT JOIN products p ON p.id = ii.product_id, bounds b
                WHERE i.status = 'completed'
                  AND i.created_at >= b.start_month
                  {bf.replace('branch_id', 'i.branch_id')}
                GROUP BY DATE_TRUNC('month', i.created_at)
            ),
            rets AS (
                SELECT DATE_TRUNC('month', r.created_at)::date AS month_start,
                       SUM(r.total_returned) AS returns_value
                FROM returns r, bounds b
                WHERE r.created_at >= b.start_month
                  {bf.replace('branch_id', 'r.branch_id')}
                GROUP BY DATE_TRUNC('month', r.created_at)
            )
            SELECT
              TO_CHAR(m.month_start, 'YYYY-MM') AS month,
              COALESCE(s.revenue, 0)::float AS revenue,
              COALESCE(s.invoice_count, 0)::int AS invoice_count,
              COALESCE(c.cogs, 0)::float AS cogs,
              (COALESCE(s.revenue, 0) - COALESCE(c.cogs, 0) - COALESCE(rt.returns_value, 0))::float AS profit,
              COALESCE(rt.returns_value, 0)::float AS returns_value
            FROM months m
            LEFT JOIN sales s ON s.month_start = m.month_start
            LEFT JOIN cogs_cte c ON c.month_start = m.month_start
            LEFT JOIN rets rt ON rt.month_start = m.month_start
            ORDER BY m.month_start
        """, [months, months] + bp + bp + bp)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()
