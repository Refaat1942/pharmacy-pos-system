from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import psycopg2.extras
import os
import time
from collections import defaultdict
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
from auth import create_token, verify_password, verify_token
from db import get_db_connection
from deps import get_current_user, get_active_branch_id, resolve_analytics_branch
from tenant_ctx import set_current_schema
from inventory import router as inventory_router, log_movement
from stock_batches import add_batch_stock, assert_sellable, deduct_stock_fefo, sync_product_from_batches
from purchasing import router as purchasing_router
from customers import router as customers_router
from clinics import router as clinics_router

app = FastAPI(title="PharmaPOS API", docs_url=None, redoc_url=None, openapi_url=None) \
    if os.getenv("ENVIRONMENT") == "production" else FastAPI(title="PharmaPOS API")

# CORS: lock to explicit origins in production, allow wildcard only in dev.
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
if _cors_env:
    _allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
elif os.getenv("ENVIRONMENT") == "production":
    _allowed_origins = ["https://erp.fratelanza.com"]
else:
    _allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Block Host header attacks in production.
if os.getenv("ENVIRONMENT") == "production":
    _trusted_hosts = [o.replace("https://", "").replace("http://", "") for o in _allowed_origins if "*" not in o]
    if _trusted_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted_hosts + ["localhost", "127.0.0.1"])

# Simple in-memory login throttle (per IP+username): 8 failed attempts → 15-min lockout.
# Resets on successful login. For multi-worker setups this is per-worker (fine for 4 workers).
_LOGIN_FAILURES: dict = defaultdict(list)  # key -> list[timestamp]
_LOGIN_MAX_FAILS = 8
_LOGIN_WINDOW = 15 * 60  # 15 minutes

def _login_throttle_check(key: str) -> None:
    now = time.time()
    fails = [t for t in _LOGIN_FAILURES[key] if now - t < _LOGIN_WINDOW]
    _LOGIN_FAILURES[key] = fails
    if len(fails) >= _LOGIN_MAX_FAILS:
        retry = int(_LOGIN_WINDOW - (now - fails[0]))
        raise HTTPException(status_code=429, detail=f"Too many login attempts. Try again in {retry//60+1} minutes.")

def _login_throttle_record_failure(key: str) -> None:
    _LOGIN_FAILURES[key].append(time.time())

def _login_throttle_clear(key: str) -> None:
    _LOGIN_FAILURES.pop(key, None)


# ─── Tenant resolution middleware ───────────────────────────────────────────
# Reads the JWT, looks up the tenant's Postgres schema, and stores it in a
# contextvar so get_db_connection() routes queries to the correct schema.
# FAIL CLOSED: any tenant-scoped request with an unresolvable / suspended /
# missing tenant is rejected here, before it can fall through to 'public'.

from fastapi.responses import JSONResponse  # noqa: E402
from tenant_ctx import reset_current_schema  # noqa: E402
from platform_db import get_tenant_by_slug  # noqa: E402


def _needs_tenant(path: str) -> bool:
    """Returns True if this path runs in tenant context."""
    if not path.startswith("/api/"):
        return False
    if path == "/api/auth/login":
        return False
    if path.startswith("/api/platform/"):
        return False
    if path.startswith("/api/clinic/"):
        return False
    return True


@app.middleware("http")
async def tenant_middleware(request: Request, call_next):
    """Resolve tenant from JWT and set the contextvar for the request.

    Always reset the contextvar in finally so no value leaks between requests
    that share a worker / async task. Fail closed on any unresolvable tenant.
    """
    path = request.url.path

    # Always start each request with a clean tenant context.
    token = set_current_schema(None)
    try:
        if not _needs_tenant(path):
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return await call_next(request)  # no token -> deps will 401

        payload = verify_token(auth[7:])
        if not payload:
            return await call_next(request)  # bad token -> deps will 401

        if payload.get("scope") == "platform":
            return await call_next(request)  # platform token -> deps will 403

        slug = payload.get("tenant_slug")
        if not slug:
            return JSONResponse(
                {"detail": "Token is missing tenant context"}, status_code=401
            )

        # Per-request lookup on the UNIQUE-indexed slug column. Cheap, and
        # eliminates every cache-staleness bug (suspend/delete take effect
        # immediately for already-issued JWTs).
        tenant = get_tenant_by_slug(slug)
        if not tenant:
            return JSONResponse({"detail": "Tenant not found"}, status_code=401)
        from platform_db import is_tenant_live
        live, reason = is_tenant_live(tenant)
        if not live:
            return JSONResponse({"detail": reason}, status_code=403)

        set_current_schema(tenant["schema_name"])
        return await call_next(request)
    finally:
        reset_current_schema(token)


from deps import requires_feature
app.include_router(inventory_router, dependencies=[Depends(requires_feature("inventory"))])
app.include_router(purchasing_router, dependencies=[Depends(requires_feature("purchases"))])
app.include_router(customers_router, dependencies=[Depends(requires_feature("customers"))])
app.include_router(clinics_router)
from settings import router as settings_router
app.include_router(settings_router, dependencies=[Depends(requires_feature("settings"))])
from reports import router as reports_router
app.include_router(reports_router, dependencies=[Depends(requires_feature("reports"))])
from fraud import router as fraud_router
app.include_router(fraud_router, dependencies=[Depends(requires_feature("fraud_surveillance"))])
from shifts import router as shifts_router
app.include_router(shifts_router, dependencies=[Depends(requires_feature("shifts"))])
from hr import router as hr_router, _normalize_code
app.include_router(hr_router, dependencies=[Depends(requires_feature("hr"))])
from offers import router as offers_router
app.include_router(offers_router)
from platform_api import router as platform_router
app.include_router(platform_router)
from ai_assistant import router as ai_assistant_router
app.include_router(ai_assistant_router)
from loyalty import router as loyalty_router
app.include_router(loyalty_router)
from pos_counseling import router as pos_counseling_router
app.include_router(pos_counseling_router)
from digital_platforms import router as digital_platforms_router
app.include_router(digital_platforms_router)


@app.on_event("startup")
def _ensure_schema():
    """Self-heal: idempotently create any missing tables on every boot.

    Bootstraps the control-plane (platform schema + default super-admin +
    default tenant pointing to the existing public schema), then runs the
    tenant init SQL against every tenant schema.
    """
    try:
        import os, sys
        sys.path.insert(0, os.path.dirname(__file__))
        from platform_db import bootstrap_platform, apply_schema_to_all_tenants
        bootstrap_platform()
        result = apply_schema_to_all_tenants()
        print(f"[startup] tenant schemas verified: {result}")
    except Exception as e:
        print(f"[startup] schema check failed (non-fatal): {e}")


