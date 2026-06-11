"""Control-plane (platform) schema: tenants and super-admin accounts.

The platform schema lives inside the same Postgres database as the tenants
but is isolated by schema name. Each tenant gets its own Postgres schema
(`tenant_<slug>`) populated by the standard init_db.SQL.
"""
import os
import re
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2 import sql

from db import get_platform_connection, get_raw_connection
from auth import hash_password

SLUG_RE = re.compile(r"^[a-z][a-z0-9_-]{2,29}$")
RESERVED_SLUGS = {"platform", "public", "default", "_platform", "admin", "tenant"}

# Master list of toggleable features. Keys are stable; UI uses labels.
# `default` = which features are enabled when a tenant is provisioned.
FEATURES_CATALOG = [
    {"key": "dashboard",  "label": "Dashboard",            "default": True},
    {"key": "pos",        "label": "Point of Sale",        "default": True},
    {"key": "sales",      "label": "Sales History",        "default": True},
    {"key": "returns",    "label": "Returns",              "default": True},
    {"key": "inventory",  "label": "Inventory",            "default": True},
    {"key": "transfers",  "label": "Branch Transfers",     "default": False},
    {"key": "branches_stock", "label": "Branches Stock Overview", "default": True},
    {"key": "expiry",     "label": "Expiry Tracking",      "default": True},
    {"key": "purchases",  "label": "Purchase Orders",      "default": True},
    {"key": "suppliers",  "label": "Suppliers",            "default": True},
    {"key": "customers",  "label": "Customers / Accounts", "default": True},
    {"key": "clinics",    "label": "Clinics & Prescriptions", "default": True},
    {"key": "reports",    "label": "Reports & Analytics",  "default": False},
    {"key": "fraud_surveillance", "label": "Fraud Surveillance", "default": False},
    {"key": "stock_reallocation", "label": "Smart Stock Reallocation", "default": False},
    {"key": "shifts",     "label": "Cash Shifts",          "default": True},
    {"key": "hr",         "label": "HR & Payroll",         "default": False},
    {"key": "settings",   "label": "Settings",             "default": True},
    {"key": "loyalty",    "label": "Loyalty Program",      "default": False},
]
DEFAULT_FEATURES = [f["key"] for f in FEATURES_CATALOG if f["default"]]
ALL_FEATURE_KEYS = {f["key"] for f in FEATURES_CATALOG}

# Default feature bundles per plan (used when seeding platform.plans).
_PLAN_FEATURE_PRESETS: dict[str, list[str]] = {
    "test": list(ALL_FEATURE_KEYS),
    "basic": [
        "dashboard", "pos", "sales", "returns", "inventory", "customers", "shifts", "settings",
    ],
    "pro": [
        "dashboard", "pos", "sales", "returns", "inventory", "transfers", "expiry",
        "purchases", "suppliers", "customers", "shifts", "settings",
    ],
    "enterprise": [
        "dashboard", "pos", "sales", "returns", "inventory", "transfers", "expiry",
        "purchases", "suppliers", "customers", "loyalty", "reports", "fraud_surveillance",
        "stock_reallocation", "shifts", "hr", "settings",
    ],
    "pilot": list(ALL_FEATURE_KEYS),
}

# Seed defaults for platform.plans (editable via Control Platform).
DEFAULT_PLANS = [
    {
        "key": "test",
        "label": "Test",
        "max_users": None,
        "max_branches": None,
        "price_le": 0,
        "notes": "For me to test before deploy to customers",
        "features": _PLAN_FEATURE_PRESETS["test"],
        "sort_order": 0,
    },
    {
        "key": "basic",
        "label": "Basic",
        "max_users": 3,
        "max_branches": 1,
        "price_le": 1000,
        "notes": "",
        "features": _PLAN_FEATURE_PRESETS["basic"],
        "sort_order": 1,
    },
    {
        "key": "pro",
        "label": "Pro",
        "max_users": 60,
        "max_branches": 5,
        "price_le": 2000,
        "notes": "",
        "features": _PLAN_FEATURE_PRESETS["pro"],
        "sort_order": 2,
    },
    {
        "key": "enterprise",
        "label": "Enterprise",
        "max_users": 100,
        "max_branches": 10,
        "price_le": 4500,
        "notes": "",
        "features": _PLAN_FEATURE_PRESETS["enterprise"],
        "sort_order": 3,
    },
    {
        "key": "pilot",
        "label": "Pilot",
        "max_users": None,
        "max_branches": None,
        "price_le": 90000,
        "notes": "",
        "features": _PLAN_FEATURE_PRESETS["pilot"],
        "sort_order": 4,
    },
]
_PENDING_FEATURE_BACKFILL = {"clinics", "loyalty"}
_FEATURE_ROLLOUT_LOCK = 778001
_FEATURE_ROLLOUT_SENTINEL = "__seeded__"


