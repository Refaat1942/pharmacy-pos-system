"""Insurance companies, plans, profiles, claims, and POS calculation API."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_active_branch_id, get_current_user, requires_feature, requires_feature_option
from discount_card_engine import calculate_discount_card, record_card_usage
from excel_utils import xlsx_response
from insurance_audit import log_insurance_audit
from insurance_constants import (
    DEFAULT_CONTROLS,
    DEFAULT_COVERAGE_RULES,
    DEFAULT_FIELD_CONFIG,
    DEFAULT_FINANCIAL_RULES,
    DEFAULT_LIMITS,
    DEFAULT_RESTRICTIONS,
    INSURANCE_FIELD_KEYS,
)
from insurance_engine import calculate_insurance_sale, record_usage_ledger

router = APIRouter(prefix="/api/insurance", tags=["insurance"])


def _admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _load_products(cur, product_ids: list[int]) -> dict[int, dict]:
    if not product_ids:
        return {}
    cur.execute(
        """SELECT id, category, origin_type, medication_type, material_group, brand_id,
                  COALESCE(is_service, false) AS is_service, name_en, name_ar
           FROM products WHERE id = ANY(%s)""",
        (product_ids,),
    )
    return {r["id"]: dict(r) for r in cur.fetchall()}


class CompanyIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name_ar: str = Field(..., min_length=1, max_length=200)
    name_en: str = Field(..., min_length=1, max_length=200)
    status: str = "active"
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    field_config: Optional[dict] = None
    custom_field_defs: Optional[list] = None
    local_drugs_pct: Optional[float] = Field(None, ge=0, le=100)
    imported_drugs_pct: Optional[float] = Field(None, ge=0, le=100)
    patient_share_pct: Optional[float] = Field(None, ge=0, le=100)


def _upsert_default_plan(
    cur,
    *,
    company_id: int,
    name_en: str,
    name_ar: str,
    local_drugs_pct: Optional[float],
    imported_drugs_pct: Optional[float],
    patient_share_pct: Optional[float],
) -> None:
    """Ensure each company has a DEFAULT plan with local/imported coverage."""
    if local_drugs_pct is None and imported_drugs_pct is None and patient_share_pct is None:
        return
    coverage = dict(DEFAULT_COVERAGE_RULES)
    financial = dict(DEFAULT_FINANCIAL_RULES)
    if local_drugs_pct is not None:
        coverage["local_drugs_pct"] = local_drugs_pct
    if imported_drugs_pct is not None:
        coverage["imported_drugs_pct"] = imported_drugs_pct
    if patient_share_pct is not None:
        financial["patient_share_pct"] = patient_share_pct
        financial["insurance_coverage_pct"] = max(0.0, 100.0 - patient_share_pct)
    cur.execute(
        "SELECT id FROM insurance_plans WHERE company_id=%s AND code='DEFAULT'",
        (company_id,),
    )
    existing = cur.fetchone()
    if existing:
        cur.execute(
            """UPDATE insurance_plans SET
               coverage_rules=%s, financial_rules=%s, status='active', updated_at=NOW()
               WHERE id=%s""",
            (
                psycopg2.extras.Json(coverage),
                psycopg2.extras.Json(financial),
                existing["id"],
            ),
        )
    else:
        cur.execute(
            """INSERT INTO insurance_plans
               (company_id, code, name_ar, name_en, status, priority, notes,
                coverage_rules, financial_rules, limits, controls, restrictions)
               VALUES (%s,'DEFAULT',%s,%s,'active',100,'Auto default plan',
                       %s,%s,%s,%s,%s)""",
            (
                company_id,
                name_ar or "الخطة الافتراضية",
                name_en or "Standard Plan",
                psycopg2.extras.Json(coverage),
                psycopg2.extras.Json(financial),
                psycopg2.extras.Json(DEFAULT_LIMITS),
                psycopg2.extras.Json(DEFAULT_CONTROLS),
                psycopg2.extras.Json(DEFAULT_RESTRICTIONS),
            ),
        )


class PlanIn(BaseModel):
    company_id: int
    code: str = Field(..., min_length=1, max_length=50)
    name_ar: str = Field(..., min_length=1, max_length=200)
    name_en: str = Field(..., min_length=1, max_length=200)
    status: str = "active"
    priority: int = 0
    notes: Optional[str] = None
    coverage_rules: Optional[dict] = None
    financial_rules: Optional[dict] = None
    limits: Optional[dict] = None
    controls: Optional[dict] = None
    restrictions: Optional[dict] = None


class ProfileIn(BaseModel):
    customer_id: int
    company_id: int
    plan_id: Optional[int] = None
    insurance_card_number: Optional[str] = None
    membership_number: Optional[str] = None
    policy_number: Optional[str] = None
    national_id: Optional[str] = None
    expiry_date: Optional[str] = None
    approval_number: Optional[str] = None
    coverage_class: Optional[str] = None
    max_coverage: Optional[float] = None
    remaining_balance: Optional[float] = None
    notes: Optional[str] = None
    is_primary: bool = True
    active: bool = True
    extra_fields: Optional[dict] = None


class CalculateIn(BaseModel):
    company_id: int
    plan_id: int
    customer_id: Optional[int] = None
    discount_card_id: Optional[int] = None
    patient_fields: Optional[dict] = None
    items: list[dict]


class ClaimGenerateIn(BaseModel):
    company_id: int
    plan_id: Optional[int] = None
    branch_id: Optional[int] = None
    period_type: str = "monthly"
    date_from: str
    date_to: str


@router.get("/field-keys", dependencies=[Depends(requires_feature("insurance"))])
def field_keys():
    return {"keys": INSURANCE_FIELD_KEYS, "defaults": DEFAULT_FIELD_CONFIG}


@router.get("/companies", dependencies=[Depends(requires_feature("insurance"))])
def list_companies(
    status: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        clause = ""
        params: list = []
        if status:
            clause = " WHERE status = %s"
            params.append(status)
        cur.execute(
            f"""SELECT * FROM insurance_companies{clause} ORDER BY name_en""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/companies/active", dependencies=[Depends(requires_feature("insurance"))])
