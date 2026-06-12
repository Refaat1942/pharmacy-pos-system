import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, ShoppingCart, X } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import type { SaleResponse } from '../lib/api'
import api from '../lib/api'
import i18n from '../lib/i18n'
import { formatDate } from '../lib/formatDate'
import CopyrightNotice from './CopyrightNotice'

interface Props {
  sale: SaleResponse
  onNewSale: () => void
  onClose: () => void
}

interface PharmacyProfile {
  name_ar?: string | null
  name_en?: string | null
  address_ar?: string | null
  address_en?: string | null
  phone?: string | null
  tax_id?: string | null
  logo_data_url?: string | null
  receipt_header_ar?: string | null
  receipt_header_en?: string | null
  receipt_footer_ar?: string | null
  receipt_footer_en?: string | null
  receipt_language?: 'auto' | 'ar' | 'en'
  receipt_paper?: '58mm' | '80mm' | 'A4'
  receipt_accent?: string
  show_logo?: boolean
  show_pharmacy_name?: boolean
  show_tax_id?: boolean
  show_seller?: boolean
  show_customer?: boolean
  show_sale_type?: boolean
  show_branch?: boolean
  show_date?: boolean
  show_time?: boolean
  show_barcode?: boolean
}

const paperWidth: Record<string, string> = {
  '58mm': '58mm',
  '80mm': '80mm',
  'A4': '190mm',
}

