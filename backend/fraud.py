"""Fraud surveillance — flag abnormal sales and returns for admin review."""
from datetime import date, datetime
from typing import Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from db import get_db_connection
from deps import get_current_user, resolve_analytics_branch

router = APIRouter(prefix="/api/fraud", tags=["fraud"])

HIGH_DISCOUNT_PCT = 25.0
HIGH_DISCOUNT_AMOUNT = 500.0
HIGH_RETURN_PCT = 20.0
LARGE_SALE_AMOUNT = 5000.0
LARGE_RETURN_AMOUNT = 1000.0


def _admin_only(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(403, "Fraud surveillance requires admin role")


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


def _branch_filter(user, active_branch_id: Optional[int]) -> tuple[str, list]:
    if user.get("role") == "admin":
        if active_branch_id:
            return " AND {alias}branch_id = %s", [active_branch_id]
        return "", []
    return " AND {alias}branch_id = %s", [user.get("branch_id")]


def _alert(
    *,
    alert_type: str,
    severity: str,
    branch_id: Optional[int],
    branch_name_en: Optional[str],
    branch_name_ar: Optional[str],
    seller_id: Optional[int],
    seller_name_en: Optional[str],
    seller_name_ar: Optional[str],
    reference: str,
    amount: float,
    detail: str,
    occurred_at,
) -> dict:
    return {
        "alert_type": alert_type,
        "severity": severity,
        "branch_id": branch_id,
        "branch_name_en": branch_name_en,
        "branch_name_ar": branch_name_ar,
        "seller_id": seller_id,
        "seller_name_en": seller_name_en,
        "seller_name_ar": seller_name_ar,
        "reference": reference,
        "amount": round(float(amount or 0), 2),
        "detail": detail,
        "occurred_at": occurred_at.isoformat() if hasattr(occurred_at, "isoformat") else str(occurred_at),
    }


@router.get("/alerts")
def fraud_alerts(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    min_severity: Optional[str] = Query(None, pattern="^(low|medium|high)$"),
    current_user: dict = Depends(get_current_user),
):
    _admin_only(current_user)
    active_branch_id = resolve_analytics_branch(request, current_user)
    df, dt = _date_range(date_from, date_to)
    bf_i, bp_i = _branch_filter(current_user, active_branch_id)
    bf_i = bf_i.format(alias="i.")
    bf_r, bp_r = _branch_filter(current_user, active_branch_id)
    bf_r = bf_r.format(alias="r.")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    alerts: list[dict] = []
    try:
        # High discount sales
        cur.execute(
            f"""
            SELECT i.id, i.invoice_number, i.subtotal, i.discount, i.net_total, i.created_at,
                   i.branch_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   i.seller_id, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar
            FROM invoices i
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN users u ON u.id = i.seller_id
            WHERE i.status = 'completed'
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              AND i.discount > 0
              AND (
                (i.subtotal > 0 AND i.discount / i.subtotal * 100 >= %s)
                OR i.discount >= %s
              )
              {bf_i}
            ORDER BY i.discount DESC
            LIMIT 200
            """,
            [df, dt, HIGH_DISCOUNT_PCT, HIGH_DISCOUNT_AMOUNT] + bp_i,
        )
        for r in cur.fetchall():
            sub = float(r["subtotal"] or 0)
            disc = float(r["discount"] or 0)
            pct = round(disc / sub * 100, 1) if sub > 0 else 0
            sev = "high" if pct >= 40 or disc >= 1000 else "medium"
            alerts.append(_alert(
                alert_type="high_discount",
                severity=sev,
                branch_id=r["branch_id"],
                branch_name_en=r["branch_name_en"],
                branch_name_ar=r["branch_name_ar"],
                seller_id=r["seller_id"],
                seller_name_en=r["seller_name_en"],
                seller_name_ar=r["seller_name_ar"],
                reference=r["invoice_number"],
                amount=disc,
                detail=f"Discount {disc:.2f} LE ({pct}% of subtotal) on sale {r['invoice_number']}",
                occurred_at=r["created_at"],
            ))

        # Large cash sales
        cur.execute(
            f"""
            SELECT i.id, i.invoice_number, i.net_total, i.created_at,
                   i.branch_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   i.seller_id, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                   i.customer_id
            FROM invoices i
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN users u ON u.id = i.seller_id
            WHERE i.status = 'completed'
              AND i.type = 'cash'
              AND i.net_total >= %s
              AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
              {bf_i}
            ORDER BY i.net_total DESC
            LIMIT 100
            """,
            [LARGE_SALE_AMOUNT, df, dt] + bp_i,
        )
        for r in cur.fetchall():
            alerts.append(_alert(
                alert_type="large_sale",
                severity="medium",
                branch_id=r["branch_id"],
                branch_name_en=r["branch_name_en"],
                branch_name_ar=r["branch_name_ar"],
                seller_id=r["seller_id"],
                seller_name_en=r["seller_name_en"],
                seller_name_ar=r["seller_name_ar"],
                reference=r["invoice_number"],
                amount=float(r["net_total"] or 0),
                detail=f"Large cash sale {r['invoice_number']} — {float(r['net_total']):.2f} LE"
                       + (" (no registered customer)" if not r.get("customer_id") else ""),
                occurred_at=r["created_at"],
            ))

        # Same-day returns on original sale
        cur.execute(
            f"""
            SELECT r.id, r.return_invoice_number, r.total_returned, r.created_at, r.reason,
                   r.branch_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   r.seller_id, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                   i.invoice_number AS original_invoice, i.net_total AS original_total,
                   i.created_at AS sale_date
            FROM returns r
            JOIN invoices i ON i.id = r.original_invoice_id
            LEFT JOIN branches b ON b.id = r.branch_id
            LEFT JOIN users u ON u.id = r.seller_id
            WHERE r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
              AND DATE(r.created_at) = DATE(i.created_at)
              {bf_r}
            ORDER BY r.total_returned DESC
            LIMIT 150
            """,
            [df, dt] + bp_r,
        )
        for r in cur.fetchall():
            amt = float(r["total_returned"] or 0)
            sev = "high" if amt >= LARGE_RETURN_AMOUNT else "medium"
            alerts.append(_alert(
                alert_type="same_day_return",
                severity=sev,
                branch_id=r["branch_id"],
                branch_name_en=r["branch_name_en"],
                branch_name_ar=r["branch_name_ar"],
                seller_id=r["seller_id"],
                seller_name_en=r["seller_name_en"],
                seller_name_ar=r["seller_name_ar"],
                reference=r["return_invoice_number"],
                amount=amt,
                detail=(
                    f"Return {r['return_invoice_number']} on same day as sale {r['original_invoice']} "
                    f"({amt:.2f} LE). Reason: {r.get('reason') or '—'}"
                ),
                occurred_at=r["created_at"],
            ))

        # Sellers with high return ratio
        cur.execute(
            f"""
            WITH sales AS (
              SELECT i.seller_id, i.branch_id,
                     COALESCE(SUM(i.net_total), 0)::float AS revenue
              FROM invoices i
              WHERE i.status = 'completed' AND i.seller_id IS NOT NULL
                AND i.created_at >= %s::date AND i.created_at < (%s::date + INTERVAL '1 day')
                {bf_i}
              GROUP BY i.seller_id, i.branch_id
            ),
            rets AS (
              SELECT r.seller_id, r.branch_id,
                     COALESCE(SUM(r.total_returned), 0)::float AS returned,
                     COUNT(*)::int AS return_count
              FROM returns r
              WHERE r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
                {bf_r}
              GROUP BY r.seller_id, r.branch_id
            )
            SELECT s.seller_id, s.branch_id, s.revenue, COALESCE(r.returned, 0) AS returned,
                   COALESCE(r.return_count, 0) AS return_count,
                   u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM sales s
            JOIN rets r ON r.seller_id = s.seller_id AND r.branch_id = s.branch_id
            LEFT JOIN users u ON u.id = s.seller_id
            LEFT JOIN branches b ON b.id = s.branch_id
            WHERE s.revenue > 0 AND r.returned / s.revenue * 100 >= %s
            ORDER BY r.returned / s.revenue DESC
            LIMIT 50
            """,
            [df, dt] + bp_i + [df, dt] + bp_r + [HIGH_RETURN_PCT],
        )
        for r in cur.fetchall():
            rev = float(r["revenue"] or 0)
            ret = float(r["returned"] or 0)
            pct = round(ret / rev * 100, 1) if rev > 0 else 0
            alerts.append(_alert(
                alert_type="high_return_ratio",
                severity="high" if pct >= 35 else "medium",
                branch_id=r["branch_id"],
                branch_name_en=r["branch_name_en"],
                branch_name_ar=r["branch_name_ar"],
                seller_id=r["seller_id"],
                seller_name_en=r["seller_name_en"],
                seller_name_ar=r["seller_name_ar"],
                reference=f"Seller #{r['seller_id']}",
                amount=ret,
                detail=(
                    f"Seller return ratio {pct}% — {ret:.2f} LE returned vs {rev:.2f} LE sold "
                    f"({r['return_count']} returns)"
                ),
                occurred_at=dt,
            ))

        # Large single returns
        cur.execute(
            f"""
            SELECT r.id, r.return_invoice_number, r.total_returned, r.created_at, r.reason,
                   r.branch_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   r.seller_id, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                   i.invoice_number AS original_invoice
            FROM returns r
            JOIN invoices i ON i.id = r.original_invoice_id
            LEFT JOIN branches b ON b.id = r.branch_id
            LEFT JOIN users u ON u.id = r.seller_id
            WHERE r.total_returned >= %s
              AND r.created_at >= %s::date AND r.created_at < (%s::date + INTERVAL '1 day')
              {bf_r}
            ORDER BY r.total_returned DESC
            LIMIT 100
            """,
            [LARGE_RETURN_AMOUNT, df, dt] + bp_r,
        )
        for r in cur.fetchall():
            alerts.append(_alert(
                alert_type="large_return",
                severity="high",
                branch_id=r["branch_id"],
                branch_name_en=r["branch_name_en"],
                branch_name_ar=r["branch_name_ar"],
                seller_id=r["seller_id"],
                seller_name_en=r["seller_name_en"],
                seller_name_ar=r["seller_name_ar"],
                reference=r["return_invoice_number"],
                amount=float(r["total_returned"] or 0),
                detail=(
                    f"Large return {r['return_invoice_number']} ({float(r['total_returned']):.2f} LE) "
                    f"on invoice {r['original_invoice']}. Reason: {r.get('reason') or '—'}"
                ),
                occurred_at=r["created_at"],
            ))
    finally:
        cur.close()
        conn.close()

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: a.get("occurred_at") or "", reverse=True)
    alerts.sort(key=lambda a: severity_rank.get(a["severity"], 9))

    if min_severity:
        cutoff = severity_rank[min_severity]
        alerts = [a for a in alerts if severity_rank.get(a["severity"], 9) <= cutoff]

    return {
        "date_from": str(df),
        "date_to": str(dt),
        "count": len(alerts),
        "summary": {
            "high": sum(1 for a in alerts if a["severity"] == "high"),
            "medium": sum(1 for a in alerts if a["severity"] == "medium"),
            "low": sum(1 for a in alerts if a["severity"] == "low"),
        },
        "alerts": alerts,
    }


@router.get("/alerts/export")
def export_fraud_alerts(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from excel_utils import xlsx_response

    data = fraud_alerts(request, date_from, date_to, current_user=current_user)
    headers = [
        "Severity", "Type", "Branch", "Seller EN", "Reference", "Amount",
        "Detail", "Occurred at",
    ]
    rows = [
        [
            a["severity"], a["alert_type"], a.get("branch_name_en"),
            a.get("seller_name_en"), a["reference"], a["amount"],
            a["detail"], a["occurred_at"],
        ]
        for a in data["alerts"]
    ]
    return xlsx_response(headers, rows, "fraud_alerts.xlsx")
