from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import date

from repositories.sales_repo import (
    get_today_sales,
    get_sales_by_date,
    get_dashboard_summary,
    get_sales_last_7_days
)

app = FastAPI(title="Pharmacy POS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# Health Check
# ==============================
@app.get("/")
def root():
    return {"status": "Backend running safely"}

# ==============================
# Sales Today
# ==============================
@app.get("/sales/today")
def sales_today():
    return get_today_sales()

# ==============================
# Sales By Date
# ==============================
@app.get("/sales/by-date")
def sales_by_date(
    date_from: date = Query(...),
    date_to: date = Query(...)
):
    return get_sales_by_date(date_from, date_to)

# ==============================
# Dashboard Summary
# ==============================
@app.get("/dashboard/summary")
def dashboard_summary():
    return get_dashboard_summary()

# ==============================
# Sales Last 7 Days
# ==============================
@app.get("/dashboard/sales-last-7-days")
def sales_last_7_days():
    return get_sales_last_7_days()
