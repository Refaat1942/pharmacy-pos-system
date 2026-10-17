"""Clinic prescription portal — admin clinic management, POS prescription
inbox, and public (no-auth) endpoints used by the clinic link."""
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
import psycopg2.extras

from db import get_db_connection
from deps import get_current_user, get_active_branch_id, requires_feature
from tenant_ctx import set_current_schema, reset_current_schema
from platform_db import get_tenant_by_slug, is_tenant_live

router = APIRouter(prefix="/api", tags=["clinics"])


def _admin_only(user):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")


def _new_token() -> str:
    return secrets.token_urlsafe(24)


# ─── ADMIN: clinic management ────────────────────────────────────────────────

class ClinicIn(BaseModel):
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


@router.get("/clinics", dependencies=[Depends(requires_feature("clinics"))])
def list_clinics(current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT c.*,
                  (SELECT COUNT(*) FROM prescriptions p
                    WHERE p.clinic_id=c.id AND p.status='pending') AS pending_count
             FROM clinics c ORDER BY c.active DESC, c.name ASC"""
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/clinics", dependencies=[Depends(requires_feature("clinics"))])
def create_clinic(req: ClinicIn, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Clinic name is required")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO clinics (name, phone, notes, portal_token, active)
               VALUES (%s,%s,%s,%s,%s) RETURNING *""",
            (name, (req.phone or "").strip() or None,
             (req.notes or "").strip() or None, _new_token(), req.active),
        )
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


