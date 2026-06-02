import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function HrUnauthorized({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div
      className={`rounded-2xl border-2 border-amber-200 bg-amber-50/90 p-8 text-center shadow-sm ${className}`}
    >
      <ShieldAlert size={40} className="mx-auto mb-3 text-amber-600" strokeWidth={1.75} />
      <p className="text-base font-semibold text-amber-900">{t('hr.not_authorized_title')}</p>
      <p className="text-sm text-amber-800/90 mt-2 max-w-md mx-auto leading-relaxed">
        {t('hr.not_authorized_feature')}
      </p>
    </div>
  )
}
