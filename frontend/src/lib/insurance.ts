/** Configurable insurance field keys and labels. */
export const INSURANCE_FIELD_KEYS = [
  'insurance_card_number',
  'membership_number',
  'policy_number',
  'approval_number',
  'national_id',
  'patient_name',
  'patient_first_name',
  'patient_last_name',
  'child_customer_id',
  'date_of_birth',
  'gender',
  'mobile_country_code',
  'mobile_number',
  'address',
  'doctor_name',
  'doctor_specialty',
  'diagnosis',
  'prescription_number',
  'prescription_date',
  'attachment_upload',
  'referral_number',
  'employee_number',
  'employer_name',
  'receipt_limit',
  'exceeding_amount',
  'patient_share_pct',
  'max_patient_share',
  'treatment_type',
  'transaction_notes',
] as const

/** Standard insurance POS fields — fixed layout; extras configurable per company. */
export const INSURANCE_STANDARD_POS_FIELDS = [
  'patient_name',
  'mobile_number',
  'insurance_card_number',
  'policy_number',
  'membership_number',
  'patient_share_pct',
  'receipt_limit',
  'max_patient_share',
  'exceeding_amount',
  'approval_number',
] as const

/** @deprecated use INSURANCE_STANDARD_POS_FIELDS */
export const INSURANCE_TRANSACTION_CORE_KEYS = INSURANCE_STANDARD_POS_FIELDS

export const INSURANCE_EXTRA_FIELD_KEYS = INSURANCE_FIELD_KEYS.filter(
  (k) => !INSURANCE_STANDARD_POS_FIELDS.includes(k as (typeof INSURANCE_STANDARD_POS_FIELDS)[number]),
)

/** Section groupings for POS transaction layout (saved via company field_config). */
export const INSURANCE_POS_SECTIONS: Record<string, readonly string[]> = {
  patient: [
    'patient_name', 'mobile_number', 'patient_first_name', 'patient_last_name',
    'date_of_birth', 'gender', 'mobile_country_code', 'national_id', 'address', 'child_customer_id',
  ],
  policy: [
    'insurance_card_number', 'policy_number', 'membership_number', 'approval_number',
    'referral_number', 'employee_number', 'employer_name',
  ],
  financial: [
    'patient_share_pct', 'receipt_limit', 'max_patient_share', 'exceeding_amount',
  ],
  clinical: [
    'doctor_name', 'doctor_specialty', 'diagnosis', 'prescription_number',
    'prescription_date', 'treatment_type', 'transaction_notes', 'attachment_upload',
  ],
}

export const INSURANCE_POS_SECTION_ORDER = ['patient', 'policy', 'financial', 'clinical'] as const

/** Logical data-entry order within each section (unknown keys append at end). */
export const INSURANCE_POS_FIELD_ORDER: Record<string, readonly string[]> = {
  patient: [
    'patient_name', 'mobile_number', 'national_id',
    'patient_first_name', 'patient_last_name', 'date_of_birth', 'gender',
    'mobile_country_code', 'address', 'child_customer_id',
  ],
  policy: [
    'insurance_card_number', 'membership_number', 'policy_number', 'approval_number',
    'referral_number', 'employee_number', 'employer_name',
  ],
  financial: [
    'patient_share_pct', 'receipt_limit', 'max_patient_share', 'exceeding_amount',
  ],
  clinical: [
    'doctor_name', 'doctor_specialty', 'diagnosis',
    'prescription_number', 'prescription_date', 'treatment_type',
    'transaction_notes', 'attachment_upload',
  ],
}

/** Grid span in a 2-column section (2 = full row). */
export const INSURANCE_FIELD_COL_SPAN: Record<string, 1 | 2> = {
  patient_name: 2,
  address: 2,
  diagnosis: 2,
  transaction_notes: 2,
  attachment_upload: 2,
  treatment_type: 2,
  child_customer_id: 2,
}