def is_tenant_live(t: dict) -> tuple[bool, str]:
    """Returns (live, reason). A tenant is live if status='active' AND not expired."""
    from datetime import date
    if t.get("status") != "active":
        return False, "This account is suspended. Please contact support."
    end = t.get("subscription_end")
    if end:
        # psycopg2 returns DATE as datetime.date
        try:
            end_d = end if isinstance(end, date) else date.fromisoformat(str(end))
            if end_d < date.today():
                return False, f"Subscription expired on {end_d.isoformat()}. Please contact support to renew."
        except Exception:
            pass
    return True, ""


def normalize_features(features) -> list[str]:
    """Whitelist filter; preserves order from catalog for stability."""
    if not features:
        return list(DEFAULT_FEATURES)
    if isinstance(features, str):
        features = [s.strip() for s in features.split(",") if s.strip()]
    requested = {f for f in features if f in ALL_FEATURE_KEYS}
    return [f["key"] for f in FEATURES_CATALOG if f["key"] in requested]


class _DuplicateSlug(Exception):
    """Internal sentinel: slug already exists; do not run destructive cleanup."""
    def __init__(self, slug: str):
        super().__init__(slug)
        self.slug = slug

PLATFORM_SQL = """
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.tenants (
    id            SERIAL PRIMARY KEY,
    slug          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(200) NOT NULL,
    schema_name   VARCHAR(100) UNIQUE NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'active',
    plan          VARCHAR(50) DEFAULT 'basic',
    contact_name  VARCHAR(200),
    contact_email VARCHAR(200),
    contact_phone VARCHAR(50),
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    suspended_at  TIMESTAMP
);

-- Idempotent column additions (safe on existing installs)
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS features          JSONB;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS subscription_start DATE;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS subscription_end   DATE;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS max_users         INT;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS max_branches      INT;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS price_le          INT;

CREATE TABLE IF NOT EXISTS platform.plans (
    key           VARCHAR(50) PRIMARY KEY,
    label         VARCHAR(100) NOT NULL,
    max_users     INT,
    max_branches  INT,
    price_le      INT NOT NULL DEFAULT 0,
    notes         TEXT,
    features      JSONB,
    sort_order    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS platform.super_admins (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(200),
    created_at    TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP
);
"""


# ─── Bootstrap ──────────────────────────────────────────────────────────────

