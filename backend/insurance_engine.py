"""Insurance sale calculation engine."""
from __future__ import annotations

from copy import deepcopy
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from insurance_constants import (
    DEFAULT_CONTROLS,
    DEFAULT_COVERAGE_RULES,
    DEFAULT_FINANCIAL_RULES,
    DEFAULT_LIMITS,
    DEFAULT_RESTRICTIONS,
    MEDICINE_CATEGORY_HINTS,
)
from material_groups import (
    infer_material_group,
    is_discountable_product,
    normalize_material_group,
    resolve_product_kind,
    resolve_product_origin,
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


def _pf_float(patient_fields: Optional[dict], key: str, default: float = 0.0) -> float:
    if not patient_fields:
        return default
    raw = patient_fields.get(key)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _is_medicine_product(product: dict) -> bool:
    if product.get("is_service"):
        return False
    cat = (product.get("category") or "").strip().lower()
    if not cat:
        return True
    if "cosmetic" in cat:
        return False
    if "medical suppl" in cat or cat == "medical supplies":
        return False
    if any(h in cat for h in MEDICINE_CATEGORY_HINTS):
        return True
    if cat in ("medicine", "supplements", "other"):
        return True
    return cat not in ("cosmetics", "medical supplies", "baby care", "personal care")


def _line_discount_pct(
    product: dict,
    coverage_rules: dict,
) -> tuple[float, str]:
    """Insurance company discount % by material group / origin (local 10%, imported 5%, etc.)."""
    if not is_discountable_product(product):
        return 0.0, "non_discountable"

    kind = resolve_product_kind(product)
    origin = resolve_product_origin(product)

    if kind in ("service", "lab"):
        return float(coverage_rules.get("services_pct") or 0), "services"

    if kind == "cosmetic":
        return float(coverage_rules.get("cosmetics_pct") or 0), f"cosmetics_{origin}"

    if kind == "medical_supply":
        return float(coverage_rules.get("medical_supplies_pct") or 0), f"medical_supplies_{origin}"

    if kind == "drug":
        if origin == "imported":
            return float(coverage_rules.get("imported_drugs_pct") or 0), "imported_drugs"
        return float(coverage_rules.get("local_drugs_pct") or 0), "local_drugs"

    cat = (product.get("category") or "").strip().lower()
    if product.get("is_service"):
        return float(coverage_rules.get("services_pct") or 0), "services"
    if "cosmetic" in cat:
        return float(coverage_rules.get("cosmetics_pct") or 0), "cosmetics"
    if "medical suppl" in cat or cat == "medical supplies":
        return float(coverage_rules.get("medical_supplies_pct") or 0), "medical_supplies"
    if _is_medicine_product(product):
        if origin == "imported":
            return float(coverage_rules.get("imported_drugs_pct") or 0), "imported_drugs"
        return float(coverage_rules.get("local_drugs_pct") or 0), "local_drugs"
    if origin == "imported":
        return float(coverage_rules.get("imported_drugs_pct") or 0), "imported_drugs"
    return float(coverage_rules.get("local_drugs_pct") or 0), "local_drugs"


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


def _resolve_discount_pct(product: dict, plan: dict) -> tuple[float, str]:
    coverage_rules = _merge(DEFAULT_COVERAGE_RULES, plan.get("coverage_rules"))
    restrictions = _merge(DEFAULT_RESTRICTIONS, plan.get("restrictions"))
    if _product_excluded(product, restrictions):
        return 0.0, "excluded"
    return _line_discount_pct(product, coverage_rules)


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
    remaining = proposed_covered
    today = date.today()
    keys = _period_keys(today)

    max_invoice = limits.get("max_coverage_per_invoice")
    if max_invoice is not None and remaining > float(max_invoice):
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
        if remaining > avail:
            if controls.get("allow_exceeding_limits"):
                warnings.append(f"{period_type} limit exceeded")
            elif controls.get("allow_partial_coverage"):
                remaining = min(remaining, max(0.0, avail))
                warnings.append(f"Partial coverage due to {period_type} limit")
            else:
                raise ValueError(f"Insurance {period_type} limit exceeded")

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

    Flow:
    1. Apply company discount % per line (local/imported/etc.) → after_insurance_discount
    2. Patient share % on gross OR after discount (company setting)
    3. Insurance company pays remainder (capped by receipt limit)
    4. Patient pays share + exceeding/additional amounts + copayment
    """
    del discount_card_result  # discount cards are a separate module — not combined here

    pf = patient_fields or {}
    coverage_rules = _merge(DEFAULT_COVERAGE_RULES, plan.get("coverage_rules"))
    financial = _merge(DEFAULT_FINANCIAL_RULES, plan.get("financial_rules"))
    limits = _merge(DEFAULT_LIMITS, plan.get("limits"))
    controls = _merge(DEFAULT_CONTROLS, plan.get("controls"))

    if controls.get("approval_required") and not pf.get("approval_number"):
        raise ValueError("Approval number is required for this insurance plan")

    receipt_limit = _pf_float(pf, "receipt_limit")
    exceeding_amount = Decimal(str(_pf_float(pf, "exceeding_amount")))
    max_patient_share = _pf_float(pf, "max_patient_share")

    txn_patient_pct = _pf_float(pf, "patient_share_pct", default=-1)
    patient_share_pct = txn_patient_pct if txn_patient_pct >= 0 else float(financial.get("patient_share_pct") or 0)
    timing = str(financial.get("patient_share_timing") or "after_discount").strip().lower()
    if timing not in ("before_discount", "after_discount"):
        timing = "after_discount"

    line_results = []
    gross = Decimal("0")
    insurance_discount_total = Decimal("0")
    after_discount = Decimal("0")

    for item in items:
        pid = item["product_id"]
        product = products.get(pid) or {}
        qty = Decimal(str(item.get("quantity") or 0))
        unit_price = Decimal(str(item.get("unit_price") or 0))
        line_disc = Decimal(str(item.get("discount") or 0)) + Decimal(str(item.get("offer_discount") or 0))
        line_gross = max(Decimal("0"), qty * unit_price - line_disc)
        gross += line_gross

        discount_pct, rule = _resolve_discount_pct(product, plan)
        line_insurance_disc = (line_gross * Decimal(str(discount_pct)) / Decimal("100")).quantize(Q, rounding=ROUND_HALF_UP)
        line_after = line_gross - line_insurance_disc
        insurance_discount_total += line_insurance_disc
        after_discount += line_after

        origin = resolve_product_origin(product)
        mg = normalize_material_group(product.get("material_group")) or infer_material_group(
            origin_type=origin,
            is_service=product.get("is_service"),
            category=product.get("category"),
        )
        line_results.append({
            "product_id": pid,
            "product_name": product.get("name_en") or product.get("name_ar") or "",
            "material_group": mg,
            "origin_type": origin,
            "line_gross": _money(line_gross),
            "coverage_pct": discount_pct,
            "coverage_rule": rule,
            "insurance_discount": _money(line_insurance_disc),
            "line_after_discount": _money(line_after),
            "covered_amount": 0.0,
            "patient_share": 0.0,
            "additional_amount": 0.0,
        })

    gross_f = _money(gross)
    after_discount_f = _money(after_discount)
    insurance_discount_f = _money(insurance_discount_total)

    share_base = gross if timing == "before_discount" else after_discount
    patient_share_amt = (share_base * Decimal(str(patient_share_pct)) / Decimal("100")).quantize(Q, rounding=ROUND_HALF_UP)

    insurance_owed = after_discount - patient_share_amt
    if insurance_owed < 0:
        insurance_owed = Decimal("0")

    receipt_limit_excess = Decimal("0")
    if receipt_limit > 0 and insurance_owed > Decimal(str(receipt_limit)):
        receipt_limit_excess = insurance_owed - Decimal(str(receipt_limit))
        insurance_owed = Decimal(str(receipt_limit))
        limit_warnings = ["Receipt insurance limit exceeded — patient pays difference"]
    else:
        limit_warnings = []

    insurance_covered = insurance_owed
    covered_f, period_warnings = _check_limits(
        cur,
        customer_id=customer_id,
        company_id=company_id,
        plan_id=plan_id,
        proposed_covered=float(insurance_covered),
        controls=controls,
        limits=limits,
    )
    limit_warnings.extend(period_warnings)

    if covered_f < float(insurance_covered):
        shortfall = insurance_covered - Decimal(str(covered_f))
        receipt_limit_excess += shortfall
        insurance_covered = Decimal(str(covered_f))

    if after_discount > 0 and insurance_covered > 0:
        ratio = insurance_covered / after_discount
        for lr in line_results:
            line_after = Decimal(str(lr["line_after_discount"]))
            c = (line_after * ratio).quantize(Q, rounding=ROUND_HALF_UP)
            lr["covered_amount"] = _money(c)
            lr["patient_share"] = _money(line_after - c)
    else:
        for lr in line_results:
            lr["patient_share"] = lr["line_after_discount"]

    copayment = Decimal(str(financial.get("fixed_copayment") or 0))
    additional = exceeding_amount
    if _pf_float(pf, "additional_amount") > 0:
        additional += Decimal(str(_pf_float(pf, "additional_amount")))

    final_patient = patient_share_amt + receipt_limit_excess + additional + copayment
    if max_patient_share > 0 and final_patient > Decimal(str(max_patient_share)):
        final_patient = Decimal(str(max_patient_share))
        limit_warnings.append("Capped at max patient share")

    if final_patient < 0:
        final_patient = Decimal("0")

    local_summary = {
        "local_lines": sum(1 for lr in line_results if lr.get("origin_type") == "local"),
        "imported_lines": sum(1 for lr in line_results if lr.get("origin_type") == "imported"),
        "local_drugs_pct": coverage_rules.get("local_drugs_pct"),
        "imported_drugs_pct": coverage_rules.get("imported_drugs_pct"),
        "patient_share_timing": timing,
    }

    return {
        "lines": line_results,
        "warnings": limit_warnings,
        "coverage_summary": local_summary,
        "totals": {
            "gross_before_discounts": gross_f,
            "after_insurance_discount": after_discount_f,
            "insurance_discount": insurance_discount_f,
            "discount_card_amount": 0.0,
            "total_discount": insurance_discount_f,
            "insurance_covered": _money(insurance_covered),
            "patient_share_pct": patient_share_pct,
            "patient_share_timing": timing,
            "patient_share": _money(patient_share_amt),
            "receipt_limit_excess": _money(receipt_limit_excess),
            "additional_amount": _money(additional),
            "copayment": _money(copayment),
            "exceeding_amount": _money(exceeding_amount),
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