@router.put("/clinics/{clinic_id}", dependencies=[Depends(requires_feature("clinics"))])
def update_clinic(clinic_id: int, req: ClinicIn, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Clinic name is required")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """UPDATE clinics SET name=%s, phone=%s, notes=%s, active=%s
               WHERE id=%s RETURNING *""",
            (name, (req.phone or "").strip() or None,
             (req.notes or "").strip() or None, req.active, clinic_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Clinic not found")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


@router.post("/clinics/{clinic_id}/regenerate-token", dependencies=[Depends(requires_feature("clinics"))])
def regenerate_token(clinic_id: int, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("UPDATE clinics SET portal_token=%s WHERE id=%s RETURNING *",
                    (_new_token(), clinic_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Clinic not found")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


# ─── POS: prescription inbox ─────────────────────────────────────────────────

def _load_items(cur, prescription_id: int):
    cur.execute(
        """SELECT id, medicine_name, quantity, dose, note
             FROM prescription_items WHERE prescription_id=%s ORDER BY id""",
        (prescription_id,),
    )
    return [dict(r) for r in cur.fetchall()]


@router.get("/prescriptions", dependencies=[Depends(requires_feature("clinics"))])
def list_prescriptions(status: str = "pending",
                       current_user=Depends(get_current_user),
                       active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where = []
    params: list = []
    if status == "active":
        where.append("p.status IN ('pending','loaded')")
    else:
        where.append("p.status = %s")
        params.append(status)
    if active_branch is not None:
        where.append("(p.branch_id = %s OR p.branch_id IS NULL)")
        params.append(active_branch)
    cur.execute(
        f"""SELECT p.*, c.name AS clinic_name,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   COALESCE(NULLIF(hu.name_en,''), hu.name_ar, hu.username) AS handled_by_name
              FROM prescriptions p
              JOIN clinics c ON p.clinic_id = c.id
              LEFT JOIN branches b ON p.branch_id = b.id
              LEFT JOIN users hu ON p.handled_by = hu.id
             WHERE {' AND '.join(where)}
             ORDER BY p.created_at DESC LIMIT 100""",
        params,
    )
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["items"] = _load_items(cur, r["id"])
    conn.close()
    return rows


@router.get("/prescriptions/count", dependencies=[Depends(requires_feature("clinics"))])
def pending_count(current_user=Depends(get_current_user),
                  active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_cond = ""
    params: list = []
    if active_branch is not None:
        branch_cond = " AND (branch_id = %s OR branch_id IS NULL)"
        params.append(active_branch)
    cur.execute(
        f"""SELECT
              COUNT(*) FILTER (WHERE status IN ('pending','loaded')) AS active_cnt,
              COUNT(*) FILTER (WHERE status = 'pending') AS new_cnt
            FROM prescriptions WHERE TRUE{branch_cond}""",
        params,
    )
    row = cur.fetchone()
    conn.close()
    return {"count": int(row["active_cnt"]), "new": int(row["new_cnt"])}


@router.patch("/prescriptions/{prescription_id}", dependencies=[Depends(requires_feature("clinics"))])
def update_prescription_status(prescription_id: int, status: str,
                               current_user=Depends(get_current_user),
                               active_branch=Depends(get_active_branch_id)):
    if status not in ("pending", "loaded", "dismissed", "fulfilled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        handled = None if status == "pending" else datetime.now()
        where = ["id = %s"]
        params: list = [status, handled,
                        current_user.get("user_id") or current_user.get("id"),
                        prescription_id]
        if active_branch is not None:
            where.append("(branch_id = %s OR branch_id IS NULL)")
            params.append(active_branch)
        cur.execute(
            f"""UPDATE prescriptions SET status=%s, handled_at=%s, handled_by=%s
               WHERE {' AND '.join(where)} RETURNING id""",
            params,
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Prescription not found")
        conn.commit()
        return {"ok": True, "status": status}
    finally:
        conn.close()


# ─── PUBLIC: clinic portal (no auth; tenant slug + token in the URL) ──────────

class PublicRxItem(BaseModel):
    medicine_name: str = Field(max_length=200)
    quantity: int = Field(1, ge=1, le=1000)
    dose: Optional[str] = Field(None, max_length=200)
    note: Optional[str] = Field(None, max_length=500)


class PublicRxIn(BaseModel):
    branch_id: int
    patient_name: Optional[str] = Field(None, max_length=150)
    patient_phone: Optional[str] = Field(None, max_length=40)
    doctor_name: Optional[str] = Field(None, max_length=150)
    notes: Optional[str] = Field(None, max_length=1000)
    items: List[PublicRxItem] = Field(max_length=50)


# The portal needs no login, so it is rate limited: link guessing per IP, searches
# per IP, and prescriptions per clinic link (in-memory sliding windows).
_HITS: dict = defaultdict(deque)
_HITS_LOCK = threading.Lock()


def _rate(key: str, limit: int, window: float) -> None:
    now = time.time()
    with _HITS_LOCK:
        q = _HITS[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests — please wait a few minutes")
        q.append(now)


def _ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    # Behind the local nginx the real client is the LAST forwarded address (nginx
    # appends it); earlier entries are whatever the client sent and can be faked.
    if peer in ("127.0.0.1", "::1", "localhost"):
        fwd = [x.strip() for x in (request.headers.get("x-forwarded-for") or "").split(",") if x.strip()]
        if fwd:
            return fwd[-1]
    return peer


def _resolve_limited(request: Request, slug: str, token: str):
    ip = _ip(request)
    with _HITS_LOCK:
        bad = _HITS[f"bad:{ip}"]
        while bad and time.time() - bad[0] > 600:
            bad.popleft()
        if len(bad) >= 20:
            raise HTTPException(status_code=429, detail="Too many requests — please wait a few minutes")
    try:
        return _resolve_clinic(slug, token)
    except HTTPException:
        with _HITS_LOCK:
            _HITS[f"bad:{ip}"].append(time.time())
        raise


def _resolve_clinic(slug: str, token: str):
    """Set tenant schema from slug and return (schema_name, clinic row).
    Raises 404 on any failure so the link reveals nothing about validity."""
    tenant = get_tenant_by_slug((slug or "").strip().lower())
    if not tenant:
        raise HTTPException(status_code=404, detail="Invalid link")
    live, _reason = is_tenant_live(tenant)
    if not live:
        raise HTTPException(status_code=404, detail="Invalid link")
    schema = tenant["schema_name"]
    ctx = set_current_schema(schema)
    try:
        conn = get_db_connection(schema=schema)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM clinics WHERE portal_token=%s AND active=true", (token,))
        clinic = cur.fetchone()
        conn.close()
    finally:
        reset_current_schema(ctx)
    if not clinic:
        raise HTTPException(status_code=404, detail="Invalid link")
    return schema, dict(clinic)


@router.get("/clinic/{slug}/{token}")
def clinic_portal_info(slug: str, token: str, request: Request):
    _rate(f"info:{_ip(request)}", 60, 60)
    schema, clinic = _resolve_limited(request, slug, token)
    ctx = set_current_schema(schema)
    try:
        conn = get_db_connection(schema=schema)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name_ar, name_en FROM branches ORDER BY id")
        branches = [dict(r) for r in cur.fetchall()]
        conn.close()
    finally:
        reset_current_schema(ctx)
    return {
        "clinic": {"id": clinic["id"], "name": clinic["name"]},
        "branches": branches,
    }


@router.get("/clinic/{slug}/{token}/products")
def clinic_portal_products(slug: str, token: str, request: Request, q: str = ""):
    _rate(f"search:{_ip(request)}", 120, 60)
    schema, _clinic = _resolve_limited(request, slug, token)
    term = (q or "").strip()
    if len(term) < 2:
        return []
    ctx = set_current_schema(schema)
    try:
        conn = get_db_connection(schema=schema)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        like = f"%{term}%"
        cur.execute(
            """SELECT DISTINCT name_en, name_ar FROM products
                WHERE active = true
                  AND (name_en ILIKE %s OR name_ar ILIKE %s OR barcode ILIKE %s)
                ORDER BY name_en LIMIT 10""",
            (like, like, like),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
    finally:
        reset_current_schema(ctx)
    return rows


@router.post("/clinic/{slug}/{token}/prescriptions")
def clinic_portal_submit(slug: str, token: str, req: PublicRxIn, request: Request):
    schema, clinic = _resolve_limited(request, slug, token)
    _rate(f"rx:{slug}:{clinic['id']}", 60, 3600)
    items = [i for i in req.items if (i.medicine_name or "").strip()]
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one medicine")
    ctx = set_current_schema(schema)
    try:
        conn = get_db_connection(schema=schema)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            cur.execute("SELECT id FROM branches WHERE id=%s", (req.branch_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=400, detail="Invalid branch")
            cur.execute(
                """INSERT INTO prescriptions
                   (clinic_id, branch_id, patient_name, patient_phone, doctor_name, notes, status)
                   VALUES (%s,%s,%s,%s,%s,%s,'pending') RETURNING id""",
                (clinic["id"], req.branch_id,
                 (req.patient_name or "").strip() or None,
                 (req.patient_phone or "").strip() or None,
                 (req.doctor_name or "").strip() or None,
                 (req.notes or "").strip() or None),
            )
            rx_id = cur.fetchone()["id"]
            for it in items:
                cur.execute(
                    """INSERT INTO prescription_items
                       (prescription_id, medicine_name, quantity, dose, note)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (rx_id, it.medicine_name.strip(), max(1, int(it.quantity or 1)),
                     (it.dose or "").strip() or None, (it.note or "").strip() or None),
                )
            conn.commit()
            return {"ok": True, "id": rx_id}
        finally:
            conn.close()
    finally:
        reset_current_schema(ctx)