def bootstrap_platform() -> None:
    """Create the platform schema, seed the default super-admin and the
    default tenant (mapped to the existing 'public' schema)."""
    conn = get_raw_connection()
    conn.autocommit = True
    try:
        cur = conn.cursor()
        cur.execute(PLATFORM_SQL)

        # Default super-admin
        cur.execute("SELECT COUNT(*) FROM platform.super_admins")
        if cur.fetchone()[0] == 0:
            u = os.getenv("PLATFORM_ADMIN_USERNAME", "superadmin")
            p = os.getenv("PLATFORM_ADMIN_PASSWORD", "super123")
            cur.execute(
                "INSERT INTO platform.super_admins(username, password_hash, name) "
                "VALUES (%s, %s, %s)",
                [u, hash_password(p), "Platform Owner"],
            )
            print(f"[platform] seeded super-admin '{u}' (change password ASAP)")

        # Default tenant pointing at the existing public schema
        cur.execute("SELECT COUNT(*) FROM platform.tenants")
        if cur.fetchone()[0] == 0:
            cur.execute(
                """INSERT INTO platform.tenants(slug, name, schema_name, status, plan)
                   VALUES (%s, %s, %s, 'active', 'pilot')""",
                ["fratelanza", "Fratelanza Pharmacy", "public"],
            )
            print("[platform] seeded default tenant 'fratelanza' -> public schema")

        cur.execute("SELECT pg_advisory_lock(%s)", [_FEATURE_ROLLOUT_LOCK])
        try:
            cur.execute(
                """CREATE TABLE IF NOT EXISTS platform.feature_rollouts (
                       feature_key TEXT PRIMARY KEY,
                       rolled_at   TIMESTAMPTZ DEFAULT now()
                   )"""
            )
            _default_on = [f["key"] for f in FEATURES_CATALOG if f.get("default")]
            cur.execute(
                "SELECT 1 FROM platform.feature_rollouts WHERE feature_key=%s",
                [_FEATURE_ROLLOUT_SENTINEL],
            )
            if cur.fetchone() is None:
                for fkey in _default_on:
                    if fkey in _PENDING_FEATURE_BACKFILL:
                        continue
                    cur.execute(
                        "INSERT INTO platform.feature_rollouts(feature_key) VALUES (%s) "
                        "ON CONFLICT DO NOTHING",
                        [fkey],
                    )
                cur.execute(
                    "INSERT INTO platform.feature_rollouts(feature_key) VALUES (%s) "
                    "ON CONFLICT DO NOTHING",
                    [_FEATURE_ROLLOUT_SENTINEL],
                )
            for fkey in _default_on:
                cur.execute(
                    "SELECT 1 FROM platform.feature_rollouts WHERE feature_key=%s",
                    [fkey],
                )
                if cur.fetchone():
                    continue
                cur.execute(
                    """UPDATE platform.tenants
                       SET features = COALESCE(features, '[]'::jsonb) || to_jsonb(%s::text)
                       WHERE features IS NOT NULL
                         AND NOT (features @> to_jsonb(%s::text))""",
                    [fkey, fkey],
                )
                cur.execute(
                    "INSERT INTO platform.feature_rollouts(feature_key) VALUES (%s) "
                    "ON CONFLICT DO NOTHING",
                    [fkey],
                )
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", [_FEATURE_ROLLOUT_LOCK])

        _seed_plans(cur)
    finally:
        conn.close()


def _seed_plans(cur) -> None:
    """Insert default plans; update label/price/notes on existing rows but preserve edited limits."""
    import json as _json
    for p in DEFAULT_PLANS:
        cur.execute(
            """INSERT INTO platform.plans(key, label, max_users, max_branches, price_le, notes, features, sort_order)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
               ON CONFLICT (key) DO UPDATE SET
                 label = EXCLUDED.label,
                 price_le = EXCLUDED.price_le,
                 notes = EXCLUDED.notes,
                 sort_order = EXCLUDED.sort_order""",
            [
                p["key"], p["label"], p["max_users"], p["max_branches"],
                p["price_le"], p["notes"] or None,
                _json.dumps(normalize_features(p["features"])),
                p["sort_order"],
            ],
        )


# ─── Plans ──────────────────────────────────────────────────────────────────

def list_plans() -> list:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM plans ORDER BY sort_order, key")
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            d["features"] = normalize_features(d.get("features"))
            rows.append(d)
        return rows
    finally:
        conn.close()


def get_plan(key: str) -> Optional[dict]:
    if not key:
        return None
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM plans WHERE key = %s", [key])
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["features"] = normalize_features(d.get("features"))
        return d
    finally:
        conn.close()


def update_plan(key: str, fields: dict) -> dict:
    import json as _json
    allowed = {"label", "max_users", "max_branches", "price_le", "notes", "sort_order"}
    sets = []
    params = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(sql.SQL("{} = %s").format(sql.Identifier(k)))
            params.append(v if v != "" else None)
    if "features" in fields:
        sets.append(sql.SQL("features = %s::jsonb"))
        params.append(_json.dumps(normalize_features(fields["features"])))
    if not sets:
        raise ValueError("No fields to update")
    params.append(key)
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            sql.SQL("UPDATE plans SET {} WHERE key = %s RETURNING *").format(
                sql.SQL(", ").join(sets)
            ),
            params,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("Plan not found")
        conn.commit()
        d = dict(row)
        d["features"] = normalize_features(d.get("features"))
        return d
    finally:
        conn.close()


def _fmt_plan_limit(n: Optional[int]) -> str:
    return "Unlimited" if n is None else str(n)


