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
    ("pharmacist", "pharm123", "د. أحمد", "Ahmed Pharmacist", "pharmacist"),
    ("cashier", "cash123", "محمد الكاشير", "Mohamed Cashier", "cashier"),
]

# (barcode, name_ar, name_en, category, unit, price, supplier_slug, stock_sub, min_stock, expiry, pack_size, sub_unit)
DEMO_PRODUCTS = [
    ("3006814", "بانادول بخار", "PANADOL VAPOUR RELEASE 10/SACH", "DL", "PAC", 130.00, "ibn_sina", 108, 10, "2027-06-30", 10, "sachet"),
    ("6223001001", "باراسيتامول 500", "Paracetamol 500mg", "DL", "strip", 12.00, "pharco", 200, 20, "2026-12-31", 10, "tablet"),
    ("6223001002", "أموكسيسيلين 250", "Amoxicillin 250mg", "DL", "box", 85.00, "eipico", 80, 15, "2026-09-30", 1, None),
    ("6223001003", "إيبوبروفين 400", "Ibuprofen 400mg", "DL", "strip", 18.00, "pharco", 150, 20, "2027-01-31", 10, "tablet"),
    ("6223001004", "أوميبرازول 20", "Omeprazole 20mg", "DL", "box", 45.00, "eipico", 60, 10, "2026-12-31", 14, "capsule"),
    ("6223001005", "فيتامين سي 1000", "Vitamin C 1000mg", "CL", "box", 95.00, "ibn_sina", 45, 10, "2027-06-30", 1, None),
    ("6223001006", "أسبرين 100", "Aspirin 100mg", "DL", "strip", 15.00, "pharco", 300, 30, "2027-03-31", 10, "tablet"),
    ("6223001007", "سيتيريزين 10", "Cetirizine 10mg", "DL", "strip", 22.00, "eipico", 140, 15, "2026-08-31", 10, "tablet"),
    ("6223001008", "ميتفورمين 500", "Metformin 500mg", "DL", "box", 55.00, "pharco", 110, 10, "2026-11-30", 30, "tablet"),
    ("6223001009", "أتورفاستاتين 10", "Atorvastatin 10mg", "DL", "box", 120.00, "eipico", 35, 8, "2027-02-28", 30, "tablet"),
    ("6223001010", "أموكسي+كلاف", "Amoxicillin+Clavulanate", "DL", "box", 175.00, "ibn_sina", 40, 10, "2026-07-31", 1, None),
    ("6223001011", "لوراتادين 10", "Loratadine 10mg", "DL", "strip", 25.00, "pharco", 160, 15, "2027-04-30", 10, "tablet"),
    ("6223001012", "ديكلوفيناك 50", "Diclofenac 50mg", "DL", "strip", 20.00, "eipico", 130, 15, "2026-10-31", 10, "tablet"),
    ("6223001013", "محلول ملحي", "Normal Saline 0.9%", "CL", "bottle", 35.00, "ibn_sina", 60, 5, "2026-05-31", 1, None),
    ("6223001014", "زنك 50", "Zinc 50mg", "CL", "box", 48.00, "pharco", 80, 10, "2027-08-31", 30, "capsule"),
    ("6223001015", "كريم هيدروكورتيزون", "Hydrocortisone Cream", "CL", "tube", 28.00, "eipico", 50, 5, "2027-01-31", 1, None),
    ("6223001016", "شامبو ضد القمل", "Anti-Lice Shampoo", "CL", "bottle", 65.00, "ibn_sina", 25, 5, "2027-05-31", 1, None),
    ("6223001017", "ميزاج استنشاق", "Vicks Inhaler", "CL", "piece", 42.00, "ibn_sina", 90, 10, "2028-01-31", 1, None),
    ("6223001018", "كحول طبي 70%", "Medical Alcohol 70%", "CL", "bottle", 22.00, "pharco", 120, 15, "2027-12-31", 1, None),
    ("6223001019", "ضمادات معقمة", "Sterile Gauze Pack", "CL", "box", 18.00, "eipico", 200, 20, "2028-06-30", 1, None),
]

DEMO_SUPPLIERS = [
    ("ibn_sina", "Ibn Sina", "أحمد مورد", "01011110001"),
    ("pharco", "Pharco", "سارة مورد", "01011110002"),
    ("eipico", "EIPICO", "محمود مورد", "01011110003"),
]

