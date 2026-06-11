"""Configurable digital delivery platforms (Talabat, Vezeeta, custom)."""
from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import psycopg2.extras

from db import get_db_connection
from deps import get_current_user

router = APIRouter(prefix="/api/digital-platforms", tags=["digital-platforms"])

BADGE_COLORS = ("orange", "violet", "teal", "blue", "emerald", "amber", "rose", "slate")

DEFAULT_PLATFORMS: list[dict[str, Any]] = [
    {"platform_key": "talabat", "name_en": "Talabat", "name_ar": "طلبات", "badge_color": "orange", "sort_order": 0},
    {"platform_key": "vezeeta", "name_en": "Vezeeta", "name_ar": "فيزيتا", "badge_color": "violet", "sort_order": 1},
    {"platform_key": "other_digital", "name_en": "Other Digital", "name_ar": "منصة أخرى", "badge_color": "slate", "sort_order": 2},
]


def _slug_key(raw: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (raw or "").strip().lower()).strip("_")
    return s[:40] or "platform"


def ensure_default_platforms(cur) -> None:
    for p in DEFAULT_PLATFORMS:
        cur.execute(
            """
            INSERT INTO digital_platforms (platform_key, name_en, name_ar, badge_color, sort_order, active)
            VALUES (%s, %s, %s, %s, %s, true)
            ON CONFLICT (platform_key) DO NOTHING
            """,
            (p["platform_key"], p["name_en"], p["name_ar"], p["badge_color"], p["sort_order"]),
        )


def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


def list_platforms(cur, *, active_only: bool = True) -> list[dict]:
    ensure_default_platforms(cur)
    where = "WHERE active = true" if active_only else ""
    cur.execute(
        f"""
        SELECT id, platform_key, name_en, name_ar, customer_id, badge_color, active, sort_order
        FROM digital_platforms
        {where}
        ORDER BY sort_order ASC, name_en ASC
        """
    )
    return [dict(r) for r in cur.fetchall()]