def plans_export_sheets() -> list[tuple[str, list, list]]:
    """Build (sheet_name, headers, rows) tuples for the plans/pricing workbook."""
    plans = list_plans()
    pricing_headers = [
        "Plan", "Key", "Max users", "Max branches", "Price (LE)", "Notes",
    ]
    pricing_rows = [
        [
            p["label"],
            p["key"],
            _fmt_plan_limit(p.get("max_users")),
            _fmt_plan_limit(p.get("max_branches")),
            p.get("price_le") or 0,
            p.get("notes") or "",
        ]
        for p in plans
    ]

    feature_headers = ["Feature"] + [p["label"] for p in plans]
    feature_rows = []
    for feat in FEATURES_CATALOG:
        row = [feat["label"]]
        for p in plans:
            feats = set(p.get("features") or [])
            row.append("Yes" if feat["key"] in feats else "—")
        feature_rows.append(row)

    return [
        ("Plans & Pricing", pricing_headers, pricing_rows),
        ("Features by Plan", feature_headers, feature_rows),
    ]


def get_tenant_limits(tenant: dict) -> dict:
    """Resolve effective max_users, max_branches, price_le for a tenant."""
    plan = get_plan(tenant.get("plan") or "basic") or {}

    def _pick(tenant_key: str, plan_key: str):
        if tenant.get(tenant_key) is not None:
            return tenant[tenant_key]
        return plan.get(plan_key)

    return {
        "max_users": _pick("max_users", "max_users"),
        "max_branches": _pick("max_branches", "max_branches"),
        "price_le": _pick("price_le", "price_le") or 0,
    }


def tenant_limits_payload(tenant: dict, usage: Optional[dict] = None) -> dict:
    """Limits + optional usage counts for API responses."""
    limits = get_tenant_limits(tenant)
    out = {
        "max_users": limits["max_users"],
        "max_branches": limits["max_branches"],
        "price_le": limits["price_le"],
    }
    if usage:
        out["users"] = usage.get("users", 0)
        out["branches"] = usage.get("branches", 0)
    return out


# ─── Tenant lookups ─────────────────────────────────────────────────────────

