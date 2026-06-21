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

DEMO_EXTRA_USERS: list = []  # demo links use admin only

DEMO_PRODUCTS = [
    ("6223001001", "باراسيتامول 500 مجم", "Paracetamol 500mg", "Analgesics", "strip", 5.00, 3.00, 120, 20, "2026-06-30"),
    ("6223001002", "أموكسيسيلين 250 مجم", "Amoxicillin 250mg", "Antibiotics", "box", 25.00, 16.00, 80, 15, "2026-09-30"),
    ("6223001003", "إيبوبروفين 400 مجم", "Ibuprofen 400mg", "Analgesics", "strip", 8.00, 5.00, 95, 20, "2027-01-31"),
    ("6223001004", "أوميبرازول 20 مجم", "Omeprazole 20mg", "Gastric", "box", 18.00, 11.00, 60, 10, "2026-12-31"),
    ("6223001005", "فيتامين سي 1000", "Vitamin C 1000mg", "Vitamins", "box", 35.00, 22.00, 45, 10, "2027-06-30"),
    ("6223001006", "أسبرين 100 مجم", "Aspirin 100mg", "Cardiology", "strip", 6.00, 4.00, 200, 30, "2027-03-31"),
    ("6223001007", "سيتيريزين 10 مجم", "Cetirizine 10mg", "Antihistamines", "strip", 7.00, 4.50, 70, 15, "2026-08-31"),
    ("6223001008", "ميتفورمين 500 مجم", "Metformin 500mg", "Diabetes", "box", 22.00, 14.00, 55, 10, "2026-11-30"),
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
        branch_id = branch_row["id"]

        for barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry in DEMO_PRODUCTS:
            cur.execute(
                """INSERT INTO products (barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry_date, branch_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry, branch_id],
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
                [admin_row["id"], branch_id, branch_id],
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
