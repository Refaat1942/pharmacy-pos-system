import { Customer } from '../lib/api'
import { regionLabel } from '../lib/regions'
import CustomerWhatsAppButton from './CustomerWhatsAppButton'
import { canOpenWhatsApp } from '../lib/whatsapp'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'

interface Props {
  customer: Customer
  showBalance?: boolean
}

export default function CustomerInfoCard({ customer, showBalance = true }: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const bal = Number(customer.balance || 0)
  const initial = (customer.name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-pharma-100 text-pharma-700 flex items-center justify-center text-lg font-bold shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 text-base leading-tight truncate">{customer.name}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600">
            {customer.code && (
              <span className="font-mono">{customer.code}</span>
            )}
            {customer.phone && (
              <span className="font-mono">{customer.phone}</span>
            )}
            {customer.region && (
              <span>{regionLabel(customer.region, lang)}</span>
            )}
          </div>
          {showBalance && (
            <div className="mt-2 text-sm">
              <span className="text-slate-500">{t('customers.col_balance')}: </span>
              <span className={`font-semibold ${bal > 0 ? 'text-amber-700' : bal < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                {bal.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        {canOpenWhatsApp(customer.phone) && (
          <CustomerWhatsAppButton
            phone={customer.phone}
            customerName={customer.name}
            size="lg"
            variant="button"
            className="shrink-0"
          />
        )}
      </div>
    </div>
  )
}