def list_active_companies(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT id, code, name_ar, name_en, field_config, custom_field_defs
               FROM insurance_companies WHERE status = 'active' ORDER BY name_en"""
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/companies", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def create_company(body: CompanyIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    field_config = {**DEFAULT_FIELD_CONFIG, **(body.field_config or {})}
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO insurance_companies
               (code, name_ar, name_en, status, contact_person, phone, email, address, notes,
                field_config, custom_field_defs, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                body.code.strip().upper(), body.name_ar, body.name_en, body.status,
                body.contact_person, body.phone, body.email, body.address, body.notes,
                psycopg2.extras.Json(field_config),
                psycopg2.extras.Json(body.custom_field_defs or []),
                current_user.get("user_id"),
            ),
        )
        row = dict(cur.fetchone())
        _upsert_default_plan(
            cur,
            company_id=row["id"],
            name_en=body.name_en,
            name_ar=body.name_ar,
            local_drugs_pct=body.local_drugs_pct,
            imported_drugs_pct=body.imported_drugs_pct,
            patient_share_pct=body.patient_share_pct,
        )
        log_insurance_audit(cur, entity_type="company", entity_id=row["id"], action="create",
                            user_id=current_user.get("user_id"), new_value=row)
        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(400, "Company code already exists") from e
        if "insurance_audit_log" in str(e).lower() or "does not exist" in str(e).lower():
            raise HTTPException(
                500,
                "Insurance tables are not fully migrated. Restart the backend or run database init.",
            ) from e
        raise HTTPException(500, f"Could not save company: {e}") from e
    finally:
        conn.close()


@router.put("/companies/{company_id}", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def update_company(company_id: int, body: CompanyIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM insurance_companies WHERE id=%s", (company_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(404, "Company not found")
        field_config = {**DEFAULT_FIELD_CONFIG, **(body.field_config or {})}
        cur.execute(
            """UPDATE insurance_companies SET
               code=%s, name_ar=%s, name_en=%s, status=%s, contact_person=%s, phone=%s,
               email=%s, address=%s, notes=%s, field_config=%s, custom_field_defs=%s,
               updated_at=NOW()
               WHERE id=%s RETURNING *""",
            (
                body.code.strip().upper(), body.name_ar, body.name_en, body.status,
                body.contact_person, body.phone, body.email, body.address, body.notes,
                psycopg2.extras.Json(field_config),
                psycopg2.extras.Json(body.custom_field_defs or []),
                company_id,
            ),
        )
        row = dict(cur.fetchone())
        _upsert_default_plan(
            cur,
            company_id=company_id,
            name_en=body.name_en,
            name_ar=body.name_ar,
            local_drugs_pct=body.local_drugs_pct,
            imported_drugs_pct=body.imported_drugs_pct,
            patient_share_pct=body.patient_share_pct,
        )
        log_insurance_audit(cur, entity_type="company", entity_id=company_id, action="update",
                            user_id=current_user.get("user_id"), old_value=dict(old), new_value=row)
        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(400, "Company code already exists") from e
        raise HTTPException(500, f"Could not update company: {e}") from e
    finally:
        conn.close()


@router.get("/plans", dependencies=[Depends(requires_feature("insurance"))])
def list_plans(company_id: Optional[int] = None, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if company_id:
            cur.execute(
                """SELECT p.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar
                   FROM insurance_plans p
                   JOIN insurance_companies c ON c.id = p.company_id
                   WHERE p.company_id = %s ORDER BY p.priority DESC, p.name_en""",
                (company_id,),
            )
        else:
            cur.execute(
                """SELECT p.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar
                   FROM insurance_plans p
                   JOIN insurance_companies c ON c.id = p.company_id
                   ORDER BY c.name_en, p.priority DESC"""
            )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/plans", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def create_plan(body: PlanIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM insurance_companies WHERE id=%s", (body.company_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Company not found")
        cur.execute(
            """INSERT INTO insurance_plans
               (company_id, code, name_ar, name_en, status, priority, notes,
                coverage_rules, financial_rules, limits, controls, restrictions)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                body.company_id, body.code.strip().upper(), body.name_ar, body.name_en,
                body.status, body.priority, body.notes,
                psycopg2.extras.Json({**DEFAULT_COVERAGE_RULES, **(body.coverage_rules or {})}),
                psycopg2.extras.Json({**DEFAULT_FINANCIAL_RULES, **(body.financial_rules or {})}),
                psycopg2.extras.Json({**DEFAULT_LIMITS, **(body.limits or {})}),
                psycopg2.extras.Json({**DEFAULT_CONTROLS, **(body.controls or {})}),
                psycopg2.extras.Json({**DEFAULT_RESTRICTIONS, **(body.restrictions or {})}),
            ),
        )
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="plan", entity_id=row["id"], action="create",
                            user_id=current_user.get("user_id"), new_value=row)
        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(400, "Plan code already exists for this company") from e
        raise
    finally:
        conn.close()


