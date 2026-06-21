import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Loader2, ShoppingBag, CreditCard, Smartphone, Banknote, CheckCircle2, AlertCircle, Shield } from 'lucide-react'
import { salesAPI, employeesAPI, loyaltyAPI } from '../lib/api'
import type { CartItem, Employee, Customer, SaleResponse, LoyaltyCalculateResult } from '../lib/api'
import i18n from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { platformDisplayLabel } from '../lib/digitalPlatforms'
import { useDigitalPlatforms } from '../lib/useDigitalPlatforms'
import InsurancePosPanel from './InsurancePosPanel'
import type { InsuranceCalculateResult } from '../lib/insurance'

interface Props {
  cartItems: CartItem[]
  subtotal: number
  invoiceDiscount: number
  netTotal: number
  offerIds?: number[]
  offerSavings?: number
  offerNames?: string
  selectedSeller: Employee | null
  selectedCustomer: Customer | null
  clinicId?: number | null
  prescriptionId?: number | null
  initialSaleType?: string
  onClose: () => void
  onSuccess: (sale: SaleResponse) => void
}

const SETTLEMENT_METHODS = ['cash', 'visa', 'hybrid', 'instapay', 'vodafone_cash'] as const
type SettlementMethod = (typeof SETTLEMENT_METHODS)[number]
type CheckoutStep = 'type' | 'setup' | 'pay'

