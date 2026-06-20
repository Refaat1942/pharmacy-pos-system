import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, Loader2, Search } from 'lucide-react'
import api from '../lib/api'

type DrugRow = {
  id: string
  name_en: string
  name_ar: string
  active_en: string
  active_ar: string
}

type DoseResult = {
  patient_type_label: string
  form: string
  dose_text: string
  frequency_hours?: number
  dose_mg?: number
  dose_volume_ml?: number
  note?: string
  disclaimer: string
}

export default function AiDoseCalculatorPanel() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [query, setQuery] = useState('')
  const [drugs, setDrugs] = useState<DrugRow[]>([])
  const [loadingDrugs, setLoadingDrugs] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [isAdult, setIsAdult] = useState(true)
  const [weightKg, setWeightKg] = useState('')
  const [ageYears, setAgeYears] = useState('')
  const [result, setResult] = useState<DoseResult | null>(null)
  const [calcError, setCalcError] = useState('')
  const [calculating, setCalculating] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setDrugs([])
      return
    }
    setLoadingDrugs(true)
    const tm = setTimeout(() => {
      api.get<{ items: DrugRow[] }>('/assistant/drugs', { params: { q: query.trim() } })
        .then(({ data }) => setDrugs(data.items || []))
        .catch(() => setDrugs([]))
        .finally(() => setLoadingDrugs(false))
    }, 250)
    return () => clearTimeout(tm)
  }, [query])

  const selected = useMemo(
    () => drugs.find((d) => d.id === selectedId) || drugs[0],
    [drugs, selectedId],
  )

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  const calculate = async () => {
    if (!selected) return
    setCalculating(true)
    setCalcError('')
    setResult(null)
    try {
      const { data } = await api.post<DoseResult>('/assistant/dose-calc', {
        drug_id: selected.id,
        is_adult: isAdult,
        weight_kg: isAdult ? undefined : Number(weightKg) || undefined,
        age_years: isAdult ? undefined : Number(ageYears) || undefined,
        lang: isAr ? 'ar' : 'en',
      })
      setResult(data)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCalcError(typeof detail === 'string' ? detail : (t('assistant.dose_error') as string))
    } finally {
      setCalculating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-indigo-800">
        <Calculator className="w-4 h-4" />
        <span className="text-sm font-semibold">{t('assistant.dose_calc_title')}</span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{t('assistant.dose_calc_hint')}</p>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute start-2.5 top-2.5" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedId('') }}
          placeholder={t('assistant.dose_search_ph') as string}
          className="input w-full ps-8 text-sm"
        />
      </div>

      {loadingDrugs && (
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {t('common.loading')}
        </div>
      )}

      {!loadingDrugs && drugs.length > 0 && (
        <select
          value={selectedId || selected?.id || ''}
          onChange={(e) => setSelectedId(e.target.value)}
          className="input w-full text-sm"
        >
          {drugs.map((d) => (
            <option key={d.id} value={d.id}>
              {isAr ? d.name_ar : d.name_en} — {isAr ? d.active_ar : d.active_en}
            </option>
          ))}
        </select>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIsAdult(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
            isAdult ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          {t('assistant.dose_adult')}
        </button>
        <button
          type="button"
          onClick={() => setIsAdult(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
            !isAdult ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          {t('assistant.dose_child')}
        </button>
      </div>

      {!isAdult && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={0}
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder={t('assistant.dose_weight_kg') as string}
            className="input text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.5"
            value={ageYears}
            onChange={(e) => setAgeYears(e.target.value)}
            placeholder={t('assistant.dose_age_years') as string}
            className="input text-sm"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => void calculate()}
        disabled={calculating || !selected || (!isAdult && !weightKg.trim())}
        className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {calculating ? t('assistant.thinking') : t('assistant.dose_calculate')}
      </button>

      {calcError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{calcError}</div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm space-y-1">
          <div className="font-semibold text-emerald-900">{result.patient_type_label}</div>
          <div className="text-slate-700">{result.form}</div>
          <div className="text-base font-bold text-emerald-800">{result.dose_text}</div>
          {result.note && <div className="text-xs text-slate-600">{result.note}</div>}
          <div className="text-[10px] text-amber-800 pt-1 border-t border-emerald-200/80">{result.disclaimer}</div>
        </div>
      )}
    </div>
  )
}
