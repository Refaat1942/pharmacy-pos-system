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


SHIPMENT_SQL = (
    "(i.type = 'delivery' OR "
    "(i.type = 'digital' AND NULLIF(TRIM(COALESCE(i.delivery_address, '')), '') IS NOT NULL))"
)


@router.get("/sales-by-seller")
def sales_by_seller(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Sales performance by salesperson (seller) including returns."""
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
              SELECT i.seller_id,
                     COUNT(*)::int AS invoice_count,
                     COALESCE(SUM(i.net_total), 0)::float AS revenue,
                     COALESCE(SUM(i.discount), 0)::float AS total_discount,
                     COUNT(*) FILTER (WHERE i.type = 'cash')::int AS cash_count,
                     COUNT(*) FILTER (WHERE i.type = 'delivery')::int AS delivery_count,
                     COUNT(*) FILTER (WHERE i.type = 'digital')::int AS digital_count,
                     COALESCE(SUM(i.net_total) FILTER (WHERE {SHIPMENT_SQL}), 0)::float AS delivery_revenue
              FROM invoices i
              WHERE i.status = 'completed'
                AND i.seller_id IS NOT NULL
                AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
                {bf.replace('branch_id', 'i.branch_id')}
              GROUP BY i.seller_id
            ),
            rets AS (
              SELECT r.seller_id,
                     COUNT(*)::int AS return_count,
                     COALESCE(SUM(r.total_returned), 0)::float AS return_value
              FROM returns r
              WHERE r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
                {bf.replace('branch_id', 'r.branch_id')}
              GROUP BY r.seller_id
            )
            SELECT u.id AS seller_id,
                   u.username,
                   u.name_en AS seller_name_en,
                   u.name_ar AS seller_name_ar,
                   u.role AS seller_role,
                   b.name_en AS branch_name_en,
                   b.name_ar AS branch_name_ar,
                   COALESCE(s.invoice_count, 0)::int AS invoice_count,
                   COALESCE(s.revenue, 0)::float AS revenue,
                   COALESCE(s.total_discount, 0)::float AS total_discount,
                   COALESCE(s.cash_count, 0)::int AS cash_count,
                   COALESCE(s.delivery_count, 0)::int AS delivery_count,
                   COALESCE(s.digital_count, 0)::int AS digital_count,
                   COALESCE(s.delivery_revenue, 0)::float AS delivery_revenue,
                   COALESCE(r.return_count, 0)::int AS return_count,
                   COALESCE(r.return_value, 0)::float AS return_value,
                   (COALESCE(s.revenue, 0) - COALESCE(r.return_value, 0))::float AS net_revenue
            FROM users u
            LEFT JOIN sales s ON s.seller_id = u.id
            LEFT JOIN rets r ON r.seller_id = u.id
            LEFT JOIN branches b ON b.id = u.branch_id
            WHERE (s.seller_id IS NOT NULL OR r.seller_id IS NOT NULL)
            ORDER BY net_revenue DESC, revenue DESC, u.id ASC
            """,
            [df, dt] + bp + [df, dt] + bp,
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            rev = float(r.get("revenue") or 0)
            ret = float(r.get("return_value") or 0)
            r["return_pct"] = round(ret / rev * 100, 1) if rev > 0 else 0.0
        return rows
    finally:
        cur.close()
        conn.close()


@router.get("/sales-by-seller/export")
def export_sales_by_seller(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_response

    rows = sales_by_seller(request, date_from, date_to, current_user)
    headers = [
        "Seller EN", "Seller AR", "Username", "Role", "Branch EN",
        "Invoices", "Revenue", "Discount", "Cash", "Delivery orders",
        "Digital", "Delivery revenue", "Returns count", "Returns value",
        "Return %", "Net revenue",
    ]
    data = [
        [
            r.get("seller_name_en"), r.get("seller_name_ar"), r.get("username"),
            r.get("seller_role"), r.get("branch_name_en"),
            r.get("invoice_count"), r.get("revenue"), r.get("total_discount"),
            r.get("cash_count"), r.get("delivery_count"), r.get("digital_count"),
            r.get("delivery_revenue"), r.get("return_count"), r.get("return_value"),
            r.get("return_pct"), r.get("net_revenue"),
        ]
        for r in rows
    ]
    return xlsx_response(headers, data, "sales_by_seller.xlsx")


@router.get("/delivery-summary")
def delivery_summary(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delivery order counts by driver and by branch."""
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            f"""
            SELECT
              COALESCE(i.delivery_person_id, 0)::int AS delivery_person_id,
              COALESCE(NULLIF(TRIM(i.delivery_person_name), ''), 'Unassigned') AS delivery_person_name,
              i.branch_id,
              b.name_en AS branch_name_en,
              b.name_ar AS branch_name_ar,
              COUNT(*)::int AS order_count,
              COUNT(*) FILTER (WHERE COALESCE(i.delivery_status, 'pending') = 'pending')::int AS pending_count,
              COUNT(*) FILTER (WHERE i.delivery_status = 'out_for_delivery')::int AS out_for_delivery_count,
              COUNT(*) FILTER (WHERE i.delivery_status = 'delivered')::int AS delivered_count,
              COALESCE(SUM(i.net_total), 0)::float AS revenue,
              COALESCE(SUM(i.delivery_fee), 0)::float AS delivery_fees
            FROM invoices i
            LEFT JOIN branches b ON b.id = i.branch_id
            WHERE i.status = 'completed'
              AND {SHIPMENT_SQL}
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            GROUP BY i.delivery_person_id, i.delivery_person_name, i.branch_id, b.name_en, b.name_ar
            ORDER BY order_count DESC, delivery_person_name ASC
            """,
            [df, dt] + bp,
        )
        by_driver = [dict(r) for r in cur.fetchall()]

        cur.execute(
            f"""
            SELECT
              i.branch_id,
              b.name_en AS branch_name_en,
              b.name_ar AS branch_name_ar,
              COUNT(*)::int AS order_count,
              COUNT(*) FILTER (WHERE COALESCE(i.delivery_status, 'pending') = 'pending')::int AS pending_count,
              COUNT(*) FILTER (WHERE i.delivery_status = 'out_for_delivery')::int AS out_for_delivery_count,
              COUNT(*) FILTER (WHERE i.delivery_status = 'delivered')::int AS delivered_count,
              COALESCE(SUM(i.net_total), 0)::float AS revenue
            FROM invoices i
            LEFT JOIN branches b ON b.id = i.branch_id
            WHERE i.status = 'completed'
              AND {SHIPMENT_SQL}
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            GROUP BY i.branch_id, b.name_en, b.name_ar
            ORDER BY order_count DESC
            """,
            [df, dt] + bp,
        )
        by_branch = [dict(r) for r in cur.fetchall()]
        return {
            "date_from": str(df),
            "date_to": str(dt),
            "by_driver": by_driver,
            "by_branch": by_branch,
            "totals": {
                "order_count": sum(r["order_count"] for r in by_driver),
                "pending_count": sum(r["pending_count"] for r in by_driver),
                "delivered_count": sum(r["delivered_count"] for r in by_driver),
            },
        }
    finally:
        cur.close()
        conn.close()


@router.get("/delivery-summary/export")
def export_delivery_summary(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_response

    report = delivery_summary(request, date_from, date_to, current_user)
    headers = [
        "Driver", "Branch EN", "Orders", "Pending", "Out for delivery",
        "Delivered", "Revenue", "Delivery fees",
    ]
    data = [
        [
            r.get("delivery_person_name"), r.get("branch_name_en"),
            r.get("order_count"), r.get("pending_count"),
            r.get("out_for_delivery_count"), r.get("delivered_count"),
            r.get("revenue"), r.get("delivery_fees"),
        ]
        for r in report["by_driver"]
    ]
    return xlsx_response(headers, data, "delivery_summary.xlsx")


@router.get("/sales-by-clinic")
def sales_by_clinic_report(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Per-clinic sales totals (reports module — consistent branch/date scoping)."""
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            f"""
            SELECT cl.id AS clinic_id,
                   cl.name AS clinic_name,
                   COUNT(*)::int AS invoice_count,
                   COALESCE(SUM(i.subtotal), 0)::float AS gross,
                   COALESCE(SUM(i.discount), 0)::float AS discount,
                   COALESCE(SUM(i.net_total), 0)::float AS net
            FROM invoices i
            JOIN clinics cl ON i.clinic_id = cl.id
            WHERE i.status = 'completed'
              AND i.type != 'return'
              AND i.clinic_id IS NOT NULL
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            GROUP BY cl.id, cl.name
            ORDER BY net DESC, cl.name ASC
            """,
            [df, dt] + bp,
        )
        return [
            {
                "clinic_id": r["clinic_id"],
                "clinic_name": r["clinic_name"],
                "invoice_count": int(r["invoice_count"]),
                "gross": round(float(r["gross"]), 2),
                "discount": round(float(r["discount"]), 2),
                "net": round(float(r["net"]), 2),
            }
            for r in cur.fetchall()
        ]
    finally:
        cur.close()
        conn.close()


@router.get("/sales-by-clinic/export")
def export_sales_by_clinic(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_response

    rows = sales_by_clinic_report(request, date_from, date_to, current_user)
    headers = ["Clinic", "Invoices", "Gross", "Discount", "Net"]
    data = [
        [r["clinic_name"], r["invoice_count"], r["gross"], r["discount"], r["net"]]
        for r in rows
    ]
    return xlsx_response(headers, data, "sales_by_clinic.xlsx")


@router.get("/delivery-zones")
def delivery_zones_report(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delivery sales aggregated by Ismailia region/zone with marketing suggestions."""
    from regions import REGIONS, REGION_BY_KEY, resolve_region_key, region_display

    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            f"""
            SELECT i.id, i.net_total, i.type, i.delivery_address,
                   c.region AS customer_region
            FROM invoices i
            LEFT JOIN customers c ON c.id = i.customer_id
            WHERE i.status = 'completed'
              AND {SHIPMENT_SQL}
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            """,
            [df, dt] + bp,
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    stats: dict[str, dict] = {}
    for r in REGIONS:
        stats[r["key"]] = {
            "region_key": r["key"],
            "region_name_en": r["en"],
            "region_name_ar": r["ar"],
            "group": r["group"],
            "order_count": 0,
            "revenue": 0.0,
            "delivery_count": 0,
            "digital_count": 0,
        }
    stats["unknown"] = {
        "region_key": "unknown",
        "region_name_en": region_display("unknown", "en"),
        "region_name_ar": region_display("unknown", "ar"),
        "group": "other",
        "order_count": 0,
        "revenue": 0.0,
        "delivery_count": 0,
        "digital_count": 0,
    }

    for row in rows:
        key = resolve_region_key(
            row.get("delivery_address"),
            customer_region=row.get("customer_region"),
        )
        if key not in stats:
            key = "unknown"
        s = stats[key]
        net = float(row["net_total"] or 0)
        s["order_count"] += 1
        s["revenue"] = round(s["revenue"] + net, 2)
        if row.get("type") == "delivery":
            s["delivery_count"] += 1
        elif row.get("type") == "digital":
            s["digital_count"] += 1

    zones = sorted(stats.values(), key=lambda z: (-z["revenue"], -z["order_count"], z["region_name_en"]))
    for i, z in enumerate(zones, start=1):
        z["rank"] = i
        z["avg_order_value"] = round(z["revenue"] / z["order_count"], 2) if z["order_count"] else 0.0

    with_sales = [z for z in zones if z["order_count"] > 0 and z["region_key"] != "unknown"]
    markaz = [z for z in REGIONS if z["group"] == "markaz"]
    markaz_keys = {m["key"] for m in markaz}

    total_orders = sum(z["order_count"] for z in zones)
    total_revenue = sum(z["revenue"] for z in zones)
    avg_orders_per_region = (
        total_orders / len(with_sales) if with_sales else 0
    )

    top_regions = [z for z in zones if z["order_count"] > 0][:5]
    bottom_with_sales = sorted(with_sales, key=lambda z: (z["order_count"], z["revenue"]))[:5]

    zero_regions = [
        stats[r["key"]] for r in REGIONS if stats[r["key"]]["order_count"] == 0
    ]

    marketing_suggestions: list[dict] = []

    for z in zero_regions:
        marketing_suggestions.append({
            "region_key": z["region_key"],
            "region_name_en": z["region_name_en"],
            "region_name_ar": z["region_name_ar"],
            "priority": "high",
            "reason_en": f"No delivery orders yet in {z['region_name_en']} — strong candidate to start marketing and delivery coverage.",
            "reason_ar": f"لا توجد طلبات توصيل بعد في {z['region_name_ar']} — مرشح قوي لبدء التسويق وتغطية التوصيل.",
        })

    for z in bottom_with_sales:
        if z["region_key"] in {s["region_key"] for s in marketing_suggestions}:
            continue
        if z["order_count"] <= max(1, avg_orders_per_region * 0.3):
            marketing_suggestions.append({
                "region_key": z["region_key"],
                "region_name_en": z["region_name_en"],
                "region_name_ar": z["region_name_ar"],
                "priority": "medium",
                "reason_en": (
                    f"Low activity in {z['region_name_en']} ({z['order_count']} orders, "
                    f"{z['revenue']:.0f} LE) — consider flyers, clinic partnerships, or targeted ads."
                ),
                "reason_ar": (
                    f"نشاط منخفض في {z['region_name_ar']} ({z['order_count']} طلبات، "
                    f"{z['revenue']:.0f} جنيه) — فكّر في منشورات أو شراكات عيادات أو إعلانات مستهدفة."
                ),
            })

    if stats["unknown"]["order_count"] > 0:
        marketing_suggestions.append({
            "region_key": "unknown",
            "region_name_en": stats["unknown"]["region_name_en"],
            "region_name_ar": stats["unknown"]["region_name_ar"],
            "priority": "low",
            "reason_en": (
                f"{stats['unknown']['order_count']} orders have unclear addresses — "
                "use structured region selection at checkout to improve zone analytics."
            ),
            "reason_ar": (
                f"{stats['unknown']['order_count']} طلبات بعناوين غير واضحة — "
                "استخدم اختيار المنطقة المنظم عند الدفع لتحسين التحليل."
            ),
        })

    markaz_with_sales = sum(1 for k in markaz_keys if stats[k]["order_count"] > 0)
    if markaz_with_sales < len(markaz_keys):
        missing_markaz = [REGION_BY_KEY[k]["en"] for k in markaz_keys if stats[k]["order_count"] == 0]
        if missing_markaz:
            marketing_suggestions.insert(0, {
                "region_key": "_markaz_gap",
                "region_name_en": "Markaz coverage gap",
                "region_name_ar": "فجوة تغطية المراكز",
                "priority": "high",
                "reason_en": f"Expand delivery/marketing to markaz with zero orders: {', '.join(missing_markaz[:5])}.",
                "reason_ar": f"وسّع التوصيل والتسويق للمراكز بدون طلبات: {', '.join(missing_markaz[:5])}.",
            })

    priority_rank = {"high": 0, "medium": 1, "low": 2}
    marketing_suggestions.sort(key=lambda s: priority_rank.get(s["priority"], 9))

    return {
        "date_from": str(df),
        "date_to": str(dt),
        "totals": {
            "order_count": total_orders,
            "revenue": round(total_revenue, 2),
            "regions_with_sales": len(with_sales),
            "regions_total": len(REGIONS) + 1,
        },
        "zones": zones,
        "top_regions": top_regions,
        "bottom_regions": bottom_with_sales + zero_regions[:5],
        "marketing_suggestions": marketing_suggestions[:15],
    }


@router.get("/delivery-zones/export")
def export_delivery_zones(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_response

    report = delivery_zones_report(request, date_from, date_to, current_user)
    headers = [
        "Rank", "Region EN", "Region AR", "Group", "Orders", "Revenue",
        "Delivery", "Digital", "Avg order",
    ]
    data = [
        [
            z["rank"], z["region_name_en"], z["region_name_ar"], z.get("group"),
            z["order_count"], z["revenue"], z["delivery_count"], z["digital_count"],
            z["avg_order_value"],
        ]
        for z in report["zones"]
    ]
    return xlsx_response(headers, data, "delivery_zones.xlsx")


def _customer_analysis_data(
    request: Request,
    date_from: Optional[str],
    date_to: Optional[str],
    current_user: dict,
) -> tuple[list, list, date, date]:
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            f"""
            WITH filtered AS (
              SELECT i.id, i.customer_id, i.net_total, i.created_at
              FROM invoices i
              WHERE i.status = 'completed'
                AND i.type != 'return'
                AND i.customer_id IS NOT NULL
                AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
                {bf.replace('branch_id', 'i.branch_id')}
            ),
            gaps AS (
              SELECT customer_id,
                     AVG(EXTRACT(EPOCH FROM (created_at - prev_at)) / 86400)::float AS avg_days_between
              FROM (
                SELECT customer_id, created_at,
                       LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at) AS prev_at
                FROM filtered
              ) x
              WHERE prev_at IS NOT NULL
              GROUP BY customer_id
            ),
            item_stats AS (
              SELECT f.customer_id,
                     COALESCE(SUM(ii.quantity), 0)::int AS total_items_qty,
                     COUNT(DISTINCT ii.product_id)::int AS distinct_products
              FROM filtered f
              JOIN invoice_items ii ON ii.invoice_id = f.id
              GROUP BY f.customer_id
            ),
            cust_agg AS (
              SELECT f.customer_id,
                     COUNT(*)::int AS invoice_count,
                     COALESCE(SUM(f.net_total), 0)::float AS total_spent,
                     MIN(f.created_at) AS first_invoice_at,
                     MAX(f.created_at) AS last_invoice_at
              FROM filtered f
              GROUP BY f.customer_id
            )
            SELECT c.id AS customer_id,
                   c.name AS customer_name,
                   c.phone,
                   c.region,
                   ca.invoice_count,
                   ca.total_spent,
                   CASE WHEN ca.invoice_count > 0
                     THEN (ca.total_spent / ca.invoice_count)::float ELSE 0 END AS avg_order_value,
                   ca.first_invoice_at,
                   ca.last_invoice_at,
                   g.avg_days_between,
                   COALESCE(it.total_items_qty, 0)::int AS total_items_qty,
                   COALESCE(it.distinct_products, 0)::int AS distinct_products
            FROM cust_agg ca
            JOIN customers c ON c.id = ca.customer_id
            LEFT JOIN gaps g ON g.customer_id = ca.customer_id
            LEFT JOIN item_stats it ON it.customer_id = ca.customer_id
            ORDER BY ca.total_spent DESC, ca.invoice_count DESC, c.name ASC
            """,
            [df, dt] + bp,
        )
        summary_rows = []
        for r in cur.fetchall():
            row = dict(r)
            last_at = row.get("last_invoice_at")
            if last_at:
                last_d = last_at.date() if hasattr(last_at, "date") else last_at
                row["days_since_last_invoice"] = (dt - last_d).days
                row["last_invoice_at"] = last_at.isoformat() if hasattr(last_at, "isoformat") else str(last_at)
            else:
                row["days_since_last_invoice"] = None
                row["last_invoice_at"] = None
            fi = row.get("first_invoice_at")
            row["first_invoice_at"] = fi.isoformat() if fi and hasattr(fi, "isoformat") else (str(fi) if fi else None)
            row["total_spent"] = round(float(row["total_spent"] or 0), 2)
            row["avg_order_value"] = round(float(row["avg_order_value"] or 0), 2)
            ab = row.get("avg_days_between")
            row["avg_days_between_invoices"] = round(float(ab), 1) if ab is not None else None
            summary_rows.append(row)

        n = len(summary_rows)
        for i, row in enumerate(summary_rows):
            if n <= 1:
                row["buyer_tier"] = "high"
            elif i / n < 0.34:
                row["buyer_tier"] = "high"
            elif i / n < 0.67:
                row["buyer_tier"] = "medium"
            else:
                row["buyer_tier"] = "low"

        cur.execute(
            f"""
            SELECT c.id AS customer_id,
                   c.name AS customer_name,
                   c.phone,
                   COALESCE(ii.product_name_en, ii.product_name_ar, p.name_en, p.name_ar) AS product_name,
                   ii.barcode,
                   SUM(ii.quantity)::int AS qty,
                   SUM(ii.total)::float AS revenue,
                   MAX(i.created_at) AS last_purchased_at,
                   COUNT(DISTINCT i.id)::int AS purchase_count
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            JOIN invoice_items ii ON ii.invoice_id = i.id
            LEFT JOIN products p ON p.id = ii.product_id
            WHERE i.status = 'completed'
              AND i.type != 'return'
              AND i.customer_id IS NOT NULL
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf.replace('branch_id', 'i.branch_id')}
            GROUP BY c.id, c.name, c.phone,
                     COALESCE(ii.product_name_en, ii.product_name_ar, p.name_en, p.name_ar),
                     ii.barcode
            ORDER BY c.name ASC, revenue DESC
            """,
            [df, dt] + bp,
        )
        item_rows = []
        for r in cur.fetchall():
            row = dict(r)
            lp = row.get("last_purchased_at")
            row["last_purchased_at"] = lp.isoformat() if lp and hasattr(lp, "isoformat") else (str(lp) if lp else None)
            row["revenue"] = round(float(row["revenue"] or 0), 2)
            item_rows.append(row)
    finally:
        cur.close()
        conn.close()
    return summary_rows, item_rows, df, dt


@router.get("/customer-analysis")
def customer_analysis(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    summary, items, df, dt = _customer_analysis_data(request, date_from, date_to, current_user)
    top_buyers = [r for r in summary if r["buyer_tier"] == "high"][:10]
    low_buyers = sorted(
        [r for r in summary if r["buyer_tier"] == "low"],
        key=lambda x: (x["total_spent"], x["invoice_count"]),
    )[:10]
    return {
        "date_from": str(df),
        "date_to": str(dt),
        "summary": {
            "customer_count": len(summary),
            "total_revenue": round(sum(r["total_spent"] for r in summary), 2),
            "high_buyers": len([r for r in summary if r["buyer_tier"] == "high"]),
            "low_buyers": len([r for r in summary if r["buyer_tier"] == "low"]),
        },
        "customers": summary,
        "top_buyers": top_buyers,
        "low_buyers": low_buyers,
        "items": items,
    }


@router.get("/customer-analysis/export")
def export_customer_analysis(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_multi_sheet

    summary, items, df, dt = _customer_analysis_data(request, date_from, date_to, current_user)
    cust_headers = [
        "Customer", "Phone", "Region", "Tier", "Invoices", "Total spent", "Avg order",
        "First invoice", "Last invoice", "Days since last", "Avg days between",
        "Items qty", "Distinct products",
    ]
    cust_data = [
        [
            r["customer_name"], r.get("phone"), r.get("region"), r.get("buyer_tier"),
            r["invoice_count"], r["total_spent"], r["avg_order_value"],
            r.get("first_invoice_at"), r.get("last_invoice_at"),
            r.get("days_since_last_invoice"), r.get("avg_days_between_invoices"),
            r["total_items_qty"], r["distinct_products"],
        ]
        for r in summary
    ]
    item_headers = [
        "Customer", "Phone", "Product", "Barcode", "Qty", "Revenue",
        "Purchase count", "Last purchased",
    ]
    item_data = [
        [
            r["customer_name"], r.get("phone"), r.get("product_name"), r.get("barcode"),
            r["qty"], r["revenue"], r["purchase_count"], r.get("last_purchased_at"),
        ]
        for r in items
    ]
    return xlsx_multi_sheet(
        [
            ("Customers", cust_headers, cust_data),
            ("Items purchased", item_headers, item_data),
        ],
        "customer_analysis.xlsx",
    )


def _sales_report_data(
    request: Request,
    date_from: Optional[str],
    date_to: Optional[str],
    current_user: dict,
) -> tuple[dict, date, date]:
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    bf_i = bf.replace("branch_id", "i.branch_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            f"""
            SELECT COALESCE(i.type, 'unknown') AS sale_type,
                   COALESCE(i.payment_method, 'unknown') AS payment_method,
                   COUNT(*)::int AS invoice_count,
                   COALESCE(SUM(i.net_total), 0)::float AS revenue,
                   COALESCE(SUM(iq.items_qty), 0)::int AS items_qty
            FROM invoices i
            LEFT JOIN (
              SELECT invoice_id, SUM(quantity)::int AS items_qty
              FROM invoice_items GROUP BY invoice_id
            ) iq ON iq.invoice_id = i.id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
            GROUP BY i.type, i.payment_method
            ORDER BY revenue DESC, invoice_count DESC
            """,
            [df, dt] + bp,
        )
        by_sale_type = [dict(r) for r in cur.fetchall()]
        for r in by_sale_type:
            r["revenue"] = round(float(r["revenue"] or 0), 2)

        cur.execute(
            f"""
            SELECT u.id AS seller_id,
                   u.username,
                   u.name_en AS seller_name_en,
                   u.name_ar AS seller_name_ar,
                   COUNT(*)::int AS invoice_count,
                   COALESCE(SUM(i.net_total), 0)::float AS revenue,
                   COALESCE(SUM(iq.items_qty), 0)::int AS items_qty,
                   COUNT(*) FILTER (WHERE i.type = 'cash')::int AS cash_count,
                   COUNT(*) FILTER (WHERE i.type = 'delivery')::int AS delivery_count,
                   COUNT(*) FILTER (WHERE i.type = 'digital')::int AS digital_count
            FROM invoices i
            JOIN users u ON u.id = i.seller_id
            LEFT JOIN (
              SELECT invoice_id, SUM(quantity)::int AS items_qty
              FROM invoice_items GROUP BY invoice_id
            ) iq ON iq.invoice_id = i.id
            WHERE i.status = 'completed'
              AND i.seller_id IS NOT NULL
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
            GROUP BY u.id, u.username, u.name_en, u.name_ar
            ORDER BY revenue DESC, invoice_count DESC
            """,
            [df, dt] + bp,
        )
        by_seller = [dict(r) for r in cur.fetchall()]
        for r in by_seller:
            r["revenue"] = round(float(r["revenue"] or 0), 2)

        cur.execute(
            f"""
            SELECT b.id AS branch_id,
                   b.name_en AS branch_name_en,
                   b.name_ar AS branch_name_ar,
                   COUNT(*)::int AS invoice_count,
                   COALESCE(SUM(i.net_total), 0)::float AS revenue,
                   COALESCE(SUM(iq.items_qty), 0)::int AS items_qty
            FROM invoices i
            JOIN branches b ON b.id = i.branch_id
            LEFT JOIN (
              SELECT invoice_id, SUM(quantity)::int AS items_qty
              FROM invoice_items GROUP BY invoice_id
            ) iq ON iq.invoice_id = i.id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
            GROUP BY b.id, b.name_en, b.name_ar
            ORDER BY revenue DESC, invoice_count DESC
            """,
            [df, dt] + bp,
        )
        by_terminal = [dict(r) for r in cur.fetchall()]
        for r in by_terminal:
            r["revenue"] = round(float(r["revenue"] or 0), 2)

        cur.execute(
            f"""
            SELECT i.id AS invoice_id,
                   i.invoice_number,
                   i.created_at,
                   i.type AS sale_type,
                   i.payment_method,
                   i.digital_type,
                   i.subtotal::float AS subtotal,
                   i.discount::float AS discount,
                   i.net_total::float AS net_total,
                   u.id AS seller_id,
                   u.username AS seller_username,
                   u.name_en AS seller_name_en,
                   u.name_ar AS seller_name_ar,
                   b.id AS branch_id,
                   b.name_en AS branch_name_en,
                   b.name_ar AS branch_name_ar,
                   c.name AS customer_name,
                   COALESCE(iq.items_qty, 0)::int AS items_qty
            FROM invoices i
            LEFT JOIN users u ON u.id = i.seller_id
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN customers c ON c.id = i.customer_id
            LEFT JOIN (
              SELECT invoice_id, SUM(quantity)::int AS items_qty
              FROM invoice_items GROUP BY invoice_id
            ) iq ON iq.invoice_id = i.id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
            ORDER BY i.created_at DESC, i.id DESC
            """,
            [df, dt] + bp,
        )
        invoices = []
        for r in cur.fetchall():
            row = dict(r)
            created = row.get("created_at")
            if created and hasattr(created, "isoformat"):
                row["created_at"] = created.isoformat()
            row["subtotal"] = round(float(row.get("subtotal") or 0), 2)
            row["discount"] = round(float(row.get("discount") or 0), 2)
            row["net_total"] = round(float(row.get("net_total") or 0), 2)
            invoices.append(row)

        cur.execute(
            f"""
            SELECT i.invoice_number,
                   i.created_at,
                   i.type AS sale_type,
                   i.payment_method,
                   u.name_en AS seller_name_en,
                   u.name_ar AS seller_name_ar,
                   b.name_en AS branch_name_en,
                   b.name_ar AS branch_name_ar,
                   COALESCE(ii.product_name_en, ii.product_name_ar, p.name_en, p.name_ar) AS product_name,
                   ii.barcode,
                   ii.quantity::int AS qty,
                   ii.unit_price::float AS unit_price,
                   ii.total::float AS line_total
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            LEFT JOIN users u ON u.id = i.seller_id
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN products p ON p.id = ii.product_id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
            ORDER BY i.created_at DESC, i.id DESC, ii.id ASC
            """,
            [df, dt] + bp,
        )
        line_items = []
        for r in cur.fetchall():
            row = dict(r)
            created = row.get("created_at")
            if created and hasattr(created, "isoformat"):
                row["created_at"] = created.isoformat()
            row["unit_price"] = round(float(row.get("unit_price") or 0), 2)
            row["line_total"] = round(float(row.get("line_total") or 0), 2)
            line_items.append(row)
    finally:
        cur.close()
        conn.close()

    total_revenue = round(sum(r["revenue"] for r in by_sale_type), 2)
    total_invoices = sum(r["invoice_count"] for r in by_sale_type)
    total_items_qty = sum(r["items_qty"] for r in by_sale_type)

    report = {
        "date_from": str(df),
        "date_to": str(dt),
        "summary": {
            "invoice_count": total_invoices,
            "total_revenue": total_revenue,
            "items_qty": total_items_qty,
        },
        "by_sale_type": by_sale_type,
        "by_seller": by_seller,
        "by_terminal": by_terminal,
        "invoices": invoices,
        "line_items": line_items,
    }
    return report, df, dt


@router.get("/sales-report")
def sales_report(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    report, _, _ = _sales_report_data(request, date_from, date_to, current_user)
    return report


@router.get("/sales-report/export")
def export_sales_report(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_multi_sheet

    report, _, _ = _sales_report_data(request, date_from, date_to, current_user)
    type_headers = ["Sale type", "Payment", "Invoices", "Revenue", "Items qty"]
    type_data = [
        [r["sale_type"], r["payment_method"], r["invoice_count"], r["revenue"], r["items_qty"]]
        for r in report["by_sale_type"]
    ]
    seller_headers = [
        "Seller EN", "Seller AR", "Username", "Invoices", "Revenue", "Items qty",
        "Cash", "Delivery", "Digital",
    ]
    seller_data = [
        [
            r["seller_name_en"], r["seller_name_ar"], r.get("username"),
            r["invoice_count"], r["revenue"], r["items_qty"],
            r["cash_count"], r["delivery_count"], r["digital_count"],
        ]
        for r in report["by_seller"]
    ]
    term_headers = ["Terminal (branch) EN", "Terminal (branch) AR", "Invoices", "Revenue", "Items qty"]
    term_data = [
        [r["branch_name_en"], r["branch_name_ar"], r["invoice_count"], r["revenue"], r["items_qty"]]
        for r in report["by_terminal"]
    ]
    inv_headers = [
        "Invoice #", "Date", "Time", "Sale type", "Payment", "Digital platform",
        "Subtotal", "Discount", "Net total", "Seller EN", "Seller AR",
        "Terminal EN", "Terminal AR", "Customer", "Items qty",
    ]
    inv_data = []
    for r in report["invoices"]:
        created = r.get("created_at") or ""
        date_part = created[:10] if len(created) >= 10 else ""
        time_part = created[11:19] if len(created) >= 19 else ""
        inv_data.append([
            r["invoice_number"], date_part, time_part,
            r["sale_type"], r["payment_method"], r.get("digital_type"),
            r["subtotal"], r["discount"], r["net_total"],
            r.get("seller_name_en"), r.get("seller_name_ar"),
            r.get("branch_name_en"), r.get("branch_name_ar"),
            r.get("customer_name"), r["items_qty"],
        ])
    item_headers = [
        "Invoice #", "Date", "Time", "Sale type", "Payment",
        "Seller EN", "Terminal EN", "Product", "Barcode", "Qty", "Unit price", "Line total",
    ]
    item_data = []
    for r in report["line_items"]:
        created = r.get("created_at") or ""
        date_part = created[:10] if len(created) >= 10 else ""
        time_part = created[11:19] if len(created) >= 19 else ""
        item_data.append([
            r["invoice_number"], date_part, time_part,
            r["sale_type"], r["payment_method"],
            r.get("seller_name_en"), r.get("branch_name_en"),
            r.get("product_name"), r.get("barcode"),
            r["qty"], r["unit_price"], r["line_total"],
        ])
    return xlsx_multi_sheet(
        [
            ("By sale type", type_headers, type_data),
            ("By salesperson", seller_headers, seller_data),
            ("By terminal", term_headers, term_data),
            ("Invoices", inv_headers, inv_data),
            ("Line items", item_headers, item_data),
        ],
        "sales_report.xlsx",
    )
