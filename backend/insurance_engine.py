"""Insurance sale calculation engine."""
from __future__ import annotations

from copy import deepcopy
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from insurance_constants import (
    DEFAULT_CONTROLS,
    DEFAULT_COVERAGE_RULES,
    DEFAULT_FINANCIAL_RULES,
    DEFAULT_LIMITS,
    DEFAULT_RESTRICTIONS,
)

Q = Decimal("0.01")


def _money(v: float | Decimal) -> float:
    return float(Decimal(str(v)).quantize(Q, rounding=ROUND_HALF_UP))


def _merge(base: dict, override: Optional[dict]) -> dict:
    out = deepcopy(base)
    if override:
        for k, v in override.items():
            if v is not None:
                out[k] = v
    return out


def _category_coverage_pct(product: dict, coverage_rules: dict) -> float:
    cat = (product.get("category") or "").strip()
    cat_lower = cat.lower()
    origin = (product.get("origin_type") or "local").lower()
    med_type = (product.get("medication_type") or "").lower()
    is_service = bool(product.get("is_service"))

    if is_service:
        return float(coverage_rules.get("services_pct") or 0)

    if "cosmetic" in cat_lower:
        return float(coverage_rules.get("cosmetics_pct") or 0)
    if "medical suppl" in cat_lower or cat_lower == "medical supplies":
        return float(coverage_rules.get("medical_supplies_pct") or 0)

    if med_type == "chronic":
        return float(coverage_rules.get("chronic_medication_pct") or 0)
    if med_type == "acute":
        return float(coverage_rules.get("acute_medication_pct") or 0)

    if origin == "imported":
        return float(coverage_rules.get("imported_drugs_pct") or 0)
    return float(coverage_rules.get("local_drugs_pct") or 0)


def _product_excluded(product: dict, restrictions: dict) -> bool:
    pid = product.get("id")
    if pid and pid in (restrictions.get("excluded_product_ids") or []):
        return True
    brand_id = product.get("brand_id")
    if brand_id and brand_id in (restrictions.get("excluded_brand_ids") or []):
        return True
    cat = (product.get("category") or "").strip()
    excluded_cats = [c.lower() for c in (restrictions.get("excluded_categories") or [])]
    if cat and cat.lower() in excluded_cats:
        return True
    covered = restrictions.get("covered_categories") or []
    if covered:
        covered_lower = [c.lower() for c in covered]
        if cat and cat.lower() not in covered_lower:
            return True
    return False


def _resolve_coverage_pct(product: dict, plan: dict) -> float:
    coverage_rules = _merge(DEFAULT_COVERAGE_RULES, plan.get("coverage_rules"))
    restrictions = _merge(DEFAULT_RESTRICTIONS, plan.get("restrictions"))
    if _product_excluded(product, restrictions):
        return 0.0
    pct = _category_coverage_pct(product, coverage_rules)
    financial = _merge(DEFAULT_FINANCIAL_RULES, plan.get("financial_rules"))
    cap = float(financial.get("insurance_coverage_pct") or 100)
    return min(pct, cap)


def _period_keys(d: date) -> dict[str, str]:
    iso = d.isocalendar()
    return {
        "daily": d.isoformat(),
        "weekly": f"{iso.year}-W{iso.week:02d}",
        "monthly": d.strftime("%Y-%m"),
        "yearly": str(d.year),
    }


def _usage_sum(cur, customer_id: Optional[int], company_id: int, plan_id: int, period_key: str, period_type: str) -> float:
    if not customer_id:
        return 0.0
    cur.execute(
        """SELECT COALESCE(SUM(covered_amount), 0)::float AS total
           FROM insurance_usage_ledger
           WHERE customer_id = %s AND company_id = %s AND plan_id = %s
             AND period_type = %s AND period_key = %s""",
        (customer_id, company_id, plan_id, period_type, period_key),
    )
    row = cur.fetchone()
    return float(row["total"] if row else 0)


def _check_limits(
    cur,
    *,
    customer_id: Optional[int],
    company_id: int,
    plan_id: int,
    proposed_covered: float,
    controls: dict,
    limits: dict,
) -> tuple[float, list[str]]:
    warnings: list[str] = []
    today = date.today()
    keys = _period_keys(today)
    remaining = proposed_covered

    max_item = limits.get("max_coverage_per_item")
    max_invoice = limits.get("max_coverage_per_invoice")
    if max_invoice is not None and proposed_covered > float(max_invoice):
        if controls.get("allow_exceeding_limits"):
            warnings.append("Invoice coverage exceeds plan maximum")
        else:
            remaining = min(remaining, float(max_invoice))

    for period_type, key in keys.items():
        limit_val = limits.get(f"{period_type}_limit")
        if limit_val is None:
            continue
        used = _usage_sum(cur, customer_id, company_id, plan_id, key, period_type)
        avail = float(limit_val) - used
        if proposed_covered > avail:
            if controls.get("allow_exceeding_limits"):
                warnings.append(f"{period_type} limit exceeded")
            elif controls.get("allow_partial_coverage"):
                remaining = min(remaining, max(0.0, avail))
                warnings.append(f"Partial coverage due to {period_type} limit")
            else:
                raise ValueError(f"Insurance {period_type} limit exceeded")

    if max_item is not None:
        # Per-item cap applied per line in calculate; store for reference
        pass

    return remaining, warnings