DEMO_BRANCHES_EXTRA = [
    ("فرع الإسماعيلية", "Ismailia Branch", "Ismailia, Egypt", "01022220001"),
    ("فرع بورسعيد", "Port Said Branch", "Port Said, Egypt", "01022220002"),
]

DEMO_CUSTOMERS = [
    ("أحمد محمود", "01001234567", "عميل منتظم"),
    ("فاطمة إبراهيم", "01112345678", None),
    ("محمد حسن", "01223456789", "تأمين طبي"),
    ("سارة علي", "01098765432", "ولاء"),
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


def _seed_demo_content(schema_name: str, admin_username: str) -> None:
    from pricing import default_cost_from_price

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

        for name_ar, name_en, address, phone in DEMO_BRANCHES_EXTRA:
            cur.execute(
                """INSERT INTO branches (name_ar, name_en, address, phone)
                   SELECT %s, %s, %s, %s
                   WHERE NOT EXISTS (
                     SELECT 1 FROM branches WHERE name_en = %s
                   )""",
                [name_ar, name_en, address, phone, name_en],
            )

        supplier_ids: dict[str, int] = {}
        for slug, name, contact, phone in DEMO_SUPPLIERS:
            cur.execute(
                """INSERT INTO suppliers (name, contact_person, phone, active)
                   SELECT %s, %s, %s, true
                   WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = %s)
                   RETURNING id""",
                [name, contact, phone, name],
            )
            row = cur.fetchone()
            if row:
                supplier_ids[slug] = row["id"]
            else:
                cur.execute("SELECT id FROM suppliers WHERE name = %s", [name])
                found = cur.fetchone()
                if found:
                    supplier_ids[slug] = found["id"]

        cur.execute("SELECT id FROM branches ORDER BY id")
        branch_ids = [r["id"] for r in cur.fetchall()]

        for branch_id in branch_ids:
            for barcode, name_ar, name_en, category, unit, price, sup_slug, stock, min_stock, expiry, pack_size, sub_unit in DEMO_PRODUCTS:
                cost = default_cost_from_price(price)
                sup_id = supplier_ids.get(sup_slug)
                bc = f"{barcode}" if branch_id == main_branch_id else f"{barcode}-B{branch_id}"
                cur.execute(
                    """INSERT INTO products (
                         barcode, name_ar, name_en, category, unit, price, cost, avg_cost,
                         stock, min_stock, expiry_date, branch_id, supplier_id,
                         pack_size, sub_unit, vat_rate, active
                       )
                       SELECT %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0.14,true
                       WHERE NOT EXISTS (
                         SELECT 1 FROM products WHERE barcode = %s AND branch_id = %s
                       )""",
                    [
                        bc, name_ar, name_en, category, unit, price, cost, cost,
                        stock if branch_id == main_branch_id else max(10, stock // 3),
                        min_stock, expiry, branch_id, sup_id,
                        pack_size, sub_unit, bc, branch_id,
                    ],
                )

        for username, password, name_ar, name_en, role in DEMO_EXTRA_USERS:
            cur.execute(
                """INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id, status)
                   SELECT %s, %s, %s, %s, %s, %s, 'active'
                   WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = %s)""",
                [username, hash_password(password), name_ar, name_en, role, main_branch_id, username],
            )

        for name, phone, notes in DEMO_CUSTOMERS:
            cur.execute(
                """INSERT INTO customers (name, phone, notes, branch_id)
                   SELECT %s, %s, %s, %s
                   WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = %s)""",
                [name, phone, notes, main_branch_id, phone],
            )

        cur.execute(
            "SELECT id FROM users WHERE username = %s AND status = 'active'",
            [admin_username],
        )
        admin_row = cur.fetchone()
        if admin_row:
            cur.execute(
                """INSERT INTO shifts(user_id, branch_id, opening_cash, notes, shift_type)
                   SELECT %s, %s, 500, 'Demo shift (auto-opened)', 'morning'
                   WHERE NOT EXISTS (
                     SELECT 1 FROM shifts WHERE branch_id = %s AND closed_at IS NULL
                   )""",
                [admin_row["id"], main_branch_id, main_branch_id],
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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
