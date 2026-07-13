"""Demo / trial packs for prospective pharmacy customers (Control Platform)."""
from __future__ import annotations

import json
import secrets
import string
from datetime import date, timedelta
from typing import Optional

import psycopg2.extras
from psycopg2 import sql

from auth import hash_password
from db import get_platform_connection, get_raw_connection
import platform_db

DEMO_EXTRA_USERS = [
    ("pharmacist", "pharm123", "د. أحمد رفعت", "Dr. Ahmed Refaat", "pharmacist", 0),
    ("cashier", "cash123", "محمد الكاشير", "Mohamed Cashier", "cashier", 0),
    ("cashier2", "cash123", "نور حسن", "Nour Hassan", "cashier", 1),
    ("pharmacist2", "pharm123", "د. سارة", "Dr. Sara", "pharmacist", 2),
]

# (barcode, intl_barcode, name_ar, name_en, category, material_group, med_type,
#  unit, price, supplier_slug, stock, min_stock, expiry, pack_size, sub_unit)
DEMO_PRODUCTS = [
    ("3006814", "5000112637922", "بانادول اكسترا", "Panadol Extra 48 Tab", "Painkillers", "DL", "acute", "box", 130.00, "ibn_sina", 120, 15, "2027-12-31", 48, "tablet"),
    ("3000109", "6223001090011", "أنتينال 200", "Antinal 200mg 24 Cap", "Antibiotics", "DL", "acute", "box", 52.00, "pharco", 85, 10, "2027-06-30", 24, "capsule"),
    ("6223001001", "6223001001001", "باراسيتامول 500", "Paracetamol 500mg", "Painkillers", "DL", "acute", "strip", 12.00, "pharco", 200, 20, "2026-12-31", 10, "tablet"),
    ("6223001002", "6223001002001", "أموكسيسيلين 250", "Amoxicillin 250mg", "Antibiotics", "DL", "acute", "box", 85.00, "eipico", 80, 15, "2026-09-30", 1, None),
    ("6223001003", "6223001003001", "إيبوبروفين 400", "Ibuprofen 400mg", "Painkillers", "DL", "acute", "strip", 18.00, "pharco", 150, 20, "2027-01-31", 10, "tablet"),
    ("6223001004", "6223001004001", "أوميبرازول 20", "Omeprazole 20mg", "Digestive", "DL", "chronic", "box", 45.00, "eipico", 60, 10, "2026-12-31", 14, "capsule"),
    ("6223001005", "6223001005001", "فيتامين سي 1000", "Vitamin C 1000mg", "Supplements", "CL", "chronic", "box", 95.00, "ibn_sina", 45, 10, "2027-06-30", 1, None),
    ("6223001006", "6223001006001", "أسبرين 100", "Aspirin 100mg", "Painkillers", "DL", "chronic", "strip", 15.00, "pharco", 300, 30, "2027-03-31", 10, "tablet"),
    ("6223001007", "6223001007001", "سيتيريزين 10", "Cetirizine 10mg", "Allergy", "DL", "acute", "strip", 22.00, "eipico", 140, 15, "2026-08-31", 10, "tablet"),
    ("6223001008", "6223001008001", "ميتفورمين 500", "Metformin 500mg", "Diabetes", "DL", "chronic", "box", 55.00, "pharco", 110, 10, "2026-11-30", 30, "tablet"),
    ("6223001009", "6223001009001", "أتورفاستاتين 10", "Atorvastatin 10mg", "Cardiology", "DL", "chronic", "box", 120.00, "eipico", 35, 8, "2027-02-28", 30, "tablet"),
    ("6223001010", "6223001010001", "أموكسي+كلاف", "Amoxicillin+Clavulanate", "Antibiotics", "DL", "acute", "box", 175.00, "ibn_sina", 40, 10, "2026-07-31", 1, None),
    ("6223001011", "6223001011001", "لوراتادين 10", "Loratadine 10mg", "Allergy", "DL", "acute", "strip", 25.00, "pharco", 160, 15, "2027-04-30", 10, "tablet"),
    ("6223001012", "6223001012001", "ديكلوفيناك 50", "Diclofenac 50mg", "Painkillers", "DL", "acute", "strip", 20.00, "eipico", 130, 15, "2026-10-31", 10, "tablet"),
    ("6223001013", "6223001013001", "محلول ملحي", "Normal Saline 0.9%", "Medical supplies", "ML", None, "bottle", 35.00, "ibn_sina", 60, 5, "2026-05-31", 1, None),
    ("6223001014", "6223001014001", "زنك 50", "Zinc 50mg", "Supplements", "CL", "chronic", "box", 48.00, "pharco", 80, 10, "2027-08-31", 30, "capsule"),
    ("6223001015", "6223001015001", "كريم هيدروكورتيزون", "Hydrocortisone Cream 1%", "Dermatology", "CL", "acute", "tube", 28.00, "eipico", 50, 5, "2027-01-31", 1, None),
    ("6223001016", "6223001016001", "شامبو ضد القمل", "Anti-Lice Shampoo", "Personal care", "CL", "acute", "bottle", 65.00, "ibn_sina", 25, 5, "2027-05-31", 1, None),
    ("6223001017", "6223001017001", "فicks استنشاق", "Vicks Inhaler", "Cold & flu", "CL", "acute", "piece", 42.00, "ibn_sina", 90, 10, "2028-01-31", 1, None),
    ("6223001018", "6223001018001", "كحول طبي 70%", "Medical Alcohol 70%", "Medical supplies", "ML", None, "bottle", 22.00, "pharco", 120, 15, "2027-12-31", 1, None),
    ("6223001019", "6223001019001", "ضمادات معقمة", "Sterile Gauze Pack", "Medical supplies", "ML", None, "box", 18.00, "eipico", 200, 20, "2028-06-30", 1, None),
    ("6223001020", "6223001020001", "أوجمنتين 1g", "Augmentin 1g 14 Tab", "Antibiotics", "DI", "acute", "box", 180.00, "memphis", 55, 10, "2026-06-30", 14, "tablet"),
    ("6223001021", "6223001021001", "كونكور 5", "Concor 5mg", "Cardiology", "DI", "chronic", "box", 210.00, "sedico", 30, 8, "2027-03-31", 30, "tablet"),
    ("6223001022", "6223001022001", "نيتروجين ميست", "Nivea Soft Cream", "Cosmetics", "CI", None, "tube", 75.00, "multi_apex", 40, 5, "2028-12-31", 1, None),
    ("6223001023", "6223001023001", "حليب أطفال", "Baby Milk Stage 1", "Baby care", "CI", None, "box", 320.00, "multi_apex", 25, 5, "2027-09-30", 1, None),
    ("6223001024", "6223001024001", "بانادول بخار", "Panadol Vapour 10 Sachets", "Cold & flu", "DL", "acute", "box", 130.00, "ibn_sina", 108, 10, "2027-06-30", 10, "sachet"),
]

