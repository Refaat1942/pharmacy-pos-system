from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user
from auth import hash_password

router = APIRouter(prefix="/api/settings", tags=["settings"])

ALLOWED_ROLES = {"admin", "pharmacist", "assistant", "cashier"}


def _admin(user):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")


# ---------------- Users ----------------

class UserIn(BaseModel):
    username: str
    name_ar: str
    name_en: str
    role: str
    branch_id: Optional[int] = None
    salary: Optional[float] = None
    password: Optional[str] = None  # required for create


class UserPatch(BaseModel):
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[int] = None
    salary: Optional[float] = None
    status: Optional[str] = None


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
        cur.execute("""
            INSERT INTO users (username, password_hash, name_ar, name_en, role, branch_id, salary, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'active')
            RETURNING id
        """, (body.username, pw, body.name_ar, body.name_en, body.role,
              body.branch_id, body.salary))
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
