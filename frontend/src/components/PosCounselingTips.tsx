import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertOctagon, AlertTriangle, CheckCircle2, Lightbulb, Plus, Stethoscope, X } from 'lucide-react'
import type { CounselingInteraction, DoseHelper, Product } from '../lib/api'
import i18n from '../lib/i18n'

export interface CounselingTip {
  id: string
  product_id: number
  product_name: string
  advice: string
  suggest: string
  related_products: Product[]
  how_to?: string[]
  warnings?: string[]
  interactions?: CounselingInteraction[]
  pregnancy_caution?: boolean
  dose_helper?: DoseHelper | null
}

/** Child weight → ml per dose for a paracetamol / ibuprofen liquid. */
function DoseCalc({ h }: { h: DoseHelper }) {
  const { t } = useTranslation()
  const [kg, setKg] = useState('')
  const w = Number(kg)
  const mg = w > 0 ? Math.min(w * h.mg_per_kg, h.max_dose_mg) : 0
  const ml = mg > 0 ? Math.round((mg / h.mg_per_ml) * 10) / 10 : 0
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-900">
      <div className="font-semibold mb-1">{t('counseling.dose_title')}</div>
      <div className="flex items-center gap-1.5">
        <input type="number" min={0} step="0.5" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={t('counseling.weight_kg') as string}
          className="w-20 border border-violet-300 rounded px-1.5 py-0.5 bg-white" />
        <span>{t('counseling.kg')}</span>
        {w > 0 && (w < h.min_weight_kg
          ? <span className="text-red-700 font-semibold">{t('counseling.dose_too_small', { kg: h.min_weight_kg })}</span>
          : <span className="font-bold">= {ml} {t('counseling.ml')} ({Math.round(mg)} mg)</span>)}
      </div>
      <div className="mt-1 text-[11px] text-violet-700">{t(`counseling.dose_rule_${h.drug}`, { n: h.times_per_day })}</div>
    </div>
  )
}

const SEVERITY: Record<string, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-100 text-amber-900 border border-amber-300',
  low: 'bg-sky-50 text-sky-900 border border-sky-200',
}

interface Props {
  tips: CounselingTip[]
  onDismiss: (id: string) => void
  onAddProduct: (product: Product) => void
  showRelatedProducts?: boolean
}

export default function PosCounselingTips({
  tips,
  onDismiss,
  onAddProduct,
  showRelatedProducts = true,
}: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  if (tips.length === 0) return null

  return (
    <div className="fixed top-20 end-4 z-[55] flex flex-col gap-2 w-[min(100vw-2rem,22rem)] pointer-events-none">
      {tips.map((tip) => (
        <div
          key={tip.id}
          className={`pointer-events-auto rounded-xl border-2 ${(tip.interactions || []).some((x) => x.severity === 'high') ? 'border-red-400' : 'border-teal-200'} bg-gradient-to-br from-teal-50 to-white shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2 px-3 py-2.5 bg-teal-600 text-white">
            <Stethoscope className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide font-semibold opacity-90">
                {t('counseling.banner_title')}
              </p>
              <p className="text-sm font-bold truncate">{tip.product_name}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(tip.id)}
              className="p-1 rounded-lg hover:bg-white/15 shrink-0"
              aria-label={t('common.close') as string}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 py-2.5 space-y-2 text-sm text-slate-800">
            {(tip.interactions || []).map((it, i) => (
              <div key={i} className={`rounded-lg px-2 py-1.5 text-xs leading-snug ${SEVERITY[it.severity] || SEVERITY.low}`}>
                <div className="flex items-center gap-1 font-bold mb-0.5">
                  {it.severity === 'high' ? <AlertOctagon className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {t('counseling.interaction_with', { name: it.with })}
                </div>
                {it.message}
              </div>
            ))}
            {tip.pregnancy_caution && (
              <div className="rounded-lg bg-pink-50 border border-pink-200 text-pink-900 px-2 py-1 text-xs font-semibold">
                🤰 {t('counseling.ask_pregnancy')}
              </div>
            )}
            {tip.dose_helper && <DoseCalc h={tip.dose_helper} />}
            {(tip.how_to || []).length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase text-teal-700 mb-0.5">{t('counseling.how_to')}</p>
                <ul className="space-y-0.5">
                  {tip.how_to!.map((l, i) => (
                    <li key={i} className="flex gap-1.5 leading-snug"><CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />{l}</li>
                  ))}
                </ul>
              </div>
            ) : tip.advice ? (
              <p className="leading-snug">
                <Lightbulb className="inline w-3.5 h-3.5 text-amber-500 me-1 -mt-0.5" />
                {tip.advice}
              </p>
            ) : null}
            {(tip.warnings || []).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase text-orange-700 mb-0.5">{t('counseling.warnings')}</p>
                <ul className="space-y-0.5">
                  {tip.warnings!.map((l, i) => (
                    <li key={i} className="flex gap-1.5 leading-snug text-[13px]"><AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />{l}</li>
                  ))}
                </ul>
              </div>
            )}
            {tip.suggest && (
              <p className="text-xs text-teal-800 bg-teal-50/80 rounded-lg px-2 py-1.5 leading-relaxed border border-teal-100">
                {tip.suggest}
              </p>
            )}
            {showRelatedProducts && tip.related_products.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] font-semibold uppercase text-slate-500 mb-1.5">
                  {t('counseling.related_items')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tip.related_products.map((p) => {
                    const name = lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onAddProduct(p)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white border border-teal-200 text-teal-800 hover:bg-teal-100 transition-colors max-w-full"
                        title={t('counseling.add_to_cart') as string}
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span className="truncate">{name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
