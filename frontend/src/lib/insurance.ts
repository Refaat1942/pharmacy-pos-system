/** Configurable insurance field keys and labels. */
export const INSURANCE_FIELD_KEYS = [
  'insurance_card_number',
  'membership_number',
  'policy_number',
  'approval_number',
  'national_id',
  'patient_name',
  'date_of_birth',
  'gender',
  'mobile_number',
  'address',
  'doctor_name',
  'doctor_specialty',
  'diagnosis',
  'prescription_number',
  'prescription_date',
  'referral_number',
  'employee_number',
  'employer_name',
] as const

export type InsuranceFieldKey = (typeof INSURANCE_FIELD_KEYS)[number]
export type FieldMode = 'required' | 'optional' | 'hidden'

export function insuranceFieldLabel(key: string, t: (k: string) => string): string {
  const k = `insurance.fields.${key}`
  const v = t(k)
  return v === k ? key.replace(/_/g, ' ') : v
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
  patient_share_pct: 20,
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
  insurance_discount: number
  discount_card_amount: number
  total_discount: number
  insurance_covered: number
  patient_share: number
  additional_amount: number
  copayment: number
  final_patient_paid: number
}

export interface InsuranceCalculateResult {
  lines: Array<{
    product_id: number
    line_gross: number
    coverage_pct: number
    covered_amount: number
    patient_share: number
  }>
  totals: InsuranceTotals
  net_total: number
  warnings?: string[]
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
