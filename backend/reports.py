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


def _fmt_display_date(iso_or_date) -> str:
    """Format date as dd/mm/yy for exports."""
    if not iso_or_date:
        return ""
    if isinstance(iso_or_date, date):
        d = iso_or_date
    elif hasattr(iso_or_date, "date"):
        d = iso_or_date.date()
    else:
        s = str(iso_or_date)[:10]
        try:
            d = datetime.strptime(s, "%Y-%m-%d").date()
        except ValueError:
            return s
    return f"{d.day:02d}/{d.month:02d}/{str(d.year)[-2:]}"


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
    branch_id: Optional[int] = None,
    sale_type: Optional[str] = None,
    payment_method: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    st = (sale_type or "").strip() or None
    pm = (payment_method or "").strip() or None
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sales_where = []
        sales_params: list = [df, dt] + bp
        if branch_id is not None:
            sales_where.append("i.branch_id = %s")
            sales_params.append(branch_id)
        if st and st != "return":
            sales_where.append("i.type = %s")
            sales_params.append(st)
        if pm and pm != "return":
            sales_where.append("COALESCE(i.payment_method, 'unknown') = %s")
            sales_params.append(pm)
        sales_extra = (" AND " + " AND ".join(sales_where)) if sales_where else ""

        rows: list[dict] = []
        if not st or st != "return":
            cur.execute(f"""
                SELECT
                  b.id AS branch_id,
                  b.name_en AS branch_name_en,
                  b.name_ar AS branch_name_ar,
                  COALESCE(i.payment_method, 'unknown') AS payment_method,
                  COALESCE(i.type, 'unknown') AS sale_type,
                  COUNT(*)::int AS invoice_count,
                  SUM(i.net_total)::float AS revenue,
                  COALESCE(SUM(i.discount), 0)::float AS total_discount
                FROM invoices i
                JOIN branches b ON b.id = i.branch_id
                WHERE i.status = 'completed'
                  AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
                  {bf.replace('branch_id', 'i.branch_id')}
                  {sales_extra}
                GROUP BY b.id, b.name_en, b.name_ar, i.payment_method, i.type
                ORDER BY b.name_en, revenue DESC
            """, sales_params)
            rows.extend(dict(r) for r in cur.fetchall())

        if (not st or st == "return") and (not pm or pm == "return"):
            ret_where = []
            ret_params: list = [df, dt] + bp
            if branch_id is not None:
                ret_where.append("r.branch_id = %s")
                ret_params.append(branch_id)
            ret_extra = (" AND " + " AND ".join(ret_where)) if ret_where else ""
            cur.execute(f"""
                SELECT
                  b.id AS branch_id,
                  b.name_en AS branch_name_en,
                  b.name_ar AS branch_name_ar,
                  'return' AS payment_method,
                  'return' AS sale_type,
                  COUNT(*)::int AS invoice_count,
                  (-SUM(r.total_returned))::float AS revenue,
                  0::float AS total_discount
                FROM returns r
                JOIN branches b ON b.id = r.branch_id
                WHERE r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
                  {bf.replace('branch_id', 'r.branch_id')}
                  {ret_extra}
                GROUP BY b.id, b.name_en, b.name_ar
                HAVING COUNT(*) > 0
                ORDER BY b.name_en
            """, ret_params)
            rows.extend(dict(r) for r in cur.fetchall())

        for r in rows:
            r["revenue"] = round(float(r.get("revenue") or 0), 2)
            r["total_discount"] = round(float(r.get("total_discount") or 0), 2)
        return rows
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
    """Delivery order counts by time interval, driver, and branch."""
    return _delivery_summary_report(request, date_from, date_to, current_user)


def _fetch_delivery_orders(cur, df, dt, bf, bp) -> list:
    cur.execute(
        f"""
        SELECT i.id AS invoice_id,
               i.invoice_number,
               i.created_at,
               EXTRACT(HOUR FROM i.created_at)::int AS hour,
               COALESCE(i.delivery_person_id, 0)::int AS delivery_person_id,
               COALESCE(NULLIF(TRIM(i.delivery_person_name), ''), 'Unassigned') AS delivery_person_name,
               i.branch_id,
               b.name_en AS branch_name_en,
               b.name_ar AS branch_name_ar,
               COALESCE(i.delivery_status, 'pending') AS delivery_status,
               i.net_total::float AS net_total,
               COALESCE(i.delivery_fee, 0)::float AS delivery_fee
        FROM invoices i
        LEFT JOIN branches b ON b.id = i.branch_id
        WHERE i.status = 'completed'
          AND {SHIPMENT_SQL}
          AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
          {bf.replace('branch_id', 'i.branch_id')}
        ORDER BY i.created_at ASC
        """,
        [df, dt] + bp,
    )
    orders = []
    for r in cur.fetchall():
        row = dict(r)
        created = row.get("created_at")
        if created and hasattr(created, "isoformat"):
            row["created_at"] = created.isoformat()
        row["net_total"] = round(float(row.get("net_total") or 0), 2)
        row["delivery_fee"] = round(float(row.get("delivery_fee") or 0), 2)
        row["hour"] = int(row.get("hour") or 0)
        orders.append(row)
    return orders


