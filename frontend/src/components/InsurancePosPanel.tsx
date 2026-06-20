import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Paperclip, Shield, X } from 'lucide-react'
import type { CartItem, Customer } from '../lib/api'
import { insuranceAPI, discountCardsAPI } from '../lib/api'
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
  onCardChange: (id: number | null) => void
  onReadyChange?: (ready: boolean) => void
  hidePlanSelect?: boolean
}

const NUMERIC_KEYS = new Set(['receipt_limit', 'exceeding_amount', 'patient_share_pct', 'max_patient_share'])

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
  onCardChange,
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
  const [patientFields, setPatientFields] = useState<Record<string, string>>({
    mobile_country_code: '+20',
    treatment_type: 'chronic',
    receipt_limit: '0',
    exceeding_amount: '0',
    max_patient_share: '0',
  })
  const [attachmentName, setAttachmentName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [discountCardId, setDiscountCardId] = useState<number | null>(null)
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
    if (!selectedPlan?.financial_rules?.patient_share_pct) return
    const planPct = String(selectedPlan.financial_rules.patient_share_pct)
    setPatientFields((f) => (f.patient_share_pct ? f : { ...f, patient_share_pct: planPct }))
  }, [selectedPlan?.id, selectedPlan?.financial_rules?.patient_share_pct])

  useEffect(() => {
    onCompanyChange(companyId ? Number(companyId) : null)
    onPlanChange(planId ? Number(planId) : null)
  }, [companyId, planId, onCompanyChange, onPlanChange])

  useEffect(() => {
    onCardChange(discountCardId)
  }, [discountCardId, onCardChange])

  useEffect(() => {
    onReadyChange?.(!!(companyId && planId && preview && selectedCustomer))
  }, [companyId, planId, preview, selectedCustomer, onReadyChange])

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
        discount_card_id: discountCardId || undefined,
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
  }, [companyId, planId, cartItems, patientFields, selectedCustomer?.id, discountCardId, onPreviewChange, t])

  const lookupCard = async () => {
    if (!cardNumber.trim()) return
    try {
      const { data } = await discountCardsAPI.lookup(cardNumber.trim())
      setDiscountCardId(data.id)
      setError('')
    } catch {
      setDiscountCardId(null)
      setError(t('insurance.card_not_found') as string)
    }
  }

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

  const visibleExtraFields = useMemo(
    () => INSURANCE_EXTRA_FIELD_KEYS.filter((k) => fieldMode(k, fieldConfig) !== 'hidden'),
    [fieldConfig],
  )

  const renderLabel = (key: string, required?: boolean) => (
    <label className="text-[10px] font-semibold text-sky-700 uppercase block mb-0.5">
      {insuranceFieldLabel(key, t)}{required ? ' *' : ''}
    </label>
  )

  const renderInput = (key: string, opts?: { className?: string; type?: string }) => {
    const required = fieldMode(key, fieldConfig) === 'required'
    return (
      <div className={opts?.className}>
        {renderLabel(key, required)}
        <input
          type={opts?.type || (NUMERIC_KEYS.has(key) ? 'number' : 'text')}
          step={NUMERIC_KEYS.has(key) ? '0.01' : undefined}
          value={patientFields[key] || ''}
          onChange={(e) => setField(key, e.target.value)}
          className="w-full border border-sky-200 rounded-lg px-2 py-1.5 text-sm bg-white"
        />
      </div>
    )
  }

  const egp = t('receipt.egp')
  const coverageSummary = preview?.coverage_summary
  const planLocalPct = selectedPlan?.coverage_rules?.local_drugs_pct ?? coverageSummary?.local_drugs_pct
  const planImportedPct = selectedPlan?.coverage_rules?.imported_drugs_pct ?? coverageSummary?.imported_drugs_pct

  return (
    <div className="space-y-3 p-4 bg-sky-50 border-2 border-sky-200 rounded-xl max-h-[70vh] overflow-y-auto">
      <p className="text-xs font-bold uppercase tracking-wider text-sky-800 flex items-center gap-2 sticky top-0 bg-sky-50 py-1 z-10">
        <Shield size={14} />
        {t('insurance.transaction_title')}
      </p>

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

      {fieldMode('child_customer_id', fieldConfig) !== 'hidden' && (
        <div>
          {renderLabel('child_customer_id', fieldMode('child_customer_id', fieldConfig) === 'required')}
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
            className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">{t('insurance.child_self')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{profileLabel(p)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {fieldMode('insurance_card_number', fieldConfig) !== 'hidden' && renderInput('insurance_card_number')}
        {fieldMode('patient_first_name', fieldConfig, 'required') !== 'hidden' && renderInput('patient_first_name')}
        {fieldMode('patient_last_name', fieldConfig, 'required') !== 'hidden' && renderInput('patient_last_name')}
      </div>

      {fieldMode('mobile_number', fieldConfig) !== 'hidden' && (
        <div className="grid grid-cols-[88px_1fr] gap-2">
          {fieldMode('mobile_country_code', fieldConfig) !== 'hidden' && renderInput('mobile_country_code', { className: '' })}
          {renderInput('mobile_number')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {fieldMode('receipt_limit', fieldConfig) !== 'hidden' && renderInput('receipt_limit')}
        {fieldMode('exceeding_amount', fieldConfig) !== 'hidden' && renderInput('exceeding_amount')}
        {fieldMode('approval_number', fieldConfig) !== 'hidden' && renderInput('approval_number')}
        {fieldMode('patient_share_pct', fieldConfig) !== 'hidden' && renderInput('patient_share_pct')}
        {fieldMode('employer_name', fieldConfig) !== 'hidden' && renderInput('employer_name')}
        {fieldMode('max_patient_share', fieldConfig) !== 'hidden' && renderInput('max_patient_share')}
      </div>

      {fieldMode('treatment_type', fieldConfig, 'required') !== 'hidden' && (
        <div>
          {renderLabel('treatment_type', fieldMode('treatment_type', fieldConfig, 'required') === 'required')}
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
      )}

      {fieldMode('transaction_notes', fieldConfig) !== 'hidden' && (
        <div>
          {renderLabel('transaction_notes')}
          <textarea
            value={patientFields.transaction_notes || ''}
            onChange={(e) => setField('transaction_notes', e.target.value)}
            rows={2}
            className="w-full border border-sky-200 rounded-lg px-2 py-1.5 text-sm bg-white"
          />
        </div>
      )}

      {fieldMode('attachment_upload', fieldConfig) !== 'hidden' && (
        <div className="border border-dashed border-sky-300 rounded-lg p-3 bg-white">
          {renderLabel('attachment_upload')}
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
      )}

      {visibleExtraFields.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-sky-200 pt-2">
          {visibleExtraFields.map((key) => {
            if (key === 'patient_name') {
              return (
                <div key={key} className="col-span-2">
                  {renderInput(key)}
                </div>
              )
            }
            const wide = ['address', 'diagnosis'].includes(key)
            const type = key === 'date_of_birth' || key === 'prescription_date' ? 'date' : undefined
            return renderInput(key, { className: wide ? 'col-span-2' : undefined, type })
          })}
        </div>
      )}

      <div className="flex gap-2 border-t border-sky-200 pt-2">
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder={t('insurance.discount_card_ph') as string}
          className="flex-1 border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button type="button" onClick={lookupCard} className="px-3 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg shrink-0">
          {t('insurance.apply_card')}
        </button>
      </div>

      {(planLocalPct != null || planImportedPct != null) && (
        <p className="text-[10px] text-sky-700 bg-sky-100 rounded px-2 py-1">
          {t('insurance.plan_coverage_hint', {
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
                <th className="p-1.5">{t('insurance.line_origin')}</th>
                <th className="p-1.5">{t('insurance.line_coverage')}</th>
                <th className="text-end p-1.5">{t('insurance.covered')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.product_id} className="border-t border-sky-50">
                  <td className="p-1.5 truncate max-w-[120px]" title={line.product_name}>{line.product_name || `#${line.product_id}`}</td>
                  <td className="p-1.5 text-center capitalize">{line.origin_type === 'imported' ? t('insurance.origin_imported') : t('insurance.origin_local')}</td>
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
          <div className="flex justify-between text-sky-700"><span>{t('insurance.covered')}</span><span>{preview.totals.insurance_covered.toFixed(2)} {egp}</span></div>
          <div className="flex justify-between"><span>{t('insurance.patient_share')}</span><span>{preview.totals.patient_share.toFixed(2)} {egp}</span></div>
          {(preview.totals.exceeding_amount ?? 0) > 0 && (
            <div className="flex justify-between"><span>{t('insurance.fields.exceeding_amount')}</span><span>{preview.totals.exceeding_amount!.toFixed(2)} {egp}</span></div>
          )}
          {preview.totals.copayment > 0 && (
            <div className="flex justify-between"><span>{t('insurance.copayment')}</span><span>{preview.totals.copayment.toFixed(2)} {egp}</span></div>
          )}
          {preview.totals.discount_card_amount > 0 && (
            <div className="flex justify-between text-emerald-700"><span>{t('insurance.card_discount')}</span><span>-{preview.totals.discount_card_amount.toFixed(2)} {egp}</span></div>
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