def get_tenant_by_slug(slug: str) -> Optional[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM tenants WHERE slug = %s", [slug])
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_tenant_by_id(tid: int) -> Optional[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM tenants WHERE id = %s", [tid])
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_tenants() -> list:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM tenants ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_tenant_stats(t: dict) -> dict:
    """Quick row counts inside a tenant schema. Best-effort; missing tables -> 0."""
    out = {"users": 0, "branches": 0, "products": 0, "invoices": 0}
    conn = get_raw_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            sql.SQL("SET search_path TO {}, public").format(
                sql.Identifier(t["schema_name"])
            )
        )
        for k, q in (
            ("users", "SELECT COUNT(*) FROM users"),
            ("branches", "SELECT COUNT(*) FROM branches"),
            ("products", "SELECT COUNT(*) FROM products"),
            ("invoices", "SELECT COUNT(*) FROM invoices"),
        ):
            try:
                cur.execute(q)
                out[k] = cur.fetchone()[0]
            except Exception:
                conn.rollback()  # the failed query left tx in error state
    finally:
        conn.close()
    return out


# ─── Provisioning ───────────────────────────────────────────────────────────

def create_tenant(
    *,
    slug: str,
    name: str,
    contact_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    contact_phone: Optional[str] = None,
    plan: str = "basic",
    notes: Optional[str] = None,
    admin_username: str = "admin",
    admin_password: str = "admin123",
    features: Optional[list] = None,
    subscription_start: Optional[str] = None,
    subscription_end: Optional[str] = None,
    max_users: Optional[int] = None,
    max_branches: Optional[int] = None,
    price_le: Optional[int] = None,
) -> dict:
    """Race-safe atomic tenant provisioning.

    Sequence (under a Postgres advisory lock keyed on slug hash so concurrent
    creates of the same slug serialize cleanly):
      1. Acquire advisory lock on hashtext(slug) inside the platform tx.
      2. INSERT tenant row with status='provisioning' — UNIQUE constraint on
         (slug, schema_name) is the authoritative race guard.
      3. CREATE SCHEMA + run init_db.SQL + seed branch & admin user in a
         separate raw connection (with its own tx).
      4. UPDATE tenant row to status='active' and COMMIT the platform tx
         (releasing the advisory lock).
      5. On any failure between 3-5: DROP SCHEMA (we own it under the lock)
         and ROLLBACK the platform tx (which deletes the row).
    """
    slug = (slug or "").strip().lower()
    if not SLUG_RE.match(slug):
        raise ValueError(
            "Slug must be 3-30 chars, lowercase letters/digits/_/-, starting with a letter"
        )
    if slug in RESERVED_SLUGS:
        raise ValueError(f"Slug '{slug}' is reserved")

    schema_name = f"tenant_{slug.replace('-', '_')}"
    features_norm = normalize_features(features)

    import json as _json
    import init_db

    pconn = get_platform_connection()  # already autocommit=False; tx started by SET search_path
    schema_created_by_us = False  # only True after CREATE SCHEMA succeeds under our lock
    try:
        pcur = pconn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Serialize concurrent provisioning of the same slug within this txn.
        pcur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [slug])

        # Reserve the tenant row first — UNIQUE(slug) and UNIQUE(schema_name)
        # are the source of truth, not an application-level pre-check.
        # If this raises UniqueViolation we MUST NOT touch the schema, because
        # another tenant legitimately owns it.
        try:
            pcur.execute(
                """INSERT INTO tenants(slug, name, schema_name, status, plan,
                                        contact_name, contact_email, contact_phone, notes,
                                        features, subscription_start, subscription_end,
                                        max_users, max_branches, price_le)
                   VALUES (%s, %s, %s, 'provisioning', %s, %s, %s, %s, %s,
                           %s::jsonb, %s, %s, %s, %s, %s)
                   RETURNING *""",
                [slug, name, schema_name, plan,
                 contact_name, contact_email, contact_phone, notes,
                 _json.dumps(features_norm),
                 subscription_start or None,
                 subscription_end or None,
                 max_users, max_branches, price_le],
            )
        except psycopg2.errors.UniqueViolation:
            pconn.rollback()
            # IMPORTANT: return directly, not via `raise`, so the outer
            # `except Exception` cleanup (which drops the schema) does NOT run.
            # Otherwise we would delete another tenant's data.
            raise _DuplicateSlug(slug)
        row = dict(pcur.fetchone())

        # Provision the schema in a separate connection so its transaction is
        # independent of the platform tx (avoids holding locks unnecessarily).
        rconn = get_raw_connection()  # already autocommit=False
        try:
            rcur = rconn.cursor()
            # If a previous failed provision left an orphan schema with the
            # same name, our lock guarantees no concurrent owner exists.
            rcur.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                    sql.Identifier(schema_name)
                )
            )
            rcur.execute(
                sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema_name))
            )
            schema_created_by_us = True  # from here on, the schema is ours to drop on failure
            rcur.execute(
                sql.SQL("SET search_path TO {}, public").format(
                    sql.Identifier(schema_name)
                )
            )
            rcur.execute(init_db.SQL)
            rcur.execute(
                """INSERT INTO branches(name_ar, name_en, address, phone)
                   VALUES (%s, %s, %s, %s) RETURNING id""",
                ["الفرع الرئيسي", "Main Branch", "", ""],
            )
            branch_id = rcur.fetchone()[0]
            rcur.execute(
                """INSERT INTO users(username, password_hash, name_ar, name_en,
                                      role, branch_id, status)
                   VALUES (%s, %s, %s, %s, 'admin', %s, 'active')""",
                [admin_username, hash_password(admin_password),
                 "المدير", "Administrator", branch_id],
            )
            rconn.commit()
        except Exception:
            rconn.rollback()
            # We still hold the advisory lock and own the tenant row, so it
            # is safe to drop the schema we tried to create. Use a fresh
            # cursor + explicit commit (don't toggle autocommit on a conn
            # that just had an aborted tx — psycopg2 rejects that).
            try:
                cleanup_cur = rconn.cursor()
                cleanup_cur.execute(
                    sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                        sql.Identifier(schema_name)
                    )
                )
                rconn.commit()
            except Exception:
                pass
            raise
        finally:
            rconn.close()

        # Flip status to 'active' and commit (releases advisory lock).
        pcur.execute(
            "UPDATE tenants SET status='active' WHERE id=%s RETURNING *",
            [row["id"]],
        )
        row = dict(pcur.fetchone())
        pconn.commit()
        return row
    except _DuplicateSlug:
        # Slug already belongs to another tenant. DO NOT touch the schema.
        raise ValueError(f"Slug '{slug}' is already in use")
    except Exception:
        try:
            pconn.rollback()
        except Exception:
            pass
        # Only drop the schema if WE created it under the advisory lock. If
        # schema_created_by_us is False the slug/schema either never existed
        # or belongs to another tenant — never drop in that case.
        if schema_created_by_us:
            try:
                rconn2 = get_raw_connection()
                cur2 = rconn2.cursor()
                cur2.execute(
                    sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                        sql.Identifier(schema_name)
                    )
                )
                rconn2.commit()
                rconn2.close()
            except Exception:
                pass
        raise
    finally:
        pconn.close()