@router.put("/plans/{plan_id}", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def update_plan(plan_id: int, body: PlanIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM insurance_plans WHERE id=%s", (plan_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(404, "Plan not found")
        cur.execute(
            """UPDATE insurance_plans SET
               company_id=%s, code=%s, name_ar=%s, name_en=%s, status=%s, priority=%s, notes=%s,
               coverage_rules=%s, financial_rules=%s, limits=%s, controls=%s, restrictions=%s,
               updated_at=NOW()
               WHERE id=%s RETURNING *""",
            (
                body.company_id, body.code.strip().upper(), body.name_ar, body.name_en,
                body.status, body.priority, body.notes,
                psycopg2.extras.Json({**DEFAULT_COVERAGE_RULES, **(body.coverage_rules or {})}),
                psycopg2.extras.Json({**DEFAULT_FINANCIAL_RULES, **(body.financial_rules or {})}),
                psycopg2.extras.Json({**DEFAULT_LIMITS, **(body.limits or {})}),
                psycopg2.extras.Json({**DEFAULT_CONTROLS, **(body.controls or {})}),
                psycopg2.extras.Json({**DEFAULT_RESTRICTIONS, **(body.restrictions or {})}),
                plan_id,
            ),
        )
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="plan", entity_id=plan_id, action="update",
                            user_id=current_user.get("user_id"), old_value=dict(old), new_value=row)
        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/profiles", dependencies=[Depends(requires_feature("insurance"))])
def list_profiles(customer_id: Optional[int] = None, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if customer_id:
            cur.execute(
                """SELECT p.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar,
                          pl.name_en AS plan_name_en, pl.name_ar AS plan_name_ar
                   FROM customer_insurance_profiles p
                   JOIN insurance_companies c ON c.id = p.company_id
                   LEFT JOIN insurance_plans pl ON pl.id = p.plan_id
                   WHERE p.customer_id = %s ORDER BY p.is_primary DESC, p.id""",
                (customer_id,),
            )
        else:
            cur.execute(
                """SELECT p.*, c.name_en AS company_name_en, cu.name AS customer_name
                   FROM customer_insurance_profiles p
                   JOIN insurance_companies c ON c.id = p.company_id
                   JOIN customers cu ON cu.id = p.customer_id
                   ORDER BY p.updated_at DESC LIMIT 200"""
            )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/profiles", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def create_profile(body: ProfileIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if body.is_primary:
            cur.execute(
                "UPDATE customer_insurance_profiles SET is_primary=false WHERE customer_id=%s",
                (body.customer_id,),
            )
        cur.execute(
            """INSERT INTO customer_insurance_profiles
               (customer_id, company_id, plan_id, insurance_card_number, membership_number,
                policy_number, national_id, expiry_date, approval_number, coverage_class,
                max_coverage, remaining_balance, notes, is_primary, active, extra_fields)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                body.customer_id, body.company_id, body.plan_id,
                body.insurance_card_number, body.membership_number, body.policy_number,
                body.national_id, body.expiry_date or None, body.approval_number,
                body.coverage_class, body.max_coverage, body.remaining_balance,
                body.notes, body.is_primary, body.active,
                psycopg2.extras.Json(body.extra_fields or {}),
            ),
        )
        row = dict(cur.fetchone())
        from customer_insurance_sync import mark_customer_sale_type
        mark_customer_sale_type(cur, body.customer_id, "insurance")
        conn.commit()
        return row
    finally:
        conn.close()


@router.put("/profiles/{profile_id}", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def update_profile(profile_id: int, body: ProfileIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if body.is_primary:
            cur.execute(
                "UPDATE customer_insurance_profiles SET is_primary=false WHERE customer_id=%s",
                (body.customer_id,),
            )
        cur.execute(
            """UPDATE customer_insurance_profiles SET
               customer_id=%s, company_id=%s, plan_id=%s, insurance_card_number=%s,
               membership_number=%s, policy_number=%s, national_id=%s, expiry_date=%s,
               approval_number=%s, coverage_class=%s, max_coverage=%s, remaining_balance=%s,
               notes=%s, is_primary=%s, active=%s, extra_fields=%s, updated_at=NOW()
               WHERE id=%s RETURNING *""",
            (
                body.customer_id, body.company_id, body.plan_id,
                body.insurance_card_number, body.membership_number, body.policy_number,
                body.national_id, body.expiry_date or None, body.approval_number,
                body.coverage_class, body.max_coverage, body.remaining_balance,
                body.notes, body.is_primary, body.active,
                psycopg2.extras.Json(body.extra_fields or {}),
                profile_id,
            ),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Profile not found")
        from customer_insurance_sync import mark_customer_sale_type
        mark_customer_sale_type(cur, body.customer_id, "insurance")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


@router.delete("/profiles/{profile_id}", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "manage")),
])
def delete_profile(profile_id: int, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM customer_insurance_profiles WHERE id=%s RETURNING id", (profile_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Profile not found")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/calculate", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "pos_billing")),
])
def calculate(body: CalculateIn, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT p.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar,
                      c.field_config, c.status AS company_status
               FROM insurance_plans p
               JOIN insurance_companies c ON c.id = p.company_id
               WHERE p.id = %s AND p.company_id = %s""",
            (body.plan_id, body.company_id),
        )
        plan_row = cur.fetchone()
        if not plan_row:
            raise HTTPException(404, "Plan not found")
        if plan_row["company_status"] != "active" or plan_row["status"] != "active":
            raise HTTPException(400, "Insurance company or plan is inactive")

        _validate_patient_fields(plan_row["field_config"] or {}, body.patient_fields or {})

        product_ids = [i["product_id"] for i in body.items]
        products = _load_products(cur, product_ids)

        card_result = None
        if body.discount_card_id:
            cur.execute(
                """SELECT dc.*, dp.rules, dp.compatibility, dp.status AS program_status
                   FROM discount_cards dc
                   JOIN discount_card_programs dp ON dp.id = dc.program_id
                   WHERE dc.id = %s""",
                (body.discount_card_id,),
            )
            card = cur.fetchone()
            if card:
                card_result = calculate_discount_card(
                    cur,
                    card=dict(card),
                    program={"rules": card["rules"], "compatibility": card["compatibility"], "status": card["program_status"]},
                    items=body.items,
                    products=products,
                    eligible_amount=sum(
                        (i.get("quantity", 0) * i.get("unit_price", 0))
                        - (i.get("discount", 0) + i.get("offer_discount", 0))
                        for i in body.items
                    ),
                    customer_id=body.customer_id,
                    has_insurance=True,
                    has_promotions=any(i.get("offer_discount") for i in body.items),
                )

        plan = dict(plan_row)
        result = calculate_insurance_sale(
            cur,
            items=body.items,
            products=products,
            plan=plan,
            company_id=body.company_id,
            plan_id=body.plan_id,
            customer_id=body.customer_id,
            patient_fields=body.patient_fields,
            discount_card_result=card_result,
        )
        result["company_id"] = body.company_id
        result["plan_id"] = body.plan_id
        result["discount_card"] = card_result
        return result
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    finally:
        conn.close()


def _validate_patient_fields(field_config: dict, patient_fields: dict) -> None:
    cfg = {**DEFAULT_FIELD_CONFIG, **(field_config or {})}
    pf = dict(patient_fields or {})
    if not str(pf.get("patient_name") or "").strip():
        combined = f"{pf.get('patient_first_name', '').strip()} {pf.get('patient_last_name', '').strip()}".strip()
        if combined:
            pf["patient_name"] = combined
    attachment = pf.get("attachment_upload") or ""
    if attachment and len(str(attachment)) > 750_000:
        raise HTTPException(400, "Attachment too large (max ~500KB)")
    for key, mode in cfg.items():
        if mode == "required":
            val = pf.get(key)
            if val is None or str(val).strip() == "":
                raise HTTPException(400, f"Field required: {key}")


@router.get("/claims", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims")),
])
def list_claims(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        clauses = []
        params: list = []
        if company_id:
            clauses.append("cl.company_id = %s")
            params.append(company_id)
        if status:
            clauses.append("cl.status = %s")
            params.append(status)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        cur.execute(
            f"""SELECT cl.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar,
                       pl.name_en AS plan_name_en, b.name_en AS branch_name_en
                FROM insurance_claims cl
                JOIN insurance_companies c ON c.id = cl.company_id
                LEFT JOIN insurance_plans pl ON pl.id = cl.plan_id
                LEFT JOIN branches b ON b.id = cl.branch_id
                {where}
                ORDER BY cl.created_at DESC LIMIT 500""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/claims/generate", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims")),
])
def generate_claim(body: ClaimGenerateIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        df = body.date_from
        dt = body.date_to
        clauses = [
            "i.type = 'insurance'",
            "i.status = 'completed'",
            "i.claim_id IS NULL",
            "i.created_at >= %s::date",
            "i.created_at < (%s::date + INTERVAL '1 day')",
            "(i.insurance_totals->>'insurance_covered')::numeric > 0",
        ]
        params: list = [df, dt]
        if body.company_id:
            clauses.append("i.insurance_company_id = %s")
            params.append(body.company_id)
        if body.plan_id:
            clauses.append("i.insurance_plan_id = %s")
            params.append(body.plan_id)
        if body.branch_id:
            clauses.append("i.branch_id = %s")
            params.append(body.branch_id)

        cur.execute(
            f"""SELECT i.id, i.net_total, i.discount, i.insurance_totals, i.subtotal
                FROM invoices i
                WHERE {' AND '.join(clauses)}""",
            params,
        )
        invoices = cur.fetchall()
        if not invoices:
            raise HTTPException(400, "No unclaimed insurance invoices in this period")

        covered = sum(float(r["insurance_totals"].get("insurance_covered") or 0) for r in invoices)
        patient = sum(float(r["insurance_totals"].get("patient_share") or 0) for r in invoices)
        additional = sum(float(r["insurance_totals"].get("additional_amount") or 0) for r in invoices)
        discounts = sum(float(r["insurance_totals"].get("total_discount") or 0) for r in invoices)
        sales = sum(float(r["subtotal"] or 0) for r in invoices)

        cur.execute("SELECT COUNT(*) + 1 AS n FROM insurance_claims")
        seq = cur.fetchone()["n"]
        claim_number = f"CLM-{datetime.now().strftime('%Y%m%d')}-{int(seq):04d}"

        cur.execute(
            """INSERT INTO insurance_claims
               (claim_number, company_id, plan_id, branch_id, period_type, period_from, period_to,
                status, receipt_count, total_sales, total_discounts, covered_amount,
                patient_share, additional_amount, net_claim_amount, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,'draft',%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                claim_number, body.company_id, body.plan_id, body.branch_id,
                body.period_type, df, dt, len(invoices), sales, discounts,
                covered, patient, additional, covered, current_user.get("user_id"),
            ),
        )
        claim = dict(cur.fetchone())
        claim_id = claim["id"]
        for inv in invoices:
            cur.execute(
                "UPDATE invoices SET claim_id = %s WHERE id = %s",
                (claim_id, inv["id"]),
            )
            cur.execute(
                "INSERT INTO insurance_claim_invoices (claim_id, invoice_id) VALUES (%s,%s)",
                (claim_id, inv["id"]),
            )
        log_insurance_audit(cur, entity_type="claim", entity_id=claim_id, action="create",
                            user_id=current_user.get("user_id"), new_value=claim)
        conn.commit()
        return claim
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/claims/{claim_id}", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims")),
])
def get_claim(claim_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM insurance_claims WHERE id=%s", (claim_id,))
        claim = cur.fetchone()
        if not claim:
            raise HTTPException(404, "Claim not found")
        cur.execute(
            """SELECT i.id, i.invoice_number, i.created_at, i.net_total, i.insurance_snapshot,
                      i.insurance_totals, cu.name AS customer_name
               FROM insurance_claim_invoices ci
               JOIN invoices i ON i.id = ci.invoice_id
               LEFT JOIN customers cu ON cu.id = i.customer_id
               WHERE ci.claim_id = %s ORDER BY i.created_at""",
            (claim_id,),
        )
        invoices = [dict(r) for r in cur.fetchall()]
        return {"claim": dict(claim), "invoices": invoices}
    finally:
        conn.close()


@router.post("/claims/{claim_id}/status", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims")),
])
def update_claim_status(claim_id: int, status: str = Query(...), current_user=Depends(get_current_user)):
    _admin(current_user)
    allowed = {"draft", "submitted", "approved", "paid", "rejected", "partial"}
    if status not in allowed:
        raise HTTPException(400, "Invalid status")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM insurance_claims WHERE id=%s", (claim_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(404, "Claim not found")
        ts_col = None
        if status == "submitted":
            ts_col = "submitted_at"
        elif status == "approved":
            ts_col = "approved_at"
        elif status == "paid":
            ts_col = "paid_at"
        extra = f", {ts_col}=NOW()" if ts_col else ""
        cur.execute(f"UPDATE insurance_claims SET status=%s{extra} WHERE id=%s RETURNING *", (status, claim_id))
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="claim", entity_id=claim_id, action="status_change",
                            user_id=current_user.get("user_id"), old_value={"status": old["status"]},
                            new_value={"status": status})
        conn.commit()
        return row
    finally:
        conn.close()


