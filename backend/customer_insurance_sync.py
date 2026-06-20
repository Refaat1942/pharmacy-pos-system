"""Create/link customers from insurance transaction data."""
from __future__ import annotations

import re
from typing import Any, Optional

import psycopg2.extras


def _digits(s: Optional[str]) -> str:
    return re.sub(r"\D", "", str(s or ""))


def patient_display_name(patient_fields: dict) -> str:
    first = str(patient_fields.get("patient_first_name") or "").strip()
    last = str(patient_fields.get("patient_last_name") or "").strip()
    combined = f"{first} {last}".strip()
    if combined:
        return combined
    name = str(patient_fields.get("patient_name") or "").strip()
    return name or "Insurance Patient"


def patient_phone(patient_fields: dict) -> Optional[str]:
    cc = str(patient_fields.get("mobile_country_code") or "").strip()
    num = str(patient_fields.get("mobile_number") or "").strip()
    if not num:
        return None
    digits = _digits(num)
    if cc and not digits.startswith(_digits(cc)):
        cc_digits = _digits(cc)
        if cc_digits:
            digits = f"{cc_digits}{digits.lstrip('0')}"
    if len(digits) == 10 and digits.startswith("0"):
        return digits
    if len(digits) == 12 and digits.startswith("20"):
        return "0" + digits[2:]
    return digits or None


def _ensure_branch_link(cur, customer_id: int, branch_id: Optional[int], user_id: Optional[int]) -> None:
    if not branch_id:
        return
    cur.execute(
        """INSERT INTO customer_branches (customer_id, branch_id, authorized_by)
           VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""",
        (customer_id, branch_id, user_id),
    )


def _ensure_customer_code(cur, customer_id: int) -> None:
    cur.execute("SELECT code FROM customers WHERE id=%s", (customer_id,))
    row = cur.fetchone()
    if row and row.get("code"):
        return
    code = f"C{customer_id:06d}"
    cur.execute("UPDATE customers SET code=%s WHERE id=%s", (code, customer_id))


def find_customer_for_insurance(
    cur,
    *,
    phone: Optional[str],
    national_id: Optional[str],
    insurance_card_number: Optional[str],
) -> Optional[int]:
    if phone:
        pd = _digits(phone)
        if pd:
            cur.execute(
                """SELECT id FROM customers
                   WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = %s
                   ORDER BY id DESC LIMIT 1""",
                (pd,),
            )
            row = cur.fetchone()
            if row:
                return int(row["id"])
    if national_id:
        nid = str(national_id).strip()
        if nid:
            cur.execute(
                """SELECT customer_id FROM customer_insurance_profiles
                   WHERE national_id = %s AND active = true
                   ORDER BY is_primary DESC, id DESC LIMIT 1""",
                (nid,),
            )
            row = cur.fetchone()
            if row:
                return int(row["customer_id"])
    if insurance_card_number:
        card = str(insurance_card_number).strip()
        if card:
            cur.execute(
                """SELECT customer_id FROM customer_insurance_profiles
                   WHERE insurance_card_number = %s AND active = true
                   ORDER BY is_primary DESC, id DESC LIMIT 1""",
                (card,),
            )
            row = cur.fetchone()
            if row:
                return int(row["customer_id"])
    return None


def create_customer_record(
    cur,
    *,
    name: str,
    phone: Optional[str],
    branch_id: Optional[int],
    sale_type: str,
    user_id: Optional[int],
    notes: Optional[str] = None,
) -> int:
    cur.execute(
        """INSERT INTO customers (name, phone, notes, active, sale_type)
           VALUES (%s,%s,%s,true,%s) RETURNING id""",
        (name, phone, notes, sale_type),
    )
    cid = int(cur.fetchone()["id"])
    _ensure_customer_code(cur, cid)
    _ensure_branch_link(cur, cid, branch_id, user_id)
    return cid


