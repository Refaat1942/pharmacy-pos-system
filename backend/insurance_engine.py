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


def _drug_coverage_pct(
    product: dict,
    coverage_rules: dict,
    patient_fields: Optional[dict],
) -> tuple[float, str]:
    """Local vs imported drug coverage from plan rules (primary insurance discount)."""
    origin = (product.get("origin_type") or "local").strip().lower()
    if origin == "imported":
        pct = float(coverage_rules.get("imported_drugs_pct") or 0)
        rule = "imported_drugs"
    else:
        pct = float(coverage_rules.get("local_drugs_pct") or 0)
        rule = "local_drugs"

    txn_treatment = (patient_fields or {}).get("treatment_type") or ""
    prod_treatment = (product.get("medication_type") or "").strip().lower()
    treatment = (txn_treatment or prod_treatment).lower()

    if treatment == "chronic":
        chronic_pct = float(coverage_rules.get("chronic_medication_pct") or 0)
        if chronic_pct > pct:
            pct = chronic_pct
            rule = "chronic_medication"
    elif treatment == "acute":
        acute_pct = float(coverage_rules.get("acute_medication_pct") or 0)
        if acute_pct > pct:
            pct = acute_pct
            rule = "acute_medication"

    txn_patient_pct = _pf_float(patient_fields, "patient_share_pct", default=-1)
    if txn_patient_pct >= 0:
        min_coverage = max(0.0, 100.0 - txn_patient_pct)
        if min_coverage > pct:
            pct = min_coverage
            rule = f"{rule}+patient_share_floor"

    return pct, rule


def _category_coverage_pct(
    product: dict,
    coverage_rules: dict,
    patient_fields: Optional[dict],
) -> tuple[float, str]:
    cat = (product.get("category") or "").strip()
    cat_lower = cat.lower()
    is_service = bool(product.get("is_service"))

    if is_service:
        return float(coverage_rules.get("services_pct") or 0), "services"

    if "cosmetic" in cat_lower:
        return float(coverage_rules.get("cosmetics_pct") or 0), "cosmetics"
    if "medical suppl" in cat_lower or cat_lower == "medical supplies":
        return float(coverage_rules.get("medical_supplies_pct") or 0), "medical_supplies"

    if _is_medicine_product(product):
        return _drug_coverage_pct(product, coverage_rules, patient_fields)

    origin = (product.get("origin_type") or "local").lower()
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


def _resolve_coverage_pct(
    product: dict,
    plan: dict,
    patient_fields: Optional[dict],
) -> tuple[float, str]:
    coverage_rules = _merge(DEFAULT_COVERAGE_RULES, plan.get("coverage_rules"))
    restrictions = _merge(DEFAULT_RESTRICTIONS, plan.get("restrictions"))
    if _product_excluded(product, restrictions):
        return 0.0, "excluded"
    pct, rule = _category_coverage_pct(product, coverage_rules, patient_fields)
    financial = _merge(DEFAULT_FINANCIAL_RULES, plan.get("financial_rules"))
    cap = float(financial.get("insurance_coverage_pct") or 100)
    if _pf_float(patient_fields, "patient_share_pct", default=-1) < 0:
        plan_patient = float(financial.get("patient_share_pct") or 0)
        if plan_patient > 0:
            cap = min(cap, 100.0 - plan_patient)
    return min(pct, cap), rule


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
    receipt_limit: float,
) -> tuple[float, list[str]]:
    warnings: list[str] = []
    today = date.today()
    keys = _period_keys(today)
    remaining = proposed_covered

    if receipt_limit > 0 and proposed_covered > receipt_limit:
        if controls.get("allow_exceeding_limits"):
            warnings.append("Receipt insurance limit exceeded — patient pays difference")
        elif controls.get("allow_partial_coverage"):
            remaining = min(remaining, receipt_limit)
            warnings.append("Partial coverage due to receipt limit")
        else:
            remaining = receipt_limit
            warnings.append("Coverage capped at receipt limit")

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
    """Calculate insurance breakdown for a cart."""
    pf = patient_fields or {}
    coverage_rules = _merge(DEFAULT_COVERAGE_RULES, plan.get("coverage_rules"))
    financial = _merge(DEFAULT_FINANCIAL_RULES, plan.get("financial_rules"))
    limits = _merge(DEFAULT_LIMITS, plan.get("limits"))
    controls = _merge(DEFAULT_CONTROLS, plan.get("controls"))

    if controls.get("approval_required") and not pf.get("approval_number"):
        raise ValueError("Approval number is required for this insurance plan")

    receipt_limit = _pf_float(pf, "receipt_limit")
    exceeding_amount = _pf_float(pf, "exceeding_amount")
    max_patient_share = _pf_float(pf, "max_patient_share")

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
        line_net = max(Decimal("0"), qty * unit_price - line_disc)
        gross += line_net

        pct, rule = _resolve_coverage_pct(product, plan, pf)
        covered = (line_net * Decimal(str(pct)) / Decimal("100")).quantize(Q, rounding=ROUND_HALF_UP)
        insurance_disc = line_net - covered
        if max_item is not None:
            covered = min(covered, Decimal(str(max_item)))
            insurance_disc = line_net - covered

        patient_line = line_net - covered
        insurance_covered += covered
        origin = (product.get("origin_type") or "local").lower()
        line_results.append({
            "product_id": pid,
            "product_name": product.get("name_en") or product.get("name_ar") or "",
            "origin_type": origin,
            "line_gross": _money(line_net),
            "coverage_pct": pct,
            "coverage_rule": rule,
            "insurance_discount": _money(insurance_disc),
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
        receipt_limit=receipt_limit,
    )

    if covered_f < float(insurance_covered):
        ratio = Decimal(str(covered_f)) / insurance_covered if insurance_covered else Decimal("0")
        insurance_covered = Decimal(str(covered_f))
        for lr in line_results:
            line_gross = Decimal(str(lr["line_gross"]))
            c = (line_gross * ratio).quantize(Q, rounding=ROUND_HALF_UP)
            lr["covered_amount"] = _money(c)
            lr["insurance_discount"] = _money(line_gross - c)
            lr["patient_share"] = _money(line_gross - c)

    patient_share = gross - insurance_covered
    additional_pct = Decimal(str(financial.get("additional_amount_pct") or 0))
    additional = (patient_share * additional_pct / Decimal("100")).quantize(Q, rounding=ROUND_HALF_UP)
    copayment = Decimal(str(financial.get("fixed_copayment") or 0))

    if exceeding_amount > 0:
        additional += Decimal(str(exceeding_amount))

    insurance_discount_total = gross - insurance_covered
    card_amount = Decimal("0")
    if discount_card_result and discount_card_result.get("active"):
        card_amount = Decimal(str(discount_card_result.get("discount_amount") or 0))

    final_patient = patient_share + additional + copayment - card_amount
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
    }

    return {
        "lines": line_results,
        "warnings": limit_warnings,
        "coverage_summary": local_summary,
        "totals": {
            "gross_before_discounts": gross_f,
            "insurance_discount": _money(insurance_discount_total),
            "discount_card_amount": _money(card_amount),
            "total_discount": _money(insurance_discount_total + card_amount),
            "insurance_covered": _money(insurance_covered),
            "patient_share": _money(patient_share),
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