# ─── AUTH ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    tenant_slug: str = "fratelanza"
    username: str
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest, request: Request):
    throttle_key = f"{request.client.host if request.client else 'unknown'}|{req.tenant_slug.strip().lower()}|{req.username.lower()}"
    _login_throttle_check(throttle_key)
    tenant = get_tenant_by_slug(req.tenant_slug.strip().lower())
    if not tenant:
        _login_throttle_record_failure(throttle_key)
        raise HTTPException(status_code=401, detail="Invalid pharmacy code or credentials")
    from platform_db import (
        is_tenant_live, normalize_features, resolve_feature_options,
        get_tenant_stats, tenant_limits_payload,
    )
    live, reason = is_tenant_live(tenant)
    if not live:
        raise HTTPException(status_code=403, detail=reason)
    conn = get_db_connection(schema=tenant["schema_name"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM users WHERE username = %s AND status = 'active'",
        (req.username,)
    )
    user = cur.fetchone()
    conn.close()
    if not user or not verify_password(req.password, user["password_hash"]):
        _login_throttle_record_failure(throttle_key)
        raise HTTPException(status_code=401, detail="Invalid pharmacy code or credentials")
    _login_throttle_clear(throttle_key)
    token = create_token({
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
        "token": token,
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
            "features": normalize_features(tenant.get("features")),
            "feature_options": resolve_feature_options(tenant),
            "subscription_start": tenant.get("subscription_start").isoformat() if tenant.get("subscription_start") else None,
            "subscription_end": tenant.get("subscription_end").isoformat() if tenant.get("subscription_end") else None,
            "limits": tenant_limits_payload(tenant, get_tenant_stats(tenant)),
        },
    }


@app.get("/api/auth/me")
def get_me(current_user=Depends(get_current_user)):
    # Return fresh tenant info too, so the frontend can react to feature/plan
    # changes made in the super-admin without forcing a logout.
    from platform_db import (
        get_tenant_by_slug, normalize_features, resolve_feature_options,
        is_tenant_live, get_tenant_stats, tenant_limits_payload,
    )
    slug = current_user.get("tenant_slug")
    tenant_payload = None
    if slug:
        t = get_tenant_by_slug(slug)
        if t:
            live, reason = is_tenant_live(t)
            tenant_payload = {
                "slug": t["slug"],
                "name": t["name"],
                "plan": t.get("plan"),
                "features": normalize_features(t.get("features")),
                "feature_options": resolve_feature_options(t),
                "subscription_start": t["subscription_start"].isoformat() if t.get("subscription_start") else None,
                "subscription_end": t["subscription_end"].isoformat() if t.get("subscription_end") else None,
                "active": live,
                "inactive_reason": None if live else reason,
                "limits": tenant_limits_payload(t, get_tenant_stats(t)),
            }
    user_payload = None
    uid = current_user.get("user_id")
    if uid and slug:
        try:
            t = get_tenant_by_slug(slug)
            if t:
                uconn = get_db_connection(schema=t["schema_name"])
                ucur = uconn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                ucur.execute(
                    "SELECT id, username, name_ar, name_en, role, branch_id, permissions, status FROM users WHERE id=%s",
                    (uid,),
                )
                row = ucur.fetchone()
                uconn.close()
                if row:
                    if row.get("status") and row["status"] != "active":
                        raise HTTPException(status_code=401, detail="Account is inactive")
                    user_payload = {
                        "id": row["id"],
                        "username": row["username"],
                        "name_ar": row["name_ar"],
                        "name_en": row["name_en"],
                        "role": row["role"],
                        "branch_id": row["branch_id"],
                        "permissions": row.get("permissions"),
                    }
        except HTTPException:
            raise
        except Exception:
            pass
    return {**current_user, "tenant": tenant_payload, "user": user_payload}


class UnlockRequest(BaseModel):
    password: str | None = None
    card_code: str | None = None


@app.post("/api/auth/unlock")
def unlock_terminal(req: UnlockRequest, request: Request, current_user=Depends(get_current_user)):
    """Verify the currently logged-in user to release a locked terminal.

    Accepts EITHER the user's password OR their personal card code (scanned
    QR/barcode). The token stays valid the whole time, so this only re-confirms
    the same person is back at the keyboard."""
    uid = current_user.get("user_id")
    if not uid:
        raise HTTPException(status_code=401, detail="Missing user context")
    throttle_key = f"unlock|{request.client.host if request.client else 'unknown'}|{uid}"
    _login_throttle_check(throttle_key)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            "SELECT password_hash, card_code, status FROM users WHERE id=%s",
            (uid,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if not row or (row.get("status") and row["status"] != "active"):
        raise HTTPException(status_code=401, detail="Account is inactive")

    pw = (req.password or "").strip()
    code = (req.card_code or "").strip()
    if pw:
        if verify_password(pw, row["password_hash"]):
            _login_throttle_clear(throttle_key)
            return {"ok": True}
    if code:
        stored = (row.get("card_code") or "").strip()
        if stored and code.upper() == stored.upper():
            _login_throttle_clear(throttle_key)
            return {"ok": True}
    _login_throttle_record_failure(throttle_key)
    raise HTTPException(status_code=401, detail="Incorrect password or card")


# ─── PRODUCTS ────────────────────────────────────────────────────────────────

@app.get("/api/products")
def search_products(q: str = "",
                    current_user=Depends(get_current_user),
                    active_branch=Depends(get_active_branch_id)):
    from barcode_utils import product_search_clause

    q = (q or "").strip()
    if not q:
        return []
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    search_clause, params = product_search_clause(q)
    where = ["active = true", search_clause]
    if active_branch is not None:
        where.append("(branch_id = %s OR branch_id IS NULL)")
        params.append(active_branch)
    cur.execute(
        f"SELECT * FROM products WHERE {' AND '.join(where)} ORDER BY name_en LIMIT 60",
        params,
    )
    products = cur.fetchall()
    conn.close()
    return [dict(p) for p in products]


@app.get("/api/branches")
def list_branches(current_user=Depends(get_current_user)):
    """List branches visible to the user. Non-admins only see their own."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if current_user.get("role") == "admin":
        cur.execute("SELECT id, name_ar, name_en, address, phone FROM branches ORDER BY id")
    else:
        cur.execute(
            "SELECT id, name_ar, name_en, address, phone FROM branches WHERE id=%s",
            (current_user.get("branch_id"),),
        )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/products/{product_id}")
def get_product(product_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    product = cur.fetchone()
    conn.close()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return dict(product)


@app.get("/api/pos/quick-items")
def pos_quick_items(
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    """Small / change items configured for one-tap add on POS (tissues, bags, etc.)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT pos_quick_items FROM pharmacy_profile WHERE id = 1")
        row = cur.fetchone()
        ids = row.get("pos_quick_items") if row else None
        if not ids or not isinstance(ids, list):
            return []
        id_list = [int(x) for x in ids if str(x).isdigit() or isinstance(x, int)]
        if not id_list:
            return []
        placeholders = ",".join(["%s"] * len(id_list))
        cur.execute(
            f"""SELECT * FROM products
                WHERE id IN ({placeholders}) AND active = true""",
            id_list,
        )
        by_id = {int(p["id"]): dict(p) for p in cur.fetchall()}
        out = []
        for pid in id_list:
            p = by_id.get(pid)
            if not p:
                continue
            if active_branch is not None and p.get("branch_id") not in (None, active_branch):
                continue
            out.append(p)
        return out
    finally:
        conn.close()


class ProductCreate(BaseModel):
    barcode: Optional[str] = None
    international_barcode: Optional[str] = None
    name_ar: Optional[str] = None
    name_en: str
    category: Optional[str] = None
    unit: Optional[str] = "box"
    price: float
    cost: Optional[float] = None
    stock: int = 0
    min_stock: int = 5
    expiry_date: Optional[date] = None
    pack_size: Optional[int] = 1
    sub_unit: Optional[str] = None
    sub_price: Optional[float] = None


@app.post("/api/products")
def create_product(req: ProductCreate, current_user=Depends(get_current_user)):
    req.name_ar = (req.name_ar or "").strip() or None
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        branch_id = current_user.get("branch_id")
        cur.execute(
            """INSERT INTO products (barcode, international_barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry_date, branch_id, pack_size, sub_unit, sub_price)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (req.barcode, req.international_barcode, req.name_ar, req.name_en, req.category, req.unit,
             req.price, req.cost, req.stock, req.min_stock, req.expiry_date,
             branch_id, max(1, req.pack_size or 1), req.sub_unit, req.sub_price),
        )
        product = cur.fetchone()
        if req.stock and req.stock > 0:
            add_batch_stock(cur, product["id"], branch_id, req.stock, req.expiry_date)
            new_stock = sync_product_from_batches(cur, product["id"])
            log_movement(
                cur, product["id"], branch_id, "initial",
                req.stock, new_stock,
                reference_type="initial", reason="Initial stock on item creation",
                user_id=current_user.get("user_id"),
            )
        conn.commit()
        return dict(product)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─── CUSTOMERS ───────────────────────────────────────────────────────────────

@app.get("/api/customers")
def list_customers(q: str = "", current_user=Depends(get_current_user)):
    """Legacy customer lookup (used by POS). Branch-scoped for non-admins:
    only customers with at least one invoice in the user's branch are visible."""
    from digital_platforms import sql_exclude_platform_partner_customers
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    like = f"%{q}%"
    partner_filter = sql_exclude_platform_partner_customers("c")
    if current_user.get("role") == "admin":
        cur.execute(
            f"SELECT * FROM customers c WHERE (c.name ILIKE %s OR c.phone ILIKE %s) "
            f"AND COALESCE(c.active, true)=true AND ({partner_filter}) "
            f"ORDER BY c.name LIMIT 30",
            (like, like),
        )
    else:
        ub = current_user.get("branch_id")
        if ub is None:
            conn.close()
            return []
        cur.execute(
            f"SELECT * FROM customers c WHERE (c.name ILIKE %s OR c.phone ILIKE %s) "
            f"AND COALESCE(c.active, true)=true AND ({partner_filter}) AND EXISTS "
            f"(SELECT 1 FROM customer_branches cb WHERE cb.customer_id=c.id AND cb.branch_id=%s) "
            f"ORDER BY c.name LIMIT 30",
            (like, like, ub),
        )
    customers = cur.fetchall()
    conn.close()
    return [dict(c) for c in customers]


class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/customers")
def create_customer(req: CustomerCreate, current_user=Depends(get_current_user)):
    """Quick-create from POS — admin only. Non-admins must request the admin
    to open a customer account (which authorizes specific branches)."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create customers")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_id = current_user.get("branch_id")
    cur.execute(
        "INSERT INTO customers (name, phone, notes, branch_id, active) VALUES (%s,%s,%s,%s,true) RETURNING *",
        (req.name, req.phone, req.notes, branch_id),
    )
    customer = cur.fetchone()
    if branch_id is not None:
        cur.execute(
            "INSERT INTO customer_branches (customer_id, branch_id, authorized_by) "
            "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
            (customer["id"], branch_id, current_user.get("user_id")),
        )
    conn.commit()
    conn.close()
    return dict(customer)


# ─── EMPLOYEES ───────────────────────────────────────────────────────────────

@app.get("/api/employees")
def list_employees(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, name_ar, name_en, role, status FROM users WHERE status='active' ORDER BY COALESCE(NULLIF(name_en,''), name_ar)"
    )
    employees = cur.fetchall()
    conn.close()
    return [dict(e) for e in employees]


@app.get("/api/employees/by-code")
def lookup_seller_by_code(code: str, current_user=Depends(get_current_user)):
    """Resolve an active POS seller from a scanned login card (card_code) or HR clock QR (clock_code)."""
    raw = (code or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Code is required")
    key = raw.upper()
    norm = _normalize_code(raw)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # Exact (case-insensitive) match on the user login card first.
        cur.execute(
            """SELECT id, name_ar, name_en, role, status
               FROM users
               WHERE status = 'active' AND UPPER(card_code) = %s""",
            [key],
        )
        row = cur.fetchone()
        if not row and norm:
            cur.execute(
                """SELECT id, name_ar, name_en, role, status
                   FROM users
                   WHERE status = 'active'
                     AND UPPER(REGEXP_REPLACE(card_code, '[^A-Za-z0-9]', '', 'g')) = %s""",
                [norm],
            )
            row = cur.fetchone()
        if not row:
            cur.execute(
                """SELECT u.id, u.name_ar, u.name_en, u.role, u.status
                   FROM employees e
                   JOIN users u ON u.employee_id = e.id AND u.status = 'active'
                   WHERE e.active = TRUE AND UPPER(e.clock_code) = %s""",
                [key],
            )
            row = cur.fetchone()
        if not row and norm:
            cur.execute(
                """SELECT u.id, u.name_ar, u.name_en, u.role, u.status
                   FROM employees e
                   JOIN users u ON u.employee_id = e.id AND u.status = 'active'
                   WHERE e.active = TRUE
                     AND UPPER(REGEXP_REPLACE(e.clock_code, '[^A-Za-z0-9]', '', 'g')) = %s""",
                [norm],
            )
            row = cur.fetchone()
        if not row:
            cur.execute(
                """SELECT 1 FROM employees
                   WHERE active = TRUE
                     AND (UPPER(clock_code) = %s
                          OR UPPER(REGEXP_REPLACE(clock_code, '[^A-Za-z0-9]', '', 'g')) = %s)""",
                [key, norm],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=404,
                    detail="Employee card found but no active POS user is linked — link the user in Settings",
                )
            raise HTTPException(status_code=404, detail="Seller not found for this code")
        return dict(row)
    finally:
        cur.close()
        conn.close()


# ─── SALES ───────────────────────────────────────────────────────────────────

def _is_shipment_sale(sale_type: str, delivery_address: Optional[str]) -> bool:
    """Cash/delivery and digital (Talabat, etc.) orders with an address go to the delivery queue."""
    if sale_type == "delivery":
        return True
    if sale_type == "digital" and (delivery_address or "").strip():
        return True
    return False


def _invoice_has_customer(
    customer_id: Optional[int],
    delivery_customer_name: Optional[str],
    delivery_customer_phone: Optional[str],
) -> bool:
    if customer_id:
        return True
    name = (delivery_customer_name or "").strip()
    phone = (delivery_customer_phone or "").strip()
    return bool(name and phone)


def _validate_delivery_digital_sale(
    sale_type: str,
    delivery_person_id: Optional[int],
    customer_id: Optional[int],
    delivery_customer_name: Optional[str],
    delivery_customer_phone: Optional[str],
    delivery_address: Optional[str],
) -> None:
    """Delivery and digital orders must have a driver and customer before completion."""
    if sale_type not in ("delivery", "digital"):
        return
    if not delivery_person_id:
        raise HTTPException(
            status_code=400,
            detail="Assign a delivery person before completing delivery or digital orders",
        )
    if not _invoice_has_customer(customer_id, delivery_customer_name, delivery_customer_phone):
        raise HTTPException(
            status_code=400,
            detail="A customer is required for delivery and digital orders — select a customer or enter delivery name and phone",
        )
    if sale_type == "delivery" and not (delivery_address or "").strip():
        raise HTTPException(status_code=400, detail="Delivery address is required for delivery orders")


SHIPMENT_INVOICE_SQL = (
    "(i.type = 'delivery' OR "
    "(i.type = 'digital' AND NULLIF(TRIM(COALESCE(i.delivery_address, '')), '') IS NOT NULL))"
)


class InvoiceItemInput(BaseModel):
    product_id: int
    quantity: int
    unit_price: float
    discount: float = 0.0
    offer_id: Optional[int] = None
    offer_discount: float = 0.0
    # "pack" (main unit, default) or "sub" (inner unit when pack_size > 1)
    unit_type: Optional[str] = "pack"
    dose_text: Optional[str] = None


class SaleRequest(BaseModel):
    type: str
    payment_method: str
    digital_type: Optional[str] = None
    items: List[InvoiceItemInput]
    discount: float = 0.0
    cash_amount: Optional[float] = None
    visa_amount: Optional[float] = None
    customer_id: Optional[int] = None
    seller_id: Optional[int] = None
    clinic_id: Optional[int] = None
    prescription_id: Optional[int] = None
    notes: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_fee: Optional[float] = None
    delivery_customer_name: Optional[str] = None
    delivery_customer_phone: Optional[str] = None
    delivery_person_id: Optional[int] = None
    delivery_person_name: Optional[str] = None
    account_paid_amount: Optional[float] = None
    account_paid_method: Optional[str] = None
    offer_ids: Optional[List[int]] = None
    offer_savings: float = 0.0
    offer_names: Optional[str] = None
    loyalty_points_redeemed: int = 0


@app.post("/api/sales")
def create_sale(req: SaleRequest,
                current_user=Depends(get_current_user),
                active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if req.type != "return":
            if active_branch is None:
                raise HTTPException(400, "Active branch is required to complete a sale")
            from shifts import assert_open_shift_for_sales
            assert_open_shift_for_sales(cur, current_user["user_id"], active_branch)

        if req.type == "digital":
            from feature_access import user_feature_option
            if not user_feature_option(current_user, "pos", "digital_sales"):
                raise HTTPException(400, "Digital platform sales are not enabled for your account")

        subtotal = sum(i.quantity * i.unit_price for i in req.items)
        delivery_fee = float(req.delivery_fee or 0) if (req.delivery_fee and req.type != "return") else 0.0
        net_total = subtotal - req.discount + delivery_fee

        if req.type != "return" and net_total > 100 and not req.customer_id and not (req.delivery_customer_name or "").strip():
            raise HTTPException(status_code=400, detail="Customer information is required for sales over EGP 100")

        cur.execute("SELECT (SELECT COUNT(*) FROM invoices) + (SELECT COUNT(*) FROM returns) AS cnt")
        count = cur.fetchone()["cnt"]
        invoice_number = f"INV-{datetime.now().strftime('%Y%m%d')}-{int(count)+1:04d}"

        change = 0.0
        cash_amount_val = req.cash_amount
        visa_amount_val = req.visa_amount
        account_paid_now = 0.0
        account_paid_method = None
        if req.payment_method == "cash" and req.cash_amount:
            change = max(0.0, req.cash_amount - net_total)
        # Account (credit) sales: walk-in customers on cash/delivery; platform partner on digital.
        account_customer_id = req.customer_id
        if req.payment_method == "account" and req.type != "return":
            if req.type == "digital":
                if not req.digital_type:
                    raise HTTPException(
                        status_code=400,
                        detail="Platform is required for digital on-account sales",
                    )
                from digital_platforms import (
                    is_active_platform,
                    lookup_platform_partner,
                    platform_display_name as platform_partner_display_name,
                )
                if not is_active_platform(cur, req.digital_type):
                    raise HTTPException(status_code=400, detail="Unknown or inactive digital platform")
                cust = lookup_platform_partner(cur, req.digital_type)
                if not cust:
                    pname = platform_partner_display_name(req.digital_type, cur=cur)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Create a customer named '{pname}' for platform on-account sales",
                    )
                account_customer_id = cust["id"]
            elif not account_customer_id:
                raise HTTPException(status_code=400, detail="Customer is required for account sales")
            else:
                cur.execute("SELECT id, name, credit_limit, active FROM customers WHERE id=%s",
                            (account_customer_id,))
                cust = cur.fetchone()
            if not cust or not cust.get("active", True):
                raise HTTPException(status_code=400, detail="Customer not found or inactive")
            cash_amount_val = None
            visa_amount_val = None
            account_paid_now = float(req.account_paid_amount or 0)
            if account_paid_now < 0:
                account_paid_now = 0.0
            if account_paid_now > net_total:
                account_paid_now = net_total
            if account_paid_now > 0:
                account_paid_method = req.account_paid_method or "cash"
                if account_paid_method not in ("cash", "visa", "instapay", "vodafone_cash"):
                    account_paid_method = "cash"
                if account_paid_method == "cash":
                    cash_amount_val = account_paid_now
                else:
                    visa_amount_val = account_paid_now
            credit_portion = net_total - account_paid_now
            # Compute current balance
            cur.execute(
                """SELECT COALESCE(SUM(net_total),0) AS charged FROM invoices
                   WHERE customer_id=%s AND payment_method='account' AND type!='return'""",
                (account_customer_id,))
            charged = float(cur.fetchone()["charged"])
            cur.execute(
                "SELECT COALESCE(SUM(amount),0) AS paid FROM customer_payments WHERE customer_id=%s",
                (account_customer_id,))
            paid = float(cur.fetchone()["paid"])
            current_bal = charged - paid
            limit = float(cust["credit_limit"] or 0)
            if limit > 0 and (current_bal + credit_portion) > limit:
                raise HTTPException(
                    status_code=400,
                    detail=f"Credit limit exceeded for {cust['name']} (balance {current_bal:.2f} + sale {credit_portion:.2f} > limit {limit:.2f})",
                )

        if not req.seller_id:
            raise HTTPException(status_code=400, detail="Salesperson is required — select who is making this sale")
        cur.execute("SELECT id, status FROM users WHERE id=%s", (req.seller_id,))
        _seller = cur.fetchone()
        if not _seller or _seller.get("status") != "active":
            raise HTTPException(status_code=400, detail="Selected salesperson is not active")
        seller_id = req.seller_id
        branch_id = active_branch if active_branch is not None else current_user.get("branch_id")
        if branch_id is None:
            raise HTTPException(status_code=400, detail="No active branch selected")
        cur.execute("SELECT id FROM branches WHERE id=%s", (branch_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Branch {branch_id} does not exist")

        # Non-admin: any sale that attaches a customer_id requires customer-branch authorization
        invoice_customer_id = (
            account_customer_id
            if req.payment_method == "account" and req.type != "return"
            else req.customer_id
        )
        if invoice_customer_id and current_user.get("role") != "admin":
            cur.execute(
                "SELECT 1 FROM customer_branches WHERE customer_id=%s AND branch_id=%s",
                (invoice_customer_id, branch_id),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="Customer is not authorized for this branch — ask an admin to open an account here",
                )

        loyalty_points_redeemed = 0
        loyalty_discount = 0.0
        loyalty_points_earned = 0
        if req.type != "return" and invoice_customer_id:
            from loyalty_engine import prepare_sale_loyalty
            pre_credit = 0.0
            if req.payment_method == "account":
                pre_credit = max(0.0, net_total - float(req.account_paid_amount or 0))
            try:
                loy = prepare_sale_loyalty(
                    cur,
                    current_user,
                    invoice_customer_id,
                    net_total,
                    int(req.loyalty_points_redeemed or 0),
                    req.payment_method,
                    pre_credit,
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            if loy.get("active"):
                loyalty_discount = float(loy.get("loyalty_discount") or 0)
                loyalty_points_redeemed = int(loy.get("points_redeemed") or 0)
                loyalty_points_earned = int(loy.get("points_earned") or 0)
                if loyalty_discount > 0:
                    net_total = float(loy["net_after_loyalty"])
                    if req.payment_method == "cash" and req.cash_amount:
                        change = max(0.0, req.cash_amount - net_total)
                    if req.payment_method == "account" and req.type != "return":
                        account_paid_now = float(req.account_paid_amount or 0)
                        if account_paid_now < 0:
                            account_paid_now = 0.0
                        if account_paid_now > net_total:
                            account_paid_now = net_total
                        if account_paid_now > 0:
                            if account_paid_method == "cash":
                                cash_amount_val = account_paid_now
                            else:
                                visa_amount_val = account_paid_now
                        credit_portion = net_total - account_paid_now
                        cur.execute(
                            """SELECT COALESCE(SUM(net_total),0) AS charged FROM invoices
                               WHERE customer_id=%s AND payment_method='account' AND type!='return'""",
                            (account_customer_id,),
                        )
                        charged = float(cur.fetchone()["charged"])
                        cur.execute(
                            "SELECT COALESCE(SUM(amount),0) AS paid FROM customer_payments WHERE customer_id=%s",
                            (account_customer_id,),
                        )
                        paid = float(cur.fetchone()["paid"])
                        current_bal = charged - paid
                        limit = float(cust["credit_limit"] or 0)
                        if limit > 0 and (current_bal + credit_portion) > limit:
                            raise HTTPException(
                                status_code=400,
                                detail=(
                                    f"Credit limit exceeded for {cust['name']} "
                                    f"(balance {current_bal:.2f} + sale {credit_portion:.2f} > limit {limit:.2f})"
                                ),
                            )

        if req.type != "return":
            _validate_delivery_digital_sale(
                req.type,
                req.delivery_person_id,
                invoice_customer_id,
                req.delivery_customer_name,
                req.delivery_customer_phone,
                req.delivery_address,
            )

        today = date.today()
        offer_product_ids: set[int] = set()
        if req.type != "return":
            from feature_access import user_has_feature
            if user_has_feature(current_user, "offers"):
                from offer_engine import active_offer_product_ids
                offer_product_ids = active_offer_product_ids(cur)

        for item in req.items:
            cur.execute("SELECT branch_id, active, expiry_date, name_en FROM products WHERE id=%s", (item.product_id,))
            p = cur.fetchone()
            if not p or not p["active"]:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
            if p["branch_id"] is not None and p["branch_id"] != branch_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {item.product_id} belongs to branch {p['branch_id']}, not active branch {branch_id}",
                )
            if req.type != "return":
                assert_sellable(cur, item.product_id, today)

        clinic_id = None
        if req.clinic_id:
            cur.execute("SELECT id FROM clinics WHERE id=%s", (req.clinic_id,))
            if cur.fetchone():
                clinic_id = req.clinic_id

        prescription_id = None
        if req.prescription_id:
            cur.execute(
                "SELECT id FROM prescriptions WHERE id=%s AND (branch_id=%s OR branch_id IS NULL)",
                (req.prescription_id, branch_id),
            )
            if cur.fetchone():
                prescription_id = req.prescription_id

        delivery_person_id = None
        delivery_person_name = None
        if req.type != "return" and req.delivery_person_id:
            cur.execute(
                "SELECT name FROM employees WHERE id=%s AND active=TRUE AND role='delivery'",
                (req.delivery_person_id,),
            )
            dp = cur.fetchone()
            if not dp:
                raise HTTPException(status_code=400, detail="Selected delivery person is not valid")
            delivery_person_id = req.delivery_person_id
            delivery_person_name = dp["name"]

        delivery_status = (
            "pending"
            if _is_shipment_sale(req.type, req.delivery_address)
            else None
        )
        offer_ids_val = req.offer_ids if req.offer_ids else None
        offer_savings_val = float(req.offer_savings or 0)
        offer_names_val = (req.offer_names or "").strip() or None
        cur.execute(
            """INSERT INTO invoices
               (invoice_number, type, payment_method, digital_type,
                subtotal, discount, net_total, cash_amount, visa_amount,
                change_amount, seller_id, customer_id, branch_id, clinic_id, prescription_id, notes,
                delivery_address, delivery_fee, delivery_customer_name, delivery_customer_phone,
                delivery_person_id, delivery_person_name, delivery_status,
                offer_ids, offer_savings, offer_names,
                loyalty_points_earned, loyalty_points_redeemed, loyalty_discount)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (invoice_number, req.type, req.payment_method, req.digital_type,
             subtotal, req.discount, net_total, cash_amount_val, visa_amount_val,
             change, seller_id, invoice_customer_id, branch_id, clinic_id, prescription_id, req.notes,
             req.delivery_address, delivery_fee or None,
             req.delivery_customer_name, req.delivery_customer_phone,
             delivery_person_id, delivery_person_name, delivery_status,
             offer_ids_val, offer_savings_val, offer_names_val,
             loyalty_points_earned, loyalty_points_redeemed, loyalty_discount),
        )
        invoice = cur.fetchone()
        invoice_id = invoice["id"]

        if account_paid_now > 0 and invoice_customer_id:
            cur.execute(
                """INSERT INTO customer_payments
                   (customer_id, invoice_id, amount, payment_method, reference, notes, recorded_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (invoice_customer_id, invoice_id, account_paid_now, account_paid_method,
                 invoice_number, "Partial payment at sale", current_user.get("user_id")),
            )

        if prescription_id and req.type != "return":
            cur.execute(
                """UPDATE prescriptions SET status='fulfilled', handled_at=%s, handled_by=%s
                   WHERE id=%s AND status IN ('pending','loaded')
                     AND (branch_id=%s OR branch_id IS NULL)""",
                (datetime.now(), seller_id, prescription_id, branch_id),
            )

        for item in req.items:
            if item.quantity <= 0:
                raise HTTPException(status_code=400, detail=f"Invalid quantity for product {item.product_id}")
            cur.execute(
                """SELECT name_ar, name_en, barcode, stock, branch_id, active,
                          unit, sub_unit, COALESCE(pack_size,1) AS pack_size
                   FROM products WHERE id=%s FOR UPDATE""",
                (item.product_id,),
            )
            prod = cur.fetchone()
            if not prod or not prod["active"]:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
            if prod["branch_id"] is not None and prod["branch_id"] != branch_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {prod['name_en']} belongs to a different branch",
                )
            # Resolve how many *stock units* this line consumes.
            # Stock is tracked in sub-units when pack_size > 1; otherwise pack_size = 1
            # and "pack" and "sub" are identical.
            pack_size = max(1, int(prod["pack_size"] or 1))
            unit_type = (item.unit_type or "pack").lower()
            if unit_type == "sub" and pack_size > 1:
                stock_used = item.quantity
                unit_label = prod["sub_unit"] or "unit"
                line_pack = 1
            else:
                stock_used = item.quantity * pack_size
                unit_label = prod["unit"] or "unit"
                line_pack = pack_size
            offer_disc = float(item.offer_discount or 0)
            line_discount = float(item.discount or 0)
            if int(item.product_id) in offer_product_ids:
                if line_discount > offer_disc + 0.009:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Manual discount is not allowed on promotional offer item '{prod['name_en']}'",
                    )
                line_discount = offer_disc
            item_total = item.quantity * item.unit_price - line_discount
            cur.execute(
                """INSERT INTO invoice_items
                   (invoice_id, product_id, product_name_ar, product_name_en,
                    barcode, quantity, unit_price, discount, total, unit_label, pack_size,
                    offer_id, offer_discount, dose_text)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (invoice_id, item.product_id, prod["name_ar"], prod["name_en"],
                 prod["barcode"], item.quantity, item.unit_price, line_discount,
                 item_total, unit_label, line_pack,
                 item.offer_id, offer_disc, (item.dose_text or "").strip() or None),
            )
            # POS allows overselling (stock may go negative; replenishment nets it out).
            deduct_stock_fefo(cur, item.product_id, stock_used, today=today, allow_negative=True)
            new_stock = sync_product_from_batches(cur, item.product_id)
            log_movement(
                cur, item.product_id, prod["branch_id"] or branch_id, "sale",
                -stock_used, new_stock,
                reference_type="invoice", reference_id=invoice_id,
                reason=f"Sale {invoice_number} ({item.quantity} {unit_label})",
                user_id=seller_id,
            )

        if req.type != "return" and invoice_customer_id and (loyalty_points_earned or loyalty_points_redeemed):
            from loyalty_engine import apply_sale_loyalty
            apply_sale_loyalty(
                cur,
                invoice_customer_id,
                invoice_id,
                points_earned=loyalty_points_earned,
                points_redeemed=loyalty_points_redeemed,
                loyalty_discount=loyalty_discount,
                net_paid=net_total,
                user_id=current_user.get("user_id"),
            )

        conn.commit()
        cur.execute(
            """SELECT i.*, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                      c.name AS customer_name,
                      b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                      b.address AS branch_address, b.phone AS branch_phone
               FROM invoices i
               LEFT JOIN users u ON i.seller_id = u.id
               LEFT JOIN customers c ON i.customer_id = c.id
               LEFT JOIN branches b ON i.branch_id = b.id
               WHERE i.id=%s""",
            (invoice_id,),
        )
        full_invoice = cur.fetchone()
        cur.execute("SELECT * FROM invoice_items WHERE invoice_id=%s", (invoice_id,))
        items = cur.fetchall()
        return {"invoice": dict(full_invoice), "items": [dict(i) for i in items]}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/sales")
def list_sales(limit: int = 50, offset: int = 0,
               date_from: Optional[str] = None,
               date_to: Optional[str] = None,
               type: Optional[str] = None,
               delivery_queue: Optional[bool] = None,
               seller_id: Optional[int] = None,
               clinic_id: Optional[int] = None,
               delivery_status: Optional[str] = None,
               delivery_person_id: Optional[int] = None,
               payment_method: Optional[str] = None,
               digital_type: Optional[str] = None,
               current_user=Depends(get_current_user),
               active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    conds = []
    params: list = []
    if active_branch is not None:
        conds.append("i.branch_id = %s")
        params.append(active_branch)
    if date_from:
        conds.append("DATE(i.created_at) >= %s")
        params.append(date_from)
    if date_to:
        conds.append("DATE(i.created_at) <= %s")
        params.append(date_to)
    if delivery_queue:
        conds.append(SHIPMENT_INVOICE_SQL)
    elif type:
        conds.append("i.type = %s")
        params.append(type)
    if seller_id:
        conds.append("i.seller_id = %s")
        params.append(seller_id)
    if clinic_id:
        conds.append("i.clinic_id = %s")
        params.append(clinic_id)
    if delivery_status:
        if delivery_status == "pending":
            conds.append("COALESCE(i.delivery_status, 'pending') = 'pending'")
        else:
            conds.append("i.delivery_status = %s")
            params.append(delivery_status)
    if delivery_person_id is not None:
        if delivery_person_id == 0:
            conds.append("i.delivery_person_id IS NULL")
        else:
            conds.append("i.delivery_person_id = %s")
            params.append(delivery_person_id)
    if payment_method:
        conds.append("i.payment_method = %s")
        params.append(payment_method)
    if digital_type:
        conds.append("i.digital_type = %s")
        params.append(digital_type)
    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    params += [limit, offset]
    cur.execute(
        f"""SELECT i.*, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                   c.name AS customer_name, cl.name AS clinic_name,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   b.address AS branch_address, b.phone AS branch_phone
            FROM invoices i
            LEFT JOIN users u ON i.seller_id = u.id
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN clinics cl ON i.clinic_id = cl.id
            LEFT JOIN branches b ON i.branch_id = b.id
            {where}
            ORDER BY i.created_at DESC LIMIT %s OFFSET %s""",
        params,
    )
    invoices = cur.fetchall()
    conn.close()
    return [dict(i) for i in invoices]


@app.get("/api/returns")
def list_returns(limit: int = 200, offset: int = 0,
                 date_from: Optional[str] = None,
                 date_to: Optional[str] = None,
                 current_user=Depends(get_current_user),
                 active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # Defensive: require r.branch_id == i.branch_id so any mislabeled rows
    # cannot leak into the wrong branch's listing.
    conds = ["(i.id IS NULL OR i.branch_id = r.branch_id)"]
    params: list = []
    if active_branch is not None:
        conds.append("r.branch_id = %s")
        conds.append("(i.id IS NULL OR i.branch_id = %s)")
        params.extend([active_branch, active_branch])
    if date_from:
        conds.append("DATE(r.created_at) >= %s")
        params.append(date_from)
    if date_to:
        conds.append("DATE(r.created_at) <= %s")
        params.append(date_to)
    where = " WHERE " + " AND ".join(conds)
    params += [limit, offset]
    cur.execute(
        f"""SELECT r.*, i.invoice_number, i.type AS sale_type, i.net_total AS sale_net,
                   u.name_en AS seller_name_en, u.name_ar AS seller_name_ar
            FROM returns r
            LEFT JOIN invoices i ON r.original_invoice_id = i.id
            LEFT JOIN users u ON r.seller_id = u.id
            {where}
            ORDER BY r.created_at DESC LIMIT %s OFFSET %s""",
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/sales/aggregate")
def sales_aggregate(date_from: Optional[str] = None,
                    date_to: Optional[str] = None,
                    type: Optional[str] = None,
                    seller_id: Optional[int] = None,
                    current_user=Depends(get_current_user),
                    active_branch=Depends(get_active_branch_id)):
    """Aggregate KPIs for sales without pagination; used by Returns ratio etc."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    conds = ["status='completed'"]
    params: list = []
    if active_branch is not None:
        conds.append("branch_id = %s"); params.append(active_branch)
    if date_from:
        conds.append("DATE(created_at) >= %s"); params.append(date_from)
    if date_to:
        conds.append("DATE(created_at) <= %s"); params.append(date_to)
    if type:
        conds.append("type = %s"); params.append(type)
    if seller_id:
        conds.append("seller_id = %s"); params.append(seller_id)
    where = " WHERE " + " AND ".join(conds)
    cur.execute(
        f"""SELECT COUNT(*) AS cnt,
                   COALESCE(SUM(subtotal),0) AS gross,
                   COALESCE(SUM(discount),0) AS discount,
                   COALESCE(SUM(net_total),0) AS net
              FROM invoices{where}""",
        params,
    )
    row = cur.fetchone()
    conn.close()
    return {
        "count": int(row["cnt"]),
        "gross": float(row["gross"]),
        "discount": float(row["discount"]),
        "net": float(row["net"]),
    }


@app.get("/api/sales/by-clinic", dependencies=[Depends(requires_feature("clinics"))])
def sales_by_clinic(date_from: Optional[str] = None,
                    date_to: Optional[str] = None,
                    current_user=Depends(get_current_user),
                    active_branch=Depends(get_active_branch_id)):
    """Per-clinic sales totals for completed, non-return invoices."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    conds = ["i.status='completed'", "i.type!='return'", "i.clinic_id IS NOT NULL"]
    params: list = []
    if active_branch is not None:
        conds.append("i.branch_id = %s"); params.append(active_branch)
    if date_from:
        conds.append("DATE(i.created_at) >= %s"); params.append(date_from)
    if date_to:
        conds.append("DATE(i.created_at) <= %s"); params.append(date_to)
    where = " WHERE " + " AND ".join(conds)
    cur.execute(
        f"""SELECT cl.id AS clinic_id, cl.name AS clinic_name,
                   COUNT(*) AS invoice_count,
                   COALESCE(SUM(i.subtotal),0) AS gross,
                   COALESCE(SUM(i.discount),0) AS discount,
                   COALESCE(SUM(i.net_total),0) AS net
              FROM invoices i
              JOIN clinics cl ON i.clinic_id = cl.id
              {where}
              GROUP BY cl.id, cl.name
              ORDER BY net DESC""",
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return [
        {
            "clinic_id": r["clinic_id"],
            "clinic_name": r["clinic_name"],
            "invoice_count": int(r["invoice_count"]),
            "gross": float(r["gross"]),
            "discount": float(r["discount"]),
            "net": float(r["net"]),
        }
        for r in rows
    ]


def _assert_invoice_branch_access(cur, invoice_id: int, current_user):
    """Non-admins may only access invoices in their own branch."""
    if current_user.get("role") == "admin":
        return
    cur.execute("SELECT branch_id FROM invoices WHERE id=%s", (invoice_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if row["branch_id"] != current_user.get("branch_id"):
        raise HTTPException(status_code=404, detail="Invoice not found")


@app.get("/api/sales/search")
def search_sales(q: str = "", limit: int = 50,
                 current_user=Depends(get_current_user),
                 active_branch=Depends(get_active_branch_id)):
    """Find invoices by receipt/invoice number OR by an item they contain
    (barcode or product name). Used for refund recall when the customer has
    no receipt — returns every transaction containing that item."""
    q = (q or "").strip()
    if not q:
        return []
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    like = f"%{q}%"
    conds: list = []
    params: list = []
    if active_branch is not None:
        conds.append("i.branch_id = %s")
        params.append(active_branch)
    conds.append(
        "(i.invoice_number ILIKE %s OR EXISTS ("
        " SELECT 1 FROM invoice_items ii WHERE ii.invoice_id = i.id"
        " AND (ii.barcode ILIKE %s OR ii.product_name_en ILIKE %s OR ii.product_name_ar ILIKE %s)))"
    )
    params += [like, like, like, like]
    where = " WHERE " + " AND ".join(conds)
    params.append(max(1, min(limit, 200)))
    cur.execute(
        f"""SELECT i.*, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                   c.name AS customer_name, cl.name AS clinic_name,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   b.address AS branch_address, b.phone AS branch_phone
            FROM invoices i
            LEFT JOIN users u ON i.seller_id = u.id
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN clinics cl ON i.clinic_id = cl.id
            LEFT JOIN branches b ON i.branch_id = b.id
            {where}
            ORDER BY i.created_at DESC LIMIT %s""",
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/sales/{invoice_id}")
def get_sale(invoice_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    _assert_invoice_branch_access(cur, invoice_id, current_user)
    cur.execute(
        """SELECT i.*, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                  c.name AS customer_name, cl.name AS clinic_name,
                  b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                  b.address AS branch_address, b.phone AS branch_phone
           FROM invoices i
           LEFT JOIN users u ON i.seller_id = u.id
           LEFT JOIN customers c ON i.customer_id = c.id
           LEFT JOIN clinics cl ON i.clinic_id = cl.id
           LEFT JOIN branches b ON i.branch_id = b.id
           WHERE i.id=%s""",
        (invoice_id,),
    )
    invoice = cur.fetchone()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    cur.execute(
        """SELECT ii.*,
                  p.unit AS prod_unit, p.sub_unit AS prod_sub_unit,
                  COALESCE((
                      SELECT SUM(ri.sub_quantity) FROM return_items ri
                      WHERE ri.invoice_item_id = ii.id
                  ), 0) AS returned_sub
           FROM invoice_items ii
           LEFT JOIN products p ON ii.product_id = p.id
           WHERE ii.invoice_id=%s
           ORDER BY ii.id""",
        (invoice_id,),
    )
    items = cur.fetchall()
    conn.close()
    return {"invoice": dict(invoice), "items": [dict(i) for i in items]}


class DeliveryStatusRequest(BaseModel):
    status: str


@app.post("/api/sales/{invoice_id:int}/delivery-status")
def update_delivery_status(invoice_id: int, req: DeliveryStatusRequest,
                           current_user=Depends(get_current_user)):
    valid = ("pending", "out_for_delivery", "delivered")
    if req.status not in valid:
        raise HTTPException(status_code=400, detail="Invalid delivery status")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _assert_invoice_branch_access(cur, invoice_id, current_user)
        cur.execute(
            """SELECT id, type, delivery_address, delivery_person_id, customer_id,
                      delivery_customer_name, delivery_customer_phone
               FROM invoices WHERE id=%s""",
            (invoice_id,),
        )
        inv = cur.fetchone()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if not _is_shipment_sale(inv["type"], inv.get("delivery_address")):
            raise HTTPException(status_code=400, detail="Not a delivery order")
        if req.status in ("out_for_delivery", "delivered"):
            if inv["type"] in ("delivery", "digital"):
                if not inv.get("delivery_person_id"):
                    raise HTTPException(
                        status_code=400,
                        detail="Assign a delivery person before updating this order",
                    )
                if not _invoice_has_customer(
                    inv.get("customer_id"),
                    inv.get("delivery_customer_name"),
                    inv.get("delivery_customer_phone"),
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Customer information is required before completing this delivery",
                    )
        cur.execute(
            "UPDATE invoices SET delivery_status=%s WHERE id=%s RETURNING *",
            (req.status, invoice_id),
        )
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        cur.close(); conn.close()


class ReturnItem(BaseModel):
    invoice_item_id: int
    quantity: int = 0
    sub_quantity: Optional[int] = None


class ReturnRequest(BaseModel):
    items: List[ReturnItem]
    reason: Optional[str] = None


@app.post("/api/sales/{invoice_id}/return")
def process_return(invoice_id: int, req: ReturnRequest, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _assert_invoice_branch_access(cur, invoice_id, current_user)
        # Always tag the return with the ORIGINAL INVOICE's branch (not the
        # operator's profile branch). Admins may operate across branches; the
        # return must remain accounted to the branch that owns the invoice.
        cur.execute("SELECT branch_id FROM invoices WHERE id=%s", (invoice_id,))
        inv_row = cur.fetchone()
        if not inv_row:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return_branch_id = inv_row["branch_id"]
        from shifts import assert_open_shift_for_sales
        assert_open_shift_for_sales(cur, current_user["user_id"], return_branch_id)

        cur.execute("SELECT (SELECT COUNT(*) FROM invoices) + (SELECT COUNT(*) FROM returns) AS cnt")
        count = cur.fetchone()["cnt"]
        return_number = f"INV-{datetime.now().strftime('%Y%m%d')}-{int(count)+1:04d}"

        cur.execute(
            """INSERT INTO returns
               (original_invoice_id, return_invoice_number, type, total_returned, reason, seller_id, branch_id)
               VALUES (%s,%s,'partial',%s,%s,%s,%s) RETURNING *""",
            (invoice_id, return_number, 0, req.reason,
             current_user.get("user_id"), return_branch_id),
        )
        ret = cur.fetchone()

        total_returned = 0.0
        for item in req.items:
            cur.execute(
                """SELECT ii.unit_price, ii.product_id, ii.quantity, ii.unit_label,
                          ii.pack_size AS line_pack_stored,
                          COALESCE(p.pack_size, 1) AS cur_pack_size, p.sub_unit,
                          COALESCE((
                              SELECT SUM(ri.sub_quantity) FROM return_items ri
                              WHERE ri.invoice_item_id = ii.id
                          ), 0) AS already_sub
                   FROM invoice_items ii
                   LEFT JOIN products p ON ii.product_id = p.id
                   WHERE ii.id=%s AND ii.invoice_id=%s""",
                (item.invoice_item_id, invoice_id),
            )
            inv_item = cur.fetchone()
            if not inv_item:
                raise HTTPException(status_code=404, detail="Invoice item not found on this invoice")

            stored = inv_item["line_pack_stored"]
            if stored is not None and int(stored) > 0:
                line_pack = int(stored)
            else:
                cur_pack = max(1, int(inv_item["cur_pack_size"] or 1))
                sold_as_sub = bool(inv_item["sub_unit"]) and inv_item["unit_label"] == inv_item["sub_unit"]
                line_pack = 1 if sold_as_sub else cur_pack
            total_sub = int(inv_item["quantity"]) * line_pack
            already_sub = int(inv_item["already_sub"])

            if item.sub_quantity is not None:
                req_sub = int(item.sub_quantity)
            else:
                req_sub = int(item.quantity) * line_pack
            if req_sub <= 0:
                raise HTTPException(status_code=400, detail="Invalid return quantity")
            remaining_sub = total_sub - already_sub
            if req_sub > remaining_sub:
                raise HTTPException(status_code=400, detail=f"Return qty {req_sub} exceeds remaining {remaining_sub}")

            price_per_sub = float(inv_item["unit_price"]) / line_pack
            item_total = round(price_per_sub * req_sub, 2)
            total_returned += item_total

            cur.execute(
                """INSERT INTO return_items
                   (return_id, invoice_item_id, product_id, quantity, unit_price, total, sub_quantity)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (ret["id"], item.invoice_item_id, inv_item["product_id"],
                 req_sub, round(price_per_sub, 2), item_total, req_sub),
            )
            cur.execute("SELECT stock, branch_id FROM products WHERE id=%s FOR UPDATE",
                        (inv_item["product_id"],))
            p = cur.fetchone()
            add_batch_stock(cur, inv_item["product_id"], p["branch_id"], req_sub, None)
            new_stock = sync_product_from_batches(cur, inv_item["product_id"])
            unit_lbl = inv_item["sub_unit"] if line_pack > 1 else inv_item["unit_label"]
            log_movement(
                cur, inv_item["product_id"], p["branch_id"], "return",
                req_sub, new_stock,
                reference_type="return", reference_id=ret["id"],
                reason=f"Return {return_number} ({req_sub} {unit_lbl or 'unit'}): {req.reason or ''}".strip(),
                user_id=current_user.get("user_id"),
            )

        cur.execute("UPDATE returns SET total_returned=%s WHERE id=%s",
                    (round(total_returned, 2), ret["id"]))
        from loyalty_engine import reverse_loyalty_on_return
        reverse_loyalty_on_return(
            cur, invoice_id, round(total_returned, 2), current_user.get("user_id"),
        )
        conn.commit()
        ret["total_returned"] = round(total_returned, 2)
        return dict(ret)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─── DASHBOARD ───────────────────────────────────────────────────────────────

@app.get("/api/dashboard/summary")
def dashboard_summary(request: Request,
                      current_user=Depends(get_current_user)):
    active_branch = resolve_analytics_branch(request, current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = date.today()
    branch_clause = ""
    branch_params: list = []
    if active_branch is not None:
        branch_clause = " AND branch_id = %s"
        branch_params = [active_branch]
    cur.execute(
        f"SELECT COALESCE(SUM(net_total),0) AS total, COUNT(*) AS cnt FROM invoices WHERE DATE(created_at)=%s AND status='completed'{branch_clause}",
        [today, *branch_params],
    )
    today_data = cur.fetchone()
    cur.execute(
        f"SELECT COALESCE(SUM(total_returned),0) AS total FROM returns WHERE DATE(created_at)=%s{branch_clause}",
        [today, *branch_params],
    )
    returns_data = cur.fetchone()
    low_clause = "stock <= min_stock AND active=true"
    if active_branch is not None:
        low_clause += " AND branch_id = %s"
    cur.execute(f"SELECT COUNT(*) AS cnt FROM products WHERE {low_clause}", branch_params)
    low_stock = cur.fetchone()
    conn.close()
    net = float(today_data["total"]) - float(returns_data["total"])
    return {
        "date": str(today),
        "today_sales": float(today_data["total"]),
        "invoice_count": int(today_data["cnt"]),
        "returns_total": float(returns_data["total"]),
        "net_sales": net,
        "low_stock_count": int(low_stock["cnt"]),
    }


@app.get("/api/dashboard/sales-series")
def dashboard_sales_series(request: Request,
                           days: int = 7,
                           current_user=Depends(get_current_user)):
    active_branch = resolve_analytics_branch(request, current_user)
    """Daily sales for last N days (default 7)."""
    days = max(1, min(days, 90))
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_clause = ""
    params: list = [days - 1]
    if active_branch is not None:
        branch_clause = " AND i.branch_id = %s"
        params.append(active_branch)
    cur.execute(
        f"""WITH days AS (
              SELECT generate_series(CURRENT_DATE - %s::int, CURRENT_DATE, '1 day')::date AS d
            )
            SELECT d::text AS date,
                   COALESCE(SUM(i.net_total) FILTER (WHERE i.status='completed'), 0) AS sales,
                   COUNT(i.id) FILTER (WHERE i.status='completed') AS invoices
              FROM days
              LEFT JOIN invoices i ON DATE(i.created_at) = d{branch_clause}
             GROUP BY d
             ORDER BY d""",
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return [{"date": r["date"], "sales": float(r["sales"]), "invoices": int(r["invoices"])} for r in rows]


@app.get("/api/dashboard/top-products")
def dashboard_top_products(request: Request,
                           limit: int = 5, days: int = 30,
                           current_user=Depends(get_current_user)):
    active_branch = resolve_analytics_branch(request, current_user)
    limit = max(1, min(limit, 50))
    days = max(1, min(days, 365))
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_clause = ""
    params: list = [days - 1]
    if active_branch is not None:
        branch_clause = " AND i.branch_id = %s"
        params.append(active_branch)
    params.append(limit)
    cur.execute(
        f"""SELECT p.id, p.name_en, p.name_ar,
                   COALESCE(SUM(ii.quantity), 0) AS qty,
                   COALESCE(SUM(ii.total), 0) AS revenue
              FROM invoice_items ii
              JOIN invoices i ON ii.invoice_id = i.id AND i.status='completed'
              JOIN products p ON ii.product_id = p.id
             WHERE DATE(i.created_at) >= CURRENT_DATE - %s::int{branch_clause}
             GROUP BY p.id, p.name_en, p.name_ar
             ORDER BY qty DESC
             LIMIT %s""",
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return [{
        "id": r["id"], "name_en": r["name_en"], "name_ar": r["name_ar"],
        "qty": int(r["qty"]), "revenue": float(r["revenue"]),
    } for r in rows]


@app.get("/api/dashboard/top-sellers")
def dashboard_top_sellers(request: Request,
                          limit: int = 3, days: int = 30,
                          current_user=Depends(get_current_user)):
    active_branch = resolve_analytics_branch(request, current_user)
    limit = max(1, min(limit, 20))
    days = max(1, min(days, 365))
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_clause = ""
    params: list = [days - 1]
    if active_branch is not None:
        branch_clause = " AND i.branch_id = %s"
        params.append(active_branch)
    params.append(limit)
    cur.execute(
        f"""SELECT u.id, u.name_en, u.name_ar,
                   COALESCE(SUM(i.net_total), 0) AS sales,
                   COUNT(i.id) AS invoices
              FROM invoices i
              JOIN users u ON i.seller_id = u.id
             WHERE i.status='completed'
               AND DATE(i.created_at) >= CURRENT_DATE - %s::int{branch_clause}
             GROUP BY u.id, u.name_en, u.name_ar
             ORDER BY sales DESC
             LIMIT %s""",
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return [{
        "id": r["id"], "name_en": r["name_en"], "name_ar": r["name_ar"],
        "sales": float(r["sales"]), "invoices": int(r["invoices"]),
    } for r in rows]


@app.get("/api/dashboard/alerts")
def dashboard_alerts(request: Request,
                     current_user=Depends(get_current_user)):
    active_branch = resolve_analytics_branch(request, current_user)
    """Operational alerts: near-expiry, low-stock, high returns."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_clause = ""
    branch_params: list = []
    if active_branch is not None:
        branch_clause = " AND branch_id = %s"
        branch_params = [active_branch]

    # Near-expiry within 60 days, stock>0
    cur.execute(
        f"""SELECT COUNT(*) AS cnt FROM products
            WHERE active=true AND stock > 0 AND expiry_date IS NOT NULL
              AND expiry_date <= CURRENT_DATE + INTERVAL '60 days'
              AND expiry_date >= CURRENT_DATE{branch_clause}""",
        branch_params,
    )
    near_expiry = int(cur.fetchone()["cnt"])

    # Already expired with stock
    cur.execute(
        f"""SELECT COUNT(*) AS cnt FROM products
            WHERE active=true AND stock > 0 AND expiry_date IS NOT NULL
              AND expiry_date < CURRENT_DATE{branch_clause}""",
        branch_params,
    )
    expired = int(cur.fetchone()["cnt"])

    # Low stock
    low_clause = "stock <= min_stock AND active=true"
    if active_branch is not None:
        low_clause += " AND branch_id = %s"
    cur.execute(f"SELECT COUNT(*) AS cnt FROM products WHERE {low_clause}", branch_params)
    low_stock = int(cur.fetchone()["cnt"])

    # Returns ratio: today's returns ÷ today's sales (>10% is high)
    today = date.today()
    cur.execute(
        f"SELECT COALESCE(SUM(net_total),0) AS total FROM invoices WHERE DATE(created_at)=%s AND status='completed'{branch_clause}",
        [today, *branch_params],
    )
    sales_today = float(cur.fetchone()["total"])
    cur.execute(
        f"SELECT COALESCE(SUM(total_returned),0) AS total FROM returns WHERE DATE(created_at)=%s{branch_clause}",
        [today, *branch_params],
    )
    returns_today = float(cur.fetchone()["total"])
    returns_ratio = (returns_today / sales_today) if sales_today > 0 else 0.0

    conn.close()
    return {
        "near_expiry_count": near_expiry,
        "expired_count": expired,
        "low_stock_count": low_stock,
        "returns_today": returns_today,
        "sales_today": sales_today,
        "returns_ratio": round(returns_ratio, 4),
        "returns_high": returns_ratio > 0.10,
    }


@app.get("/")
def root():
    return {"status": "PharmaPOS API running", "version": "2.0"}