def _filter_delivery_orders(
    orders: list,
    branch_id: Optional[int] = None,
    delivery_person_id: Optional[int] = None,
    delivery_status: Optional[str] = None,
    hour_from: Optional[int] = None,
    hour_to: Optional[int] = None,
    section_date_from: Optional[str] = None,
    section_date_to: Optional[str] = None,
) -> list:
    out = orders
    if branch_id is not None:
        out = [o for o in out if o.get("branch_id") == branch_id]
    if delivery_person_id is not None:
        out = [o for o in out if o.get("delivery_person_id") == delivery_person_id]
    if delivery_status:
        out = [o for o in out if o.get("delivery_status") == delivery_status]
    if hour_from is not None:
        out = [o for o in out if int(o.get("hour") or 0) >= hour_from]
    if hour_to is not None:
        out = [o for o in out if int(o.get("hour") or 0) <= hour_to]
    if section_date_from or section_date_to:
        out = [o for o in out if _in_date_range(o.get("created_at"), section_date_from, section_date_to)]
    return out


def _interval_label(start_hour: int, interval_hours: int) -> str:
    end = (start_hour + interval_hours) % 24
    return f"{start_hour:02d}:00–{end:02d}:00"


def _aggregate_delivery_by_time(orders: list, interval_hours: int = 1) -> list:
    interval_hours = max(1, min(4, int(interval_hours or 1)))
    buckets: dict = {}
    for o in orders:
        h = int(o.get("hour") or 0)
        start = (h // interval_hours) * interval_hours
        if start not in buckets:
            buckets[start] = {
                "hour_start": start,
                "interval_hours": interval_hours,
                "interval_label": _interval_label(start, interval_hours),
                "order_count": 0,
                "pending_count": 0,
                "out_for_delivery_count": 0,
                "delivered_count": 0,
                "revenue": 0.0,
                "delivery_fees": 0.0,
            }
        b = buckets[start]
        b["order_count"] += 1
        st = o.get("delivery_status") or "pending"
        if st == "pending":
            b["pending_count"] += 1
        elif st == "out_for_delivery":
            b["out_for_delivery_count"] += 1
        elif st == "delivered":
            b["delivered_count"] += 1
        b["revenue"] = round(b["revenue"] + float(o.get("net_total") or 0), 2)
        b["delivery_fees"] = round(b["delivery_fees"] + float(o.get("delivery_fee") or 0), 2)
    return sorted(buckets.values(), key=lambda x: x["hour_start"])


def _aggregate_delivery_by_driver(orders: list) -> list:
    buckets: dict = {}
    for o in orders:
        key = (
            o.get("delivery_person_id"),
            o.get("delivery_person_name"),
            o.get("branch_id"),
            o.get("branch_name_en"),
            o.get("branch_name_ar"),
        )
        if key not in buckets:
            buckets[key] = {
                "delivery_person_id": o.get("delivery_person_id"),
                "delivery_person_name": o.get("delivery_person_name"),
                "branch_id": o.get("branch_id"),
                "branch_name_en": o.get("branch_name_en"),
                "branch_name_ar": o.get("branch_name_ar"),
                "order_count": 0,
                "pending_count": 0,
                "out_for_delivery_count": 0,
                "delivered_count": 0,
                "revenue": 0.0,
                "delivery_fees": 0.0,
            }
        b = buckets[key]
        b["order_count"] += 1
        st = o.get("delivery_status") or "pending"
        if st == "pending":
            b["pending_count"] += 1
        elif st == "out_for_delivery":
            b["out_for_delivery_count"] += 1
        elif st == "delivered":
            b["delivered_count"] += 1
        b["revenue"] = round(b["revenue"] + float(o.get("net_total") or 0), 2)
        b["delivery_fees"] = round(b["delivery_fees"] + float(o.get("delivery_fee") or 0), 2)
    return sorted(buckets.values(), key=lambda x: (-x["order_count"], x["delivery_person_name"] or ""))


def _aggregate_delivery_by_branch(orders: list) -> list:
    buckets: dict = {}
    for o in orders:
        key = (o.get("branch_id"), o.get("branch_name_en"), o.get("branch_name_ar"))
        if key not in buckets:
            buckets[key] = {
                "branch_id": o.get("branch_id"),
                "branch_name_en": o.get("branch_name_en"),
                "branch_name_ar": o.get("branch_name_ar"),
                "order_count": 0,
                "pending_count": 0,
                "out_for_delivery_count": 0,
                "delivered_count": 0,
                "revenue": 0.0,
            }
        b = buckets[key]
        b["order_count"] += 1
        st = o.get("delivery_status") or "pending"
        if st == "pending":
            b["pending_count"] += 1
        elif st == "out_for_delivery":
            b["out_for_delivery_count"] += 1
        elif st == "delivered":
            b["delivered_count"] += 1
        b["revenue"] = round(b["revenue"] + float(o.get("net_total") or 0), 2)
    return sorted(buckets.values(), key=lambda x: -x["order_count"])


def _delivery_totals(orders: list) -> dict:
    pending = sum(1 for o in orders if (o.get("delivery_status") or "pending") == "pending")
    delivered = sum(1 for o in orders if o.get("delivery_status") == "delivered")
    return {
        "order_count": len(orders),
        "pending_count": pending,
        "delivered_count": delivered,
    }


def _delivery_summary_report(
    request: Request,
    date_from: Optional[str],
    date_to: Optional[str],
    current_user: dict,
) -> dict:
    _check_role(current_user)
    active_branch_id = _resolve_report_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf, bp = _branch_filter(current_user, active_branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        orders = _fetch_delivery_orders(cur, df, dt, bf, bp)
    finally:
        cur.close()
        conn.close()
    return {
        "date_from": str(df),
        "date_to": str(dt),
        "orders": orders,
        "by_time_interval": _aggregate_delivery_by_time(orders, 1),
        "by_driver": _aggregate_delivery_by_driver(orders),
        "by_branch": _aggregate_delivery_by_branch(orders),
        "totals": _delivery_totals(orders),
    }


def _apply_delivery_summary_filters(
    report: dict,
    section: Optional[str],
    branch_id: Optional[int],
    delivery_person_id: Optional[int],
    delivery_status: Optional[str],
    hour_from: Optional[int],
    hour_to: Optional[int],
    section_date_from: Optional[str],
    section_date_to: Optional[str],
    interval_hours: int = 1,
) -> dict:
    status = (delivery_status or "").strip() or None
    filtered = _filter_delivery_orders(
        report["orders"],
        branch_id=branch_id,
        delivery_person_id=delivery_person_id,
        delivery_status=status,
        hour_from=hour_from,
        hour_to=hour_to,
        section_date_from=section_date_from,
        section_date_to=section_date_to,
    )
    out = {
        **report,
        "by_time_interval": _aggregate_delivery_by_time(filtered, interval_hours),
        "by_driver": _aggregate_delivery_by_driver(filtered),
        "by_branch": _aggregate_delivery_by_branch(filtered),
        "totals": _delivery_totals(filtered),
    }
    if section == "by_time":
        return {"by_time_interval": out["by_time_interval"], "_section": section}
    if section == "by_driver":
        return {"by_driver": out["by_driver"], "_section": section}
    if section == "by_branch":
        return {"by_branch": out["by_branch"], "_section": section}
    return out


def _delivery_summary_sheets(report: dict) -> list[tuple[str, list, list]]:
    time_headers = [
        "Time interval", "Orders", "Pending", "Out for delivery",
        "Delivered", "Revenue", "Delivery fees",
    ]
    time_data = [
        [
            r["interval_label"], r["order_count"], r["pending_count"],
            r["out_for_delivery_count"], r["delivered_count"],
            r["revenue"], r["delivery_fees"],
        ]
        for r in report.get("by_time_interval", [])
    ]
    driver_headers = [
        "Driver", "Branch EN", "Orders", "Pending", "Out for delivery",
        "Delivered", "Revenue", "Delivery fees",
    ]
    driver_data = [
        [
            r.get("delivery_person_name"), r.get("branch_name_en"),
            r.get("order_count"), r.get("pending_count"),
            r.get("out_for_delivery_count"), r.get("delivered_count"),
            r.get("revenue"), r.get("delivery_fees"),
        ]
        for r in report.get("by_driver", [])
    ]
    branch_headers = [
        "Branch EN", "Branch AR", "Orders", "Pending", "Out for delivery",
        "Delivered", "Revenue",
    ]
    branch_data = [
        [
            r.get("branch_name_en"), r.get("branch_name_ar"),
            r.get("order_count"), r.get("pending_count"),
            r.get("out_for_delivery_count"), r.get("delivered_count"),
            r.get("revenue"),
        ]
        for r in report.get("by_branch", [])
    ]
    return [
        ("By time interval", time_headers, time_data),
        ("By driver", driver_headers, driver_data),
        ("By branch", branch_headers, branch_data),
    ]


@router.get("/delivery-summary/export")
def export_delivery_summary(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    section: Optional[str] = None,
    branch_id: Optional[int] = None,
    delivery_person_id: Optional[int] = None,
    delivery_status: Optional[str] = None,
    hour_from: Optional[int] = Query(None, ge=0, le=23),
    hour_to: Optional[int] = Query(None, ge=0, le=23),
    section_date_from: Optional[str] = None,
    section_date_to: Optional[str] = None,
    interval_hours: int = Query(1, ge=1, le=4),
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_multi_sheet, xlsx_response

    report = _delivery_summary_report(request, date_from, date_to, current_user)
    valid_sections = {"by_time", "by_driver", "by_branch"}
    sec = (section or "").strip() or None
    if sec and sec not in valid_sections:
        raise HTTPException(400, "Invalid section")

    has_filters = any([
        branch_id is not None, delivery_person_id is not None, delivery_status,
        hour_from is not None, hour_to is not None, section_date_from, section_date_to,
    ])
    if has_filters or (sec == "by_time" and interval_hours != 1):
        report = _apply_delivery_summary_filters(
            report, None, branch_id, delivery_person_id, delivery_status,
            hour_from, hour_to, section_date_from, section_date_to, interval_hours,
        )
    elif sec == "by_time":
        report = {**report, "by_time_interval": _aggregate_delivery_by_time(report["orders"], interval_hours)}

    sheets = _delivery_summary_sheets(report)
    if sec:
        title_map = {
            "by_time": "By time interval",
            "by_driver": "By driver",
            "by_branch": "By branch",
        }
        title = title_map[sec]
        headers, data = next((s[1], s[2]) for s in sheets if s[0] == title)
        return xlsx_response(headers, data, f"delivery_summary_{sec}.xlsx")

    return xlsx_multi_sheet(sheets, "delivery_summary.xlsx")


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


ZONE_HEADERS = [
    "Rank", "Region EN", "Region AR", "Group", "Orders", "Revenue",
    "Delivery", "Digital", "Avg order",
]

MARKETING_HEADERS = [
    "Priority", "Region EN", "Region AR", "Suggestion EN", "Suggestion AR",
]


def _zone_export_row(z: dict) -> list:
    return [
        z.get("rank"), z.get("region_name_en"), z.get("region_name_ar"), z.get("group"),
        z.get("order_count"), z.get("revenue"), z.get("delivery_count"), z.get("digital_count"),
        z.get("avg_order_value"),
    ]


def _filter_zones(
    zones: list,
    region_group: Optional[str] = None,
    min_orders: Optional[int] = None,
    with_sales_only: bool = False,
) -> list:
    out = zones
    grp = (region_group or "").strip() or None
    if grp:
        out = [z for z in out if z.get("group") == grp]
    if min_orders is not None:
        out = [z for z in out if int(z.get("order_count") or 0) >= min_orders]
    if with_sales_only:
        out = [z for z in out if int(z.get("order_count") or 0) > 0]
    return out


def _filter_marketing(rows: list, priority: Optional[str] = None) -> list:
    p = (priority or "").strip() or None
    if not p:
        return rows
    return [r for r in rows if r.get("priority") == p]


def _delivery_zones_sheets(report: dict) -> list[tuple[str, list, list]]:
    zone_data = [_zone_export_row(z) for z in report.get("zones", [])]
    top_data = [_zone_export_row(z) for z in report.get("top_regions", [])]
    bottom_data = [_zone_export_row(z) for z in report.get("bottom_regions", [])]
    mkt_data = [
        [
            r.get("priority"), r.get("region_name_en"), r.get("region_name_ar"),
            r.get("reason_en"), r.get("reason_ar"),
        ]
        for r in report.get("marketing_suggestions", [])
    ]
    return [
        ("Marketing suggestions", MARKETING_HEADERS, mkt_data),
        ("Top regions", ZONE_HEADERS, top_data),
        ("Least regions", ZONE_HEADERS, bottom_data),
        ("All zones", ZONE_HEADERS, zone_data),
    ]


@router.get("/delivery-zones/export")
def export_delivery_zones(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    section: Optional[str] = None,
    region_group: Optional[str] = None,
    min_orders: Optional[int] = Query(None, ge=0),
    with_sales_only: bool = False,
    priority: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_multi_sheet, xlsx_response

    report = delivery_zones_report(request, date_from, date_to, current_user)
    valid_sections = {"marketing", "top_regions", "bottom_regions", "all_zones"}
    sec = (section or "").strip() or None
    if sec and sec not in valid_sections:
        raise HTTPException(400, "Invalid section")

    has_zone_filters = bool(region_group or min_orders is not None or with_sales_only)
    if has_zone_filters or priority:
        report = {
            **report,
            "zones": _filter_zones(
                report["zones"], region_group, min_orders, with_sales_only,
            ),
            "top_regions": _filter_zones(
                report["top_regions"], region_group, min_orders, with_sales_only,
            ),
            "bottom_regions": _filter_zones(
                report["bottom_regions"], region_group, min_orders, with_sales_only,
            ),
            "marketing_suggestions": _filter_marketing(report["marketing_suggestions"], priority),
        }

    sheets = _delivery_zones_sheets(report)
    if sec:
        title_map = {
            "marketing": "Marketing suggestions",
            "top_regions": "Top regions",
            "bottom_regions": "Least regions",
            "all_zones": "All zones",
        }
        title = title_map[sec]
        headers, data = next((s[1], s[2]) for s in sheets if s[0] == title)
        return xlsx_response(headers, data, f"delivery_zones_{sec}.xlsx")

    return xlsx_multi_sheet(sheets, "delivery_zones.xlsx")


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
              SELECT i.id, i.customer_id, i.net_total, i.discount, i.created_at
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
                     COALESCE(SUM(f.discount), 0)::float AS total_discount,
                     MIN(f.created_at) AS first_invoice_at,
                     MAX(f.created_at) AS last_invoice_at
              FROM filtered f
              GROUP BY f.customer_id
            )
            SELECT c.id AS customer_id,
                   c.code AS customer_code,
                   c.name AS customer_name,
                   c.phone,
                   c.region,
                   ca.invoice_count,
                   ca.total_spent,
                   ca.total_discount,
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
            row["total_discount"] = round(float(row.get("total_discount") or 0), 2)
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
                   c.code AS customer_code,
                   c.name AS customer_name,
                   c.phone,
                   COALESCE(ii.product_name_en, ii.product_name_ar, p.name_en, p.name_ar) AS product_name,
                   ii.barcode,
                   SUM(ii.quantity)::int AS qty,
                   SUM(ii.total)::float AS revenue,
                   COALESCE(SUM(ii.discount), 0)::float AS line_discount,
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
            GROUP BY c.id, c.code, c.name, c.phone,
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
            row["line_discount"] = round(float(row.get("line_discount") or 0), 2)
            item_rows.append(row)
    finally:
        cur.close()
        conn.close()
    return summary_rows, item_rows, df, dt


def _customer_row_export(r: dict) -> list:
    first = r.get("first_invoice_at") or ""
    last = r.get("last_invoice_at") or ""
    return [
        r.get("customer_code"), r["customer_name"], r.get("phone"), r.get("region"), r.get("buyer_tier"),
        r["invoice_count"], r["total_spent"], r.get("total_discount", 0), r["avg_order_value"],
        _fmt_display_date(first[:10] if len(first) >= 10 else first),
        _fmt_display_date(last[:10] if len(last) >= 10 else last),
        r.get("days_since_last_invoice"), r.get("avg_days_between_invoices"),
        r["total_items_qty"], r["distinct_products"],
    ]


CUSTOMER_CUST_HEADERS = [
    "Code", "Customer", "Phone", "Region", "Tier", "Invoices", "Total spent", "Total discount", "Avg order",
    "First invoice", "Last invoice", "Days since last", "Avg days between",
    "Items qty", "Distinct products",
]

CUSTOMER_ITEM_HEADERS = [
    "Code", "Customer", "Phone", "Product", "Barcode", "Qty", "Revenue", "Line discount",
    "Purchase count", "Last purchased",
]


def _build_customer_analysis_report(summary: list, items: list, df: date, dt: date) -> dict:
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


def _apply_customer_analysis_filters(
    report: dict,
    section: Optional[str],
    buyer_tier: Optional[str],
    region: Optional[str],
    customer_id: Optional[int],
    section_date_from: Optional[str],
    section_date_to: Optional[str],
    invoice_date_on: Optional[str] = "last",
) -> dict:
    bt = (buyer_tier or "").strip() or None
    reg = (region or "").strip() or None
    cid = customer_id
    sdf = (section_date_from or "").strip() or None
    sdt = (section_date_to or "").strip() or None
    date_field = "first_invoice_at" if (invoice_date_on or "last") == "first" else "last_invoice_at"

    customers = report["customers"]
    if bt:
        customers = [r for r in customers if r.get("buyer_tier") == bt]
    if reg:
        customers = [r for r in customers if (r.get("region") or "").lower() == reg.lower()]
    if cid is not None:
        customers = [r for r in customers if r.get("customer_id") == cid]
    if sdf or sdt:
        customers = [r for r in customers if _in_date_range(r.get(date_field), sdf, sdt)]

    top_buyers = [r for r in customers if r["buyer_tier"] == "high"][:10]
    low_buyers = sorted(
        [r for r in customers if r["buyer_tier"] == "low"],
        key=lambda x: (x["total_spent"], x["invoice_count"]),
    )[:10]

    items = report["items"]
    if cid is not None:
        items = [r for r in items if r.get("customer_id") == cid]
    if reg:
        allowed = {r["customer_id"] for r in customers}
        items = [r for r in items if r.get("customer_id") in allowed]
    if sdf or sdt:
        items = [r for r in items if _in_date_range(r.get("last_purchased_at"), sdf, sdt)]

    out = {
        **report,
        "customers": customers,
        "top_buyers": top_buyers,
        "low_buyers": low_buyers,
        "items": items,
    }
    if section == "top_buyers":
        return {"top_buyers": top_buyers, "_section": section}
    if section == "low_buyers":
        return {"low_buyers": low_buyers, "_section": section}
    if section == "all_customers":
        return {"customers": customers, "_section": section}
    if section == "items":
        return {"items": items, "_section": section}
    return out


def _customer_analysis_sheets(report: dict) -> list[tuple[str, list, list]]:
    cust_data = [_customer_row_export(r) for r in report.get("customers", [])]
    top_data = [_customer_row_export(r) for r in report.get("top_buyers", [])]
    low_data = [_customer_row_export(r) for r in report.get("low_buyers", [])]
    item_data = [
        [
            r.get("customer_code"), r["customer_name"], r.get("phone"), r.get("product_name"), r.get("barcode"),
            r["qty"], r["revenue"], r.get("line_discount", 0), r["purchase_count"],
            _fmt_display_date(r.get("last_purchased_at")),
        ]
        for r in report.get("items", [])
    ]
    return [
        ("Top buyers", CUSTOMER_CUST_HEADERS, top_data),
        ("Low buyers", CUSTOMER_CUST_HEADERS, low_data),
        ("All customers", CUSTOMER_CUST_HEADERS, cust_data),
        ("Items purchased", CUSTOMER_ITEM_HEADERS, item_data),
    ]


@router.get("/customer-analysis")
def customer_analysis(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    summary, items, df, dt = _customer_analysis_data(request, date_from, date_to, current_user)
    return _build_customer_analysis_report(summary, items, df, dt)


@router.get("/customer-analysis/export")
def export_customer_analysis(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    section: Optional[str] = None,
    buyer_tier: Optional[str] = None,
    region: Optional[str] = None,
    customer_id: Optional[int] = None,
    section_date_from: Optional[str] = None,
    section_date_to: Optional[str] = None,
    invoice_date_on: Optional[str] = Query("last"),
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_multi_sheet, xlsx_response

    summary, items, df, dt = _customer_analysis_data(request, date_from, date_to, current_user)
    report = _build_customer_analysis_report(summary, items, df, dt)
    valid_sections = {"top_buyers", "low_buyers", "all_customers", "items"}
    sec = (section or "").strip() or None
    if sec and sec not in valid_sections:
        raise HTTPException(400, "Invalid section")

    filtered = _apply_customer_analysis_filters(
        report, sec, buyer_tier, region, customer_id,
        section_date_from, section_date_to, invoice_date_on,
    )
    sheets = _customer_analysis_sheets(filtered if sec else report)
    if sec:
        title_map = {
            "top_buyers": "Top buyers",
            "low_buyers": "Low buyers",
            "all_customers": "All customers",
            "items": "Items purchased",
        }
        title = title_map[sec]
        headers, data = next((s[1], s[2]) for s in sheets if s[0] == title)
        return xlsx_response(headers, data, f"customer_analysis_{sec}.xlsx")
    return xlsx_multi_sheet(
        [(s[0], s[1], s[2]) for s in sheets],
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
                   COALESCE(SUM(i.discount), 0)::float AS total_discount,
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
            r["total_discount"] = round(float(r.get("total_discount") or 0), 2)

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
                   ii.discount::float AS line_discount,
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
            row["line_discount"] = round(float(row.get("line_discount") or 0), 2)
            row["line_total"] = round(float(row.get("line_total") or 0), 2)
            line_items.append(row)
    finally:
        cur.close()
        conn.close()

    total_revenue = round(sum(r["revenue"] for r in by_sale_type), 2)
    total_invoices = sum(r["invoice_count"] for r in by_sale_type)
    total_items_qty = sum(r["items_qty"] for r in by_sale_type)
    total_discount = round(sum(r.get("total_discount", 0) for r in by_sale_type), 2)

    report = {
        "date_from": str(df),
        "date_to": str(dt),
        "summary": {
            "invoice_count": total_invoices,
            "total_revenue": total_revenue,
            "total_discount": total_discount,
            "items_qty": total_items_qty,
        },
        "by_sale_type": by_sale_type,
        "by_seller": by_seller,
        "by_terminal": by_terminal,
        "invoices": invoices,
        "line_items": line_items,
    }
    return report, df, dt


def _row_date_part(created_at) -> str:
    if not created_at:
        return ""
    if hasattr(created_at, "isoformat"):
        return created_at.date().isoformat()
    return str(created_at)[:10]


def _in_date_range(created_at, date_from: Optional[str], date_to: Optional[str]) -> bool:
    if not date_from and not date_to:
        return True
    d = _row_date_part(created_at)
    if not d:
        return False
    if date_from and d < date_from:
        return False
    if date_to and d > date_to:
        return False
    return True


def _apply_sales_report_filters(
    report: dict,
    section: Optional[str],
    sale_type: Optional[str],
    payment_method: Optional[str],
    seller_id: Optional[int],
    branch_id: Optional[int],
    section_date_from: Optional[str],
    section_date_to: Optional[str],
) -> dict:
    """Return a copy of report sections with optional filters applied."""
    out = {**report}
    st = (sale_type or "").strip() or None
    pm = (payment_method or "").strip() or None
    sid = seller_id
    bid = branch_id
    sdf = (section_date_from or "").strip() or None
    sdt = (section_date_to or "").strip() or None

    by_type = report["by_sale_type"]
    if st:
        by_type = [r for r in by_type if r.get("sale_type") == st]
    if pm:
        by_type = [r for r in by_type if r.get("payment_method") == pm]
    out["by_sale_type"] = by_type

    by_seller = report["by_seller"]
    if sid is not None:
        by_seller = [r for r in by_seller if r.get("seller_id") == sid]
    if st:
        by_seller = [r for r in by_seller if (
            (st == "cash" and r.get("cash_count", 0) > 0)
            or (st == "delivery" and r.get("delivery_count", 0) > 0)
            or (st == "digital" and r.get("digital_count", 0) > 0)
        )]
    out["by_seller"] = by_seller

    by_terminal = report["by_terminal"]
    if bid is not None:
        by_terminal = [r for r in by_terminal if r.get("branch_id") == bid]
    out["by_terminal"] = by_terminal

    invoices = report["invoices"]
    if st:
        invoices = [r for r in invoices if r.get("sale_type") == st]
    if pm:
        invoices = [r for r in invoices if r.get("payment_method") == pm]
    if sid is not None:
        invoices = [r for r in invoices if r.get("seller_id") == sid]
    if bid is not None:
        invoices = [r for r in invoices if r.get("branch_id") == bid]
    if sdf or sdt:
        invoices = [r for r in invoices if _in_date_range(r.get("created_at"), sdf, sdt)]
    out["invoices"] = invoices

    allowed_invoices = {r["invoice_number"] for r in invoices}
    invoice_level_filter = bool(st or pm or sid is not None or bid is not None or sdf or sdt)

    line_items = report["line_items"]
    if st:
        line_items = [r for r in line_items if r.get("sale_type") == st]
    if pm:
        line_items = [r for r in line_items if r.get("payment_method") == pm]
    if sdf or sdt:
        line_items = [r for r in line_items if _in_date_range(r.get("created_at"), sdf, sdt)]
    if invoice_level_filter:
        line_items = [r for r in line_items if r.get("invoice_number") in allowed_invoices]
    out["line_items"] = line_items

    if section == "by_sale_type":
        return {k: out[k] for k in ("by_sale_type",) if k in out} | {"_section": section}
    if section == "by_seller":
        return {k: out[k] for k in ("by_seller",) if k in out} | {"_section": section}
    if section == "by_terminal":
        return {k: out[k] for k in ("by_terminal",) if k in out} | {"_section": section}
    if section == "invoices":
        return {k: out[k] for k in ("invoices",) if k in out} | {"_section": section}
    if section == "line_items":
        return {k: out[k] for k in ("line_items",) if k in out} | {"_section": section}
    return out


def _sales_report_sheet_data(report: dict) -> list[tuple[str, list, list]]:
    type_headers = ["Sale type", "Payment", "Invoices", "Revenue", "Discount", "Items qty"]
    type_data = [
        [r["sale_type"], r["payment_method"], r["invoice_count"], r["revenue"], r.get("total_discount", 0), r["items_qty"]]
        for r in report.get("by_sale_type", [])
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
        for r in report.get("by_seller", [])
    ]
    term_headers = ["Terminal (branch) EN", "Terminal (branch) AR", "Invoices", "Revenue", "Items qty"]
    term_data = [
        [r["branch_name_en"], r["branch_name_ar"], r["invoice_count"], r["revenue"], r["items_qty"]]
        for r in report.get("by_terminal", [])
    ]
    inv_headers = [
        "Invoice #", "Date", "Time", "Sale type", "Payment", "Digital platform",
        "Subtotal", "Discount", "Net total", "Seller EN", "Seller AR",
        "Terminal EN", "Terminal AR", "Customer", "Items qty",
    ]
    inv_data = []
    for r in report.get("invoices", []):
        created = r.get("created_at") or ""
        date_part = _fmt_display_date(created)
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
        "Seller EN", "Terminal EN", "Product", "Barcode", "Qty", "Unit price", "Line discount", "Line total",
    ]
    item_data = []
    for r in report.get("line_items", []):
        created = r.get("created_at") or ""
        date_part = _fmt_display_date(created)
        time_part = created[11:19] if len(created) >= 19 else ""
        item_data.append([
            r["invoice_number"], date_part, time_part,
            r["sale_type"], r["payment_method"],
            r.get("seller_name_en"), r.get("branch_name_en"),
            r.get("product_name"), r.get("barcode"),
            r["qty"], r["unit_price"], r.get("line_discount", 0), r["line_total"],
        ])
    return [
        ("By sale type", type_headers, type_data),
        ("By salesperson", seller_headers, seller_data),
        ("By terminal", term_headers, term_data),
        ("Invoices", inv_headers, inv_data),
        ("Line items", item_headers, item_data),
    ]


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
    section: Optional[str] = None,
    sale_type: Optional[str] = None,
    payment_method: Optional[str] = None,
    seller_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    section_date_from: Optional[str] = None,
    section_date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_multi_sheet, xlsx_response

    report, _, _ = _sales_report_data(request, date_from, date_to, current_user)
    valid_sections = {"by_sale_type", "by_seller", "by_terminal", "invoices", "line_items"}
    sec = (section or "").strip() or None
    if sec and sec not in valid_sections:
        raise HTTPException(400, "Invalid section")

    filtered = _apply_sales_report_filters(
        report, sec, sale_type, payment_method, seller_id, branch_id,
        section_date_from, section_date_to,
    )
    sheets = _sales_report_sheet_data(filtered)
    if sec:
        title, headers, data = next(s for s in sheets if {
            "by_sale_type": "By sale type",
            "by_seller": "By salesperson",
            "by_terminal": "By terminal",
            "invoices": "Invoices",
            "line_items": "Line items",
        }[sec] == s[0])
        fname = f"sales_report_{sec}.xlsx"
        return xlsx_response(headers, data, fname)
    return xlsx_multi_sheet(sheets, "sales_report.xlsx")
