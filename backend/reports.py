from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional
from datetime import date, datetime, timedelta
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user, resolve_analytics_branch
from customers import PLATFORM_PARTNER_NAMES, platform_partner_display_name

router = APIRouter(prefix="/api/reports", tags=["reports"])

def _check_role(user):
    if user.get("role") not in ("admin", "pharmacist"):
        raise HTTPException(403, "Reports require admin or pharmacist role")


def _resolve_report_branch(request: Request, user: dict) -> Optional[int]:
    return resolve_analytics_branch(request, user)


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


@router.get("/sales-by-item")
def sales_by_item(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(2000, ge=1, le=5000),
    current_user: dict = Depends(get_current_user),
):
    """Per-product sales in the date range, broken down by sale type, with current stock."""
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            f"""
            WITH sales AS (
                SELECT
                  ii.product_id,
                  SUM(ii.quantity)::int AS qty_total,
                  SUM(ii.total)::float AS revenue_total,
                  SUM(ii.quantity) FILTER (WHERE i.type = 'cash')::int AS qty_cash,
                  SUM(ii.total) FILTER (WHERE i.type = 'cash')::float AS revenue_cash,
                  SUM(ii.quantity) FILTER (WHERE i.type = 'delivery')::int AS qty_delivery,
                  SUM(ii.total) FILTER (WHERE i.type = 'delivery')::float AS revenue_delivery,
                  SUM(ii.quantity) FILTER (WHERE i.type = 'digital')::int AS qty_digital,
                  SUM(ii.total) FILTER (WHERE i.type = 'digital')::float AS revenue_digital
                FROM invoice_items ii
                JOIN invoices i ON i.id = ii.invoice_id
                WHERE i.status = 'completed'
                  AND i.created_at >= %s::date
                  AND i.created_at < (%s::date + INTERVAL '1 day')
                  {bf.replace('branch_id', 'i.branch_id')}
                GROUP BY ii.product_id
            ),
            returns_agg AS (
                SELECT
                  ri.product_id,
                  SUM(ri.quantity)::int AS qty_return,
                  SUM(ri.total)::float AS revenue_return
                FROM return_items ri
                JOIN returns r ON r.id = ri.return_id
                WHERE r.created_at >= %s::date
                  AND r.created_at < (%s::date + INTERVAL '1 day')
                  {bf.replace('branch_id', 'r.branch_id')}
                GROUP BY ri.product_id
            )
            SELECT
              p.id,
              p.name_ar,
              p.name_en,
              p.barcode,
              COALESCE(p.category, 'Uncategorized') AS category,
              COALESCE(p.stock, 0)::int AS current_stock,
              s.qty_total,
              s.revenue_total,
              s.qty_cash,
              s.revenue_cash,
              s.qty_delivery,
              s.revenue_delivery,
              s.qty_digital,
              s.revenue_digital,
              COALESCE(ret.qty_return, 0)::int AS qty_return,
              COALESCE(ret.revenue_return, 0)::float AS revenue_return
            FROM sales s
            JOIN products p ON p.id = s.product_id
            LEFT JOIN returns_agg ret ON ret.product_id = p.id
            ORDER BY s.revenue_total DESC
            LIMIT %s
            """,
            [df, dt] + bp + [df, dt] + bp + [limit],
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.get("/digital-platform-account")
def digital_platform_account_report(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    digital_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """On-account digital platform sales in a date range — for billing / collection from partners."""
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    bf_i = bf.replace("branch_id", "i.branch_id")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        extra = []
        params: list = [df, dt]
        if digital_type and digital_type in PLATFORM_PARTNER_NAMES:
            extra.append("AND i.digital_type = %s")
            params.append(digital_type)
        extra_sql = " ".join(extra)

        cur.execute(
            f"""
            SELECT
              i.id,
              i.invoice_number,
              i.created_at,
              i.digital_type,
              i.net_total::float AS net_total,
              (SELECT COALESCE(SUM(cp.amount), 0)::float
               FROM customer_payments cp WHERE cp.invoice_id = i.id) AS paid_total,
              b.name_en AS branch_name_en,
              b.name_ar AS branch_name_ar,
              i.notes
            FROM invoices i
            LEFT JOIN branches b ON b.id = i.branch_id
            WHERE i.status = 'completed'
              AND i.type = 'digital'
              AND i.payment_method = 'account'
              AND i.created_at >= %s::date
              AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
              {extra_sql}
            ORDER BY i.created_at ASC, i.id ASC
            """,
            params + bp,
        )
        invoices = []
        by_platform: dict = {}
        total_charged = 0.0
        total_paid = 0.0
        total_balance = 0.0

        for r in cur.fetchall():
            row = dict(r)
            dt_key = row.get("digital_type") or "unknown"
            net = float(row["net_total"] or 0)
            paid = float(row["paid_total"] or 0)
            balance = round(net - paid, 2)
            row["paid_total"] = round(paid, 2)
            row["balance"] = balance
            row["platform_name"] = platform_partner_display_name(dt_key)
            invoices.append(row)

            total_charged += net
            total_paid += paid
            total_balance += balance

            if dt_key not in by_platform:
                by_platform[dt_key] = {
                    "digital_type": dt_key,
                    "platform_name": row["platform_name"],
                    "invoice_count": 0,
                    "charged": 0.0,
                    "paid": 0.0,
                    "balance": 0.0,
                    "collected_in_period": 0.0,
                    "total_owed_all_time": 0.0,
                }
            p = by_platform[dt_key]
            p["invoice_count"] += 1
            p["charged"] = round(p["charged"] + net, 2)
            p["paid"] = round(p["paid"] + paid, 2)
            p["balance"] = round(p["balance"] + balance, 2)

        # Payments recorded in the period against digital on-account invoices
        pay_params: list = [df, dt]
        pay_extra = ""
        if digital_type and digital_type in PLATFORM_PARTNER_NAMES:
            pay_extra = "AND i.digital_type = %s"
            pay_params.append(digital_type)
        cur.execute(
            f"""
            SELECT
              COALESCE(i.digital_type, 'unknown') AS digital_type,
              COALESCE(SUM(cp.amount), 0)::float AS collected
            FROM customer_payments cp
            JOIN invoices i ON i.id = cp.invoice_id
            WHERE i.type = 'digital'
              AND i.payment_method = 'account'
              AND i.status = 'completed'
              AND cp.paid_at >= %s::date
              AND cp.paid_at < (%s::date + INTERVAL '1 day')
              {bf_i}
              {pay_extra}
            GROUP BY COALESCE(i.digital_type, 'unknown')
            """,
            pay_params + bp,
        )
        for r in cur.fetchall():
            dt_key = r["digital_type"]
            if dt_key in by_platform:
                by_platform[dt_key]["collected_in_period"] = round(float(r["collected"] or 0), 2)

        # All-time balance per platform partner customer
        for dt_key in list(by_platform.keys()):
            pname = platform_partner_display_name(dt_key)
            cur.execute(
                """SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s)) LIMIT 1""",
                (pname,),
            )
            cust = cur.fetchone()
            if not cust:
                continue
            cid = cust["id"]
            if current_user.get("role") != "admin":
                ub = current_user.get("branch_id")
                cur.execute(
                    """SELECT COALESCE(SUM(net_total),0)::float AS charged
                       FROM invoices
                       WHERE customer_id=%s AND payment_method='account' AND type!='return'
                         AND branch_id=%s""",
                    (cid, ub),
                )
                charged_all = float(cur.fetchone()["charged"])
                cur.execute(
                    """SELECT COALESCE(SUM(cp.amount),0)::float AS paid
                       FROM customer_payments cp
                       JOIN invoices i ON i.id = cp.invoice_id
                       WHERE cp.customer_id=%s AND i.branch_id=%s""",
                    (cid, ub),
                )
                paid_all = float(cur.fetchone()["paid"])
            else:
                cur.execute(
                    """SELECT COALESCE(SUM(net_total),0)::float AS charged
                       FROM invoices
                       WHERE customer_id=%s AND payment_method='account' AND type!='return'""",
                    (cid,),
                )
                charged_all = float(cur.fetchone()["charged"])
                cur.execute(
                    """SELECT COALESCE(SUM(amount),0)::float AS paid
                       FROM customer_payments WHERE customer_id=%s""",
                    (cid,),
                )
                paid_all = float(cur.fetchone()["paid"])
            by_platform[dt_key]["total_owed_all_time"] = round(charged_all - paid_all, 2)

        platforms = sorted(
            by_platform.values(),
            key=lambda x: (-x["balance"], x["platform_name"]),
        )
        for p in platforms:
            p["charged"] = round(p["charged"], 2)
            p["paid"] = round(p["paid"], 2)
            p["balance"] = round(p["balance"], 2)

        return {
            "date_from": str(df),
            "date_to": str(dt),
            "summary": {
                "invoice_count": len(invoices),
                "total_charged": round(total_charged, 2),
                "total_paid": round(total_paid, 2),
                "total_balance": round(total_balance, 2),
            },
            "by_platform": platforms,
            "invoices": invoices,
        }
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