@router.get("/claims/{claim_id}/export", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims_export")),
])
def export_claim(claim_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT cl.*, c.name_en AS company_name
               FROM insurance_claims cl
               JOIN insurance_companies c ON c.id = cl.company_id
               WHERE cl.id=%s""",
            (claim_id,),
        )
        claim = cur.fetchone()
        if not claim:
            raise HTTPException(404, "Claim not found")
        cur.execute(
            """SELECT i.invoice_number, i.created_at, cu.name AS patient_name,
                      i.insurance_snapshot, i.insurance_totals
               FROM insurance_claim_invoices ci
               JOIN invoices i ON i.id = ci.invoice_id
               LEFT JOIN customers cu ON cu.id = i.customer_id
               WHERE ci.claim_id = %s ORDER BY i.created_at""",
            (claim_id,),
        )
        rows = []
        for r in cur.fetchall():
            snap = r["insurance_snapshot"] or {}
            totals = r["insurance_totals"] or {}
            rows.append([
                r["invoice_number"],
                str(r["created_at"])[:10],
                r["patient_name"] or "",
                snap.get("insurance_card_number", ""),
                snap.get("membership_number", ""),
                totals.get("insurance_covered", 0),
                totals.get("patient_share", 0),
                totals.get("final_patient_paid", 0),
            ])
        headers = [
            "Invoice", "Date", "Patient", "Card #", "Membership",
            "Covered", "Patient Share", "Patient Paid",
        ]
        return xlsx_response(headers, rows, f"claim-{claim['claim_number']}.xlsx")
    finally:
        conn.close()


@router.get("/dashboard", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "dashboard")),
])
def insurance_dashboard(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        today = date.today()
        month_start = today.replace(day=1)
        cur.execute(
            """SELECT
                 COALESCE(SUM((insurance_totals->>'insurance_covered')::numeric), 0)::float AS total_covered,
                 COALESCE(SUM(net_total), 0)::float AS patient_paid,
                 COUNT(*)::int AS invoice_count
               FROM invoices
               WHERE type='insurance' AND status='completed'
                 AND created_at >= %s""",
            (month_start,),
        )
        sales = dict(cur.fetchone())
        cur.execute(
            """SELECT status, COUNT(*)::int AS cnt,
                      COALESCE(SUM(net_claim_amount), 0)::float AS amount
               FROM insurance_claims GROUP BY status"""
        )
        claims_by_status = [dict(r) for r in cur.fetchall()]
        return {"month_sales": sales, "claims_by_status": claims_by_status}
    finally:
        conn.close()


@router.get("/audit", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "audit")),
])
def audit_log(limit: int = 100, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """SELECT a.*, u.name_en AS user_name
               FROM insurance_audit_log a
               LEFT JOIN users u ON u.id = a.user_id
               ORDER BY a.created_at DESC LIMIT %s""",
            (min(limit, 500),),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


class TemplateIn(BaseModel):
    template_type: str
    name: str
    language: str = "bilingual"
    is_default: bool = False
    layout: Optional[dict] = None
    branding: Optional[dict] = None
    active: bool = True


def _load_pharmacy_branding(cur) -> dict:
    cur.execute(
        """SELECT name_en, name_ar, address_en, address_ar, phone, tax_id
           FROM pharmacy_profile WHERE id = 1"""
    )
    row = cur.fetchone()
    return dict(row) if row else {"name_en": "Pharmacy", "address_en": "", "tax_id": ""}


def _fetch_claim_bundle(cur, claim_id: int) -> tuple[dict, list, str, str]:
    cur.execute(
        """SELECT cl.*, c.name_en AS company_name_en,
                  pl.name_en AS plan_name_en, b.name_en AS branch_name_en
           FROM insurance_claims cl
           JOIN insurance_companies c ON c.id = cl.company_id
           LEFT JOIN insurance_plans pl ON pl.id = cl.plan_id
           LEFT JOIN branches b ON b.id = cl.branch_id
           WHERE cl.id = %s""",
        (claim_id,),
    )
    claim = cur.fetchone()
    if not claim:
        raise HTTPException(404, "Claim not found")
    cur.execute(
        """SELECT i.invoice_number, i.created_at, i.insurance_snapshot, i.insurance_totals,
                  cu.name AS customer_name
           FROM insurance_claim_invoices ci
           JOIN invoices i ON i.id = ci.invoice_id
           LEFT JOIN customers cu ON cu.id = i.customer_id
           WHERE ci.claim_id = %s ORDER BY i.created_at""",
        (claim_id,),
    )
    invoices = [dict(r) for r in cur.fetchall()]
    return dict(claim), invoices, claim["company_name_en"], claim.get("plan_name_en") or ""


@router.get("/templates", dependencies=[Depends(requires_feature("insurance"))])
def list_templates(template_type: Optional[str] = None, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if template_type:
            cur.execute(
                "SELECT * FROM document_templates WHERE template_type=%s ORDER BY is_default DESC, name",
                (template_type,),
            )
        else:
            cur.execute("SELECT * FROM document_templates ORDER BY template_type, name")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/templates", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "templates")),
])
def create_template(body: TemplateIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if body.is_default:
            cur.execute(
                "UPDATE document_templates SET is_default=false WHERE template_type=%s",
                (body.template_type,),
            )
        cur.execute(
            """INSERT INTO document_templates
               (template_type, name, language, is_default, layout, branding, active)
               VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                body.template_type, body.name, body.language, body.is_default,
                psycopg2.extras.Json(body.layout or {}),
                psycopg2.extras.Json(body.branding or {}),
                body.active,
            ),
        )
        row = dict(cur.fetchone())
        log_insurance_audit(cur, entity_type="template", entity_id=row["id"], action="create",
                            user_id=current_user.get("user_id"), new_value=row)
        conn.commit()
        return row
    finally:
        conn.close()


