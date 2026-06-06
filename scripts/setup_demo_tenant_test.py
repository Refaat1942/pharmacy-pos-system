#!/usr/bin/env python3
"""Provision and seed the 'test' demo tenant for customer video recording."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from auth import hash_password
import platform_db
from db import get_db_connection
import psycopg2.extras

SLUG = "test"
ADMIN_USER = "admin"
ADMIN_PASS = "test123"


def seed_tenant_schema():
    conn = get_db_connection(f"tenant_{SLUG}")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM branches LIMIT 1")
    branch_id = cur.fetchone()["id"]

    cur.execute(
        """
        UPDATE pharmacy_profile SET
            name_ar = 'test',
            name_en = 'test',
            receipt_language = 'ar',
            receipt_paper = '80mm',
            phone = '01000000000',
            address_ar = 'القاهرة، مصر',
            address_en = 'Cairo, Egypt'
        WHERE id = 1
        """
    )

    users = [
        ("pharmacist1", hash_password("pharm123"), "د. أحمد", "Dr. Ahmed", "pharmacist"),
        ("cashier1", hash_password("cash123"), "محمد علي", "Mohamed Ali", "cashier"),
    ]
    for u in users:
        cur.execute(
            """
            INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (username) DO NOTHING
            """,
            (*u, branch_id),
        )

    products = [
        ("6223001001", "باراسيتامول 500 مجم", "Paracetamol 500mg", "Analgesics", "strip", 5.00, 3.00, 120, 20, "2026-06-30"),
        ("6223001002", "أموكسيسيلين 250 مجم", "Amoxicillin 250mg", "Antibiotics", "box", 25.00, 16.00, 80, 15, "2026-09-30"),
        ("6223001003", "إيبوبروفين 400 مجم", "Ibuprofen 400mg", "Analgesics", "strip", 8.00, 5.00, 95, 20, "2027-01-31"),
        ("6223001004", "أوميبرازول 20 مجم", "Omeprazole 20mg", "Gastric", "box", 18.00, 11.00, 60, 10, "2026-12-31"),
        ("6223001005", "فيتامين سي 1000", "Vitamin C 1000mg", "Vitamins", "box", 35.00, 22.00, 45, 10, "2027-06-30"),
    ]
    for p in products:
        cur.execute(
            "SELECT 1 FROM products WHERE barcode = %s",
            (p[0],),
        )
        if not cur.fetchone():
            cur.execute(
                """
                INSERT INTO products (barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry_date, branch_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (*p, branch_id),
            )

    cur.execute("SELECT COUNT(*) AS n FROM customers")
    if cur.fetchone()["n"] == 0:
        customers = [
            ("أحمد محمود", "01001234567", "عميل منتظم", 5000),
            ("فاطمة إبراهيم", "01112345678", None, 3000),
        ]
        for c in customers:
            cur.execute(
                """
                INSERT INTO customers (name, phone, notes, credit_limit, branch_id)
                VALUES (%s,%s,%s,%s,%s)
                """,
                (*c, branch_id),
            )

    conn.commit()
    conn.close()


def main():
    try:
        platform_db.create_tenant(
            slug=SLUG,
            name="test",
            plan="test",
            admin_username=ADMIN_USER,
            admin_password=ADMIN_PASS,
        )
        print(f"Created tenant '{SLUG}'")
    except ValueError as e:
        print(f"Tenant '{SLUG}': {e}")

    seed_tenant_schema()
    print("Seeded demo data and pharmacy profile (name: test)")
    print(f"Login: pharmacy code={SLUG}, user={ADMIN_USER}, password={ADMIN_PASS}")


if __name__ == "__main__":
    main()
