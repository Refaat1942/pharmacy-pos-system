import { useTranslation } from 'react-i18next'
import { ISMAILIA_REGIONS } from '../lib/regions'
import i18n from '../lib/i18n'

interface Props {
  value: string | null | undefined
  onChange: (v: string) => void
  className?: string
}

export default function RegionSelect({ value, onChange, className = '' }: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const markaz = ISMAILIA_REGIONS.filter((r) => r.group === 'markaz')
  const areas = ISMAILIA_REGIONS.filter((r) => r.group === 'area')
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`input ${className}`}
    >
      <option value="">{t('regions.select')}</option>
      <optgroup label={t('regions.markaz') as string}>
        {markaz.map((r) => (
          <option key={r.value} value={r.value}>{lang === 'ar' ? r.ar : r.en}</option>
        ))}
      </optgroup>
      <optgroup label={t('regions.areas') as string}>
        {areas.map((r) => (
          <option key={r.value} value={r.value}>{lang === 'ar' ? r.ar : r.en}</option>
        ))}
      </optgroup>
    </select>
  )
}