def mark_customer_sale_type(cur, customer_id: int, sale_type: str) -> None:
    if not customer_id or sale_type not in ("cash", "delivery", "digital", "insurance"):
        return
    cur.execute("UPDATE customers SET sale_type=%s WHERE id=%s", (sale_type, customer_id))


def upsert_insurance_profile(
    cur,
    *,
    customer_id: int,
    company_id: int,
    plan_id: Optional[int],
    patient_fields: dict,
) -> None:
    card = str(patient_fields.get("insurance_card_number") or "").strip() or None
    membership = str(patient_fields.get("membership_number") or "").strip() or None
    policy = str(patient_fields.get("policy_number") or "").strip() or None
    national_id = str(patient_fields.get("national_id") or "").strip() or None
    approval = str(patient_fields.get("approval_number") or "").strip() or None
    extra = {
        k: v for k, v in patient_fields.items()
        if k not in (
            "insurance_card_number", "membership_number", "policy_number",
            "national_id", "approval_number", "attachment_upload",
        ) and v not in (None, "")
    }
    extra["patient_first_name"] = patient_fields.get("patient_first_name")
    extra["patient_last_name"] = patient_fields.get("patient_last_name")
    if patient_fields.get("patient_name"):
        extra["patient_name"] = patient_fields.get("patient_name")

    existing_id = None
    if card:
        cur.execute(
            """SELECT id FROM customer_insurance_profiles
               WHERE customer_id=%s AND company_id=%s AND insurance_card_number=%s
               LIMIT 1""",
            (customer_id, company_id, card),
        )
        row = cur.fetchone()
        if row:
            existing_id = row["id"]

    if existing_id:
        cur.execute(
            """UPDATE customer_insurance_profiles SET
               plan_id=%s, membership_number=%s, policy_number=%s, national_id=%s,
               approval_number=%s, extra_fields=%s, active=true, updated_at=NOW()
               WHERE id=%s""",
            (
                plan_id, membership, policy, national_id, approval,
                psycopg2.extras.Json(extra), existing_id,
            ),
        )
        return

    cur.execute(
        "UPDATE customer_insurance_profiles SET is_primary=false WHERE customer_id=%s",
        (customer_id,),
    )
    cur.execute(
        """INSERT INTO customer_insurance_profiles
           (customer_id, company_id, plan_id, insurance_card_number, membership_number,
            policy_number, national_id, approval_number, is_primary, active, extra_fields)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true,true,%s)""",
        (
            customer_id, company_id, plan_id, card, membership, policy, national_id,
            approval, psycopg2.extras.Json(extra),
        ),
    )


def ensure_customer_for_insurance_sale(
    cur,
    patient_fields: dict,
    *,
    branch_id: Optional[int],
    company_id: int,
    plan_id: Optional[int],
    existing_customer_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> int:
    """Resolve customer from insurance form; create in customers if needed."""
    name = patient_display_name(patient_fields)
    phone = patient_phone(patient_fields)
    national_id = patient_fields.get("national_id")
    card = patient_fields.get("insurance_card_number")

    customer_id = existing_customer_id
    if not customer_id:
        customer_id = find_customer_for_insurance(
            cur, phone=phone, national_id=national_id, insurance_card_number=card,
        )

    if customer_id:
        cur.execute(
            """UPDATE customers SET
               name=COALESCE(NULLIF(%s,''), name),
               phone=COALESCE(%s, phone),
               sale_type='insurance'
               WHERE id=%s""",
            (name, phone, customer_id),
        )
    else:
        customer_id = create_customer_record(
            cur,
            name=name,
            phone=phone,
            branch_id=branch_id,
            sale_type="insurance",
            user_id=user_id,
            notes="Registered from insurance POS transaction",
        )

    _ensure_branch_link(cur, customer_id, branch_id, user_id)
    upsert_insurance_profile(
        cur,
        customer_id=customer_id,
        company_id=company_id,
        plan_id=plan_id,
        patient_fields=patient_fields,
    )
    return customer_id
