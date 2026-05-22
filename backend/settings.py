from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user
from auth import hash_password

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ---------------- Pharmacy Profile / Receipt Branding ----------------

PROFILE_FIELDS = [
    "name_ar", "name_en", "address_ar", "address_en", "phone", "tax_id",
    "logo_data_url", "receipt_header_ar", "receipt_header_en",
    "receipt_footer_ar", "receipt_footer_en", "receipt_language",
    "receipt_paper", "receipt_accent",
    "show_logo", "show_tax_id", "show_seller", "show_customer",
    "show_sale_type", "show_branch", "show_date", "show_time", "show_barcode",
    "shift_morning_start", "shift_evening_start", "shift_night_start",
]


class ProfilePatch(BaseModel):
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    address_ar: Optional[str] = None
    address_en: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    logo_data_url: Optional[str] = None  # data: URI, max ~500 KB
    receipt_header_ar: Optional[str] = None
    receipt_header_en: Optional[str] = None
    receipt_footer_ar: Optional[str] = None
    receipt_footer_en: Optional[str] = None
    receipt_language: Optional[str] = None  # 'auto' | 'ar' | 'en'
    receipt_paper: Optional[str] = None     # '58mm' | '80mm' | 'A4'
    receipt_accent: Optional[str] = None    # hex color
    show_logo: Optional[bool] = None
    show_tax_id: Optional[bool] = None
    show_seller: Optional[bool] = None
    show_customer: Optional[bool] = None
    show_sale_type: Optional[bool] = None
    show_branch: Optional[bool] = None
    show_date: Optional[bool] = None
    show_time: Optional[bool] = None
    show_barcode: Optional[bool] = None
    shift_morning_start: Optional[str] = None   # 'HH:MM'
    shift_evening_start: Optional[str] = None
    shift_night_start:   Optional[str] = None


