"""Discount card calculation engine."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from insurance_constants import DEFAULT_CARD_COMPATIBILITY, DEFAULT_CARD_RULES
from material_groups import is_discountable_product, resolve_product_origin

Q = Decimal("0.01")


def _money(v: float | Decimal) -> float:
    return float(Decimal(str(v)).quantize(Q, rounding=ROUND_HALF_UP))


def _merge(base: dict, override: Optional[dict]) -> dict:
    out = dict(base)
    if override:
        for k, v in override.items():
            if v is not None:
                out[k] = v
    return out


def _month_usage(cur, card_id: int) -> float:
    today = date.today()
    start = date(today.year, today.month, 1)
    end_day = monthrange(today.year, today.month)[1]
    end = date(today.year, today.month, end_day)
    cur.execute(
        """SELECT COALESCE(SUM(discount_amount), 0)::float AS total
           FROM discount_card_usage
           WHERE card_id = %s AND used_at >= %s AND used_at < %s + INTERVAL '1 day'""",
        (card_id, start, end),
    )
    row = cur.fetchone()
    return float(row["total"] if row else 0)


def _customer_usage(cur, card_id: int, customer_id: Optional[int]) -> int:
    if not customer_id:
        return 0
    cur.execute(
        """SELECT COUNT(*)::int AS cnt FROM discount_card_usage
           WHERE card_id = %s AND customer_id = %s""",
        (card_id, customer_id),
    )
    row = cur.fetchone()
    return int(row["cnt"] if row else 0)


def calculate_discount_card(
    cur,
    *,
    card: dict,
    program: dict,
    items: list[dict],
    products: dict[int, dict],
    eligible_amount: float,
    customer_id: Optional[int] = None,
    has_insurance: bool = False,
    has_promotions: bool = False,
) -> dict[str, Any]:
    rules = _merge(DEFAULT_CARD_RULES, program.get("rules"))
    compat = _merge(DEFAULT_CARD_COMPATIBILITY, program.get("compatibility"))

    if has_insurance and not compat.get("combine_with_insurance"):
        return {"active": False, "reason": "cannot_combine_insurance", "discount_amount": 0.0}
    if has_promotions and not compat.get("combine_with_promotions"):
        return {"active": False, "reason": "cannot_combine_promotions", "discount_amount": 0.0}

    if card.get("status") != "active" or program.get("status") != "active":
        return {"active": False, "reason": "inactive", "discount_amount": 0.0}

    expiry = card.get("expiry_date")
    if expiry:
        exp = expiry if isinstance(expiry, date) else datetime.strptime(str(expiry)[:10], "%Y-%m-%d").date()
        if exp < date.today():
            return {"active": False, "reason": "expired", "discount_amount": 0.0}

    monthly_limit = rules.get("monthly_usage_limit")
    if monthly_limit is not None and _month_usage(cur, card["id"]) >= float(monthly_limit):
        return {"active": False, "reason": "monthly_limit", "discount_amount": 0.0}

    cust_limit = rules.get("customer_usage_limit")
    if cust_limit is not None and _customer_usage(cur, card["id"], customer_id) >= int(cust_limit):
        return {"active": False, "reason": "customer_limit", "discount_amount": 0.0}

    base = Decimal(str(eligible_amount))
    discount = Decimal("0")

    local_pct = Decimal(str(rules.get("local_drugs_discount_pct") or 0))
    imported_pct = Decimal(str(rules.get("imported_drugs_discount_pct") or 0))
    if local_pct > 0 or imported_pct > 0:
        for item in items:
            pid = item["product_id"]
            product = products.get(pid) or {}
            if not is_discountable_product(product):
                continue
            origin = resolve_product_origin(product)
            pct = imported_pct if origin == "imported" else local_pct
            if pct <= 0:
                continue
            line_amt = Decimal(str(item.get("quantity") or 0)) * Decimal(str(item.get("unit_price") or 0))
            line_amt -= Decimal(str(item.get("discount") or 0)) + Decimal(str(item.get("offer_discount") or 0))
            discount += line_amt * pct / Decimal("100")
    else:
        pct = Decimal(str(rules.get("percentage_discount") or 0))
        fixed = Decimal(str(rules.get("fixed_discount") or 0))
        if pct > 0:
            discount = base * pct / Decimal("100")
        elif fixed > 0:
            discount = fixed
        else:
            cat_discounts = rules.get("category_discounts") or {}
            prod_discounts = rules.get("product_discounts") or {}
            for item in items:
                pid = item["product_id"]
                product = products.get(pid) or {}
                cat = (product.get("category") or "").strip()
                line_amt = Decimal(str(item.get("quantity") or 0)) * Decimal(str(item.get("unit_price") or 0))
                line_amt -= Decimal(str(item.get("discount") or 0)) + Decimal(str(item.get("offer_discount") or 0))
                if str(pid) in prod_discounts or pid in prod_discounts:
                    key = str(pid) if str(pid) in prod_discounts else pid
                    p = Decimal(str(prod_discounts[key]))
                    discount += line_amt * p / Decimal("100") if p <= 100 else p
                elif cat in cat_discounts:
                    p = Decimal(str(cat_discounts[cat]))
                    discount += line_amt * p / Decimal("100") if p <= 100 else p

    max_disc = rules.get("max_discount")
    if max_disc is not None:
        discount = min(discount, Decimal(str(max_disc)))
    discount = min(discount, base)
    discount = discount.quantize(Q, rounding=ROUND_HALF_UP)

    return {
        "active": True,
        "card_id": card["id"],
        "program_id": program["id"],
        "discount_amount": _money(discount),
    }


def record_card_usage(
    cur,
    *,
    card_id: int,
    invoice_id: int,
    customer_id: Optional[int],
    branch_id: Optional[int],
    discount_amount: float,
) -> None:
    cur.execute(
        """INSERT INTO discount_card_usage
           (card_id, invoice_id, customer_id, branch_id, discount_amount)
           VALUES (%s,%s,%s,%s,%s)""",
        (card_id, invoice_id, customer_id, branch_id, discount_amount),
    )