export default function PaymentModal({
  cartItems, subtotal, invoiceDiscount, netTotal,
  offerIds, offerSavings, offerNames,
  selectedSeller, selectedCustomer, clinicId, prescriptionId,
  initialSaleType,
  onClose, onSuccess,
}: Props) {
  const { t } = useTranslation()
  const { hasFeature, hasFeatureOption } = useAuth()
  const lang = i18n.language
  const loyaltyOn = hasFeature('loyalty') && hasFeatureOption('loyalty', 'pos_redeem')
  const digitalSalesOn = hasFeature('pos') && hasFeatureOption('pos', 'digital_sales')
  const insuranceSalesOn = hasFeature('insurance') && hasFeatureOption('insurance', 'pos_billing')
  const { platforms } = useDigitalPlatforms()
  const langCode = lang === 'ar' ? 'ar' : 'en'

  const typePreselected = Boolean(initialSaleType)
  const [saleType, setSaleType] = useState(initialSaleType || 'cash')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [digitalType, setDigitalType] = useState('talabat')
  const [cashAmount, setCashAmount] = useState('')
  const [cashPart, setCashPart] = useState('')
  const [cardPart, setCardPart] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [deliveryCustomerName, setDeliveryCustomerName] = useState(selectedCustomer?.name || '')
  const [deliveryCustomerPhone, setDeliveryCustomerPhone] = useState(selectedCustomer?.phone || '')
  const [deliveryPeople, setDeliveryPeople] = useState<{ id: number; name: string }[]>([])
  const [deliveryPersonId, setDeliveryPersonId] = useState<number | ''>('')
  const [accountPaidAmount, setAccountPaidAmount] = useState('')
  const [accountPaidMethod, setAccountPaidMethod] = useState('cash')
  /** Digital sales: platform already paid vs billed to platform on account */
  const [digitalBilling, setDigitalBilling] = useState<'paid' | 'account'>('paid')
  const [loyaltyRedeem, setLoyaltyRedeem] = useState('')
  const [loyaltyPreview, setLoyaltyPreview] = useState<LoyaltyCalculateResult | null>(null)
  const [insuranceCompanyId, setInsuranceCompanyId] = useState<number | null>(null)
  const [insurancePlanId, setInsurancePlanId] = useState<number | null>(null)
  const [insurancePreview, setInsurancePreview] = useState<InsuranceCalculateResult | null>(null)
  const [insurancePatientFields, setInsurancePatientFields] = useState<Record<string, string>>({})
  const [insuranceReady, setInsuranceReady] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>(() => {
    if (!initialSaleType) return 'type'
    return initialSaleType === 'cash' ? 'pay' : 'setup'
  })
  const [cashTouched, setCashTouched] = useState(false)
  const [hybridTouched, setHybridTouched] = useState(false)

  const isDigitalPaid = saleType === 'digital' && digitalBilling === 'paid'
  const isDigitalAccount = saleType === 'digital' && digitalBilling === 'account'

  useEffect(() => {
    const load = () => {
      employeesAPI.deliveryRoster().then((r) => setDeliveryPeople(r.data)).catch(() => {})
    }
    load()
    window.addEventListener('branch-changed', load)
    return () => window.removeEventListener('branch-changed', load)
  }, [])

  useEffect(() => {
    if (!platforms.length) return
    setDigitalType((prev) => (
      platforms.some((p) => p.platform_key === prev) ? prev : platforms[0].platform_key
    ))
  }, [platforms])

  useEffect(() => {
    if (initialSaleType) {
      setSaleType(initialSaleType)
      setCheckoutStep(initialSaleType === 'cash' ? 'pay' : 'setup')
    }
  }, [initialSaleType])

  useEffect(() => {
    if (!digitalSalesOn && saleType === 'digital') {
      setSaleType('cash')
      setPaymentMethod('cash')
    }
  }, [digitalSalesOn, saleType])

  useEffect(() => {
    if (!insuranceSalesOn && saleType === 'insurance') {
      setSaleType('cash')
      setPaymentMethod('cash')
    }
  }, [insuranceSalesOn, saleType])

  useEffect(() => {
    if (selectedCustomer) {
      setDeliveryCustomerName(selectedCustomer.name || '')
      setDeliveryCustomerPhone(selectedCustomer.phone || '')
    }
  }, [selectedCustomer])

  const handleSaleTypeChange = (type: string) => {
    setSaleType(type)
    setError('')
    if (type === 'digital') {
      setDigitalBilling('paid')
      setPaymentMethod('cash')
    } else if (type === 'insurance') {
      setPaymentMethod('cash')
    } else if (paymentMethod === 'account') {
      setPaymentMethod('cash')
    }
  }

  const saleTypeLabel = (type: string) => {
    if (type === 'cash') return t('payment.cash_sale')
    if (type === 'delivery') return t('payment.delivery_sale')
    if (type === 'digital') return t('payment.digital_sale')
    if (type === 'insurance') return t('payment.insurance_sale')
    return type
  }

  const canContinueSetup = () => {
    if (saleType === 'insurance') {
      return insuranceReady
    }
    if (needsDelivery) {
      return !!deliveryPersonId && deliveryAddress.trim() !== '' && hasCustomerForShipment
    }
    return true
  }

  const goToPaymentStep = () => {
    if (!canContinueSetup()) {
      if (saleType === 'insurance') setError(t('insurance.complete_transaction') as string)
      else if (needsDelivery && !deliveryPersonId) setError(t('payment.delivery_person_required') as string)
      else if (needsDelivery && !deliveryAddress.trim()) setError(t('payment.delivery_address_required') as string)
      else if (needsDelivery && !hasCustomerForShipment) setError(t('payment.delivery_customer_required') as string)
      return
    }
    setError('')
    setCheckoutStep('pay')
  }

  const handleTypeContinue = () => {
    setError('')
    if (saleType === 'cash') setCheckoutStep('pay')
    else setCheckoutStep('setup')
  }

  const modalMaxWidth = checkoutStep === 'setup' && saleType === 'insurance' ? 'max-w-6xl' : 'max-w-2xl'
  const stepTitle = checkoutStep === 'type'
    ? t('payment.step_sale_type')
    : checkoutStep === 'setup'
      ? (saleType === 'insurance' ? t('insurance.transaction_title') : t('payment.step_setup'))
      : t('payment.title')

  const handleDigitalBillingChange = (mode: 'paid' | 'account') => {
    setDigitalBilling(mode)
    if (mode === 'account') {
      setPaymentMethod('account')
    } else {
      setPaymentMethod((m) =>
        m === 'account' || m === 'digital' || !SETTLEMENT_METHODS.includes(m as SettlementMethod)
          ? 'cash'
          : m,
      )
    }
  }

  const isInsurance = saleType === 'insurance'
  const needsDelivery = saleType === 'delivery' || saleType === 'digital'
  const deliveryFeeNum = parseFloat(deliveryFee) || 0
  const cartTotal = netTotal + (needsDelivery ? deliveryFeeNum : 0)
  const accountPaidNow = Math.min(Math.max(parseFloat(accountPaidAmount) || 0, 0), cartTotal)
  const loyaltyDiscount = !isInsurance && loyaltyOn && loyaltyPreview?.active ? (loyaltyPreview.loyalty_discount || 0) : 0
  const insuranceDue = isInsurance && insurancePreview?.totals ? insurancePreview.totals.final_patient_paid : null
  const effectiveTotal = insuranceDue != null ? insuranceDue : Math.max(0, cartTotal - loyaltyDiscount)

  useEffect(() => {
    setCashTouched(false)
    setHybridTouched(false)
    setCashAmount('')
    setCashPart('')
    setCardPart('')
  }, [checkoutStep, saleType, paymentMethod])

  useEffect(() => {
    if (checkoutStep !== 'pay') return
    if (paymentMethod === 'cash' && !cashTouched) {
      setCashAmount(effectiveTotal.toFixed(2))
    }
    if (paymentMethod === 'hybrid' && !hybridTouched) {
      setCashPart(effectiveTotal.toFixed(2))
      setCardPart('0')
    }
  }, [checkoutStep, paymentMethod, effectiveTotal, cashTouched, hybridTouched])

  const handleCashPartChange = (raw: string) => {
    setHybridTouched(true)
    setCashPart(raw)
    if (raw.trim() === '') {
      setCardPart('')
      return
    }
    const cash = parseFloat(raw)
    if (Number.isNaN(cash)) return
    setCardPart(Math.max(0, effectiveTotal - cash).toFixed(2))
  }

  const handleCardPartChange = (raw: string) => {
    setHybridTouched(true)
    setCardPart(raw)
    if (raw.trim() === '') {
      setCashPart('')
      return
    }
    const card = parseFloat(raw)
    if (Number.isNaN(card)) return
    setCashPart(Math.max(0, effectiveTotal - card).toFixed(2))
  }

  useEffect(() => {
    if (!loyaltyOn || !selectedCustomer?.id || isInsurance) {
      setLoyaltyPreview(null)
      setLoyaltyRedeem('')
      return
    }
    const redeem = parseInt(loyaltyRedeem, 10) || 0
    const creditPortion = paymentMethod === 'account' ? Math.max(0, cartTotal - accountPaidNow) : 0
    const timer = setTimeout(() => {
      loyaltyAPI.calculate({
        customer_id: selectedCustomer.id,
        net_total: cartTotal,
        redeem_points: redeem,
        payment_method: paymentMethod,
        credit_portion: creditPortion,
      }).then((r) => setLoyaltyPreview(r.data)).catch(() => setLoyaltyPreview(null))
    }, 250)
    return () => clearTimeout(timer)
  }, [
    loyaltyOn, selectedCustomer?.id, cartTotal, loyaltyRedeem, paymentMethod, accountPaidNow,
  ])
  const requiresCustomerInfo =
    !isInsurance && saleType !== 'cash' && effectiveTotal > 100
  const hasDeliveryCustomerDetails =
    deliveryCustomerName.trim() !== '' && deliveryCustomerPhone.trim() !== ''
  const hasCustomerForShipment =
    !!selectedCustomer ||
    hasDeliveryCustomerDetails ||
    isDigitalAccount
  const hasCustomerInfo =
    !!selectedCustomer || hasDeliveryCustomerDetails || isDigitalAccount
  const change =
    paymentMethod === 'cash' && cashAmount
      ? Math.max(0, parseFloat(cashAmount) - effectiveTotal)
      : 0

  const hybridSum = (parseFloat(cashPart) || 0) + (parseFloat(cardPart) || 0)
  const hybridDiff = hybridSum - effectiveTotal

  const accountPaidNowFinal = Math.min(accountPaidNow, effectiveTotal)
  const accountRemaining = Math.max(0, effectiveTotal - accountPaidNowFinal)

  const isValid = () => {
    if (!selectedSeller) return false
    if (requiresCustomerInfo && !hasCustomerInfo) return false
    if (needsDelivery) {
      if (!deliveryPersonId) return false
      if (!hasCustomerForShipment) return false
      if (!deliveryAddress.trim()) return false
    }
    if (paymentMethod === 'cash') return parseFloat(cashAmount) >= effectiveTotal
    if (paymentMethod === 'hybrid') return Math.abs(hybridDiff) < 0.01
    if (paymentMethod === 'account') {
      if (isDigitalAccount) return !!deliveryPersonId && hasCustomerForShipment
      return !!selectedCustomer && !!deliveryPersonId
    }
    if (isDigitalPaid) {
      if (paymentMethod === 'cash') return parseFloat(cashAmount) >= effectiveTotal
      if (paymentMethod === 'hybrid') return Math.abs(hybridDiff) < 0.01
    }
    return true
  }

  const topAlert = useMemo(() => {
    if (error) return error
    if (!selectedSeller) return t('payment.seller_required') as string
    if (requiresCustomerInfo && !hasCustomerInfo) return t('payment.customer_required_over_100') as string
    if (needsDelivery) {
      if (!deliveryPersonId) return t('payment.delivery_person_required') as string
      if (!hasCustomerForShipment) return t('payment.delivery_customer_required') as string
      if (!deliveryAddress.trim()) return t('payment.delivery_address_required') as string
    }
    return null
  }, [
    error, selectedSeller, requiresCustomerInfo, hasCustomerInfo, needsDelivery,
    deliveryPersonId, hasCustomerForShipment, deliveryAddress, paymentMethod,
    cashAmount, effectiveTotal, cashPart, cardPart, hybridDiff, t,
  ])

  const handleSubmit = async () => {
    if (!selectedSeller) {
      setError(t('payment.seller_required') as string)
      return
    }
    if (requiresCustomerInfo && !hasCustomerInfo) {
      setError(t('payment.customer_required_over_100') as string)
      return
    }
    if (isInsurance) {
      if (!insuranceCompanyId || !insurancePlanId || !insurancePreview) {
        setError(t('insurance.select_company_plan') as string)
        return
      }
    }
    if (needsDelivery) {
      if (!deliveryPersonId) {
        setError(t('payment.delivery_person_required') as string)
        return
      }
      if (!hasCustomerForShipment) {
        setError(t('payment.delivery_customer_required') as string)
        return
      }
      if (!deliveryAddress.trim()) {
        setError(t('payment.delivery_address_required') as string)
        return
      }
      if (!selectedCustomer && !hasDeliveryCustomerDetails && !isDigitalAccount) {
        setError(t('payment.delivery_required') as string)
        return
      }
    }
    if (!isValid()) {
      setError(
        paymentMethod === 'cash'
          ? `Minimum amount: ${t('receipt.egp')} ${effectiveTotal.toFixed(2)}`
          : `Amounts must sum to: ${t('receipt.egp')} ${effectiveTotal.toFixed(2)}`
      )
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await salesAPI.create({
        type: saleType,
        payment_method: paymentMethod,
        digital_type: saleType === 'digital' ? digitalType : undefined,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          offer_id: item.offer_id,
          offer_discount: item.offer_discount || 0,
          unit_type: item.unit_type || 'pack',
          dose_text: item.dose_text || undefined,
        })),
        discount: isInsurance ? 0 : invoiceDiscount,
        offer_ids: offerIds?.length ? offerIds : undefined,
        offer_savings: offerSavings || 0,
        offer_names: offerNames || undefined,
        cash_amount:
          paymentMethod === 'cash'
            ? parseFloat(cashAmount) || netTotal
            : paymentMethod === 'hybrid'
            ? parseFloat(cashPart) || 0
            : undefined,
        visa_amount:
          paymentMethod === 'visa' || paymentMethod === 'instapay' || paymentMethod === 'vodafone_cash'
            ? effectiveTotal
            : paymentMethod === 'hybrid'
            ? parseFloat(cardPart) || 0
            : undefined,
        account_paid_amount: paymentMethod === 'account' && accountPaidNowFinal > 0 ? accountPaidNowFinal : undefined,
        account_paid_method: paymentMethod === 'account' && accountPaidNowFinal > 0 ? accountPaidMethod : undefined,
        loyalty_points_redeemed: loyaltyOn && selectedCustomer && loyaltyPreview?.active
          ? (loyaltyPreview.points_redeem || parseInt(loyaltyRedeem, 10) || 0)
          : undefined,
        customer_id:
          paymentMethod === 'account' && saleType === 'digital'
            ? undefined
            : selectedCustomer?.id,
        seller_id: selectedSeller?.id,
        clinic_id: clinicId ?? undefined,
        prescription_id: prescriptionId ?? undefined,
        delivery_address: needsDelivery ? deliveryAddress.trim() : undefined,
        delivery_fee: needsDelivery ? deliveryFeeNum : undefined,
        delivery_customer_name: needsDelivery ? deliveryCustomerName.trim() : undefined,
        delivery_customer_phone: needsDelivery ? deliveryCustomerPhone.trim() : undefined,
        delivery_person_id: needsDelivery && deliveryPersonId ? Number(deliveryPersonId) : undefined,
        delivery_person_name:
          needsDelivery && deliveryPersonId
            ? deliveryPeople.find((p) => p.id === Number(deliveryPersonId))?.name
            : undefined,
        insurance_company_id: isInsurance ? insuranceCompanyId ?? undefined : undefined,
        insurance_plan_id: isInsurance ? insurancePlanId ?? undefined : undefined,
        insurance_patient_fields: isInsurance ? insurancePatientFields : undefined,
      })
      onSuccess(data)
    } catch (e: any) {
      setError(e.response?.data?.detail || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${modalMaxWidth} flex flex-col max-h-[min(92vh,calc(100dvh-2rem))] my-2 sm:my-4 overflow-hidden`}>
        {/* Header */}
        <div className="shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{stepTitle}</h2>
              {checkoutStep === 'pay' && (
                <p className="text-xs text-gray-500 mt-0.5">{saleTypeLabel(saleType)}</p>
              )}
              {checkoutStep !== 'type' && (
                <div className="flex gap-1 mt-2">
                  {(['type', 'setup', 'pay'] as CheckoutStep[]).filter((s) => s !== 'setup' || saleType !== 'cash').map((s, i) => (
                    <span key={s} className={`h-1 flex-1 rounded-full max-w-12 ${checkoutStep === s ? 'bg-pharma-600' : i < ['type', 'setup', 'pay'].indexOf(checkoutStep) ? 'bg-pharma-300' : 'bg-gray-200'}`} />
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition-all"
            >
              <X size={20} />
            </button>
          </div>
          {topAlert && (
            <div className="px-6 pb-4">
              <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 flex gap-3 shadow-sm" role="alert">
                <AlertCircle size={22} className="shrink-0 text-red-600" strokeWidth={2} />
                <p className="text-sm font-semibold text-red-900 leading-snug">{topAlert}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* ── Left: payment form ── */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {/* Salesperson confirmation */}
            <div className={`p-3 rounded-xl border-2 ${selectedSeller ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-300'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${selectedSeller ? 'text-emerald-700' : 'text-red-700'}`}>
                {t('payment.salesperson')}
              </p>
              <p className={`text-base font-bold ${selectedSeller ? 'text-emerald-900' : 'text-red-900'}`}>
                {selectedSeller
                  ? (lang === 'ar' ? selectedSeller.name_ar : selectedSeller.name_en)
                  : t('payment.seller_required')}
              </p>
            </div>

            {checkoutStep === 'pay' && loyaltyOn && selectedCustomer && !isInsurance && (
              <div className="p-3 rounded-xl border-2 border-indigo-100 bg-indigo-50/80 space-y-2">
                <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">
                  {t('loyalty.pos_title')}
                </p>
                <p className="text-sm text-indigo-900">
                  {t('loyalty.pos_balance', { points: selectedCustomer.loyalty_points ?? loyaltyPreview?.points_balance ?? 0 })}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={loyaltyPreview?.max_redeem_points ?? 0}
                    value={loyaltyRedeem}
                    onChange={(e) => setLoyaltyRedeem(e.target.value)}
                    placeholder={t('loyalty.pos_redeem_placeholder') as string}
                    className="input flex-1 text-sm"
                  />
                  <span className="text-xs text-indigo-700 whitespace-nowrap">
                    {t('loyalty.pos_max', { n: loyaltyPreview?.max_redeem_points ?? 0 })}
                  </span>
                </div>
                {loyaltyDiscount > 0 && (
                  <p className="text-xs text-emerald-700 font-medium">
                    {t('loyalty.pos_discount', { amount: loyaltyDiscount.toFixed(2) })}
                  </p>
                )}
                {loyaltyPreview?.points_earn != null && loyaltyPreview.points_earn > 0 && (
                  <p className="text-xs text-indigo-700">
                    {t('loyalty.pos_earn', { n: loyaltyPreview.points_earn })}
                  </p>
                )}
              </div>
            )}

            {checkoutStep === 'type' && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('payment.sale_type')}
              </p>
              <p className="text-sm text-gray-600 mb-3">{t('payment.step_sale_type_hint')}</p>
              <div className={`grid gap-2 ${digitalSalesOn && insuranceSalesOn ? 'grid-cols-4' : digitalSalesOn || insuranceSalesOn ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {[
                  { value: 'cash', icon: Banknote, label: t('payment.cash_sale') },
                  { value: 'delivery', icon: ShoppingBag, label: t('payment.delivery_sale') },
                  ...(digitalSalesOn ? [{ value: 'digital' as const, icon: Smartphone, label: t('payment.digital_sale') }] : []),
                  ...(insuranceSalesOn ? [{ value: 'insurance' as const, icon: Shield, label: t('payment.insurance_sale') }] : []),
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSaleTypeChange(value)}
                    className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                      saleType === value
                        ? 'border-pharma-500 bg-pharma-50 text-pharma-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={20} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {checkoutStep === 'setup' && isInsurance && (
              <>
                <InsurancePosPanel
                  cartItems={cartItems}
                  selectedCustomer={selectedCustomer}
                  onPreviewChange={(p, fields) => { setInsurancePreview(p); setInsurancePatientFields(fields) }}
                  onCompanyChange={setInsuranceCompanyId}
                  onPlanChange={setInsurancePlanId}
                  onReadyChange={setInsuranceReady}
                />
              </>
            )}

            {checkoutStep === 'pay' && isInsurance && insurancePreview?.totals && (
              <div className="p-4 bg-sky-50 border-2 border-sky-200 rounded-xl text-xs space-y-1">
                <p className="font-bold text-sky-900 uppercase tracking-wider mb-2">{t('insurance.transaction_title')}</p>
                <div className="flex justify-between"><span>{t('insurance.covered')}</span><span>{insurancePreview.totals.insurance_covered.toFixed(2)} {t('receipt.egp')}</span></div>
                <div className="flex justify-between font-bold"><span>{t('insurance.final_due')}</span><span>{insurancePreview.totals.final_patient_paid.toFixed(2)} {t('receipt.egp')}</span></div>
              </div>
            )}

            {checkoutStep === 'setup' && needsDelivery && (
              <div className="space-y-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  {t('payment.delivery_details')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={deliveryCustomerName}
                    onChange={(e) => setDeliveryCustomerName(e.target.value)}
                    placeholder={t('payment.delivery_customer_name') as string}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="tel"
                    value={deliveryCustomerPhone}
                    onChange={(e) => setDeliveryCustomerPhone(e.target.value)}
                    placeholder={t('payment.delivery_customer_phone') as string}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={t('payment.delivery_address') as string}
                  rows={2}
                  className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400"
                />
                <select
                  value={deliveryPersonId}
                  onChange={(e) => setDeliveryPersonId(e.target.value ? Number(e.target.value) : '')}
                  required
                  className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400 ${
                    deliveryPersonId ? 'border-amber-200' : 'border-red-300 ring-1 ring-red-200'
                  }`}
                >
                  <option value="">{t('payment.delivery_person_required_short')}</option>
                  {deliveryPeople.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-amber-800 whitespace-nowrap">
                    {t('payment.delivery_fee')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <span className="text-xs text-amber-700">{t('receipt.egp')}</span>
                </div>
              </div>
            )}

            {/* Payment method */}
            {checkoutStep === 'pay' && saleType !== 'digital' && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t('payment.payment_method')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'cash', label: t('payment.cash') },
                    { value: 'visa', label: t('payment.visa') },
                    { value: 'hybrid', label: t('payment.hybrid') },
                    { value: 'instapay', label: t('payment.instapay') },
                    { value: 'vodafone_cash', label: t('payment.vodafone_cash') },
                    { value: 'account', label: t('payment.account') },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setPaymentMethod(value)}
                      className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        paymentMethod === value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Digital: platform billing (paid vs on-account) */}
            {checkoutStep === 'setup' && saleType === 'digital' && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {t('payment.platform_billing')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'paid' as const, label: t('payment.platform_paid') },
                      { value: 'account' as const, label: t('payment.platform_on_account') },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleDigitalBillingChange(value)}
                        className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                          digitalBilling === value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {checkoutStep === 'pay' && saleType === 'digital' && isDigitalPaid && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t('payment.platform_settlement')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {SETTLEMENT_METHODS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentMethod(value)}
                      className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        paymentMethod === value
                          ? 'border-pharma-500 bg-pharma-50 text-pharma-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {t(`payment.${value}`)}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">{t('payment.platform_settlement_hint')}</p>
              </div>
            )}

            {/* Cash form */}
            {checkoutStep === 'pay' && paymentMethod === 'cash' && (saleType !== 'digital' || isDigitalPaid) && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    {t('payment.amount_tendered')}
                  </label>
                  <input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => {
                      setCashTouched(true)
                      setCashAmount(e.target.value)
                    }}
                    className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-4 py-3 text-2xl font-bold text-gray-900 focus:outline-none transition-all"
                    placeholder={effectiveTotal.toFixed(2)}
                    autoFocus
                    min={0}
                    step={0.5}
                  />
                </div>
                <div className={`flex justify-between items-center p-4 rounded-xl border-2 transition-all ${
                  change > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <span className="text-sm font-semibold text-gray-600">{t('payment.change')}</span>
                  <span className={`text-2xl font-bold ${change > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                    {t('receipt.egp')} {change.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Electronic form */}
            {(checkoutStep === 'pay') && (paymentMethod === 'visa' || paymentMethod === 'instapay' || paymentMethod === 'vodafone_cash') &&
              (saleType !== 'digital' || isDigitalPaid) && (
              <div className="bg-blue-50 border-2 border-blue-200 p-6 rounded-xl text-center space-y-2">
                <CreditCard size={36} className="text-blue-500 mx-auto" />
                <p className="text-sm font-semibold text-blue-700">{t(`payment.${paymentMethod}`)}</p>
                <p className="text-3xl font-bold text-blue-900">
                  {t('receipt.egp')} {effectiveTotal.toFixed(2)}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-blue-500 text-sm">
                  <CheckCircle2 size={16} />
                  <span>Ready to charge</span>
                </div>
              </div>
            )}

            {/* Hybrid form */}
            {checkoutStep === 'pay' && paymentMethod === 'hybrid' && (saleType !== 'digital' || isDigitalPaid) && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">
                      {t('payment.cash_amount')}
                    </label>
                    <input
                      type="number"
                      value={cashPart}
                      onChange={(e) => handleCashPartChange(e.target.value)}
                      className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none transition-all"
                      placeholder="0.00"
                      min={0}
                      step={0.5}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">
                      {t('payment.card_amount')}
                    </label>
                    <input
                      type="number"
                      value={cardPart}
                      onChange={(e) => handleCardPartChange(e.target.value)}
                      className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none transition-all"
                      placeholder="0.00"
                      min={0}
                      step={0.5}
                    />
                  </div>
                </div>
                <div className={`p-3 rounded-xl text-sm font-semibold text-center border-2 transition-all ${
                  Math.abs(hybridDiff) < 0.01
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : hybridSum > 0
                    ? 'bg-orange-50 border-orange-200 text-orange-700'
                    : 'bg-gray-50 border-gray-200 text-gray-400'
                }`}>
                  {Math.abs(hybridDiff) < 0.01
                    ? '✓ Amounts match total'
                    : hybridSum > 0
                    ? `Remaining: ${t('receipt.egp')} ${(effectiveTotal - hybridSum).toFixed(2)}`
                    : `Enter amounts totaling ${t('receipt.egp')} ${effectiveTotal.toFixed(2)}`}
                </div>
              </div>
            )}

            {/* Account (on-credit) — digital bills the platform (Talabat, etc.), not the POS customer */}
            {checkoutStep === 'pay' && paymentMethod === 'account' && (saleType !== 'digital' || isDigitalAccount) && (
              <div className={`p-5 rounded-xl border-2 text-center space-y-2 ${
                isDigitalAccount || selectedCustomer
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <CreditCard
                  size={32}
                  className={
                    isDigitalAccount || selectedCustomer
                      ? 'text-amber-500 mx-auto'
                      : 'text-red-500 mx-auto'
                  }
                />
                <p
                  className={`text-sm font-semibold ${
                    isDigitalAccount || selectedCustomer ? 'text-amber-800' : 'text-red-800'
                  }`}
                >
                  {isDigitalAccount
                    ? `${t('payment.charge_to')} ${t(`payment.${digitalType}`)}`
                    : selectedCustomer
                    ? `${t('payment.charge_to')} ${selectedCustomer.name}`
                    : t('payment.account_requires_customer')}
                </p>
                {isDigitalAccount && (
                  <p className="text-xs text-amber-700">{t('payment.platform_account_hint')}</p>
                )}
                <p
                  className={`text-2xl font-bold ${
                    isDigitalAccount || selectedCustomer ? 'text-amber-900' : 'text-red-900'
                  }`}
                >
                  {t('receipt.egp')} {effectiveTotal.toFixed(2)}
                </p>
                {(isDigitalAccount || selectedCustomer) && (
                  <div className="pt-3 mt-2 border-t border-amber-200 text-left space-y-2">
                    <label className="text-xs font-semibold text-amber-800 block">
                      {t('payment.paid_now')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        max={effectiveTotal}
                        value={accountPaidAmount}
                        onChange={(e) => setAccountPaidAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 border-2 border-amber-200 focus:border-amber-400 rounded-xl px-3 py-2 text-sm focus:outline-none transition-all"
                      />
                      <select
                        value={accountPaidMethod}
                        onChange={(e) => setAccountPaidMethod(e.target.value)}
                        className="border-2 border-amber-200 focus:border-amber-400 rounded-xl px-3 py-2 text-sm focus:outline-none transition-all"
                      >
                        {['cash', 'visa', 'instapay', 'vodafone_cash'].map((m) => (
                          <option key={m} value={m}>
                            {t(`payment.${m}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {accountPaidNowFinal > 0 && (
                      <div className="flex justify-between text-sm font-semibold text-amber-900">
                        <span>{t('payment.remaining_on_account')}</span>
                        <span className="tabular-nums">{t('receipt.egp')} {accountRemaining.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {checkoutStep === 'setup' && saleType === 'digital' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    {t('payment.digital_type')}
                  </label>
                  <select
                    value={digitalType}
                    onChange={(e) => setDigitalType(e.target.value)}
                    className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                  >
                    {platforms.map((p) => (
                      <option key={p.platform_key} value={p.platform_key}>
                        {platformDisplayLabel(p, p.platform_key, langCode)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

          </div>

          {/* ── Right: order summary ── */}
          <div className="w-60 xl:w-64 flex-shrink-0 border-s border-gray-100 flex flex-col bg-gray-50">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {t('payment.summary')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cartItems.map((item) => {
                const name = lang === 'ar' ? item.product.name_ar : item.product.name_en
                return (
                  <div key={item.product.id} className="flex justify-between gap-2 text-xs">
                    <span className="text-gray-600 line-clamp-2 flex-1 leading-tight">{name} ×{item.quantity}</span>
                    <span className="font-semibold text-gray-900 flex-shrink-0 tabular-nums">
                      {(item.quantity * item.unit_price).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="p-4 border-t border-gray-200 space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{t('payment.subtotal')}</span>
                <span className="tabular-nums">{subtotal.toFixed(2)}</span>
              </div>
              {invoiceDiscount > 0 && !isInsurance && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>- {t('payment.discount')}</span>
                  <span className="tabular-nums">{invoiceDiscount.toFixed(2)}</span>
                </div>
              )}
              {needsDelivery && deliveryFeeNum > 0 && (
                <div className="flex justify-between text-xs text-amber-700">
                  <span>+ {t('payment.delivery_fee')}</span>
                  <span className="tabular-nums">{deliveryFeeNum.toFixed(2)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-xs text-indigo-700">
                  <span>- {t('loyalty.pos_discount_label')}</span>
                  <span className="tabular-nums">{loyaltyDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>{t('payment.total')}</span>
                <span className="text-pharma-700 tabular-nums">
                  {t('receipt.egp')} {effectiveTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex gap-3 justify-between bg-white">
          <div className="flex gap-2">
            {checkoutStep !== 'type' && (
              <button
                type="button"
                onClick={() => {
                  setError('')
                  if (checkoutStep === 'pay') {
                    if (typePreselected) {
                      if (saleType === 'cash') onClose()
                      else setCheckoutStep('setup')
                    } else {
                      setCheckoutStep(saleType === 'cash' ? 'type' : 'setup')
                    }
                  } else if (typePreselected) {
                    onClose()
                  } else {
                    setCheckoutStep('type')
                  }
                }}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
              >
                {t('common.back')}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
            >
              {t('common.cancel')}
            </button>
          </div>
          <div className="flex gap-2">
            {checkoutStep === 'type' && (
              <button
                type="button"
                onClick={handleTypeContinue}
                className="px-6 py-2.5 bg-pharma-600 hover:bg-pharma-700 text-white rounded-xl text-sm font-bold transition-all"
              >
                {t('payment.continue')}
              </button>
            )}
            {checkoutStep === 'setup' && (
              <button
                type="button"
                onClick={goToPaymentStep}
                disabled={!canContinueSetup()}
                className="px-6 py-2.5 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all"
              >
                {saleType === 'insurance' ? t('insurance.proceed_checkout') : t('payment.continue')}
              </button>
            )}
            {checkoutStep === 'pay' && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2.5 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-pharma-200/50"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? t('payment.processing') : t('payment.confirm')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