export default function ReceiptModal({ sale, onNewSale, onClose }: Props) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<PharmacyProfile | null>(null)
  const barcodeRef = useRef<SVGSVGElement | null>(null)
  const { invoice, items } = sale

  useEffect(() => {
    api.get<PharmacyProfile>('/settings/profile')
      .then((r) => setProfile(r.data))
      .catch(() => setProfile({}))
  }, [])

  // Decide receipt language: profile override or current UI language.
  const lang: 'ar' | 'en' =
    profile?.receipt_language && profile.receipt_language !== 'auto'
      ? (profile.receipt_language as 'ar' | 'en')
      : (i18n.language === 'ar' ? 'ar' : 'en')

  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr'
  const accent = profile?.receipt_accent || '#0EA5E9'
  const paper = profile?.receipt_paper || '80mm'

  const name = lang === 'ar'
    ? (profile?.name_ar || profile?.name_en || t('app_name'))
    : (profile?.name_en || profile?.name_ar || t('app_name'))

  const address = lang === 'ar'
    ? (profile?.address_ar || profile?.address_en || '')
    : (profile?.address_en || profile?.address_ar || '')

  const headerText = lang === 'ar'
    ? (profile?.receipt_header_ar || '')
    : (profile?.receipt_header_en || '')

  const footerText = lang === 'ar'
    ? (profile?.receipt_footer_ar || i18n.getFixedT('ar')('receipt.thank_you'))
    : (profile?.receipt_footer_en || i18n.getFixedT('en')('receipt.thank_you'))

  const handlePrint = () => window.print()

  const localeId = lang === 'ar' ? 'ar-EG' : 'en-US'
  const formatDateOnly = (s: string) => formatDate(s)
  const formatTimeOnly = (s: string) =>
    new Date(s).toLocaleTimeString(localeId, { hour: '2-digit', minute: '2-digit' })

  const tr = (k: string) => i18n.getFixedT(lang)(k)

  const paymentLabel: Record<string, string> = {
    cash: tr('payment.cash'),
    visa: tr('payment.visa'),
    hybrid: tr('payment.hybrid'),
    instapay: tr('payment.instapay'),
    vodafone_cash: tr('payment.vodafone_cash'),
    digital: tr('payment.digital'),
    account: tr('payment.account'),
  }

  const saleTypeLabel = (typ: string): string => {
    const k = `receipt.sale_type_${(typ || 'sale').toLowerCase()}`
    const translated = tr(k)
    // If i18n returned the key itself (no entry), fall back to the raw type
    return translated === k ? (typ || tr('receipt.sale_type_sale')) : translated
  }

  const branchName = lang === 'ar'
    ? (invoice.branch_name_ar || invoice.branch_name_en || '')
    : (invoice.branch_name_en || invoice.branch_name_ar || '')

  const branchAddress = invoice.branch_address || ''
  const branchPhone = invoice.branch_phone || ''

  // Render barcode whenever the toggle / invoice number / paper changes
  useEffect(() => {
    if (!barcodeRef.current) return
    if (profile?.show_barcode === false) return
    if (!invoice.invoice_number) return
    try {
      JsBarcode(barcodeRef.current, invoice.invoice_number, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 13,
        fontOptions: 'bold',
        height: 44,
        width: 2,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {
      /* swallow — bad chars in invoice number shouldn't break the receipt */
    }
  }, [profile?.show_barcode, invoice.invoice_number, paper])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header (screen only) */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 no-print">
          <h2 className="text-base font-bold text-gray-900">{t('receipt.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Receipt content — width follows configured paper size for print */}
        <div
          className={`flex-1 overflow-y-auto p-3 sm:p-5 receipt-print receipt-paper-${paper} mx-auto`}
          dir={dir}
          style={{ width: '100%', maxWidth: paperWidth[paper] }}
        >
          {/* Pharmacy header */}
          <div className="text-center mb-2 receipt-header-block">
            {profile?.show_logo !== false && profile?.logo_data_url ? (
              <img
                src={profile.logo_data_url}
                alt={name}
                className="receipt-logo mx-auto mb-3 max-h-32 max-w-[230px] object-contain"
              />
            ) : profile?.show_logo !== false ? (
              <div
                className="receipt-logo-placeholder inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
                style={{ backgroundColor: accent }}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-white fill-current">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1h-3v3c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-3H7c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1h3V7c0-.55.45-1 1-1h2z"/>
                </svg>
              </div>
            ) : null}
            {profile?.show_pharmacy_name !== false && (
              <>
                <h3 className="font-bold text-gray-900 text-lg receipt-pharmacy-name">{name}</h3>
                {address && <p className="text-xs text-gray-700 mt-0.5 receipt-meta">{address}</p>}
                {profile?.phone && <p className="text-xs text-gray-700 receipt-meta">{profile.phone}</p>}
              </>
            )}
            {profile?.show_tax_id !== false && profile?.tax_id && (
              <p className="text-xs text-gray-500 mt-0.5">
                {lang === 'ar' ? 'الرقم الضريبي' : 'Tax ID'}: {profile.tax_id}
              </p>
            )}
            {profile?.show_branch !== false && branchName && (
              <div className="mt-2 pt-2 border-t border-dashed border-gray-300">
                <p className="text-sm font-bold text-gray-800">{branchName}</p>
                {branchAddress && <p className="text-xs text-gray-500 mt-0.5">{branchAddress}</p>}
                {branchPhone && <p className="text-xs text-gray-500">{branchPhone}</p>}
              </div>
            )}
            {headerText && (
              <p className="text-xs text-gray-600 mt-2 whitespace-pre-line">{headerText}</p>
            )}
          </div>

          {/* Invoice info */}
          <div className="receipt-info-block rounded-lg p-2 mb-2 space-y-1 bg-gray-50">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{tr('receipt.invoice_no')}</span>
              <span className="font-mono font-bold" style={{ color: accent }}>{invoice.invoice_number}</span>
            </div>
            {profile?.show_sale_type !== false && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tr('receipt.sale_type')}</span>
                <span className="text-gray-700">{saleTypeLabel(invoice.type)}</span>
              </div>
            )}
            {profile?.show_date !== false && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tr('receipt.date')}</span>
                <span className="text-gray-700 text-xs">{formatDateOnly(invoice.created_at)}</span>
              </div>
            )}
            {profile?.show_time !== false && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tr('receipt.time')}</span>
                <span className="text-gray-700 text-xs">{formatTimeOnly(invoice.created_at)}</span>
              </div>
            )}
            {profile?.show_seller !== false && invoice.seller_name_en && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tr('receipt.seller')}</span>
                <span className="text-gray-700">
                  {lang === 'ar' ? invoice.seller_name_ar : invoice.seller_name_en}
                </span>
              </div>
            )}
            {profile?.show_customer !== false && invoice.customer_name && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tr('receipt.customer')}</span>
                <span className="text-gray-700">{invoice.customer_name}</span>
              </div>
            )}
            {invoice.delivery_person_name && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tr('receipt.delivery_person')}</span>
                <span className="text-gray-700">{invoice.delivery_person_name}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-2 text-start text-xs font-semibold text-gray-500 uppercase">{tr('receipt.item')}</th>
                <th className="pb-2 text-center text-xs font-semibold text-gray-500 uppercase w-10">{tr('receipt.qty')}</th>
                <th className="pb-2 text-end text-xs font-semibold text-gray-500 uppercase">{tr('receipt.total')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const rawUnit = (item.unit_label || '').toString().trim()
                const unitKey = `units.${rawUnit.toLowerCase()}`
                const translatedUnit = rawUnit ? tr(unitKey) : ''
                // Fall back to the raw label if no translation entry exists for it
                const unitDisplay = !rawUnit
                  ? ''
                  : (translatedUnit === unitKey ? rawUnit : translatedUnit)
                return (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-2.5">
                      <p className="font-medium text-gray-800 leading-tight">
                        {lang === 'ar' ? item.product_name_ar : item.product_name_en}
                      </p>
                      <p className="text-[11px] text-gray-400 tabular-nums">
                        {tr('receipt.egp')} {item.unit_price.toFixed(2)} × {item.quantity}
                        {unitDisplay ? ` ${unitDisplay}` : ''}
                      </p>
                    </td>
                    <td className="py-2.5 text-center text-gray-700 font-medium">
                      <span className="tabular-nums">{item.quantity}</span>
                      {unitDisplay && (
                        <div className="text-[10px] text-gray-400 font-normal leading-none mt-0.5">
                          {unitDisplay}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-end font-bold text-gray-900 tabular-nums">{item.total.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="space-y-1.5 mb-4 bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{tr('receipt.subtotal')}</span>
              <span className="tabular-nums">{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>- {tr('receipt.discount')}</span>
                <span className="tabular-nums">{invoice.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t-2 border-gray-200">
              <span>{tr('receipt.net_total')}</span>
              <span className="tabular-nums" style={{ color: accent }}>
                {tr('receipt.egp')} {invoice.net_total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-blue-600 font-semibold">{tr('receipt.payment')}</span>
              <span className="text-blue-900 font-bold">
                {paymentLabel[invoice.payment_method] || invoice.payment_method}
              </span>
            </div>
            {invoice.cash_amount && invoice.cash_amount > 0 && (
              <div className="flex justify-between text-xs text-blue-600">
                <span>{tr('receipt.cash_paid')}</span>
                <span className="tabular-nums">{tr('receipt.egp')} {invoice.cash_amount.toFixed(2)}</span>
              </div>
            )}
            {invoice.change_amount > 0 && (
              <div className="flex justify-between text-sm font-semibold text-blue-700">
                <span>{tr('receipt.change')}</span>
                <span className="tabular-nums">{tr('receipt.egp')} {invoice.change_amount.toFixed(2)}</span>
              </div>
            )}
            {invoice.payment_method === 'account' &&
              ((invoice.cash_amount || 0) + (invoice.visa_amount || 0)) > 0 && (
              <>
                <div className="flex justify-between text-xs text-blue-600">
                  <span>{tr('receipt.paid_now')}</span>
                  <span className="tabular-nums">
                    {tr('receipt.egp')} {((invoice.cash_amount || 0) + (invoice.visa_amount || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-blue-700">
                  <span>{tr('receipt.on_account')}</span>
                  <span className="tabular-nums">
                    {tr('receipt.egp')} {(invoice.net_total - (invoice.cash_amount || 0) - (invoice.visa_amount || 0)).toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="receipt-footer-block text-center text-xs text-gray-500 pb-1 whitespace-pre-line">{footerText}</p>
          <CopyrightNotice variant="short" className="no-print text-center text-[10px] text-gray-400 pb-2" />

          {/* Scannable barcode at the bottom for fast invoice retrieval */}
          {profile?.show_barcode !== false && (
            <div className="receipt-barcode-block mt-2 mb-1 flex flex-col items-center" dir="ltr">
              <svg ref={barcodeRef} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
          >
            <Printer size={16} />
            {t('receipt.print')}
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 flex items-center justify-center gap-2 text-white rounded-xl py-2.5 text-sm font-bold transition-all shadow-lg"
            style={{ backgroundColor: accent }}
          >
            <ShoppingCart size={16} />
            {t('receipt.new_sale')}
          </button>
        </div>
      </div>
    </div>
  )
}
