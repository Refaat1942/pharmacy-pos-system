from datetime import date
from db import get_connection


def get_today_sales():
    db = get_connection()
    cur = db.cursor()

    cur.execute("""
        SELECT ISNULL(SUM(NetAmount), 0)
        FROM Invoices
        WHERE CAST(InvoiceDate AS DATE) = CAST(GETDATE() AS DATE)
    """)

    total = cur.fetchone()[0]
    db.close()

    return {
        "date": str(date.today()),
        "total_sales": float(total)
    }


def get_sales_by_date(date_from, date_to):
    db = get_connection()
    cur = db.cursor()

    cur.execute("""
        SELECT 
            CAST(InvoiceDate AS DATE) AS invoice_date,
            SUM(NetAmount) AS total
        FROM Invoices
        WHERE CAST(InvoiceDate AS DATE)
              BETWEEN ? AND ?
        GROUP BY CAST(InvoiceDate AS DATE)
        ORDER BY CAST(InvoiceDate AS DATE)
    """, date_from, date_to)

    rows = cur.fetchall()
    db.close()

    days = [{
        "date": str(r.invoice_date),
        "total": float(r.total)
    } for r in rows]

    return {
        "from": str(date_from),
        "to": str(date_to),
        "days_count": len(days),
        "grand_total": sum(d["total"] for d in days),
        "days": days
    }


def get_dashboard_summary():
    db = get_connection()
    cur = db.cursor()

    cur.execute("""
        SELECT ISNULL(SUM(NetAmount), 0)
        FROM Invoices
        WHERE CAST(InvoiceDate AS DATE) = CAST(GETDATE() AS DATE)
    """)
    today_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM Invoices
        WHERE CAST(InvoiceDate AS DATE) = CAST(GETDATE() AS DATE)
    """)
    invoice_count = cur.fetchone()[0]

    db.close()

    return {
        "date": str(date.today()),
        "today_sales": float(today_sales),
        "invoice_count": invoice_count,
        "returns_total": 0.0,
        "net_sales": float(today_sales)
    }


def get_sales_last_7_days():
    db = get_connection()
    cur = db.cursor()

    cur.execute("""
        SELECT 
            CAST(InvoiceDate AS DATE),
            ISNULL(SUM(NetAmount), 0)
        FROM Invoices
        WHERE InvoiceDate >= DATEADD(DAY, -6, CAST(GETDATE() AS DATE))
        GROUP BY CAST(InvoiceDate AS DATE)
        ORDER BY CAST(InvoiceDate AS DATE)
    """)

    rows = cur.fetchall()
    db.close()

    return [
        {"date": str(r[0]), "total": float(r[1])}
        for r in rows
    ]
