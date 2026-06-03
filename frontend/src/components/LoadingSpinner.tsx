import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function LoadingSpinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-pharma-600 ${className}`} aria-hidden />
}

export function TableLoadingRow({
  colSpan,
  label,
}: {
  colSpan: number
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-10 text-slate-500">
        <span className="inline-flex items-center justify-center gap-2">
          <LoadingSpinner />
          <span>{label ?? t('common.loading')}</span>
        </span>
      </td>
    </tr>
  )
}

export function ListLoadingPanel({ label, className = '' }: { label?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-slate-500 ${className}`}>
      <LoadingSpinner />
      <span>{label ?? t('common.loading')}</span>
    </div>
  )
}