export function orderInsuranceFields(sectionKey: string, keys: string[]): string[] {
  const order = INSURANCE_POS_FIELD_ORDER[sectionKey] || []
  return [...keys].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

export type InsuranceFieldKey = (typeof INSURANCE_FIELD_KEYS)[number]
export type FieldMode = 'required' | 'optional' | 'hidden'

export function insuranceFieldLabel(key: string, t: (k: string) => string): string {
  const k = `insurance.fields.${key}`
  const v = t(k)
  return v === k ? key.replace(/_/g, ' ') : v
}

export function fieldMode(
  key: string,
  fieldConfig?: Record<string, FieldMode>,
  fallback: FieldMode = 'optional',
): FieldMode {
  return fieldConfig?.[key] || fallback
}

export function splitCustomerName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] || '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export const DEFAULT_COVERAGE_RULES = {
  local_drugs_pct: 80,
  imported_drugs_pct: 70,
  medical_supplies_pct: 50,
  cosmetics_pct: 0,
  services_pct: 0,
  chronic_medication_pct: 90,
  acute_medication_pct: 80,
}

export const DEFAULT_FINANCIAL_RULES = {
  insurance_coverage_pct: 80,
  patient_share_pct: 0,
  additional_amount_pct: 0,
  fixed_copayment: 0,
}

export const DEFAULT_CONTROLS = {
  approval_required: false,
  allow_partial_coverage: true,
  allow_exceeding_limits: false,
  allow_manual_override: true,
}

export const DEFAULT_CARD_RULES = {
  percentage_discount: 0,
  local_drugs_discount_pct: 0,
  imported_drugs_discount_pct: 0,
  fixed_discount: 0,
  category_discounts: {},
  product_discounts: {},
  max_discount: null as number | null,
  monthly_usage_limit: null as number | null,
  customer_usage_limit: null as number | null,
}

export const DEFAULT_CARD_COMPATIBILITY = {
  combine_with_insurance: false,
  combine_with_promotions: true,
  combine_with_coupons: true,
}

export interface InsuranceTotals {
  gross_before_discounts: number
  after_insurance_discount?: number
  insurance_discount: number
  discount_card_amount: number
  total_discount: number
  insurance_covered: number
  patient_share_pct?: number
  patient_share_timing?: string
  patient_share: number
  receipt_limit_excess?: number
  additional_amount: number
  copayment: number
  exceeding_amount?: number
  final_patient_paid: number
}

export interface InsuranceLineResult {
  product_id: number
  product_name?: string
  material_group?: string
  origin_type?: string
  coverage_rule?: string
  line_gross: number
  coverage_pct: number
  insurance_discount?: number
  covered_amount: number
  patient_share: number
  additional_amount?: number
}

export interface InsuranceCalculateResult {
  lines: InsuranceLineResult[]
  totals: InsuranceTotals
  net_total: number
  warnings?: string[]
  coverage_summary?: {
    local_lines: number
    imported_lines: number
    local_drugs_pct?: number
    imported_drugs_pct?: number
  }
}

export interface InsuranceCompany {
  id: number
  code: string
  name_ar: string
  name_en: string
  status: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  field_config?: Record<string, FieldMode>
  custom_field_defs?: Array<{ key: string; label_en?: string; label_ar?: string; mode?: FieldMode }>
  local_drugs_pct?: number
  imported_drugs_pct?: number
  default_patient_share_pct?: number
  patient_share_timing?: string
}

export interface InsurancePlan {
  id: number
  company_id: number
  code: string
  name_ar: string
  name_en: string
  status: string
  priority: number
  notes?: string
  coverage_rules?: Record<string, number | null>
  financial_rules?: Record<string, number | null>
  limits?: Record<string, number | null>
  controls?: Record<string, boolean>
  restrictions?: Record<string, unknown>
  company_name_en?: string
  company_name_ar?: string
}

export interface InsuranceClaim {
  id: number
  claim_number: string
  company_id: number
  plan_id?: number
  branch_id?: number
  period_type: string
  period_from: string
  period_to: string
  status: string
  receipt_count: number
  total_sales: number
  covered_amount: number
  net_claim_amount: number
  company_name_en?: string
}

export interface InsuranceProfile {
  id: number
  customer_id: number
  company_id: number
  plan_id?: number
  insurance_card_number?: string
  membership_number?: string
  policy_number?: string
  national_id?: string
  approval_number?: string
  is_primary?: boolean
  extra_fields?: Record<string, string>
}
