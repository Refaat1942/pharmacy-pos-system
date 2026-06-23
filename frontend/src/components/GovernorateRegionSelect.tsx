import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import {
  EGYPT_GOVERNORATES,
  encodeRegion,
  parseRegionValue,
} from '../lib/regions'

interface Props {
  value: string | null | undefined
  onChange: (v: string) => void
  className?: string
}

export default function GovernorateRegionSelect({ value, onChange, className = '' }: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const parsed = useMemo(() => parseRegionValue(value), [value])
  const governorate = parsed.governorate
  const region = parsed.region
  const otherText = parsed.custom || ''

  const regions = useMemo(
    () => EGYPT_GOVERNORATES.find((g) => g.key === governorate)?.regions ?? [],
    [governorate],
  )

  const markaz = regions.filter((r) => r.group === 'markaz' || r.group === 'city')
  const areas = regions.filter((r) => r.group === 'area' || !r.group)
  const govMeta = EGYPT_GOVERNORATES.find((g) => g.key === governorate)
  const areasGroupLabel = govMeta
    ? (lang === 'ar' ? `أحياء — ${govMeta.ar}` : `Areas — ${govMeta.en}`)
    : (t('regions.areas') as string)

  const showOtherField = region === 'other'

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={governorate}
          onChange={(e) => {
            const g = e.target.value
            if (!g) {
              onChange('')
              return
            }
            const first = EGYPT_GOVERNORATES.find((x) => x.key === g)?.regions[0]?.value
            onChange(first ? encodeRegion(g, first) : g)
          }}
          className="input w-full"
        >
          <option value="">{t('regions.select_governorate')}</option>
          {EGYPT_GOVERNORATES.map((g) => (
            <option key={g.key} value={g.key}>{lang === 'ar' ? g.ar : g.en}</option>
          ))}
        </select>
        <select
          value={region}
          disabled={!governorate}
          onChange={(e) => {
            const nextRegion = e.target.value
            if (nextRegion === 'other') {
              onChange(encodeRegion(governorate, 'other', otherText))
            } else {
              onChange(encodeRegion(governorate, nextRegion))
            }
          }}
          className="input w-full disabled:opacity-50"
        >
          <option value="">{t('regions.select_region')}</option>
          {markaz.length > 0 && (
            <optgroup label={t('regions.markaz') as string}>
              {markaz.map((r) => (
                <option key={r.value} value={r.value}>{lang === 'ar' ? r.ar : r.en}</option>
              ))}
            </optgroup>
          )}
          {areas.length > 0 && markaz.length > 0 && (
            <optgroup label={areasGroupLabel}>
              {areas.map((r) => (
                <option key={r.value} value={r.value}>{lang === 'ar' ? r.ar : r.en}</option>
              ))}
            </optgroup>
          )}
          {markaz.length === 0 && areas.map((r) => (
            <option key={r.value} value={r.value}>{lang === 'ar' ? r.ar : r.en}</option>
          ))}
        </select>
      </div>
      {showOtherField && (
        <div>
          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
            {t('regions.other_specify')}
          </label>
          <input
            type="text"
            value={otherText}
            onChange={(e) => onChange(encodeRegion(governorate, 'other', e.target.value))}
            placeholder={t('regions.other_specify_ph') as string}
            className="input w-full"
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