# (slug, name, contact, phone, email, address, region, tax_number, notes)
DEMO_SUPPLIERS = [
    ("ibn_sina", "Ibn Sina", "أحمد مورد", "01011110001", "orders@ibnsina-demo.eg", "Cairo Distribution Hub", "cairo", "100-111-001", "Primary wholesaler — fast delivery"),
    ("pharco", "Pharco", "سارة مورد", "01011110002", "supply@pharco-demo.eg", "Alexandria Industrial Zone", "alexandria", "100-111-002", "Local generics"),
    ("eipico", "EIPICO", "محمود مورد", "01011110003", "sales@eipico-demo.eg", "10th of Ramadan City", "sharqia", "100-111-003", "EIPICO lines"),
    ("memphis", "Memphis Pharma", "كريم مورد", "01011110004", "memphis@demo.eg", "6th October City", "giza", "100-111-004", "Imported antibiotics"),
    ("sedico", "SEDICO", "ليلى مورد", "01011110005", "sedico@demo.eg", "New Cairo", "cairo", "100-111-005", "Cardiology & chronic"),
    ("multi_apex", "Multi-Apex", "هاني مورد", "01011110006", "multi@demo.eg", "Heliopolis", "cairo", "100-111-006", "Cosmetics & baby care"),
]

DEMO_BRANCHES_EXTRA = [
    ("فرع الإسماعيلية", "Ismailia Branch", "Salah Salem St, Ismailia", "01022220001"),
    ("فرع بورسعيد", "Port Said Branch", "Port Said Downtown", "01022220002"),
]