def _ensure_profile_row(cur):
    cur.execute(
        "INSERT INTO pharmacy_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )


@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    """Anyone signed in can read the profile (needed to render receipts)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _ensure_profile_row(cur)
        conn.commit()
        cur.execute(
            f"SELECT {', '.join(PROFILE_FIELDS)} FROM pharmacy_profile WHERE id = 1"
        )
        return dict(cur.fetchone() or {})
    finally:
        cur.close()
        conn.close()


@router.put("/profile")
def update_profile(body: ProfilePatch, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    data = body.model_dump(exclude_unset=True)

    # Validate logo if provided. SVG is rejected because data:image/svg+xml
    # can carry executable script and would be rendered as stored XSS.
    if "logo_data_url" in data and data["logo_data_url"]:
        url = data["logo_data_url"]
        allowed_prefixes = (
            "data:image/png;base64,",
            "data:image/jpeg;base64,",
            "data:image/jpg;base64,",
            "data:image/webp;base64,",
        )
        if not url.startswith(allowed_prefixes):
            raise HTTPException(
                400,
                "Logo must be a base64-encoded PNG, JPEG, or WebP data URI (SVG not allowed).",
            )
        if len(url) > 700_000:
            raise HTTPException(400, "Logo too large (max ~500 KB). Please resize.")

    if "receipt_language" in data and data["receipt_language"] not in ("auto", "ar", "en"):
        raise HTTPException(400, "receipt_language must be auto, ar, or en")
    if "receipt_paper" in data and data["receipt_paper"] not in ("58mm", "80mm", "A4"):
        raise HTTPException(400, "receipt_paper must be 58mm, 80mm, or A4")

    if "receipt_accent" in data and data["receipt_accent"]:
        import re
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", data["receipt_accent"]):
            raise HTTPException(400, "receipt_accent must be a 6-digit hex color like #0EA5E9")

    import re as _re
    for k in ("shift_morning_start", "shift_evening_start", "shift_night_start"):
        if k in data and data[k]:
            if not _re.fullmatch(r"\d{1,2}:\d{2}", str(data[k])):
                raise HTTPException(400, f"{k} must be in HH:MM format")

    if not data:
        return {"ok": True}

    fields = []
    values = []
    for k, v in data.items():
        fields.append(f"{k} = %s")
        values.append(v)
    fields.append("updated_at = NOW()")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _ensure_profile_row(cur)
        cur.execute(
            f"UPDATE pharmacy_profile SET {', '.join(fields)} WHERE id = 1",
            values,
        )
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


ALLOWED_ROLES = {"admin", "pharmacist", "assistant", "cashier", "branch"}


def _admin(user):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")


# ---------------- Users ----------------

ALL_FEATURES = {
    "dashboard", "pos", "sales", "returns", "inventory", "transfers",
    "branches_stock", "expiry", "purchases", "customers", "suppliers",
    "reports", "shifts", "hr",
}


def _clean_permissions(value):
    if value is None:
        return None
    if not isinstance(value, list):
        raise HTTPException(400, "permissions must be a list")
    cleaned = []
    seen = set()
    for v in value:
        if not isinstance(v, str):
            continue
        v = v.strip()
        if v in ALL_FEATURES and v not in seen:
            cleaned.append(v); seen.add(v)
    return cleaned


class UserIn(BaseModel):
    username: str
    name_ar: str
    name_en: str
    role: str
    branch_id: Optional[int] = None
    salary: Optional[float] = None
    password: Optional[str] = None
    permissions: Optional[List[str]] = None


class UserPatch(BaseModel):
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[int] = None
    salary: Optional[float] = None
    status: Optional[str] = None
    permissions: Optional[List[str]] = None


class PasswordReset(BaseModel):
    password: str


@router.get("/users")
def list_users(current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT u.id, u.username, u.name_ar, u.name_en, u.role,
                   u.branch_id, u.salary, COALESCE(u.status,'active') AS status,
                   u.permissions,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   u.created_at
            FROM users u
            LEFT JOIN branches b ON b.id = u.branch_id
            ORDER BY u.id
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.post("/users")
def create_user(body: UserIn, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of {sorted(ALLOWED_ROLES)}")
    if not body.password or len(body.password) < 4:
        raise HTTPException(400, "Password is required (min 4 chars)")
    pw = hash_password(body.password)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT 1 FROM users WHERE username = %s", (body.username,))
        if cur.fetchone():
            raise HTTPException(400, "Username already exists")
        perms = _clean_permissions(body.permissions) if body.permissions is not None else None
        cur.execute("""
            INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id, salary, status, permissions)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'active',%s)
            RETURNING id
        """, (body.username, pw, body.name_ar, body.name_en, body.role,
              body.branch_id, body.salary,
              psycopg2.extras.Json(perms) if perms is not None else None))
        uid = cur.fetchone()['id']
        conn.commit()
        return {"id": uid, "ok": True}
    finally:
        cur.close()
        conn.close()


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    fields = []
    values = []
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "role" and v not in ALLOWED_ROLES:
            raise HTTPException(400, "Invalid role")
        if k == "status" and v not in ("active", "inactive"):
            raise HTTPException(400, "Invalid status")
        if k == "permissions":
            cleaned = _clean_permissions(v)
            fields.append("permissions = %s")
            values.append(psycopg2.extras.Json(cleaned) if cleaned is not None else None)
            continue
        fields.append(f"{k} = %s")
        values.append(v)
    if not fields:
        return {"ok": True}
    values.append(user_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(404, "User not found")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    if int(current_user.get("user_id") or 0) == int(user_id):
        raise HTTPException(400, "You cannot delete your own account")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, username, role, status FROM users WHERE id=%s FOR UPDATE", (user_id,))
        target = cur.fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        if target["role"] == "admin" and target["status"] == "active":
            cur.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active' AND id<>%s FOR UPDATE", (user_id,))
            others = cur.fetchone()["n"]
            if others < 1:
                conn.rollback()
                raise HTTPException(400, "Cannot delete the last active admin")
        try:
            cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
            conn.commit()
            return {"ok": True, "deleted": True, "deactivated": False}
        except psycopg2.IntegrityError:
            conn.rollback()
            cur.execute("UPDATE users SET status='inactive' WHERE id=%s", (user_id,))
            conn.commit()
            return {"ok": True, "deleted": False, "deactivated": True,
                    "message": "User has linked records (sales, shifts, etc.) and was deactivated instead of deleted."}
    finally:
        cur.close()
        conn.close()


@router.put("/users/{user_id}/password")
def reset_password(user_id: int, body: PasswordReset, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    if not body.password or len(body.password) < 4:
        raise HTTPException(400, "Password too short")
    pw = hash_password(body.password)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (pw, user_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "User not found")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


# ---------------- Branches ----------------

class BranchIn(BaseModel):
    name_ar: str
    name_en: str
    address: Optional[str] = None
    phone: Optional[str] = None


@router.get("/branches")
def list_branches(current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT b.id, b.name_ar, b.name_en, b.address, b.phone, b.created_at,
                   (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id) AS user_count,
                   (SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id) AS product_count
            FROM branches b
            ORDER BY b.id
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.post("/branches")
def create_branch(body: BranchIn, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO branches (name_ar, name_en, address, phone)
            VALUES (%s,%s,%s,%s) RETURNING id
        """, (body.name_ar, body.name_en, body.address, body.phone))
        bid = cur.fetchone()['id']
        conn.commit()
        return {"id": bid, "ok": True}
    finally:
        cur.close()
        conn.close()


@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: int, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, name_en FROM branches WHERE id=%s", (branch_id,))
        b = cur.fetchone()
        if not b:
            raise HTTPException(404, "Branch not found")
        cur.execute("SELECT COUNT(*) AS n FROM users WHERE branch_id=%s", (branch_id,))
        if cur.fetchone()["n"] > 0:
            raise HTTPException(400, "Branch still has users assigned. Move or remove them first.")
        cur.execute("SELECT COUNT(*) AS n FROM products WHERE branch_id=%s", (branch_id,))
        if cur.fetchone()["n"] > 0:
            raise HTTPException(400, "Branch still has products / stock. Transfer or remove them first.")
        try:
            cur.execute("DELETE FROM branches WHERE id=%s", (branch_id,))
            conn.commit()
            return {"ok": True, "deleted": True}
        except psycopg2.IntegrityError:
            conn.rollback()
            raise HTTPException(409, "Branch has linked historical records (sales, purchases, etc.) and cannot be deleted.")
    finally:
        cur.close()
        conn.close()


@router.put("/branches/{branch_id}")
def update_branch(branch_id: int, body: BranchIn, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            UPDATE branches SET name_ar=%s, name_en=%s, address=%s, phone=%s
            WHERE id=%s
        """, (body.name_ar, body.name_en, body.address, body.phone, branch_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Branch not found")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()
