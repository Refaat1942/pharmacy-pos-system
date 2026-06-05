"""Sales blueprint content for the Control Platform (customer sign-off & demo videos)."""
from __future__ import annotations

import platform_db


BLUEPRINT_META = {
    "title": "Fratelanza Pharmacy ERP",
    "subtitle": "Product Blueprint & Feature Overview",
    "tagline": "Bilingual cloud POS and ERP built for Egyptian pharmacies.",
    "version": "2026",
}

BLUEPRINT_SECTIONS = [
    {
        "id": "overview",
        "title": "1. What you get",
        "summary": "A complete pharmacy management system — hosted securely in the cloud with your own private database.",
        "bullets": [
            "English & Arabic interface with RTL support",
            "Works on PC, tablet, and phone browser — no extra POS hardware required",
            "Each pharmacy gets an isolated database (your data never mixes with others)",
            "Role-based access: admin, cashier, inventory, HR, and more",
            "Receipt printing (58mm / 80mm / A4) with your logo and branding",
        ],
        "video_hook": "Open with the problem: scattered Excel sheets, lost stock, no visibility — then show one login to everything.",
    },
    {
        "id": "pos",
        "title": "2. Point of Sale (POS)",
        "summary": "Fast checkout designed for busy pharmacy counters.",
        "bullets": [
            "Barcode scan or search by name / international barcode",
            "Sell by box or sub-unit (strip, tablet) with correct stock deduction",
            "Cash, Visa, mixed payment, on-account, and digital platform sales (Talabat, etc.)",
            "Line and invoice discounts; delivery orders with driver assignment",
            "Load clinic prescriptions straight into the cart",
            "Customizable receipts: logo, tax ID, seller name, barcode for reprint lookup",
        ],
        "feature_keys": ["pos"],
        "video_hook": "Demo a 30-second sale: scan → discount → pay → print receipt.",
    },
    {
        "id": "sales",
        "title": "3. Sales history & returns",
        "summary": "Full audit trail of every transaction.",
        "bullets": [
            "Search and filter sales by date, branch, seller, payment type",
            "Reprint any receipt; view invoice detail",
            "Returns linked to original invoice — correct refund and restock every time",
            "Delivery queue: pending → out for delivery → delivered",
        ],
        "feature_keys": ["sales", "returns"],
        "video_hook": "Show finding yesterday's invoice and processing a partial return.",
    },
    {
        "id": "inventory",
        "title": "4. Inventory & stock control",
        "summary": "Know what you have, where it is, and when it expires.",
        "bullets": [
            "Product catalog with cost, price, min stock alerts",
            "Bulk Excel upload for fast setup and price updates",
            "Stock take with variance report (shortages / increases)",
            "Multiple expiry batches per product",
            "Barcode designer & bulk barcode label printing",
            "Stock movement audit log for every in/out",
        ],
        "feature_keys": ["inventory", "expiry"],
        "video_hook": "Upload 100 products from Excel, then run a stock take.",
    },
    {
        "id": "purchases",
        "title": "5. Purchases & suppliers",
        "summary": "Record incoming goods and track supplier balances.",
        "bullets": [
            "Supplier directory with opening balances",
            "Purchase orders with discounts, VAT, and public price",
            "Receive stock into branch inventory on approval",
            "Supplier payment history",
        ],
        "feature_keys": ["purchases", "suppliers"],
        "video_hook": "Create a PO, receive goods, show stock increased automatically.",
    },
    {
        "id": "customers",
        "title": "6. Customers & on-account",
        "summary": "Manage credit customers and corporate accounts.",
        "bullets": [
            "Customer profiles with credit limits and branch authorization",
            "On-account sales with running balance and statement",
            "Payment recording against outstanding invoices",
            "Bulk customer upload",
        ],
        "feature_keys": ["customers"],
        "video_hook": "Sell on account, then show the customer statement and payment.",
    },
    {
        "id": "branches",
        "title": "7. Multi-branch operations",
        "summary": "For pharmacy chains with more than one location.",
        "bullets": [
            "Separate stock per branch; central overview of all branches",
            "Stock transfers: send → in transit → receive with print slip",
            "Per-branch users and permissions",
            "Compare stock levels across branches",
        ],
        "feature_keys": ["transfers", "branches_stock"],
        "video_hook": "Transfer stock from main branch to satellite — show both sides.",
    },
    {
        "id": "shifts",
        "title": "8. Cash drawer & shifts",
        "summary": "End-of-day control for cashiers.",
        "bullets": [
            "Open / close shift with opening float",
            "Morning / evening / night shift types",
            "X report while open; Z report on close",
            "Cash & Visa counted totals with variance",
            "Block close if delivery orders still pending",
        ],
        "feature_keys": ["shifts"],
        "video_hook": "Close a shift — show expected vs counted cash and visa.",
    },
    {
        "id": "clinics",
        "title": "9. Clinics & prescriptions",
        "summary": "Partner clinics send prescriptions digitally.",
        "bullets": [
            "Register contracted clinics with a private portal link",
            "Doctor submits prescription online; cashier loads it in POS",
            "Track pending vs handled prescriptions",
        ],
        "feature_keys": ["clinics"],
        "video_hook": "Show clinic portal on phone → prescription appears in POS.",
    },
    {
        "id": "reports",
        "title": "10. Reports & business intelligence",
        "summary": "Decisions backed by real numbers.",
        "bullets": [
            "Dashboard KPIs: sales, top items, low stock",
            "Sales by item, seller, branch, payment method — with Excel export",
            "Delivery summary, customer analysis, stock velocity",
            "Fraud surveillance: unusual discounts and void patterns",
            "Smart stock reallocation suggestions between branches",
        ],
        "feature_keys": ["dashboard", "reports", "fraud_surveillance", "stock_reallocation"],
        "video_hook": "Open Reports — filter last month sales by branch, export Excel.",
    },
    {
        "id": "hr",
        "title": "11. HR & payroll (optional)",
        "summary": "Employees, attendance, and payslips in the same system.",
        "bullets": [
            "Employee records linked to POS login users",
            "QR / barcode clock-in for attendance",
            "Salary slips with allowances and deductions — printable",
            "HR permissions separate from POS roles",
        ],
        "feature_keys": ["hr"],
        "video_hook": "Scan employee card at clock terminal, preview payslip.",
    },
    {
        "id": "platform",
        "title": "12. Hosting, support & updates",
        "summary": "We run the servers; you run the pharmacy.",
        "bullets": [
            "Secure HTTPS access at your pharmacy code (e.g. dms.erp.fratelanza.com)",
            "Automatic schema updates — new features without reinstalling",
            "Daily backups; data isolated per pharmacy",
            "Training and onboarding support available",
        ],
        "video_hook": "Close with trust: isolated data, Egyptian pounds, local support.",
    },
]