def calculate_insurance_sale(
    cur,
    *,
    items: list[dict],
    products: dict[int, dict],
    plan: dict,
    company_id: int,
    plan_id: int,
    customer_id: Optional[int] = None,
    patient_fields: Optional[dict] = None,
    discount_card_result: Optional[dict] = None,
) -> dict[str, Any]:
    """Calculate insurance breakdown for a cart.

    Each item: {product_id, quantity, unit_price, discount, offer_discount}
    """
    coverage_rules = _merge(DEFAULT_COVERAGE_RULES, plan.get("coverage_rules"))
    financial = _merge(DEFAULT_FINANCIAL_RULES, plan.get("financial_rules"))
    limits = _merge(DEFAULT_LIMITS, plan.get("limits"))
    controls = _merge(DEFAULT_CONTROLS, plan.get("controls"))
    _ = coverage_rules  # used via _resolve_coverage_pct

    if controls.get("approval_required") and not (patient_fields or {}).get("approval_number"):
        raise ValueError("Approval number is required for this insurance plan")

    line_results = []
    gross = Decimal("0")
    insurance_covered = Decimal("0")
    max_item = limits.get("max_coverage_per_item")

    for item in items:
        pid = item["product_id"]
        product = products.get(pid) or {}
        qty = Decimal(str(item.get("quantity") or 0))
        unit_price = Decimal(str(item.get("unit_price") or 0))
        line_disc = Decimal(str(item.get("discount") or 0)) + Decimal(str(item.get("offer_discount") or 0))
        line_gross = qty * unit_price
        line_net = max(Decimal("0"), line_gross - line_disc)
        gross += line_net

        pct = _resolve_coverage_pct(product, plan)
        covered = (line_net * Decimal(str(pct)) / Decimal("100")).quantize(Q, rounding=ROUND_HALF_UP)
        if max_item is not None:
            covered = min(covered, Decimal(str(max_item)))
        if not controls.get("allow_partial_coverage") and pct < 100 and pct > 0:
            pass  # partial by design when pct < 100

        patient_line = line_net - covered
        insurance_covered += covered
        line_results.append({
            "product_id": pid,
            "line_gross": _money(line_net),
            "coverage_pct": pct,
            "covered_amount": _money(covered),
            "patient_share": _money(patient_line),
            "additional_amount": 0.0,
        })

    gross_f = _money(gross)
    covered_f, limit_warnings = _check_limits(
        cur,
        customer_id=customer_id,
        company_id=company_id,
        plan_id=plan_id,
        proposed_covered=float(insurance_covered),
        controls=controls,
        limits=limits,
    )

    if covered_f < float(insurance_covered):
        ratio = Decimal(str(covered_f)) / insurance_covered if insurance_covered else Decimal("0")
        insurance_covered = Decimal(str(covered_f))
        for lr in line_results:
            c = Decimal(str(lr["covered_amount"])) * ratio
            lr["covered_amount"] = _money(c)
            lr["patient_share"] = _money(Decimal(str(lr["line_gross"])) - c)

    patient_share = gross - insurance_covered
    additional_pct = Decimal(str(financial.get("additional_amount_pct") or 0))
    additional = (patient_share * additional_pct / Decimal("100")).quantize(Q, rounding=ROUND_HALF_UP)
    copayment = Decimal(str(financial.get("fixed_copayment") or 0))

    insurance_discount = gross - insurance_covered  # amount "discounted" via insurance coverage
    card_amount = Decimal("0")
    if discount_card_result and discount_card_result.get("active"):
        card_amount = Decimal(str(discount_card_result.get("discount_amount") or 0))

    total_discount = insurance_discount + card_amount
    final_patient = patient_share + additional + copayment - card_amount
    if final_patient < 0:
        final_patient = Decimal("0")

    return {
        "lines": line_results,
        "warnings": limit_warnings,
        "totals": {
            "gross_before_discounts": gross_f,
            "insurance_discount": _money(insurance_discount),
            "discount_card_amount": _money(card_amount),
            "total_discount": _money(total_discount),
            "insurance_covered": _money(insurance_covered),
            "patient_share": _money(patient_share),
            "additional_amount": _money(additional),
            "copayment": _money(copayment),
            "final_patient_paid": _money(final_patient),
        },
        "net_total": _money(final_patient),
    }


def record_usage_ledger(
    cur,
    *,
    customer_id: Optional[int],
    company_id: int,
    plan_id: int,
    branch_id: Optional[int],
    invoice_id: int,
    covered_amount: float,
) -> None:
    today = date.today()
    for period_type, period_key in _period_keys(today).items():
        cur.execute(
            """INSERT INTO insurance_usage_ledger
               (customer_id, company_id, plan_id, branch_id, invoice_id,
                period_type, period_key, covered_amount)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (customer_id, company_id, plan_id, branch_id, invoice_id, period_type, period_key, covered_amount),
        )
