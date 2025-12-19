from fastapi import FastAPI, Query
from datetime import date
from db import get_connection

# ==============================
#   Create FastAPI App
# ==============================
app = FastAPI(title="Pharmacy POS Backend")

# ==============================
#   Root (Health Check)
# ==============================
@app.get("/")
def root():
    return {"status": "Backend running safely"}

# ==============================
#   Sales Today
# ==============================
@app.get("/sales/today")
def sales_today():
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

# ==============================
#   Sales By Date Range
# ==============================
@app.get("/sales/by-date")
def sales_by_date(
    date_from: date = Query(..., description="Start date YYYY-MM-DD"),
    date_to: date = Query(..., description="End date YYYY-MM-DD")
):
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

    days = []
    for r in rows:
        days.append({
            "date": str(r.invoice_date),
            "total": float(r.total)
        })

    # إجمالي الفترة كلها
    grand_total = sum(d["total"] for d in days)

    return {
        "from": str(date_from),
        "to": str(date_to),
        "days_count": len(days),
        "grand_total": grand_total,
        "days": days
    }
