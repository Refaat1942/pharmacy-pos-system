import { useTranslation } from 'react-i18next'
import type { FeatureOptionGroup, FeatureOptionsMap } from '../lib/featureOptions'

export default function FeatureOptionsPicker({
  catalog,
  enabledFeatures,
  value,
  onChange,
}: {
  catalog: FeatureOptionGroup[]
  enabledFeatures: string[]
  value: FeatureOptionsMap
  onChange: (v: FeatureOptionsMap) => void
}) {
  const { t } = useTranslation()
  const enabled = new Set(enabledFeatures)
  const groups = catalog.filter((g) => enabled.has(g.feature))
  if (!groups.length) return null

  const toggle = (feature: string, option: string) => {
    const current = value[feature]?.[option] ?? true
    onChange({
      ...value,
      [feature]: { ...value[feature], [option]: !current },
    })
  }

  return (
    <div className="space-y-3 max-h-[min(32rem,60vh)] overflow-y-auto pe-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide sticky top-0 bg-white py-1 z-10">
        {t('settings.features_picker_title', { count: groups.length })}
      </p>
      {groups.map((group) => (
        <div key={group.feature} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.options.map((opt) => {
              const on = value[group.feature]?.[opt.key] ?? opt.default
              return (
                <button
                  type="button"
                  key={`${group.feature}.${opt.key}`}
                  onClick={() => toggle(group.feature, opt.key)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs text-start transition ${
                    on
                      ? 'bg-white border-indigo-200 text-indigo-800 shadow-sm'
                      : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                    on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
                  }`}>{on ? '✓' : ''}</span>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
