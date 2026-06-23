"""Shared constants for insurance field configuration."""

# Admin-configurable POS fields (required / optional / hidden)
INSURANCE_FIELD_KEYS = [
    "insurance_card_number",
    "membership_number",
    "policy_number",
    "approval_number",
    "national_id",
    "patient_name",
    "patient_first_name",
    "patient_last_name",
    "child_customer_id",
    "date_of_birth",
    "gender",
    "mobile_country_code",
    "mobile_number",
    "address",
    "doctor_name",
    "doctor_specialty",
    "diagnosis",
    "prescription_number",
    "prescription_date",
    "attachment_upload",
    "referral_number",
    "employee_number",
    "employer_name",
    "receipt_limit",
    "exceeding_amount",
    "additional_amount",
    "patient_share_pct",
    "max_patient_share",
    "treatment_type",
    "transaction_notes",
]

# Default visible fields on insurance POS — rest hidden until enabled in company advanced settings
DEFAULT_FIELD_CONFIG = {k: "hidden" for k in INSURANCE_FIELD_KEYS}
for _k in INSURANCE_STANDARD_POS_FIELDS:
    DEFAULT_FIELD_CONFIG[_k] = "optional"
DEFAULT_FIELD_CONFIG["patient_name"] = "required"
DEFAULT_FIELD_CONFIG["insurance_card_number"] = "required"
DEFAULT_FIELD_CONFIG["mobile_country_code"] = "hidden"
DEFAULT_FIELD_CONFIG["patient_first_name"] = "hidden"
DEFAULT_FIELD_CONFIG["patient_last_name"] = "hidden"

# Standard POS insurance transaction fields (always shown unless hidden in company settings)
INSURANCE_STANDARD_POS_FIELDS = [
    "patient_name",
    "mobile_number",
    "insurance_card_number",
    "policy_number",
    "membership_number",
    "patient_share_pct",
    "receipt_limit",
    "max_patient_share",
    "exceeding_amount",
    "approval_number",
]

INSURANCE_TRANSACTION_CORE_KEYS = list(INSURANCE_STANDARD_POS_FIELDS)


def merge_field_config_for_pos(stored: dict | None) -> dict:
    """POS: core patient fields only; extras stay hidden unless saved in company advanced settings."""
    stored = stored or {}
    cfg = dict(DEFAULT_FIELD_CONFIG)
    for key in INSURANCE_STANDARD_POS_FIELDS:
        if key in stored:
            cfg[key] = stored[key]
    for key in INSURANCE_FIELD_KEYS:
        if key in INSURANCE_TRANSACTION_CORE_KEYS:
            continue
        mode = stored.get(key)
        if mode in ("required", "optional"):
            cfg[key] = mode
    return cfg

DEFAULT_COVERAGE_RULES = {
    "local_drugs_pct": 80,
    "imported_drugs_pct": 70,
    "medical_supplies_pct": 50,
    "cosmetics_pct": 0,
    "services_pct": 0,
    "chronic_medication_pct": 90,
    "acute_medication_pct": 80,
}

DEFAULT_FINANCIAL_RULES = {
    "insurance_coverage_pct": 80,
    "patient_share_pct": 0,
    "patient_share_timing": "after_discount",
    "additional_amount_pct": 0,
    "fixed_copayment": 0,
}

DEFAULT_LIMITS = {
    "max_coverage_per_item": None,
    "max_coverage_per_invoice": None,
    "daily_limit": None,
    "weekly_limit": None,
    "monthly_limit": None,
    "yearly_limit": None,
}

DEFAULT_CONTROLS = {
    "approval_required": False,
    "allow_partial_coverage": True,
    "allow_exceeding_limits": False,
    "allow_manual_override": True,
}

DEFAULT_RESTRICTIONS = {
    "covered_categories": [],
    "excluded_categories": [],
    "excluded_product_ids": [],
    "excluded_brand_ids": [],
}

DEFAULT_CARD_RULES = {
    "percentage_discount": 0,
    "local_drugs_discount_pct": 0,
    "imported_drugs_discount_pct": 0,
    "fixed_discount": 0,
    "category_discounts": {},
    "product_discounts": {},
    "max_discount": None,
    "monthly_usage_limit": None,
    "customer_usage_limit": None,
}

DEFAULT_CARD_COMPATIBILITY = {
    "combine_with_insurance": False,
    "combine_with_promotions": True,
    "combine_with_coupons": True,
}

MEDICINE_CATEGORY_HINTS = ("medicine", "supplement", "drug", "دواء", "أدوية")
