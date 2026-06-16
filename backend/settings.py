from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user, check_tenant_quota
from auth import hash_password

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ---------------- Pharmacy Profile / Receipt Branding ----------------

PROFILE_FIELDS = [
    "name_ar", "name_en", "address_ar", "address_en", "phone", "tax_id",
    "logo_data_url", "receipt_header_ar", "receipt_header_en",
    "receipt_footer_ar", "receipt_footer_en", "receipt_language",
    "receipt_paper", "receipt_accent",
    "show_logo", "show_pharmacy_name", "show_pharmacy_name_on_labels",
    "show_tax_id", "show_seller", "show_customer",
    "show_sale_type", "show_branch", "show_date", "show_time", "show_barcode",
    "shift_morning_start", "shift_evening_start", "shift_night_start",
    "dose_label_presets",
    "pos_quick_items",
    "label_print_settings",
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
    show_pharmacy_name: Optional[bool] = None
    show_pharmacy_name_on_labels: Optional[bool] = None
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
    dose_label_presets: Optional[List[dict]] = None
    pos_quick_items: Optional[List[int]] = None
    label_print_settings: Optional[dict] = None


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
        if k == "dose_label_presets":
            if not isinstance(v, list):
                raise HTTPException(400, "dose_label_presets must be a JSON array")
            cleaned = []
            for item in v[:50]:
                if not isinstance(item, dict):
                    continue
                text_en = str(item.get("text_en") or "").strip()
                text_ar = str(item.get("text_ar") or "").strip()
                if not text_en and not text_ar:
                    continue
                cleaned.append({
                    "id": str(item.get("id") or f"custom-{len(cleaned)}"),
                    "text_en": text_en or text_ar,
                    "text_ar": text_ar or text_en,
                })
            values.append(psycopg2.extras.Json(cleaned))
        elif k == "pos_quick_items":
            if not isinstance(v, list):
                raise HTTPException(400, "pos_quick_items must be an array of product IDs")
            cleaned_ids: list[int] = []
            seen: set[int] = set()
            for raw in v[:30]:
                try:
                    pid = int(raw)
                except (TypeError, ValueError):
                    continue
                if pid <= 0 or pid in seen:
                    continue
                seen.add(pid)
                cleaned_ids.append(pid)
            values.append(psycopg2.extras.Json(cleaned_ids))
        elif k == "label_print_settings":
            if v is not None and not isinstance(v, dict):
                raise HTTPException(400, "label_print_settings must be a JSON object")
            values.append(psycopg2.extras.Json(v) if v is not None else None)
        else:
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


ALLOWED_ROLES = {"admin", "pharmacist", "assistant", "cashier", "branch", "delivery"}


def _admin(user):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")


DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
USER_MANUAL_FILES = {
    "en": ("USER_MANUAL_EN.md", "PharmaPOS_User_Manual_EN.md"),
    "ar": ("USER_MANUAL_AR.md", "PharmaPOS_User_Manual_AR.md"),
}


@router.get("/user-manual/{lang}")
def download_user_manual(lang: str, current_user: dict = Depends(get_current_user)):
    """Download the user manual (English or Arabic markdown)."""
    _admin(current_user)
    key = lang.lower().strip()
    if key not in USER_MANUAL_FILES:
        raise HTTPException(404, "Manual not found — use en or ar")
    src_name, download_name = USER_MANUAL_FILES[key]
    path = DOCS_DIR / src_name
    if not path.is_file():
        raise HTTPException(404, "Manual file missing on server")
    return FileResponse(
        path,
        media_type="text/markdown; charset=utf-8",
        filename=download_name,
    )


# ---------------- Users ----------------

ALL_FEATURES = {
    "dashboard", "pos", "sales", "returns", "inventory", "transfers",
    "branches_stock", "expiry", "purchases", "customers", "suppliers",
    "reports", "shifts", "hr",
    "hr_employees", "hr_attendance", "hr_payroll", "hr_performance",
}

HR_SUB_FEATURES = {"hr_employees", "hr_attendance", "hr_payroll", "hr_performance"}


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
    if any(s in cleaned for s in HR_SUB_FEATURES) and "hr" not in seen:
        cleaned.append("hr")
    return cleaned


def _user_display_name(name_en: str, name_ar: str) -> str:
    return (name_en or name_ar or "Staff").strip()


def _sync_user_delivery_employee(cur, user_id: int, name_en: str, name_ar: str,
                                branch_id: Optional[int], is_delivery: bool,
                                employee_id: Optional[int] = None) -> None:
    """Keep employees(role=delivery) in sync when a user is marked as a delivery driver."""
    from hr import _generate_clock_code

    name = _user_display_name(name_en, name_ar)
    if not is_delivery:
        if employee_id:
            cur.execute("UPDATE employees SET active = FALSE WHERE id = %s", (employee_id,))
        cur.execute("UPDATE users SET employee_id = NULL WHERE id = %s", (user_id,))
        return
    if employee_id:
        cur.execute(
            """UPDATE employees SET name = %s, role = 'delivery', branch_id = %s, active = TRUE
               WHERE id = %s""",
            (name, branch_id, employee_id),
        )
        eid = employee_id
    else:
        cur.execute(
            """INSERT INTO employees (name, role, branch_id, active, base_salary)
               VALUES (%s, 'delivery', %s, TRUE, 0) RETURNING id""",
            (name, branch_id),
        )
        eid = cur.fetchone()["id"]
        cur.execute(
            "UPDATE employees SET clock_code = %s WHERE id = %s",
            (_generate_clock_code(eid, name), eid),
        )
    cur.execute("UPDATE users SET employee_id = %s WHERE id = %s", (eid, user_id))


class UserIn(BaseModel):
    username: str
    name_ar: str
    name_en: str
    role: str
    branch_id: Optional[int] = None
    salary: Optional[float] = None
    password: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_delivery: bool = False


class UserPatch(BaseModel):
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[int] = None
    salary: Optional[float] = None
    status: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_delivery: Optional[bool] = None


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
                   u.permissions, u.card_code, u.employee_id,
                   (e.id IS NOT NULL AND e.role = 'delivery' AND e.active = TRUE) AS is_delivery,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
                   u.created_at
            FROM users u
            LEFT JOIN branches b ON b.id = u.branch_id
            LEFT JOIN employees e ON e.id = u.employee_id
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
        cur.execute("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")
        active_count = cur.fetchone()["n"]
        slug = current_user.get("tenant_slug")
        if slug:
            check_tenant_quota(slug, "users", active_count)
        perms = _clean_permissions(body.permissions) if body.permissions is not None else None
        cur.execute("""
            INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id, salary, status, permissions)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'active',%s)
            RETURNING id
        """, (body.username, pw, body.name_ar, body.name_en, body.role,
              body.branch_id, body.salary,
              psycopg2.extras.Json(perms) if perms is not None else None))
        uid = cur.fetchone()['id']
        cur.execute("""
            UPDATE users
               SET card_code = 'USR-' || LPAD(id::text, 4, '0') || '-' || SUBSTR(MD5(id::text || COALESCE(username,'') || 'fratelanza'), 1, 6)
             WHERE id = %s AND card_code IS NULL
        """, (uid,))
        is_delivery = body.is_delivery or body.role == "delivery"
        _sync_user_delivery_employee(
            cur, uid, body.name_en, body.name_ar, body.branch_id, is_delivery,
        )
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
    patch = body.model_dump(exclude_unset=True)
    for k, v in patch.items():
        if k == "is_delivery":
            continue
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
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT id, name_en, name_ar, branch_id, role, employee_id
               FROM users WHERE id = %s""",
            (user_id,),
        )
        before = cur.fetchone()
        if not before:
            raise HTTPException(404, "User not found")
        if fields:
            values.append(user_id)
            cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", values)
        name_en = body.name_en if body.name_en is not None else before["name_en"]
        name_ar = body.name_ar if body.name_ar is not None else before["name_ar"]
        branch_id = body.branch_id if body.branch_id is not None else before["branch_id"]
        role = body.role if body.role is not None else before["role"]
        if body.is_delivery is not None:
            is_delivery = body.is_delivery
        elif body.role is not None:
            is_delivery = role == "delivery"
        else:
            cur.execute(
                "SELECT 1 FROM employees WHERE id = %s AND role = 'delivery' AND active = TRUE",
                (before["employee_id"],),
            )
            is_delivery = cur.fetchone() is not None
        if body.is_delivery is not None or body.role is not None or any(
            k in patch for k in ("name_en", "name_ar", "branch_id")
        ):
            _sync_user_delivery_employee(
                cur, user_id, name_en, name_ar, branch_id, is_delivery, before["employee_id"],
            )
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
                   (SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id AND p.active = true) AS product_count
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
        cur.execute("SELECT COUNT(*) AS n FROM branches")
        branch_count = cur.fetchone()["n"]
        slug = current_user.get("tenant_slug")
        if slug:
            check_tenant_quota(slug, "branches", branch_count)
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
        cur.execute(
            """DELETE FROM stock_transfers
               WHERE from_branch_id=%s OR to_branch_id=%s""",
            (branch_id, branch_id),
        )
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
