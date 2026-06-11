import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, X, Tag } from 'lucide-react'
import type { PromoOffer } from '../lib/offerEngine'
import { offerTypeLabel } from '../lib/offerEngine'
import i18n from '../lib/i18n'

interface Props {
  offers: PromoOffer[]
  onSelectProduct?: (productId: number) => void
}

export default function OffersPosButton({ offers, onSelectProduct }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  if (!offers.length) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="offers-glow-btn group relative flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-sm text-white shadow-lg overflow-hidden"
        aria-label={t('offers.view_offers') as string}
      >
        <span className="offers-glow-btn__shine" aria-hidden />
        <Sparkles size={18} className="relative z-10 offers-glow-btn__icon" />
        <span className="relative z-10">{t('offers.active_offers')}</span>
        <span className="relative z-10 ml-0.5 bg-white/25 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums">
          {offers.length}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col border border-pharma-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b bg-gradient-to-r from-pharma-600 to-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={22} />
                <div>
                  <h2 className="font-bold text-lg leading-tight">{t('offers.modal_title')}</h2>
                  <p className="text-xs text-white/80">{t('offers.modal_subtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/15">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
              {offers.map((o) => {
                const name = lang === 'ar' ? (o.name_ar || o.name_en) : o.name_en
                return (
                  <div
                    key={o.id}
                    className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-pharma-50/40 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h3 className="font-bold text-slate-800">{name}</h3>
                        <p className="text-xs text-pharma-700 font-medium mt-0.5">
                          {offerTypeLabel(o.offer_type, lang)}
                          {o.offer_type === 'second_half' || o.offer_type === 'direct_percent'
                            ? ` · ${o.discount_percent ?? 50}%`
                            : null}
                          {o.offer_type === 'direct_amount' && o.discount_amount
                            ? ` · ${o.discount_amount} EGP`
                            : null}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide bg-pharma-100 text-pharma-800 px-2 py-1 rounded-full font-bold">
                        {t('offers.auto_apply')}
                      </span>
                    </div>
                    <ul className="space-y-1 max-h-32 overflow-y-auto">
                      {(o.products || []).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => { onSelectProduct?.(p.id); setOpen(false) }}
                            className="w-full text-left text-sm flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-pharma-100/60 text-slate-700"
                          >
                            <Tag size={14} className="text-pharma-600 shrink-0" />
                            <span className="truncate">{lang === 'ar' ? (p.name_ar || p.name_en) : p.name_en}</span>
                            <span className="ml-auto text-xs text-slate-400 font-mono shrink-0">{p.barcode}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
