"""Run once to seed sample data."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from db import get_db_connection
from auth import hash_password
from pricing import default_cost_from_price
import psycopg2.extras


def seed():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        INSERT INTO branches (name_ar, name_en, address, phone)
        VALUES ('الفرع الرئيسي', 'Main Branch', 'Cairo, Egypt', '01000000000')
        ON CONFLICT DO NOTHING RETURNING id
    """)
    row = cur.fetchone()
    if row:
        branch_id = row["id"]
    else:
        cur.execute("SELECT id FROM branches LIMIT 1")
        branch_id = cur.fetchone()["id"]

    cur.execute("""
        INSERT INTO branches (name_ar, name_en, address, phone)
        SELECT 'فرع الإسماعيلية', 'Ismailia Branch', 'Ismailia', '01022220001'
        WHERE NOT EXISTS (SELECT 1 FROM branches WHERE name_en = 'Ismailia Branch')
    """)

    suppliers = [
        ("Ibn Sina", "01011110001"),
        ("Pharco", "01011110002"),
        ("EIPICO", "01011110003"),
    ]
    supplier_ids = {}
    for name, phone in suppliers:
        cur.execute(
            """INSERT INTO suppliers (name, phone, active)
               SELECT %s, %s, true
               WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = %s)
               RETURNING id""",
            [name, phone, name],
        )
        r = cur.fetchone()
        if r:
            supplier_ids[name] = r["id"]
        else:
            cur.execute("SELECT id FROM suppliers WHERE name = %s", [name])
            supplier_ids[name] = cur.fetchone()["id"]

    users = [
        ("admin", hash_password("admin123"), "مدير النظام", "System Admin", "admin"),
        ("pharmacist1", hash_password("pharm123"), "د. أحمد رفعت", "Dr. Ahmed Refaat", "pharmacist"),
        ("cashier1", hash_password("cash123"), "محمد علي", "Mohamed Ali", "cashier"),
    ]
    for u in users:
        cur.execute("""
            INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (username) DO NOTHING
        """, (*u, branch_id))

    products = [
        ("3006814", "بانادول بخار", "PANADOL VAPOUR RELEASE 10/SACH", "DL", "PAC", 130.00, "Ibn Sina", 108, 10, "2027-06-30", 10, "sachet"),
        ("6223001001", "باراسيتامول 500", "Paracetamol 500mg", "DL", "strip", 12.00, "Pharco", 200, 20, "2026-12-31", 10, "tablet"),
        ("6223001002", "أموكسيسيلين 250", "Amoxicillin 250mg", "DL", "box", 85.00, "EIPICO", 80, 15, "2026-09-30", 1, None),
        ("6223001003", "إيبوبروفين 400", "Ibuprofen 400mg", "DL", "strip", 18.00, "Pharco", 150, 20, "2027-01-31", 10, "tablet"),
        ("6223001004", "أوميبرازول 20", "Omeprazole 20mg", "DL", "box", 45.00, "EIPICO", 60, 10, "2026-12-31", 14, "capsule"),
        ("6223001005", "فيتامين سي 1000", "Vitamin C 1000mg", "CL", "box", 95.00, "Ibn Sina", 45, 10, "2027-06-30", 1, None),
    ]
    for p in products:
        barcode, name_ar, name_en, category, unit, price, sup_name, stock, min_stock, expiry, pack_size, sub_unit = p
        cost = default_cost_from_price(price)
        cur.execute("""
            INSERT INTO products (
              barcode, name_ar, name_en, category, unit, price, cost, avg_cost,
              stock, min_stock, expiry_date, branch_id, supplier_id, pack_size, sub_unit, vat_rate
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0.14)
            ON CONFLICT (barcode, branch_id) DO NOTHING
        """, (
            barcode, name_ar, name_en, category, unit, price, cost, cost,
            stock, min_stock, expiry, branch_id, supplier_ids.get(sup_name),
            pack_size, sub_unit,
        ))

    customers = [
        ("أحمد محمود", "01001234567", "عميل منتظم"),
        ("فاطمة إبراهيم", "01112345678", None),
    ]
    for c in customers:
        cur.execute("""
            INSERT INTO customers (name, phone, notes, branch_id)
            SELECT %s, %s, %s, %s
            WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = %s)
        """, (*c, branch_id, c[1]))

    conn.commit()
    conn.close()
    print("✅ Seed data inserted successfully!")
    print("   Admin: admin / admin123")
    print("   Pharmacist: pharmacist1 / pharm123")
    print("   Cashier: cashier1 / cash123")


if __name__ == "__main__":
    seed()