def get_platform(cur, platform_key: str) -> Optional[dict]:
    ensure_default_platforms(cur)
    cur.execute(
        """
        SELECT id, platform_key, name_en, name_ar, customer_id, badge_color, active, sort_order
        FROM digital_platforms
        WHERE platform_key = %s
        """,
        (platform_key,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def platform_display_name(platform_key: str, cur=None, lang: str = "en") -> str:
    if cur is not None:
        row = get_platform(cur, platform_key)
        if row:
            if lang == "ar":
                return (row.get("name_ar") or row.get("name_en") or platform_key).strip()
            return (row.get("name_en") or row.get("name_ar") or platform_key).strip()
    for p in DEFAULT_PLATFORMS:
        if p["platform_key"] == platform_key:
            return p["name_en"] if lang != "ar" else p.get("name_ar") or p["name_en"]
    return platform_key.replace("_", " ").title()


def lookup_platform_partner(cur, digital_type: str):
    """Return active customer row for a digital platform partner, or None."""
    ensure_default_platforms(cur)
    row = get_platform(cur, digital_type)
    if not row or not row.get("active", True):
        return None

    if row.get("customer_id"):
        cur.execute(
            "SELECT id, name, credit_limit, active FROM customers WHERE id=%s",
            (row["customer_id"],),
        )
        cust = cur.fetchone()
        if cust and cust.get("active", True):
            return cust

    name = platform_display_name(digital_type, cur=cur, lang="en")
    cur.execute(
        "SELECT id, name, credit_limit, active FROM customers "
        "WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s)) LIMIT 1",
        (name,),
    )
    cust = cur.fetchone()
    if cust and row.get("customer_id") != cust["id"]:
        cur.execute(
            "UPDATE digital_platforms SET customer_id = %s WHERE platform_key = %s",
            (cust["id"], digital_type),
        )
    return cust


def ensure_platform_customer(cur, platform_key: str, user_id: int | None = None) -> int:
    """Create or link customer account for on-account digital sales."""
    row = get_platform(cur, platform_key)
    if not row:
        raise ValueError(f"Unknown platform: {platform_key}")

    if row.get("customer_id"):
        cur.execute("SELECT id FROM customers WHERE id=%s AND active=true", (row["customer_id"],))
        if cur.fetchone():
            return int(row["customer_id"])

    name = platform_display_name(platform_key, cur=cur, lang="en")
    cur.execute(
        "SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s)) LIMIT 1",
        (name,),
    )
    existing = cur.fetchone()
    if existing:
        cid = int(existing["id"])
    else:
        cur.execute(
            """
            INSERT INTO customers (name, notes, active)
            VALUES (%s, %s, true)
            RETURNING id
            """,
            (name, f"Digital platform partner ({platform_key})"),
        )
        cid = int(cur.fetchone()["id"])

    cur.execute(
        "UPDATE digital_platforms SET customer_id = %s WHERE platform_key = %s",
        (cid, platform_key),
    )
    return cid


def is_active_platform(cur, platform_key: str) -> bool:
    row = get_platform(cur, platform_key)
    return bool(row and row.get("active", True))


# ─── API ────────────────────────────────────────────────────────────────────

class PlatformIn(BaseModel):
    platform_key: Optional[str] = Field(None, max_length=40)
    name_en: str = Field(..., min_length=1, max_length=120)
    name_ar: Optional[str] = Field(None, max_length=120)
    badge_color: Optional[str] = "slate"
    sort_order: Optional[int] = 0
    active: Optional[bool] = True
    create_customer_account: Optional[bool] = True


class PlatformPatch(BaseModel):
    name_en: Optional[str] = Field(None, min_length=1, max_length=120)
    name_ar: Optional[str] = Field(None, max_length=120)
    badge_color: Optional[str] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None
    create_customer_account: Optional[bool] = None


def _admin(user):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins only")


@router.get("")
def list_active_platforms(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        rows = list_platforms(cur, active_only=True)
        conn.commit()
        return rows
    finally:
        cur.close()
        conn.close()


@router.get("/manage")
def list_all_platforms(current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        rows = list_platforms(cur, active_only=False)
        conn.commit()
        return rows
    finally:
        cur.close()
        conn.close()


@router.post("/manage")
def create_platform(body: PlatformIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    key = _slug_key(body.platform_key or body.name_en)
    color = body.badge_color if body.badge_color in BADGE_COLORS else "slate"
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        ensure_default_platforms(cur)
        cur.execute("SELECT 1 FROM digital_platforms WHERE platform_key = %s", (key,))
        if cur.fetchone():
            raise HTTPException(400, f"Platform key '{key}' already exists")
        cur.execute(
            """
            INSERT INTO digital_platforms (platform_key, name_en, name_ar, badge_color, sort_order, active)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, platform_key, name_en, name_ar, customer_id, badge_color, active, sort_order
            """,
            (
                key,
                body.name_en.strip(),
                (body.name_ar or "").strip() or body.name_en.strip(),
                color,
                int(body.sort_order or 0),
                bool(body.active if body.active is not None else True),
            ),
        )
        row = dict(cur.fetchone())
        if body.create_customer_account:
            ensure_platform_customer(cur, key, current_user.get("user_id"))
            cur.execute(
                "SELECT customer_id FROM digital_platforms WHERE platform_key = %s",
                (key,),
            )
            row["customer_id"] = cur.fetchone()["customer_id"]
        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/manage/{platform_id}")
def update_platform(platform_id: int, body: PlatformPatch, current_user=Depends(get_current_user)):
    _admin(current_user)
    data = body.model_dump(exclude_unset=True)
    create_customer = data.pop("create_customer_account", None)
    if "badge_color" in data and data["badge_color"] not in BADGE_COLORS:
        raise HTTPException(400, "Invalid badge color")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            "SELECT platform_key FROM digital_platforms WHERE id = %s",
            (platform_id,),
        )
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(404, "Platform not found")
        key = existing["platform_key"]

        if data:
            sets = ", ".join(f"{k} = %s" for k in data)
            cur.execute(
                f"UPDATE digital_platforms SET {sets} WHERE id = %s "
                f"RETURNING id, platform_key, name_en, name_ar, customer_id, badge_color, active, sort_order",
                list(data.values()) + [platform_id],
            )
            row = dict(cur.fetchone())
        else:
            cur.execute(
                "SELECT id, platform_key, name_en, name_ar, customer_id, badge_color, active, sort_order "
                "FROM digital_platforms WHERE id = %s",
                (platform_id,),
            )
            row = dict(cur.fetchone())

        if create_customer:
            ensure_platform_customer(cur, key, current_user.get("user_id"))
            cur.execute("SELECT customer_id FROM digital_platforms WHERE id = %s", (platform_id,))
            row["customer_id"] = cur.fetchone()["customer_id"]

        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/manage/{platform_id}")
def deactivate_platform(platform_id: int, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE digital_platforms SET active = false
            WHERE id = %s
            RETURNING id, platform_key, name_en, name_ar, customer_id, badge_color, active, sort_order
            """,
            (platform_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Platform not found")
        conn.commit()
        return dict(row)
    finally:
        cur.close()
        conn.close()