def update_tenant(tid: int, fields: dict) -> dict:
    import json as _json
    allowed = {"name", "status", "plan", "contact_name", "contact_email",
               "contact_phone", "notes", "subscription_start", "subscription_end",
               "max_users", "max_branches", "price_le"}
    sets = []
    params = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(sql.SQL("{} = %s").format(sql.Identifier(k)))
            if k in ("max_users", "max_branches", "price_le"):
                params.append(v)
            else:
                params.append(v if v != "" else None)
    if "features" in fields:
        sets.append(sql.SQL("features = %s::jsonb"))
        params.append(_json.dumps(normalize_features(fields["features"])))
    if "status" in fields:
        sets.append(sql.SQL("suspended_at = %s"))
        params.append(None if fields["status"] == "active" else "now()")
        # but easier to just use NOW() literal; rewrite:
        sets.pop()
        params.pop()
        if fields["status"] == "active":
            sets.append(sql.SQL("suspended_at = NULL"))
        else:
            sets.append(sql.SQL("suspended_at = NOW()"))
    if not sets:
        raise ValueError("No fields to update")
    params.append(tid)
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            sql.SQL("UPDATE tenants SET {} WHERE id = %s RETURNING *").format(
                sql.SQL(", ").join(sets)
            ),
            params,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("Tenant not found")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


def delete_tenant(tid: int) -> None:
    t = get_tenant_by_id(tid)
    if not t:
        raise ValueError("Tenant not found")
    if t["schema_name"] in ("public", "platform"):
        raise ValueError("Refusing to drop a system schema")
    # Drop schema first
    conn = get_raw_connection()
    conn.autocommit = True
    try:
        cur = conn.cursor()
        cur.execute(
            sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                sql.Identifier(t["schema_name"])
            )
        )
    finally:
        conn.close()
    # Then remove the row
    pconn = get_platform_connection()
    pcur = pconn.cursor()
    try:
        pcur.execute("DELETE FROM tenants WHERE id = %s", [tid])
        pconn.commit()
    finally:
        pconn.close()


def apply_schema_to_all_tenants() -> dict:
    """Self-heal: run init_db.SQL against every tenant schema. Idempotent."""
    import init_db
    out = {"ok": 0, "failed": []}
    for t in list_tenants():
        schema = t["schema_name"]
        try:
            conn = get_raw_connection()
            cur = conn.cursor()
            cur.execute(
                sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema))
            )
            cur.execute(init_db.SQL)
            conn.commit()
            conn.close()
            out["ok"] += 1
        except Exception as e:
            out["failed"].append({"slug": t["slug"], "error": str(e)})
    return out


# ─── Super admin lookups ────────────────────────────────────────────────────

def get_super_admin_by_username(username: str) -> Optional[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM super_admins WHERE username = %s", [username])
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_super_admin_by_id(sa_id: int) -> Optional[dict]:
    conn = get_platform_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, username, name, last_login_at FROM super_admins WHERE id = %s", [sa_id])
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def touch_super_admin_login(sa_id: int) -> None:
    conn = get_platform_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE super_admins SET last_login_at = NOW() WHERE id = %s", [sa_id])
        conn.commit()
    finally:
        conn.close()


def change_super_admin_password(sa_id: int, new_password: str) -> None:
    conn = get_platform_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE super_admins SET password_hash = %s WHERE id = %s",
            [hash_password(new_password), sa_id],
        )
        conn.commit()
    finally:
        conn.close()
