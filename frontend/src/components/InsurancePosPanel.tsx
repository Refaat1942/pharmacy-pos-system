import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Paperclip, Shield, X } from 'lucide-react'
import type { CartItem, Customer } from '../lib/api'
import { insuranceAPI } from '../lib/api'
import type { InsuranceCalculateResult, InsuranceCompany, InsurancePlan, InsuranceProfile } from '../lib/insurance'
import {
  INSURANCE_FIELD_COL_SPAN,
  INSURANCE_POS_SECTION_ORDER,
  INSURANCE_POS_SECTIONS,
  fieldMode,
  insuranceFieldLabel,
  orderInsuranceFields,
  splitCustomerName,
} from '../lib/insurance'
import i18n from '../lib/i18n'

interface Props {
  cartItems: CartItem[]
  selectedCustomer: Customer | null
  onPreviewChange: (preview: InsuranceCalculateResult | null, patientFields: Record<string, string>) => void
  onCompanyChange: (id: number | null) => void
  onPlanChange: (id: number | null) => void
  onReadyChange?: (ready: boolean) => void
  hidePlanSelect?: boolean
}

const NUMERIC_KEYS = new Set(['receipt_limit', 'exceeding_amount', 'patient_share_pct', 'max_patient_share'])

const INPUT_CLASS =
  'w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100'

function fieldColSpan(key: string): string {
  return (INSURANCE_FIELD_COL_SPAN[key] || 1) === 2 ? 'sm:col-span-2' : ''
}

function customerPrimaryPhone(c: Customer | null): string {
  if (!c) return ''
  const primary = c.phones?.find((p) => p.is_primary)?.phone
  return primary || c.phone || ''
}

function hasPatientIdentity(fields: Record<string, string>): boolean {
  if ((fields.patient_name || '').trim()) return true
  const first = (fields.patient_first_name || '').trim()
  const last = (fields.patient_last_name || '').trim()
  if (first || last) return true
  return false
}

function profileLabel(p: InsuranceProfile): string {
  const card = p.insurance_card_number || p.membership_number || `#${p.id}`
  const extra = p.extra_fields?.patient_name || p.extra_fields?.patient_first_name
  if (extra) return `${extra} (${card})`
  return p.is_primary ? `${card} ★` : card
}