# (code, name, phone, email, region, address, tax_number, credit_limit, discount_pct, discount_notes, notes, sale_type)
DEMO_CUSTOMERS = [
    ("C001", "أحمد محمود", "01001234567", "ahmed.m@demo.eg", "cairo", "Nasr City, Block 7", None, 5000, 5.0, "Regular customer discount", "عميل منتظم", "cash"),
    ("C002", "فاطمة إبراهيم", "01112345678", "fatma.i@demo.eg", "ismailia", "El Gabbal St", None, 2000, None, None, None, "cash"),
    ("C003", "محمد حسن", "01223456789", "m.hassan@demo.eg", "cairo", "Heliopolis", "200-333-001", 10000, 10.0, "Corporate account", "تأمين / حساب آجل", "account"),
    ("C004", "سارة علي", "01098765432", "sara.ali@demo.eg", "port_said", "Port Fouad", None, 1500, None, None, "برنامج ولاء", "cash"),
    ("C005", "خالد يوسف", "01055556666", "k.youssef@demo.eg", "cairo", "Maadi", None, 3000, 7.5, "Chronic meds discount", "أدوية مزمنة", "cash"),
    ("C006", "نادية سمير", "01166667777", "n.samir@demo.eg", "alexandria", "Smouha", None, 0, None, None, None, "cash"),
    ("C007", "شركة النيل للتأمين", "0223456789", "billing@nile-ins.demo.eg", "cairo", "Downtown Cairo", "300-444-001", 50000, 15.0, "Insurance contract", "عميل تأمين B2B", "account"),
    ("C008", "ياسمين كمال", "01077778888", "y.kamal@demo.eg", "giza", "Dokki", None, 800, None, None, "عميلة جديدة", "cash"),
    ("C009", "عمر رشاد", "01288889999", "o.rashad@demo.eg", "sharqia", "Zagazig", None, 2500, 3.0, None, None, "account"),
    ("C010", "مريم عبد الله", "01099990000", "m.abdullah@demo.eg", "cairo", "Shubra", None, 0, None, None, "Walk-in", "cash"),
    ("C011", "Hassan El Masry", "01100001111", "h.masry@demo.eg", "ismailia", "Faisal", None, 1200, None, None, "English-speaking customer", "cash"),
    ("C012", "Dr. Layla Clinic", "0221111222", "clinic@layla.demo.eg", "cairo", "Mohandessin", "400-555-002", 15000, 12.0, "Clinic contract", "عيادة — فواتير آجلة", "account"),
]


def all_features_enabled() -> list[str]:
    return [f["key"] for f in platform_db.FEATURES_CATALOG]


def all_feature_options_enabled(features: list[str]) -> dict[str, dict[str, bool]]:
    enabled = set(features)
    out: dict[str, dict[str, bool]] = {}
    for group in platform_db.FEATURE_OPTIONS_CATALOG:
        fk = group["feature"]
        if fk not in enabled:
            continue
        out[fk] = {o["key"]: True for o in group["options"]}
    return out


def _gen_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Demo" + "".join(secrets.choice(alphabet) for _ in range(6))


