"""POS smart counseling — pharmacist tips when scanning items."""
from __future__ import annotations

from typing import List, Optional

import psycopg2.extras
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from counseling_knowledge import build_counseling_message, match_counseling_rule
from db import get_db_connection
from deps import get_active_branch_id, get_current_user, requires_feature, requires_feature_option

router = APIRouter(prefix="/api/pos/counseling", tags=["pos-counseling"])


class SuggestRequest(BaseModel):
    product_id: int
    cart_product_ids: List[int] = Field(default_factory=list)
    lang: Optional[str] = "auto"


class RelatedProduct(BaseModel):
    id: int
    name_en: str
    name_ar: str
    price: float
    category: Optional[str] = None
    stock: int = 0


@router.post("/suggest", dependencies=[
    Depends(requires_feature("pos_counseling")),
    Depends(requires_feature_option("pos_counseling", "tips")),
])
def suggest_counseling(
    body: SuggestRequest,
    current_user=Depends(get_current_user),
    active_branch=Depends(get_active_branch_id),
):
    lang = "ar" if body.lang == "ar" else ("en" if body.lang == "en" else "ar")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            "SELECT id, name_en, name_ar, category, price, stock FROM products WHERE id=%s AND active=true",
            (body.product_id,),
        )
        product = cur.fetchone()
        if not product:
            return {"active": False}

        rule = match_counseling_rule(
            product.get("name_en") or "",
            product.get("name_ar") or "",
            product.get("category"),
        )
        if not rule:
            return {
                "active": True,
                "matched": False,
                "product_id": product["id"],
                "product_name": product.get("name_ar") if lang == "ar" else product.get("name_en"),
            }

        msg = build_counseling_message(rule, lang)
        exclude = set(body.cart_product_ids or []) | {body.product_id}
        related: list[dict] = []
        seen: set[int] = set()
        for term in rule.get("related_terms", [])[:8]:
            if len(related) >= 4:
                break
            term = (term or "").strip()
            if len(term) < 2:
                continue
            params: list = [f"%{term}%", f"%{term}%", f"%{term}%"]
            branch_clause = ""
            if active_branch is not None:
                branch_clause = " AND (branch_id = %s OR branch_id IS NULL)"
                params.append(active_branch)
            cur.execute(
                f"""SELECT id, name_en, name_ar, price, category, stock
                    FROM products
                    WHERE active = true
                      AND (name_en ILIKE %s OR name_ar ILIKE %s OR category ILIKE %s)
                      {branch_clause}
                    ORDER BY stock DESC, name_en
                    LIMIT 12""",
                params,
            )
            for row in cur.fetchall():
                pid = row["id"]
                if pid in exclude or pid in seen:
                    continue
                if int(row.get("stock") or 0) <= 0:
                    continue
                seen.add(pid)
                related.append(dict(row))
                if len(related) >= 4:
                    break

        return {
            "active": True,
            "matched": True,
            "product_id": product["id"],
            "product_name": product.get("name_ar") if lang == "ar" else product.get("name_en"),
            "rule_id": msg["rule_id"],
            "advice": msg["advice"],
            "suggest": msg["suggest"],
            "related_products": related,
            "lang": lang,
        }
    finally:
        conn.close()
