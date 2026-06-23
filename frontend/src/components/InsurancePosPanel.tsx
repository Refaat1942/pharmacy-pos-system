import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Paperclip, Shield, X } from 'lucide-react'
import type { CartItem, Customer } from '../lib/api'
import { insuranceAPI } from '../lib/api'
import type { InsuranceCalculateResult, InsuranceCompany, InsurancePlan, InsuranceProfile } from '../lib/insurance'
import {
  INSURANCE_EXTRA_FIELD_KEYS,
  fieldMode,
  insuranceFieldLabel,
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

const NUMERIC_KEYS = new Set(['receipt_limit', 'exceeding_amount', 'additional_amount', 'patient_share_pct', 'max_patient_share'])

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
          mobile_number: selectedCustomer.phone || f.mobile_number || '',
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
        mobile_number: selectedCustomer.phone || f.mobile_number || '',
        insurance_card_number: primary.insurance_card_number || f.insurance_card_number || '',
        membership_number: primary.membership_number || f.membership_number || '',
        policy_number: primary.policy_number || f.policy_number || '',
        national_id: primary.national_id || f.national_id || '',
        approval_number: primary.approval_number || f.approval_number || '',
        ...(primary.extra_fields || {}),
      }))
    }).catch(() => setProfiles([]))
  }, [selectedCustomer?.id, selectedCustomer?.name, selectedCustomer?.phone])

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

  const optionalFields = useMemo(
    () => INSURANCE_EXTRA_FIELD_KEYS.filter((k) => fieldMode(k, fieldConfig) !== 'hidden'),
    [fieldConfig],
  )

  const renderOptionalField = (key: string) => {
    if (key === 'child_customer_id') {
      return (
        <div key={key}>
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
            className="w-full border border-sky-200 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="">{t('insurance.child_self')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{profileLabel(p)}</option>
            ))}
          </select>
        </div>
      )
    }
    if (key === 'treatment_type') {
      return (
        <div key={key} className="md:col-span-2">
          {renderLabel(key, fieldMode(key, fieldConfig) === 'required')}
          <div className="flex gap-4 mt-1">
            {(['chronic', 'acute'] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
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
        </div>
      )
    }
    if (key === 'transaction_notes') {
      return (
        <div key={key} className="md:col-span-2">
          {renderLabel(key)}
          <textarea
            value={patientFields.transaction_notes || ''}
            onChange={(e) => setField('transaction_notes', e.target.value)}
            rows={2}
            className="w-full border border-sky-200 rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        </div>
      )
    }
    if (key === 'attachment_upload') {
      return (
        <div key={key} className="md:col-span-2 border border-dashed border-sky-300 rounded-lg p-3 bg-white">
          {renderLabel(key)}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg cursor-pointer">
              <Paperclip size={12} />
              {t('insurance.browse_file')}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => onAttachment(e.target.files?.[0] || null)} />
            </label>
            {attachmentName && (
              <>
                <span className="text-xs text-sky-800 truncate max-w-[180px]">{attachmentName}</span>
                <button type="button" onClick={() => onAttachment(null)} className="text-xs text-red-600 flex items-center gap-0.5">
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
        <div key={key} className="md:col-span-2">
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
            className="w-full border border-sky-200 rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        </div>
      )
    }
    const wide = ['address', 'diagnosis'].includes(key)
    const type = key === 'date_of_birth' || key === 'prescription_date' ? 'date' : undefined
    return renderInput(key, { className: wide ? 'md:col-span-2' : undefined, type })
  }

  const renderLabel = (key: string, required?: boolean) => (
    <label className="text-[10px] font-semibold text-sky-700 uppercase block mb-0.5">
      {insuranceFieldLabel(key, t)}{required ? ' *' : ''}
    </label>
  )

  const renderInput = (key: string, opts?: { className?: string; type?: string }) => {
    const required = fieldMode(key, fieldConfig) === 'required'
    const isNum = NUMERIC_KEYS.has(key)
    const raw = patientFields[key] || ''
    const display = isNum && (raw === '0' || raw === '') ? '' : raw
    return (
      <div className={opts?.className}>
        {renderLabel(key, required)}
        <input
          type={opts?.type || (isNum ? 'number' : 'text')}
          step={isNum ? '0.01' : undefined}
          value={display}
          onChange={(e) => setField(key, e.target.value)}
          className="w-full border border-sky-200 rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>
    )
  }

  const egp = t('receipt.egp')
  const coverageSummary = preview?.coverage_summary
  const planLocalPct = selectedPlan?.coverage_rules?.local_drugs_pct ?? coverageSummary?.local_drugs_pct
  const planImportedPct = selectedPlan?.coverage_rules?.imported_drugs_pct ?? coverageSummary?.imported_drugs_pct

  return (
    <div className="space-y-4 p-5 bg-sky-50 border-2 border-sky-200 rounded-xl">
      <div className="sticky top-0 bg-sky-50 py-1 z-10 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-sky-800 flex items-center gap-2">
          <Shield size={14} />
          {t('insurance.transaction_title')}
        </p>
        {!selectedCustomer && (
          <p className="text-[11px] text-sky-700">{t('insurance.patient_auto_register')}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-sky-700 uppercase block mb-0.5">
            {t('insurance.select_company')} *
          </label>
          <select
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : ''); setPlanId('') }}
            className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">{t('insurance.select_company')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</option>
            ))}
          </select>
        </div>
        {showPlanPicker && (
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')}
            disabled={!companyId}
            className="border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50 self-end mt-5"
          >
            <option value="">{t('insurance.select_plan')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar : p.name_en}</option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-sky-200 bg-white p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
            {t('insurance.section_patient')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['patient_name', 'mobile_number'] as const).map((key) => {
              if (fieldMode(key, fieldConfig) === 'hidden') return null
              return key === 'patient_name' ? renderOptionalField(key) : renderInput(key)
            })}
          </div>
        </div>

        <div className="rounded-xl border border-sky-200 bg-white p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
            {t('insurance.section_policy')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['insurance_card_number', 'policy_number', 'membership_number', 'approval_number'] as const).map((key) => {
              if (fieldMode(key, fieldConfig) === 'hidden') return null
              return renderInput(key)
            })}
          </div>
        </div>

        <div className="rounded-xl border border-sky-200 bg-white p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
            {t('insurance.section_financial')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['patient_share_pct', 'receipt_limit', 'max_patient_share', 'exceeding_amount'] as const).map((key) => {
              if (fieldMode(key, fieldConfig) === 'hidden') return null
              return renderInput(key)
            })}
          </div>
        </div>
      </div>

      {optionalFields.length > 0 && (
        <div className="rounded-xl border border-dashed border-sky-300 bg-white p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            {t('insurance.section_extra')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {optionalFields.map((key) => renderOptionalField(key))}
          </div>
        </div>
      )}

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