def _unique_demo_slug(prefix: str = "demo") -> str:
    prefix = (prefix or "demo").strip().lower()[:12]
    if not prefix or not platform_db.SLUG_RE.match(prefix + "abc"):
        prefix = "demo"
    for _ in range(40):
        suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(6))
        slug = f"{prefix}-{suffix}"[:30]
        if platform_db.SLUG_RE.match(slug) and not platform_db.get_tenant_by_slug(slug):
            return slug
    raise ValueError("Could not generate a unique demo pharmacy code")


def _seed_demo_content(schema_name: str, admin_username: str) -> dict:
    from material_groups import product_fields_from_material_group
    from pricing import default_cost_from_price

    stats = {"branches": 0, "suppliers": 0, "products": 0, "customers": 0, "users": 0, "shifts": 0}
    conn = get_raw_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema_name))
        )
        cur.execute("SELECT id FROM branches ORDER BY id LIMIT 1")
        branch_row = cur.fetchone()
        if not branch_row:
            raise ValueError("Demo tenant has no branch")
        main_branch_id = branch_row["id"]

        cur.execute(
            """UPDATE branches SET name_ar = %s, name_en = %s, address = %s, phone = %s
               WHERE id = %s""",
            [
                "الفرع الرئيسي — القاهرة",
                "Main Branch — Cairo",
                "15 Abbas El Akkad St, Nasr City, Cairo",
                "01000000001",
                main_branch_id,
            ],
        )

        for name_ar, name_en, address, phone in DEMO_BRANCHES_EXTRA:
            cur.execute(
                """INSERT INTO branches (name_ar, name_en, address, phone)
                   SELECT %s, %s, %s, %s
                   WHERE NOT EXISTS (
                     SELECT 1 FROM branches WHERE name_en = %s
                   )""",
                [name_ar, name_en, address, phone, name_en],
            )
            if cur.rowcount:
                stats["branches"] += 1

        supplier_ids: dict[str, int] = {}
        for slug, name, contact, phone, email, address, region, tax_number, notes in DEMO_SUPPLIERS:
            cur.execute(
                """INSERT INTO suppliers
                   (name, contact_person, phone, email, address, region, tax_number, notes, active)
                   SELECT %s, %s, %s, %s, %s, %s, %s, %s, true
                   WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = %s)
                   RETURNING id""",
                [name, contact, phone, email, address, region, tax_number, notes, name],
            )
            row = cur.fetchone()
            if row:
                supplier_ids[slug] = row["id"]
                stats["suppliers"] += 1
            else:
                cur.execute("SELECT id FROM suppliers WHERE name = %s", [name])
                found = cur.fetchone()
                if found:
                    supplier_ids[slug] = found["id"]
                    cur.execute(
                        """UPDATE suppliers SET contact_person=%s, phone=%s, email=%s, address=%s,
                           region=%s, tax_number=%s, notes=%s, active=true WHERE id=%s""",
                        [contact, phone, email, address, region, tax_number, notes, found["id"]],
                    )

        cur.execute("SELECT id FROM branches ORDER BY id")
        branch_ids = [r["id"] for r in cur.fetchall()]
        stats["branches"] = len(branch_ids)

        for branch_id in branch_ids:
            for row in DEMO_PRODUCTS:
                (barcode, intl_barcode, name_ar, name_en, category, mg, med_type,
                 unit, price, sup_slug, stock, min_stock, expiry, pack_size, sub_unit) = row
                cost = default_cost_from_price(price)
                sup_id = supplier_ids.get(sup_slug)
                cls = product_fields_from_material_group(mg)
                pack_size = max(1, int(pack_size or 1))
                sub_price = round(price / pack_size, 2) if pack_size > 1 and sub_unit else None
                sub_unit_val = sub_unit if pack_size > 1 else None
                bc = barcode if branch_id == main_branch_id else f"{barcode}-B{branch_id}"
                branch_stock = stock if branch_id == main_branch_id else max(10, stock // 3)
                cur.execute(
                    """INSERT INTO products (
                         barcode, international_barcode, name_ar, name_en, category, unit,
                         price, cost, avg_cost, stock, min_stock, expiry_date, branch_id,
                         supplier_id, pack_size, sub_unit, sub_price, vat_rate,
                         material_group, origin_type, is_service, medication_type, active
                       )
                       SELECT %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0.14,%s,%s,%s,%s,true
                       WHERE NOT EXISTS (
                         SELECT 1 FROM products WHERE barcode = %s AND branch_id = %s
                       )""",
                    [
                        bc, intl_barcode, name_ar, name_en, category, unit,
                        price, cost, cost, branch_stock, min_stock, expiry, branch_id,
                        sup_id, pack_size, sub_unit_val, sub_price,
                        cls["material_group"], cls["origin_type"], cls["is_service"], med_type,
                        bc, branch_id,
                    ],
                )
                if cur.rowcount:
                    stats["products"] += 1

        for username, password, name_ar, name_en, role, branch_idx in DEMO_EXTRA_USERS:
            bid = branch_ids[min(branch_idx, len(branch_ids) - 1)]
            cur.execute(
                """INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id, status)
                   SELECT %s, %s, %s, %s, %s, %s, 'active'
                   WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = %s)""",
                [username, hash_password(password), name_ar, name_en, role, bid, username],
            )
            if cur.rowcount:
                stats["users"] += 1

        for (code, name, phone, email, region, address, tax_number, credit_limit,
             discount_pct, discount_notes, notes, sale_type) in DEMO_CUSTOMERS:
            cur.execute(
                """INSERT INTO customers
                   (code, name, phone, email, region, address_details, tax_number,
                    credit_limit, discount_percent, discount_notes, notes, sale_type, branch_id, active)
                   SELECT %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true
                   WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = %s)
                   RETURNING id""",
                [
                    code, name, phone, email, region, address, tax_number,
                    credit_limit, discount_pct, discount_notes, notes, sale_type, main_branch_id, phone,
                ],
            )
            cust = cur.fetchone()
            if cust:
                stats["customers"] += 1
                cur.execute(
                    """INSERT INTO customer_phones (customer_id, phone, label, is_primary, sort_order)
                       SELECT %s, %s, 'Mobile', true, 0
                       WHERE NOT EXISTS (
                         SELECT 1 FROM customer_phones WHERE customer_id = %s AND phone = %s
                       )""",
                    [cust["id"], phone, cust["id"], phone],
                )
            else:
                cur.execute("SELECT id FROM customers WHERE phone = %s", [phone])
                existing = cur.fetchone()
                if existing:
                    cur.execute(
                        """UPDATE customers SET code=%s, name=%s, email=%s, region=%s,
                           address_details=%s, tax_number=%s, credit_limit=%s,
                           discount_percent=%s, discount_notes=%s, notes=%s, sale_type=%s, active=true
                           WHERE id=%s""",
                        [
                            code, name, email, region, address, tax_number, credit_limit,
                            discount_pct, discount_notes, notes, sale_type, existing["id"],
                        ],
                    )

        cur.execute(
            """UPDATE pharmacy_profile SET
               name_ar = COALESCE(NULLIF(name_ar, ''), 'صيدلية العرض التجريبي'),
               name_en = COALESCE(NULLIF(name_en, ''), 'Fratelanza Demo Pharmacy'),
               phone = COALESCE(NULLIF(phone, ''), '01000000001'),
               address_ar = COALESCE(NULLIF(address_ar, ''), 'Nasr City, Cairo'),
               address_en = COALESCE(NULLIF(address_en, ''), 'Nasr City, Cairo'),
               loyalty_enabled = true
               WHERE id = 1"""
        )

        quick_barcodes = [p[0] for p in DEMO_PRODUCTS[:8]]
        cur.execute(
            """UPDATE pharmacy_profile SET pos_quick_items = %s::jsonb WHERE id = 1""",
            [json.dumps(quick_barcodes)],
        )

        cur.execute(
            "SELECT id FROM users WHERE username = %s AND status = 'active'",
            [admin_username],
        )
        admin_row = cur.fetchone()
        if admin_row:
            # DB allows one open shift per user — assign different users per branch.
            shift_plan: list[tuple[int, int]] = [(admin_row["id"], main_branch_id)]
            extra_shift_users = [
                ("cashier2", 1),
                ("pharmacist2", 2),
            ]
            for username, branch_idx in extra_shift_users:
                if branch_idx >= len(branch_ids):
                    continue
                cur.execute(
                    "SELECT id FROM users WHERE username = %s AND status = 'active'",
                    [username],
                )
                u = cur.fetchone()
                if u:
                    shift_plan.append((u["id"], branch_ids[branch_idx]))

            for user_id, bid in shift_plan:
                cur.execute(
                    """INSERT INTO shifts(user_id, branch_id, opening_cash, notes, shift_type)
                       SELECT %s, %s, 1000, 'Demo shift (auto-opened for video)', 'morning'
                       WHERE NOT EXISTS (
                         SELECT 1 FROM shifts WHERE user_id = %s AND status = 'open'
                       )""",
                    [user_id, bid, user_id],
                )
                if cur.rowcount:
                    stats["shifts"] += 1

        conn.commit()
        return stats
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _looks_like_demo_slug(slug: str) -> bool:
    """Pharmacy codes created for trials (demo, demo-2, demo-abc123, …)."""
    return slug == "demo" or slug.startswith("demo-")


def reseed_demo_tenant(slug: str) -> dict:
    """Fill or refresh demo sample data on an existing demo pharmacy (e.g. demo-2)."""
    slug = (slug or "").strip().lower()
    tenant = platform_db.get_tenant_by_slug(slug)
    if not tenant:
        raise ValueError(f"Pharmacy '{slug}' not found")
    if not tenant.get("is_demo"):
        if not _looks_like_demo_slug(slug):
            raise ValueError(f"'{slug}' is not a demo pharmacy — seed blocked for safety")
        platform_db.update_tenant(tenant["id"], {"is_demo": True})
        tenant = platform_db.get_tenant_by_slug(slug) or tenant
    if tenant.get("status") == "suspended":
        platform_db.update_tenant(tenant["id"], {"status": "active"})
    stats = _seed_demo_content(tenant["schema_name"], "admin")
    return {
        "ok": True,
        "slug": slug,
        "schema_name": tenant["schema_name"],
        "stats": stats,
        "login": {"tenant": slug, "admin": "admin", "pharmacist": "pharmacist / pharm123", "cashier": "cashier / cash123"},
    }


def _login_path(slug: str, username: str | None = None) -> str:
    q = f"/login?tenant={slug}"
    if username:
        q += f"&user={username}"
    return q


def _access_path(token: str, account_index: int = 0) -> str:
    if account_index <= 0:
        return f"/demo/{token}"
    return f"/demo/{token}?a={account_index}"


def _get_valid_pack_row(token: str) -> Optional[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM demo_packs WHERE token = %s", [token.strip()])
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("revoked_at"):
            return None
        exp = d.get("expires_at")
        if exp and exp < date.today():
            return None
        return d
    finally:
        conn.close()


def _admin_credential(account: dict) -> tuple[str, str]:
    users = account.get("users") or []
    admin = next((u for u in users if u.get("role") == "admin"), users[0] if users else None)
    if not admin:
        raise ValueError("Demo account has no admin user")
    return admin["username"], admin["password"]


def demo_auto_login(token: str, account_index: int = 0) -> dict:
    """One-click demo login — credentials never sent to the browser."""
    pack = _get_valid_pack_row(token)
    if not pack:
        raise ValueError("Demo link not found or expired")

    accounts = pack.get("accounts") or []
    if account_index < 0 or account_index >= len(accounts):
        raise ValueError("Invalid demo account")

    acc = accounts[account_index]
    slug = acc.get("slug") or ""
    username, password = _admin_credential(acc)

    tenant = platform_db.get_tenant_by_slug(slug)
    if not tenant or not tenant.get("is_demo"):
        raise ValueError("Invalid demo pharmacy")

    from platform_db import (
        is_tenant_live,
        normalize_features,
        resolve_feature_options,
        get_tenant_stats,
        tenant_limits_payload,
    )
    from auth import verify_password, create_token
    from db import get_db_connection

    live, reason = is_tenant_live(tenant)
    if not live:
        raise ValueError(reason or "Demo pharmacy is not active")

    conn = get_db_connection(schema=tenant["schema_name"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM users WHERE username = %s AND status = 'active'",
            [username],
        )
        user = cur.fetchone()
    finally:
        conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        raise ValueError("Demo login failed")

    jwt = create_token({
        "scope": "tenant",
        "tenant_slug": tenant["slug"],
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "name_ar": user["name_ar"],
        "name_en": user["name_en"],
        "branch_id": user["branch_id"],
        "permissions": user.get("permissions"),
    })

    return {
        "token": jwt,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name_ar": user["name_ar"],
            "name_en": user["name_en"],
            "role": user["role"],
            "branch_id": user["branch_id"],
            "permissions": user.get("permissions"),
        },
        "tenant": {
            "slug": tenant["slug"],
            "name": tenant["name"],
            "plan": tenant.get("plan"),
            "is_demo": True,
            "features": normalize_features(tenant.get("features")),
            "feature_options": resolve_feature_options(tenant),
            "subscription_start": tenant.get("subscription_start").isoformat() if tenant.get("subscription_start") else None,
            "subscription_end": tenant.get("subscription_end").isoformat() if tenant.get("subscription_end") else None,
            "limits": tenant_limits_payload(tenant, get_tenant_stats(tenant)),
        },
    }


def create_demo_pack(
    *,
    label: str,
    count: int = 1,
    expiry_days: int = 2,
    slug_prefix: str = "demo",
    app_origin: str = "",
) -> dict:
    """Provision N demo pharmacies (all features) and store a shareable access pack."""
    label = (label or "").strip() or "POS demo accounts"
    count = max(1, min(int(count), 25))
    expiry_days = max(1, min(int(expiry_days), 365))
    today = date.today()
    sub_end = today + timedelta(days=expiry_days)
    features = all_features_enabled()
    feature_options = all_feature_options_enabled(features)
    origin = (app_origin or "").rstrip("/")
    accounts: list[dict] = []

    for i in range(count):
        slug = _unique_demo_slug(slug_prefix)
        name = f"Demo Pharmacy {i + 1}" if count > 1 else "Demo Pharmacy"
        admin_password = _gen_password()

        tenant = platform_db.create_tenant(
            slug=slug,
            name=name,
            plan="enterprise",
            notes=f"Auto demo pack — {label}",
            admin_username="admin",
            admin_password=admin_password,
            features=features,
            feature_options=feature_options,
            subscription_start=today.isoformat(),
            subscription_end=sub_end.isoformat(),
            max_users=None,
            max_branches=3,
            price_le=0,
            is_demo=True,
        )

        schema_name = tenant["schema_name"]
        _seed_demo_content(schema_name, "admin")

        users = [{
            "role": "admin",
            "username": "admin",
            "password": admin_password,
            "name_en": "Administrator",
        }]

        accounts.append({
            "tenant_id": tenant["id"],
            "name": name,
            "slug": slug,
            "subscription_end": sub_end.isoformat(),
            "users": users,
        })

    token = secrets.token_urlsafe(18)
    for i, acc in enumerate(accounts):
        path = _access_path(token, i)
        acc["access_path"] = path
        acc["access_url"] = f"{origin}{path}" if origin else path

    share_url = f"{origin}{_access_path(token, 0)}" if origin else _access_path(token, 0)

    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO demo_packs(token, label, expires_at, accounts)
               VALUES (%s, %s, %s, %s::jsonb)
               RETURNING id, token, label, expires_at, accounts, created_at, revoked_at""",
            [token, label, sub_end.isoformat(), json.dumps(accounts)],
        )
        row = dict(cur.fetchone())
        conn.commit()
    finally:
        conn.close()

    row["share_url"] = share_url
    row["accounts"] = accounts
    row["features_enabled"] = features
    return row


def list_demo_packs() -> list[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT id, token, label, expires_at, created_at, revoked_at,
                      jsonb_array_length(accounts) AS account_count
               FROM demo_packs
               ORDER BY created_at DESC"""
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["share_path"] = f"/demo/{r['token']}"
        return rows
    finally:
        conn.close()


def get_demo_pack_by_id(pack_id: int) -> Optional[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM demo_packs WHERE id = %s", [pack_id])
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["share_path"] = f"/demo/{d['token']}"
        return d
    finally:
        conn.close()


def get_demo_pack_public(token: str) -> Optional[dict]:
    pack = _get_valid_pack_row(token)
    if not pack:
        return None
    exp = pack.get("expires_at")
    accounts = pack.get("accounts") or []
    public_accounts = []
    for i, acc in enumerate(accounts):
        public_accounts.append({
            "index": i,
            "name": acc.get("name"),
            "access_path": acc.get("access_path") or _access_path(token, i),
            "role": "admin",
        })
    return {
        "label": pack.get("label"),
        "expires_at": exp.isoformat() if exp else None,
        "created_at": pack.get("created_at").isoformat() if pack.get("created_at") else None,
        "account_count": len(public_accounts),
        "accounts": public_accounts,
        "all_features": True,
        "auto_login": True,
    }


def extend_demo_pack(pack_id: int, extra_days: int) -> dict:
    extra_days = max(1, min(int(extra_days), 365))
    pack = get_demo_pack_by_id(pack_id)
    if not pack:
        raise ValueError("Demo pack not found")
    if pack.get("revoked_at"):
        raise ValueError("Cannot extend a revoked demo pack")

    exp = pack.get("expires_at")
    if isinstance(exp, str):
        exp = date.fromisoformat(exp)
    base = max(date.today(), exp) if exp else date.today()
    new_exp = base + timedelta(days=extra_days)

    accounts = list(pack.get("accounts") or [])
    for acc in accounts:
        tid = acc.get("tenant_id")
        if tid:
            platform_db.update_tenant(tid, {"subscription_end": new_exp.isoformat()})
        acc["subscription_end"] = new_exp.isoformat()

    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """UPDATE demo_packs SET expires_at = %s, accounts = %s::jsonb
               WHERE id = %s RETURNING *""",
            [new_exp.isoformat(), json.dumps(accounts), pack_id],
        )
        row = dict(cur.fetchone())
        conn.commit()
    finally:
        conn.close()

    row["share_path"] = f"/demo/{row['token']}"
    if accounts:
        row["share_url"] = accounts[0].get("access_url") or row["share_path"]
    return row


def revoke_demo_pack(pack_id: int) -> dict:
    pack = get_demo_pack_by_id(pack_id)
    if not pack:
        raise ValueError("Demo pack not found")
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            "UPDATE demo_packs SET revoked_at = NOW() WHERE id = %s RETURNING *",
            [pack_id],
        )
        row = dict(cur.fetchone())
        conn.commit()
    finally:
        conn.close()

    for acc in pack.get("accounts") or []:
        tid = acc.get("tenant_id")
        if tid:
            try:
                platform_db.update_tenant(tid, {"status": "suspended"})
            except Exception:
                pass
    return row


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3 and sys.argv[1] == "seed":
        result = reseed_demo_tenant(sys.argv[2])
        print(json.dumps(result, indent=2, default=str))
    else:
        print("Usage: python platform_demo.py seed <tenant-slug>")
        print("Example: python platform_demo.py seed demo-2")
