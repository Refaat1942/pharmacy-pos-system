import { useTranslation } from 'react-i18next'
import { Printer, ShoppingCart, X } from 'lucide-react'
import type { SaleResponse } from '../lib/api'
import i18n from '../lib/i18n'

interface Props {
  sale: SaleResponse
  onNewSale: () => void
  onClose: () => void
}

export default function ReceiptModal({ sale, onNewSale, onClose }: Props) {
  const { t } = useTranslation()
  const lang = i18n.language
  const { invoice, items } = sale

  const handlePrint = () => window.print()

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const paymentLabel: Record<string, string> = {
    cash: t('payment.cash'),
    visa: t('payment.visa'),
    hybrid: t('payment.hybrid'),
    digital: t('payment.digital'),
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 no-print">
          <h2 className="text-base font-bold text-gray-900">{t('receipt.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Receipt content */}
        <div className="flex-1 overflow-y-auto p-5 receipt-print">
          {/* Pharmacy header */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-pharma-600 rounded-2xl mb-3">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-white fill-current">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1h-3v3c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-3H7c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1h3V7c0-.55.45-1 1-1h2z"/>
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 text-xl">{t('app_name')}</h3>
          </div>

          {/* Invoice info */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('receipt.invoice_no')}</span>
              <span className="font-mono font-bold text-gray-900 text-pharma-700">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('receipt.date')}</span>
              <span className="text-gray-700 text-xs">{formatDate(invoice.created_at)}</span>
            </div>
            {invoice.seller_name_en && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('receipt.seller')}</span>
                <span className="text-gray-700">
                  {lang === 'ar' ? invoice.seller_name_ar : invoice.seller_name_en}
                </span>
              </div>
            )}
            {invoice.customer_name && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('receipt.customer')}</span>
                <span className="text-gray-700">{invoice.customer_name}</span>
              </div>
            )}
          </div>

          {/* Items table */}
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-2 text-start text-xs font-semibold text-gray-500 uppercase">{t('receipt.item')}</th>
                <th className="pb-2 text-center text-xs font-semibold text-gray-500 uppercase w-10">{t('receipt.qty')}</th>
                <th className="pb-2 text-end text-xs font-semibold text-gray-500 uppercase">{t('receipt.total')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-2.5">
                    <p className="font-medium text-gray-800 leading-tight">
                      {lang === 'ar' ? item.product_name_ar : item.product_name_en}
                    </p>
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      {t('receipt.egp')} {item.unit_price.toFixed(2)} × {item.quantity}
                    </p>
                  </td>
                  <td className="py-2.5 text-center text-gray-700 font-medium">{item.quantity}</td>
                  <td className="py-2.5 text-end font-bold text-gray-900 tabular-nums">
                    {item.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="space-y-1.5 mb-4 bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t('receipt.subtotal')}</span>
              <span className="tabular-nums">{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>- {t('receipt.discount')}</span>
                <span className="tabular-nums">{invoice.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t-2 border-gray-200">
              <span>{t('receipt.net_total')}</span>
              <span className="text-pharma-700 tabular-nums">
                {t('receipt.egp')} {invoice.net_total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment info */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-blue-600 font-semibold">{t('receipt.payment')}</span>
              <span className="text-blue-900 font-bold">
                {paymentLabel[invoice.payment_method] || invoice.payment_method}
              </span>
            </div>
            {invoice.cash_amount && invoice.cash_amount > 0 && (
              <div className="flex justify-between text-xs text-blue-600">
                <span>{t('receipt.cash_paid')}</span>
                <span className="tabular-nums">{t('receipt.egp')} {invoice.cash_amount.toFixed(2)}</span>
              </div>
            )}
            {invoice.change_amount > 0 && (
              <div className="flex justify-between text-sm font-semibold text-blue-700">
                <span>{t('receipt.change')}</span>
                <span className="tabular-nums">{t('receipt.egp')} {invoice.change_amount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 pb-2">{t('receipt.thank_you')}</p>
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
            className="flex-1 flex items-center justify-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all shadow-lg shadow-pharma-200/50"
          >
            <ShoppingCart size={16} />
            {t('receipt.new_sale')}
          </button>
        </div>
      </div>
    </div>
  )
}
