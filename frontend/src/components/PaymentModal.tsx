import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Loader2, ShoppingBag, CreditCard, Smartphone, Banknote, CheckCircle2 } from 'lucide-react'
import { salesAPI, employeesAPI } from '../lib/api'
import type { CartItem, Employee, Customer, SaleResponse } from '../lib/api'
import i18n from '../lib/i18n'

interface Props {
  cartItems: CartItem[]
  subtotal: number
  invoiceDiscount: number
  netTotal: number
  selectedSeller: Employee | null
  selectedCustomer: Customer | null
  clinicId?: number | null
  prescriptionId?: number | null
  onClose: () => void
  onSuccess: (sale: SaleResponse) => void
}

export default function PaymentModal({
  cartItems, subtotal, invoiceDiscount, netTotal,
  selectedSeller, selectedCustomer, clinicId, prescriptionId, onClose, onSuccess,
}: Props) {
  const { t } = useTranslation()
  const lang = i18n.language

  const [saleType, setSaleType] = useState('cash')
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

  useEffect(() => {
    employeesAPI.deliveryRoster().then((r) => setDeliveryPeople(r.data)).catch(() => {})
  }, [])

  const handleSaleTypeChange = (type: string) => {
    setSaleType(type)
    if (type === 'digital') setPaymentMethod('digital')
    else if (paymentMethod === 'digital') setPaymentMethod('cash')
  }

  const needsDelivery = saleType === 'delivery' || saleType === 'digital'
  const deliveryFeeNum = parseFloat(deliveryFee) || 0
  const effectiveTotal = netTotal + (needsDelivery ? deliveryFeeNum : 0)
  const requiresCustomerInfo = effectiveTotal > 100
  const hasCustomerInfo = !!selectedCustomer || (deliveryCustomerName.trim() !== '' && deliveryCustomerPhone.trim() !== '')
  const change =
    paymentMethod === 'cash' && cashAmount
      ? Math.max(0, parseFloat(cashAmount) - effectiveTotal)
      : 0

  const hybridSum = (parseFloat(cashPart) || 0) + (parseFloat(cardPart) || 0)
  const hybridDiff = hybridSum - effectiveTotal

  const isValid = () => {
    if (!selectedSeller) return false
    if (requiresCustomerInfo && !hasCustomerInfo) return false
    if (needsDelivery) {
      if (!deliveryAddress.trim()) return false
      if (!deliveryCustomerName.trim()) return false
      if (!deliveryCustomerPhone.trim()) return false
    }
    if (paymentMethod === 'cash') return parseFloat(cashAmount) >= effectiveTotal
    if (paymentMethod === 'hybrid') return Math.abs(hybridDiff) < 0.01
    if (paymentMethod === 'account') return !!selectedCustomer
    return true
  }

  const handleSubmit = async () => {
    if (!selectedSeller) {
      setError(t('payment.seller_required') as string)
      return
    }
    if (requiresCustomerInfo && !hasCustomerInfo) {
      setError(t('payment.customer_required_over_100') as string)
      return
    }
    if (needsDelivery && (!deliveryAddress.trim() || !deliveryCustomerName.trim() || !deliveryCustomerPhone.trim())) {
      setError(t('payment.delivery_required') as string)
      return
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
        digital_type: paymentMethod === 'digital' ? digitalType : undefined,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          unit_type: item.unit_type || 'pack',
        })),
        discount: invoiceDiscount,
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
        customer_id: selectedCustomer?.id,
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
      })
      onSuccess(data)
    } catch (e: any) {
      setError(e.response?.data?.detail || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t('payment.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
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

            {/* Sale type */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('payment.sale_type')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash', icon: Banknote, label: t('payment.cash_sale') },
                  { value: 'delivery', icon: ShoppingBag, label: t('payment.delivery_sale') },
                  { value: 'digital', icon: Smartphone, label: t('payment.digital_sale') },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
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

            {/* Delivery details */}
            {needsDelivery && (
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
                  className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">{t('payment.delivery_person')}</option>
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
            {saleType !== 'digital' && (
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

            {/* Cash form */}
            {paymentMethod === 'cash' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    {t('payment.amount_tendered')}
                  </label>
                  <input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-4 py-3 text-2xl font-bold text-gray-900 focus:outline-none transition-all"
                    placeholder={effectiveTotal.toFixed(2)}
                    autoFocus
                    min={effectiveTotal}
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
            {(paymentMethod === 'visa' || paymentMethod === 'instapay' || paymentMethod === 'vodafone_cash') && (
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
            {paymentMethod === 'hybrid' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">
                      {t('payment.cash_amount')}
                    </label>
                    <input
                      type="number"
                      value={cashPart}
                      onChange={(e) => setCashPart(e.target.value)}
                      className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none transition-all"
                      placeholder="0.00"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">
                      {t('payment.card_amount')}
                    </label>
                    <input
                      type="number"
                      value={cardPart}
                      onChange={(e) => setCardPart(e.target.value)}
                      className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none transition-all"
                      placeholder="0.00"
                      min={0}
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

            {/* Account (on-credit) */}
            {paymentMethod === 'account' && (
              <div className={`p-5 rounded-xl border-2 text-center space-y-2 ${selectedCustomer ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                <CreditCard size={32} className={selectedCustomer ? 'text-amber-500 mx-auto' : 'text-red-500 mx-auto'} />
                <p className={`text-sm font-semibold ${selectedCustomer ? 'text-amber-800' : 'text-red-800'}`}>
                  {selectedCustomer
                    ? `${t('payment.charge_to')} ${selectedCustomer.name}`
                    : t('payment.account_requires_customer')}
                </p>
                <p className={`text-2xl font-bold ${selectedCustomer ? 'text-amber-900' : 'text-red-900'}`}>
                  {t('receipt.egp')} {effectiveTotal.toFixed(2)}
                </p>
              </div>
            )}

            {/* Digital platform */}
            {(paymentMethod === 'digital' || saleType === 'digital') && (
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                  {t('payment.digital_type')}
                </label>
                <select
                  value={digitalType}
                  onChange={(e) => setDigitalType(e.target.value)}
                  className="w-full border-2 border-gray-200 focus:border-pharma-400 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                >
                  {['talabat', 'vezeeta', 'other_digital'].map((dt) => (
                    <option key={dt} value={dt}>
                      {t(`payment.${dt}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
                {error}
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
              {invoiceDiscount > 0 && (
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
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-pharma-200/50"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? t('payment.processing') : t('payment.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