@router.put("/templates/{template_id}", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "templates")),
])
def update_template(template_id: int, body: TemplateIn, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if body.is_default:
            cur.execute(
                "UPDATE document_templates SET is_default=false WHERE template_type=%s AND id != %s",
                (body.template_type, template_id),
            )
        cur.execute(
            """UPDATE document_templates SET
               template_type=%s, name=%s, language=%s, is_default=%s,
               layout=%s, branding=%s, active=%s
               WHERE id=%s RETURNING *""",
            (
                body.template_type, body.name, body.language, body.is_default,
                psycopg2.extras.Json(body.layout or {}),
                psycopg2.extras.Json(body.branding or {}),
                body.active, template_id,
            ),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Template not found")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


@router.get("/claims/{claim_id}/pdf", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims_export")),
])
def export_claim_pdf(claim_id: int, language: str = "bilingual", current_user=Depends(get_current_user)):
    from pdf_utils import build_claim_pdf, pdf_response

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        claim, invoices, company_name, plan_name = _fetch_claim_bundle(cur, claim_id)
        brand = _load_pharmacy_branding(cur)
        pdf = build_claim_pdf(
            pharmacy_name=brand.get("name_en") or "Pharmacy",
            pharmacy_address=brand.get("address_en") or "",
            tax_id=brand.get("tax_id") or "",
            branch_name=claim.get("branch_name_en") or "",
            claim=claim,
            company_name=company_name,
            plan_name=plan_name,
            invoices=invoices,
            language=language,
        )
        return pdf_response(pdf, f"claim-{claim['claim_number']}.pdf")
    finally:
        conn.close()


@router.get("/claims/{claim_id}/payment-request/pdf", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "claims_export")),
])
def export_payment_request_pdf(claim_id: int, language: str = "bilingual", current_user=Depends(get_current_user)):
    from pdf_utils import build_payment_request_pdf, pdf_response

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        claim, _, company_name, _ = _fetch_claim_bundle(cur, claim_id)
        brand = _load_pharmacy_branding(cur)
        pdf = build_payment_request_pdf(
            pharmacy_name=brand.get("name_en") or "Pharmacy",
            pharmacy_address=brand.get("address_en") or "",
            tax_id=brand.get("tax_id") or "",
            branch_name=claim.get("branch_name_en") or "",
            claim=claim,
            company_name=company_name,
            language=language,
        )
        return pdf_response(pdf, f"payment-request-{claim['claim_number']}.pdf")
    finally:
        conn.close()


