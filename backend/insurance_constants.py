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
    "patient_share_pct",
    "max_patient_share",
    "treatment_type",
    "transaction_notes",
]

# Fixed POS fields for every company — no extras on checkout
INSURANCE_STANDARD_POS_FIELDS = [
    "patient_name",
    "insurance_card_number",
    "mobile_number",
    "membership_number",
    "policy_number",
    "approval_number",
    "patient_share_pct",
    "receipt_limit",
    "max_patient_share",
    "exceeding_amount",
    "attachment_upload",
    "transaction_notes",
]

INSURANCE_TRANSACTION_CORE_KEYS = list(INSURANCE_STANDARD_POS_FIELDS)

INSURANCE_POS_SECTIONS: dict[str, list[str]] = {
    "patient": ["patient_name", "mobile_number"],
    "policy": [
        "insurance_card_number", "membership_number", "policy_number", "approval_number",
    ],
    "financial": [
        "patient_share_pct", "receipt_limit", "max_patient_share", "exceeding_amount",
    ],
    "documents": ["attachment_upload", "transaction_notes"],
}

# Default visible fields on insurance POS — rest hidden until enabled in company advanced settings
DEFAULT_FIELD_CONFIG = {k: "hidden" for k in INSURANCE_FIELD_KEYS}
for _k in INSURANCE_STANDARD_POS_FIELDS:
    DEFAULT_FIELD_CONFIG[_k] = "optional"
DEFAULT_FIELD_CONFIG["patient_name"] = "required"
DEFAULT_FIELD_CONFIG["insurance_card_number"] = "required"
DEFAULT_FIELD_CONFIG["mobile_country_code"] = "hidden"
DEFAULT_FIELD_CONFIG["patient_first_name"] = "hidden"
DEFAULT_FIELD_CONFIG["patient_last_name"] = "hidden"


def merge_field_config_for_pos(stored: dict | None) -> dict:
    """POS shows only INSURANCE_STANDARD_POS_FIELDS; all other keys stay hidden."""
    stored = stored or {}
    cfg = {k: "hidden" for k in INSURANCE_FIELD_KEYS}
    for key in INSURANCE_STANDARD_POS_FIELDS:
        default = DEFAULT_FIELD_CONFIG.get(key, "optional")
        mode = stored.get(key)
        cfg[key] = mode if mode in ("required", "optional", "hidden") else default
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
