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

# Always core to an insurance transaction at POS (MetLife / RMS-style)
INSURANCE_TRANSACTION_CORE_KEYS = [
    "child_customer_id",
    "insurance_card_number",
    "patient_first_name",
    "patient_last_name",
    "mobile_country_code",
    "mobile_number",
    "receipt_limit",
    "exceeding_amount",
    "approval_number",
    "patient_share_pct",
    "employer_name",
    "max_patient_share",
    "treatment_type",
    "transaction_notes",
    "attachment_upload",
]

DEFAULT_FIELD_CONFIG = {k: "optional" for k in INSURANCE_FIELD_KEYS}
DEFAULT_FIELD_CONFIG["insurance_card_number"] = "required"
DEFAULT_FIELD_CONFIG["patient_first_name"] = "required"
DEFAULT_FIELD_CONFIG["patient_last_name"] = "required"
DEFAULT_FIELD_CONFIG["approval_number"] = "optional"
DEFAULT_FIELD_CONFIG["patient_share_pct"] = "optional"
DEFAULT_FIELD_CONFIG["treatment_type"] = "required"

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
    "patient_share_pct": 20,
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