@router.get("/reports/sales", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "reports")),
])
def insurance_sales_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        clauses = ["i.type = 'insurance'", "i.status = 'completed'"]
        params: list = []
        if date_from:
            clauses.append("i.created_at >= %s::date")
            params.append(date_from)
        if date_to:
            clauses.append("i.created_at < (%s::date + INTERVAL '1 day')")
            params.append(date_to)
        if company_id:
            clauses.append("i.insurance_company_id = %s")
            params.append(company_id)
        cur.execute(
            f"""SELECT i.id, i.invoice_number, i.created_at, i.net_total,
                       i.insurance_totals, i.insurance_snapshot,
                       c.name AS customer_name,
                       ic.name_en AS company_name_en, ip.name_en AS plan_name_en
                FROM invoices i
                LEFT JOIN customers c ON c.id = i.customer_id
                LEFT JOIN insurance_companies ic ON ic.id = i.insurance_company_id
                LEFT JOIN insurance_plans ip ON ip.id = i.insurance_plan_id
                WHERE {' AND '.join(clauses)}
                ORDER BY i.created_at DESC LIMIT 2000""",
            params,
        )
        rows = [dict(r) for r in cur.fetchall()]
        summary = {
            "count": len(rows),
            "covered": sum(float((r.get("insurance_totals") or {}).get("insurance_covered") or 0) for r in rows),
            "patient_paid": sum(float(r.get("net_total") or 0) for r in rows),
        }
        return {"summary": summary, "rows": rows}
    finally:
        conn.close()


