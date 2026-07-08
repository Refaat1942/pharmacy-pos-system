"""Run once to seed sample data."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from db import get_db_connection
from auth import hash_password
import psycopg2.extras


def seed():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Branch
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

    # Users
    users = [
        ("admin", hash_password("admin123"), "مدير النظام", "System Admin", "admin"),
        ("pharmacist1", hash_password("pharm123"), "د. أحمد رفعت", "Dr. Ahmed Refaat", "pharmacist"),
        ("assistant1", hash_password("asst123"), "سارة محمد", "Sara Mohamed", "assistant"),
        ("cashier1", hash_password("cash123"), "محمد علي", "Mohamed Ali", "cashier"),
    ]
    for u in users:
        cur.execute("""
            INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (username) DO NOTHING
        """, (*u, branch_id))

    # Products
    products = [
        ("6223001001", "باراسيتامول 500 مجم", "Paracetamol 500mg", "Analgesics", "strip", 5.00, 3.00, 120, 20, "2026-06-30"),
        ("6223001002", "أموكسيسيلين 250 مجم", "Amoxicillin 250mg", "Antibiotics", "box", 25.00, 16.00, 80, 15, "2026-09-30"),
        ("6223001003", "إيبوبروفين 400 مجم", "Ibuprofen 400mg", "Analgesics", "strip", 8.00, 5.00, 95, 20, "2027-01-31"),
        ("6223001004", "أوميبرازول 20 مجم", "Omeprazole 20mg", "Gastric", "box", 18.00, 11.00, 60, 10, "2026-12-31"),
        ("6223001005", "فيتامين سي 1000", "Vitamin C 1000mg", "Vitamins", "box", 35.00, 22.00, 45, 10, "2027-06-30"),
        ("6223001006", "أسبرين 100 مجم", "Aspirin 100mg", "Cardiology", "strip", 6.00, 4.00, 200, 30, "2027-03-31"),
        ("6223001007", "سيتيريزين 10 مجم", "Cetirizine 10mg", "Antihistamines", "strip", 7.00, 4.50, 70, 15, "2026-08-31"),
        ("6223001008", "ميتفورمين 500 مجم", "Metformin 500mg", "Diabetes", "box", 22.00, 14.00, 55, 10, "2026-11-30"),
        ("6223001009", "أتورفاستاتين 10 مجم", "Atorvastatin 10mg", "Cardiology", "box", 45.00, 28.00, 35, 8, "2027-02-28"),
        ("6223001010", "أموكسيسيلين+كلافولانات", "Amoxicillin+Clavulanate", "Antibiotics", "box", 65.00, 42.00, 40, 10, "2026-07-31"),
        ("6223001011", "لوراتادين 10 مجم", "Loratadine 10mg", "Antihistamines", "strip", 9.00, 5.50, 80, 15, "2027-04-30"),
        ("6223001012", "ديكلوفيناك 50 مجم", "Diclofenac 50mg", "Analgesics", "strip", 10.00, 6.00, 65, 15, "2026-10-31"),
        ("6223001013", "محلول ملحي 9%", "Normal Saline 0.9%", "IV Fluids", "bottle", 15.00, 8.00, 30, 5, "2026-05-31"),
        ("6223001014", "زنك 50 مجم", "Zinc 50mg", "Vitamins", "box", 28.00, 18.00, 50, 10, "2027-08-31"),
        ("6223001015", "كريم هيدروكورتيزون", "Hydrocortisone Cream", "Dermatology", "tube", 20.00, 12.00, 25, 5, "2027-01-31"),
    ]
    for p in products:
        cur.execute("""
            INSERT INTO products (barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry_date, branch_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (barcode, branch_id) DO NOTHING
        """, (*p, branch_id))

    # Customers
    customers = [
        ("أحمد محمود", "01001234567", "عميل منتظم"),
        ("فاطمة إبراهيم", "01112345678", None),
        ("محمد حسن", "01223456789", "لديه تأمين طبي"),
    ]
    for c in customers:
        cur.execute("""
            INSERT INTO customers (name, phone, notes, branch_id)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
        """, (*c, branch_id))

    conn.commit()
    conn.close()
    print("✅ Seed data inserted successfully!")
    print("   Admin login: admin / admin123")
    print("   Pharmacist login: pharmacist1 / pharm123")


if __name__ == "__main__":
    seed()