export default function InsurancePosPanel({
  cartItems,
  selectedCustomer,
  onPreviewChange,
  onCompanyChange,
  onPlanChange,
  onReadyChange,
  hidePlanSelect = true,
}: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [companies, setCompanies] = useState<InsuranceCompany[]>([])
  const [plans, setPlans] = useState<InsurancePlan[]>([])
  const [profiles, setProfiles] = useState<InsuranceProfile[]>([])
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [planId, setPlanId] = useState<number | ''>('')
  const [patientFields, setPatientFields] = useState<Record<string, string>>({})
  const [attachmentName, setAttachmentName] = useState('')
  const [preview, setPreview] = useState<InsuranceCalculateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === Number(companyId)),
    [companies, companyId],
  )
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === Number(planId)),
    [plans, planId],
  )
  const fieldConfig = selectedCompany?.field_config

  const setField = useCallback((key: string, value: string) => {
    setPatientFields((f) => ({ ...f, [key]: value }))
  }, [])

  const applyProfile = useCallback((profile: InsuranceProfile | null) => {
    if (!profile) {
      setField('child_customer_id', '')
      return
    }
    setField('child_customer_id', String(profile.id))
    setPatientFields((f) => ({
      ...f,
      child_customer_id: String(profile.id),
      insurance_card_number: profile.insurance_card_number || f.insurance_card_number || '',
      membership_number: profile.membership_number || f.membership_number || '',
      policy_number: profile.policy_number || f.policy_number || '',
      national_id: profile.national_id || f.national_id || '',
      approval_number: profile.approval_number || f.approval_number || '',
      ...(profile.extra_fields || {}),
    }))
  }, [setField])

  useEffect(() => {
    insuranceAPI.activeCompanies().then((r) => setCompanies(r.data)).catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setProfiles([])
      return
    }
    insuranceAPI.profiles(selectedCustomer.id).then((r) => {
      const list = r.data as InsuranceProfile[]
      setProfiles(list)
      const primary = list.find((p) => p.is_primary) || list[0]
      if (!primary) {
        const { first, last } = splitCustomerName(selectedCustomer.name || '')
        setPatientFields((f) => ({
          ...f,
          patient_first_name: first,
          patient_last_name: last,
          mobile_number: customerPrimaryPhone(selectedCustomer) || f.mobile_number || '',
        }))
        return
      }
      setCompanyId(primary.company_id)
      if (primary.plan_id) setPlanId(primary.plan_id)
      const { first, last } = splitCustomerName(selectedCustomer.name || '')
      setPatientFields((f) => ({
        ...f,
        patient_name: selectedCustomer.name || f.patient_name || '',
        patient_first_name: first,
        patient_last_name: last,
        mobile_number: customerPrimaryPhone(selectedCustomer) || f.mobile_number || '',
        insurance_card_number: primary.insurance_card_number || f.insurance_card_number || '',
        membership_number: primary.membership_number || f.membership_number || '',
        policy_number: primary.policy_number || f.policy_number || '',
        national_id: primary.national_id || f.national_id || '',
        approval_number: primary.approval_number || f.approval_number || '',
        ...(primary.extra_fields || {}),
      }))
    }).catch(() => setProfiles([]))
  }, [selectedCustomer?.id, selectedCustomer?.name, selectedCustomer?.phone, selectedCustomer?.phones])

  useEffect(() => {
    if (!companyId) {
      setPlans([])
      setPlanId('')
      return
    }
    insuranceAPI.plans(Number(companyId)).then((r) => {
      const active = r.data.filter((p) => p.status === 'active')
      setPlans(active)
      const def = active.find((p) => p.code === 'DEFAULT') || active[0]
      setPlanId(def ? def.id : '')
    }).catch(() => setPlans([]))
  }, [companyId])

  const showPlanPicker = !hidePlanSelect && plans.length > 1

  useEffect(() => {
    onCompanyChange(companyId ? Number(companyId) : null)
    onPlanChange(planId ? Number(planId) : null)
  }, [companyId, planId, onCompanyChange, onPlanChange])

  useEffect(() => {
    onReadyChange?.(!!(companyId && planId && preview && hasPatientIdentity(patientFields)))
  }, [companyId, planId, preview, patientFields, onReadyChange])

  useEffect(() => {
    if (!companyId || !planId || !cartItems.length) {
      setPreview(null)
      onPreviewChange(null, patientFields)
      return
    }
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      insuranceAPI.calculate({
        company_id: Number(companyId),
        plan_id: Number(planId),
        customer_id: selectedCustomer?.id,
        patient_fields: patientFields,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          offer_discount: item.offer_discount || 0,
          additional_amount: item.additional_amount || 0,
        })),
      })
        .then((r) => {
          setPreview(r.data)
          onPreviewChange(r.data, patientFields)
        })
        .catch((e) => {
          setPreview(null)
          onPreviewChange(null, patientFields)
          setError(e.response?.data?.detail || t('common.error'))
        })
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(timer)
  }, [companyId, planId, cartItems, patientFields, selectedCustomer?.id, onPreviewChange, t])

  const onAttachment = (file: File | null) => {
    if (!file) {
      setAttachmentName('')
      setField('attachment_upload', '')
      return
    }
    if (file.size > 500_000) {
      setError(t('insurance.attachment_too_large') as string)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAttachmentName(file.name)
      setField('attachment_upload', String(reader.result || ''))
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const sectionTitle = (key: string) => {
    const k = `insurance.section_${key}`
    const v = t(k)
    return v === k ? key : v
  }

  const visibleSectionFields = (sectionKey: string) =>
    (INSURANCE_POS_SECTIONS[sectionKey] || []).filter(
      (key) => fieldMode(key, fieldConfig) !== 'hidden',
    )

  const renderSection = (sectionKey: string) => {
    const keys = orderInsuranceFields(
      sectionKey,
      visibleSectionFields(sectionKey),
    )
    if (!keys.length) return null
    const hintKey = `insurance.section_${sectionKey}_hint`
    const hint = t(hintKey)
    const showHint = hint !== hintKey
    return (
      <section
        key={sectionKey}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="border-b border-slate-100 pb-2 mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            {sectionTitle(sectionKey)}
          </h3>
          {showHint && (
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{hint}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          {keys.map((key) => (
            <div key={key} className={fieldColSpan(key)}>
              {renderOptionalField(key)}
            </div>
          ))}
        </div>
      </section>
    )
  }

  const renderOptionalField = (key: string) => {
    if (key === 'child_customer_id') {
      return (
        <>
          {renderLabel(key, fieldMode(key, fieldConfig) === 'required')}
          <select
            value={patientFields.child_customer_id || ''}
            onChange={(e) => {
              const id = e.target.value
              if (!id) {
                applyProfile(null)
                return
              }
              const p = profiles.find((x) => String(x.id) === id)
              if (p) applyProfile(p)
            }}
            className={INPUT_CLASS}
          >
            <option value="">{t('insurance.child_self')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{profileLabel(p)}</option>
            ))}
          </select>
        </>
      )
    }
    if (key === 'treatment_type') {
      return (
        <>
          {renderLabel(key, fieldMode(key, fieldConfig) === 'required')}
          <div className="flex flex-wrap gap-3 mt-1">
            {(['chronic', 'acute'] as const).map((v) => (
              <label
                key={v}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer text-sm font-semibold transition-colors ${
                  (patientFields.treatment_type || 'chronic') === v
                    ? 'border-sky-600 bg-sky-50 text-sky-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
                }`}
              >
                <input
                  type="radio"
                  name="treatment_type"
                  checked={(patientFields.treatment_type || 'chronic') === v}
                  onChange={() => setField('treatment_type', v)}
                  className="accent-sky-600"
                />
                {t(`insurance.treatment_${v}`)}
              </label>
            ))}
          </div>
        </>
      )
    }
    if (key === 'transaction_notes') {
      return (
        <>
          {renderLabel(key)}
          <textarea
            value={patientFields.transaction_notes || ''}
            onChange={(e) => setField('transaction_notes', e.target.value)}
            rows={2}
            className={`${INPUT_CLASS} resize-none`}
          />
        </>
      )
    }
    if (key === 'attachment_upload') {
      return (
        <div className="border-2 border-dashed border-sky-200 rounded-xl p-3 bg-sky-50/40">
          {renderLabel(key)}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <label className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg cursor-pointer hover:bg-emerald-700">
              <Paperclip size={12} />
              {t('insurance.browse_file')}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => onAttachment(e.target.files?.[0] || null)} />
            </label>
            {attachmentName && (
              <>
                <span className="text-xs font-medium text-sky-900 truncate max-w-[180px]">{attachmentName}</span>
                <button type="button" onClick={() => onAttachment(null)} className="text-xs font-semibold text-red-600 flex items-center gap-0.5">
                  <X size={12} /> {t('insurance.remove_file')}
                </button>
              </>
            )}
          </div>
        </div>
      )
    }
    if (key === 'patient_name') {
      return (
        <>
          {renderLabel(key, fieldMode(key, fieldConfig) === 'required')}
          <input
            type="text"
            value={patientFields.patient_name || ''}
            onChange={(e) => {
              const name = e.target.value
              const { first, last } = splitCustomerName(name)
              setPatientFields((f) => ({
                ...f,
                patient_name: name,
                patient_first_name: first,
                patient_last_name: last,
              }))
            }}
            className={INPUT_CLASS}
            autoComplete="name"
          />
        </>
      )
    }
    if (key === 'gender') {
      const required = fieldMode(key, fieldConfig) === 'required'
      return (
        <>
          {renderLabel(key, required)}
          <select
            value={patientFields.gender || ''}
            onChange={(e) => setField('gender', e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">{t('common.select')}</option>
            <option value="male">{t('insurance.gender_male')}</option>
            <option value="female">{t('insurance.gender_female')}</option>
          </select>
        </>
      )
    }
    const type = key === 'date_of_birth' || key === 'prescription_date' ? 'date' : undefined
    return renderInput(key, { type })
  }

  const renderLabel = (key: string, required?: boolean) => {
    const hintKey = `insurance.field_hints.${key}`
    const hint = t(hintKey)
    const showHint = hint !== hintKey
    return (
      <div className="mb-1.5">
        <label className="text-sm font-bold text-slate-900 block leading-snug">
          {insuranceFieldLabel(key, t)}
          {required && <span className="text-red-600 font-bold"> *</span>}
        </label>
        {showHint && (
          <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">{hint}</p>
        )}
      </div>
    )
  }

  const renderInput = (key: string, opts?: { type?: string }) => {
    const required = fieldMode(key, fieldConfig) === 'required'
    const isNum = NUMERIC_KEYS.has(key)
    const raw = patientFields[key] || ''
    const display = isNum && (raw === '0' || raw === '') ? '' : raw
    return (
      <>
        {renderLabel(key, required)}
        <input
          type={opts?.type || (isNum ? 'number' : 'text')}
          step={isNum ? '0.01' : undefined}
          min={isNum ? 0 : undefined}
          value={display}
          onChange={(e) => setField(key, e.target.value)}
          className={INPUT_CLASS}
        />
      </>
    )
  }

  const egp = t('receipt.egp')
  const coverageSummary = preview?.coverage_summary
  const planLocalPct = selectedPlan?.coverage_rules?.local_drugs_pct ?? coverageSummary?.local_drugs_pct
  const planImportedPct = selectedPlan?.coverage_rules?.imported_drugs_pct ?? coverageSummary?.imported_drugs_pct

  return (
    <div className="space-y-4 p-4 sm:p-5 bg-gradient-to-b from-sky-50 to-slate-50 border-2 border-sky-200 rounded-xl">
      <div className="sticky top-0 bg-sky-50/95 backdrop-blur-sm py-2 z-10 space-y-1 border-b border-sky-100 -mx-1 px-1">
        <p className="text-sm font-bold text-sky-900 flex items-center gap-2">
          <Shield size={16} className="text-sky-600" />
          {t('insurance.transaction_title')}
        </p>
        {!selectedCustomer && (
          <p className="text-xs text-sky-800 font-medium">{t('insurance.patient_auto_register')}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">{t('insurance.company_plan_heading')}</h3>
        <div className={`grid gap-4 ${showPlanPicker ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="text-sm font-bold text-slate-900 block mb-1.5">
              {t('insurance.select_company')} <span className="text-red-600">*</span>
            </label>
            <p className="text-[11px] text-slate-500 font-medium mb-2">{t('insurance.select_company_hint')}</p>
            <select
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : ''); setPlanId('') }}
              className={INPUT_CLASS}
            >
              <option value="">{t('insurance.select_company')}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</option>
              ))}
            </select>
          </div>
          {showPlanPicker && (
            <div>
              <label className="text-sm font-bold text-slate-900 block mb-1.5">
                {t('insurance.select_plan')}
              </label>
              <p className="text-[11px] text-slate-500 font-medium mb-2">{t('insurance.select_plan_hint')}</p>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')}
                disabled={!companyId}
                className={`${INPUT_CLASS} disabled:opacity-50`}
              >
                <option value="">{t('insurance.select_plan')}</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar : p.name_en}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {INSURANCE_POS_SECTION_ORDER.map((sectionKey) => renderSection(sectionKey))}
      </div>

      {(planLocalPct != null || planImportedPct != null) && (
        <p className="text-[10px] text-sky-700 bg-sky-100 rounded px-2 py-1">
          {t('insurance.company_coverage_hint', {
            local: planLocalPct ?? '—',
            imported: planImportedPct ?? '—',
          })}
        </p>
      )}

      {loading && (
        <p className="text-xs text-sky-600 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> {t('insurance.calculating')}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {preview?.warnings?.map((w) => (
        <p key={w} className="text-xs text-amber-700">{w}</p>
      ))}

      {preview?.lines?.length ? (
        <div className="bg-white rounded-lg border border-sky-100 overflow-hidden">
          <table className="w-full text-[10px]">
            <thead className="bg-sky-100 text-sky-900">
              <tr>
                <th className="text-start p-1.5">{t('insurance.line_item')}</th>
                <th className="p-1.5">{t('inventory.f_material_group')}</th>
                <th className="p-1.5">{t('insurance.line_discount')}</th>
                <th className="p-1.5">{t('insurance.item_additional')}</th>
                <th className="text-end p-1.5">{t('insurance.covered')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.product_id} className="border-t border-sky-50">
                  <td className="p-1.5 truncate max-w-[120px]" title={line.product_name}>{line.product_name || `#${line.product_id}`}</td>
                  <td className="p-1.5 text-center font-mono" title={line.material_group || line.origin_type}>
                    {line.material_group || (line.origin_type === 'imported' ? 'DI' : 'DL')}
                  </td>
                  <td className="p-1.5 text-center">{line.coverage_pct}%</td>
                  <td className="p-1.5 text-center font-mono">
                    {(line.additional_amount ?? 0) > 0 ? line.additional_amount!.toFixed(2) : '—'}
                  </td>
                  <td className="p-1.5 text-end font-mono">{line.covered_amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview?.totals && (
        <div className="bg-white rounded-lg border border-sky-100 p-3 text-xs space-y-1 font-mono">
          <div className="flex justify-between"><span>{t('insurance.gross')}</span><span>{preview.totals.gross_before_discounts.toFixed(2)} {egp}</span></div>
          <div className="flex justify-between text-sky-700"><span>{t('insurance.insurance_discount')}</span><span>-{preview.totals.insurance_discount.toFixed(2)} {egp}</span></div>
          {(preview.totals.after_insurance_discount ?? 0) > 0 && (
            <div className="flex justify-between"><span>{t('insurance.after_discount')}</span><span>{preview.totals.after_insurance_discount!.toFixed(2)} {egp}</span></div>
          )}
          <div className="flex justify-between"><span>{t('insurance.patient_share')}{preview.totals.patient_share_pct != null ? ` (${preview.totals.patient_share_pct}%)` : ''}</span><span>{preview.totals.patient_share.toFixed(2)} {egp}</span></div>
          <div className="flex justify-between text-sky-700"><span>{t('insurance.covered')}</span><span>{preview.totals.insurance_covered.toFixed(2)} {egp}</span></div>
          {(preview.totals.receipt_limit_excess ?? 0) > 0 && (
            <div className="flex justify-between text-amber-700"><span>{t('insurance.receipt_limit_excess')}</span><span>{preview.totals.receipt_limit_excess!.toFixed(2)} {egp}</span></div>
          )}
          {(preview.totals.exceeding_amount ?? 0) > 0 && (
            <div className="flex justify-between"><span>{t('insurance.fields.exceeding_amount')}</span><span>{preview.totals.exceeding_amount!.toFixed(2)} {egp}</span></div>
          )}
          {(preview.totals.additional_amount ?? 0) > 0 && (
            <div className="flex justify-between"><span>{t('insurance.additional_amount')}</span><span>{preview.totals.additional_amount.toFixed(2)} {egp}</span></div>
          )}
          {preview.totals.copayment > 0 && (
            <div className="flex justify-between"><span>{t('insurance.copayment')}</span><span>{preview.totals.copayment.toFixed(2)} {egp}</span></div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-sky-100 pt-2 mt-2">
            <span>{t('insurance.final_due')}</span>
            <span>{preview.totals.final_patient_paid.toFixed(2)} {egp}</span>
          </div>
        </div>
      )}
    </div>
  )
}
