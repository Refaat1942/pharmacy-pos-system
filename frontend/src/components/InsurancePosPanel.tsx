import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Shield } from 'lucide-react'
import type { CartItem, Customer } from '../lib/api'
import { insuranceAPI, discountCardsAPI } from '../lib/api'
import type { InsuranceCalculateResult, InsuranceCompany, InsurancePlan } from '../lib/insurance'
import { INSURANCE_FIELD_KEYS, insuranceFieldLabel } from '../lib/insurance'
import i18n from '../lib/i18n'

interface Props {
  cartItems: CartItem[]
  selectedCustomer: Customer | null
  onPreviewChange: (preview: InsuranceCalculateResult | null, patientFields: Record<string, string>) => void
  onCompanyChange: (id: number | null) => void
  onPlanChange: (id: number | null) => void
  onCardChange: (id: number | null) => void
}

export default function InsurancePosPanel({
  cartItems,
  selectedCustomer,
  onPreviewChange,
  onCompanyChange,
  onPlanChange,
  onCardChange,
}: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [companies, setCompanies] = useState<InsuranceCompany[]>([])
  const [plans, setPlans] = useState<InsurancePlan[]>([])
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [planId, setPlanId] = useState<number | ''>('')
  const [patientFields, setPatientFields] = useState<Record<string, string>>({})
  const [cardNumber, setCardNumber] = useState('')
  const [discountCardId, setDiscountCardId] = useState<number | null>(null)
  const [preview, setPreview] = useState<InsuranceCalculateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    insuranceAPI.activeCompanies().then((r) => setCompanies(r.data)).catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    if (!companyId) {
      setPlans([])
      setPlanId('')
      return
    }
    insuranceAPI.plans(Number(companyId)).then((r) => setPlans(r.data)).catch(() => setPlans([]))
  }, [companyId])

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === Number(companyId)),
    [companies, companyId],
  )

  const visibleFields = useMemo(() => {
    const cfg = selectedCompany?.field_config || {}
    return INSURANCE_FIELD_KEYS.filter((k) => cfg[k] !== 'hidden')
  }, [selectedCompany])

  useEffect(() => {
    if (selectedCustomer?.name && !patientFields.patient_name) {
      setPatientFields((f) => ({ ...f, patient_name: selectedCustomer.name, mobile_number: selectedCustomer.phone || '' }))
    }
  }, [selectedCustomer, patientFields.patient_name])

  useEffect(() => {
    onCompanyChange(companyId ? Number(companyId) : null)
    onPlanChange(planId ? Number(planId) : null)
  }, [companyId, planId, onCompanyChange, onPlanChange])

  useEffect(() => {
    onCardChange(discountCardId)
  }, [discountCardId, onCardChange])

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
    }, 300)
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

  const egp = t('receipt.egp')

  return (
    <div className="space-y-3 p-4 bg-sky-50 border-2 border-sky-200 rounded-xl">
      <p className="text-xs font-bold uppercase tracking-wider text-sky-800 flex items-center gap-2">
        <Shield size={14} />
        {t('insurance.pos_panel')}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={companyId}
          onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : ''); setPlanId('') }}
          className="border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">{t('insurance.select_company')}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</option>
          ))}
        </select>
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')}
          disabled={!companyId}
          className="border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
        >
          <option value="">{t('insurance.select_plan')}</option>
          {plans.filter((p) => p.status === 'active').map((p) => (
            <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar : p.name_en}</option>
          ))}
        </select>
      </div>

      {visibleFields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {visibleFields.map((key) => {
            const mode = selectedCompany?.field_config?.[key] || 'optional'
            const required = mode === 'required'
            return (
              <div key={key} className={key === 'address' || key === 'diagnosis' ? 'col-span-2' : ''}>
                <label className="text-[10px] font-semibold text-sky-700 uppercase">
                  {insuranceFieldLabel(key, t)}{required ? ' *' : ''}
                </label>
                <input
                  type={key === 'date_of_birth' || key === 'prescription_date' ? 'date' : 'text'}
                  value={patientFields[key] || ''}
                  onChange={(e) => setPatientFields((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-sky-200 rounded-lg px-2 py-1.5 text-sm bg-white mt-0.5"
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder={t('insurance.discount_card_ph') as string}
          className="flex-1 border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button type="button" onClick={lookupCard} className="px-3 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg">
          {t('insurance.apply_card')}
        </button>
      </div>

      {loading && (
        <p className="text-xs text-sky-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t('insurance.calculating')}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {preview?.totals && (
        <div className="bg-white rounded-lg border border-sky-100 p-3 text-xs space-y-1 font-mono">
          <div className="flex justify-between"><span>{t('insurance.gross')}</span><span>{preview.totals.gross_before_discounts.toFixed(2)} {egp}</span></div>
          <div className="flex justify-between text-sky-700"><span>{t('insurance.covered')}</span><span>{preview.totals.insurance_covered.toFixed(2)} {egp}</span></div>
          <div className="flex justify-between"><span>{t('insurance.patient_share')}</span><span>{preview.totals.patient_share.toFixed(2)} {egp}</span></div>
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