@router.get("/reports/sales/export", dependencies=[
    Depends(requires_feature("insurance")),
    Depends(requires_feature_option("insurance", "reports")),
])
def insurance_sales_export(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    payload = insurance_sales_report(date_from, date_to, company_id, current_user)
    rows = []
    for r in payload["rows"]:
        totals = r.get("insurance_totals") or {}
        snap = r.get("insurance_snapshot") or {}
        rows.append([
            r.get("invoice_number"),
            str(r.get("created_at", ""))[:10],
            r.get("company_name_en", ""),
            r.get("plan_name_en", ""),
            r.get("customer_name", ""),
            snap.get("insurance_card_number", ""),
            totals.get("insurance_covered", 0),
            totals.get("patient_share", 0),
            r.get("net_total", 0),
        ])
    return xlsx_response(
        ["Invoice", "Date", "Company", "Plan", "Patient", "Card #", "Covered", "Patient Share", "Paid"],
        rows,
        "insurance-sales.xlsx",
    )


def process_insurance_sale(cur, req, branch_id: int, items: list, current_user: dict) -> dict[str, Any]:
    """Called from create_sale when type=insurance. Returns totals dict for invoice insert."""
    from feature_access import user_feature_option
    if not user_feature_option(current_user, "insurance", "pos_billing"):
        raise HTTPException(400, "Insurance billing is not enabled")

    if not req.insurance_company_id or not req.insurance_plan_id:
        raise HTTPException(400, "Insurance company and plan are required")

    cur.execute(
        """SELECT p.*, c.field_config, c.status AS company_status, c.name_en AS company_name_en,
                  c.name_ar AS company_name_ar
           FROM insurance_plans p
           JOIN insurance_companies c ON c.id = p.company_id
           WHERE p.id = %s AND p.company_id = %s""",
        (req.insurance_plan_id, req.insurance_company_id),
    )
    plan_row = cur.fetchone()
    if not plan_row or plan_row["company_status"] != "active" or plan_row["status"] != "active":
        raise HTTPException(400, "Invalid or inactive insurance company/plan")

    patient_fields = req.insurance_patient_fields or {}
    _validate_patient_fields(plan_row["field_config"] or {}, patient_fields)

    from customer_insurance_sync import ensure_customer_for_insurance_sale, patient_display_name
    if not str(patient_fields.get("patient_first_name") or "").strip() and not str(patient_fields.get("patient_name") or "").strip():
        raise HTTPException(400, "Patient name is required in insurance transaction")
    if not str(patient_fields.get("insurance_card_number") or "").strip() and not str(patient_fields.get("membership_number") or "").strip():
        raise HTTPException(400, "Insurance card or membership number is required")

    resolved_customer_id = ensure_customer_for_insurance_sale(
        cur,
        patient_fields,
        branch_id=branch_id,
        company_id=req.insurance_company_id,
        plan_id=req.insurance_plan_id,
        existing_customer_id=req.customer_id,
        user_id=current_user.get("user_id"),
    )

    item_payloads = [
        {
            "product_id": i.product_id,
            "quantity": i.quantity,
            "unit_price": i.unit_price,
            "discount": i.discount,
            "offer_discount": i.offer_discount or 0,
        }
        for i in items
    ]
    products = _load_products(cur, [i.product_id for i in items])

    card_result = None
    if req.discount_card_id:
        cur.execute(
            """SELECT dc.*, dp.rules, dp.compatibility, dp.status AS program_status
               FROM discount_cards dc
               JOIN discount_card_programs dp ON dp.id = dc.program_id
               WHERE dc.id = %s""",
            (req.discount_card_id,),
        )
        card = cur.fetchone()
        if card:
            card_result = calculate_discount_card(
                cur,
                card=dict(card),
                program={"rules": card["rules"], "compatibility": card["compatibility"], "status": card["program_status"]},
                items=item_payloads,
                products=products,
                eligible_amount=sum(i.quantity * i.unit_price - i.discount - (i.offer_discount or 0) for i in items),
                customer_id=resolved_customer_id,
                has_insurance=True,
                has_promotions=any(i.offer_discount for i in items),
            )

    result = calculate_insurance_sale(
        cur,
        items=item_payloads,
        products=products,
        plan=dict(plan_row),
        company_id=req.insurance_company_id,
        plan_id=req.insurance_plan_id,
        customer_id=resolved_customer_id,
        patient_fields=patient_fields,
        discount_card_result=card_result,
    )

    snapshot = {
        **patient_fields,
        "patient_name": patient_fields.get("patient_name") or patient_display_name(patient_fields),
        "company_id": req.insurance_company_id,
        "plan_id": req.insurance_plan_id,
        "company_name_en": plan_row["company_name_en"],
        "company_name_ar": plan_row["company_name_ar"],
        "plan_name_en": plan_row["name_en"],
        "plan_name_ar": plan_row["name_ar"],
    }

    return {
        "net_total": result["net_total"],
        "insurance_totals": result["totals"],
        "insurance_snapshot": snapshot,
        "insurance_lines": result["lines"],
        "discount_card_result": card_result,
        "company_id": req.insurance_company_id,
        "plan_id": req.insurance_plan_id,
        "customer_id": resolved_customer_id,
    }