VIDEO_SCRIPT = [
    {"time": "0:00–0:30", "scene": "Hook", "script": "Pharmacy owners lose money when stock, sales, and accounts live in different places. Fratelanza ERP puts POS, inventory, purchases, and reports in one bilingual system."},
    {"time": "0:30–1:30", "scene": "POS sale", "script": "Log in, scan barcodes, apply a discount, take cash and visa, print receipt. Show box vs strip sale if relevant."},
    {"time": "1:30–2:30", "scene": "Inventory", "script": "Show product list, low-stock alert, expiry view, and bulk upload from Excel."},
    {"time": "2:30–3:15", "scene": "Purchases", "script": "Receive a supplier delivery — stock updates instantly."},
    {"time": "3:15–4:00", "scene": "Customer account", "script": "On-account sale and customer statement with payment."},
    {"time": "4:00–4:45", "scene": "Shift close", "script": "Cashier closes shift — cash and visa variance on screen."},
    {"time": "4:45–5:30", "scene": "Reports", "script": "Dashboard and one Excel export — sales by item or seller."},
    {"time": "5:30–6:00", "scene": "Call to action", "script": "Your pharmacy gets its own private system. Contact Fratelanza for a demo and plan that fits your branches and team."},
]


def get_blueprint() -> dict:
    plans = platform_db.list_plans()
    features = platform_db.FEATURES_CATALOG
    return {
        "meta": BLUEPRINT_META,
        "sections": BLUEPRINT_SECTIONS,
        "video_script": VIDEO_SCRIPT,
        "plans": plans,
        "features": features,
    }
