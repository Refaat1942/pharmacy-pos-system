import { Banknote, Shield, ShoppingBag, Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'

export type PosSaleType = 'cash' | 'delivery' | 'digital' | 'insurance'

interface Props {
  value: PosSaleType
  onChange: (type: PosSaleType) => void
  compact?: boolean
}

export default function PosSaleTypePicker({ value, onChange, compact }: Props) {
  const { t } = useTranslation()
  const { hasFeature, hasFeatureOption } = useAuth()
  const digitalSalesOn = hasFeature('pos') && hasFeatureOption('pos', 'digital_sales')
  const insuranceSalesOn = hasFeature('insurance') && hasFeatureOption('insurance', 'pos_billing')

  const options: { value: PosSaleType; icon: typeof Banknote; label: string }[] = [
    { value: 'cash', icon: Banknote, label: t('payment.cash_sale') },
    { value: 'delivery', icon: ShoppingBag, label: t('payment.delivery_sale') },
    ...(digitalSalesOn ? [{ value: 'digital' as const, icon: Smartphone, label: t('payment.digital_sale') }] : []),
    ...(insuranceSalesOn ? [{ value: 'insurance' as const, icon: Shield, label: t('payment.insurance_sale') }] : []),
  ]

  const cols = options.length >= 4 ? 'grid-cols-4' : options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
        {t('pos.sale_type')}
      </p>
      {!compact && (
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">{t('pos.sale_type_hint')}</p>
      )}
      <div className={`grid gap-1.5 ${cols}`}>
        {options.map(({ value: v, icon: Icon, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 text-[10px] font-semibold transition-all ${
              value === v
                ? 'border-pharma-500 bg-pharma-50 text-pharma-700 shadow-sm'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Icon size={compact ? 16 : 18} />
            <span className="leading-tight text-center">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
