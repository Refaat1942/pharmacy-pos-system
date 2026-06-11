import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, X, Plus, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { Product } from '../lib/api'
import i18n from '../lib/i18n'
import { formatMoney } from '../lib/formatNumber'
import { useAuth } from '../lib/auth'

interface Props {
  onAdd: (product: Product) => void
}

export default function PosQuickItems({ onAdd }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get<Product[]>('/pos/quick-items')
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onBranch = () => load()
    window.addEventListener('branch-changed', onBranch)
    return () => window.removeEventListener('branch-changed', onBranch)
  }, [load])

  const label = (p: Product) => (lang === 'ar' ? p.name_ar || p.name_en : p.name_en || p.name_ar)

  const handleAdd = (p: Product) => {
    onAdd(p)
    setOpen(false)
  }

  const preview = items.slice(0, 5)
  const isAdmin = user?.role === 'admin'

  if (!loading && items.length === 0 && !isAdmin) return null

  return (
    <>
      <div className="max-w-3xl mx-auto mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (items.length ? setOpen(true) : undefined)}
          disabled={items.length === 0}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900 hover:border-amber-300 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-default"
          title={t('pos.quick_items_btn') as string}
        >
          <Package size={16} className="text-amber-600 shrink-0" />
          {t('pos.quick_items_btn')}
        </button>

        {preview.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleAdd(p)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:border-pharma-400 hover:bg-pharma-50 hover:text-pharma-800 shadow-sm transition-colors max-w-[9rem] truncate"
            title={`${label(p)} — ${formatMoney(p.price)}`}
          >
            <Plus size={12} className="shrink-0 text-pharma-600" />
            <span className="truncate">{label(p)}</span>
          </button>
        ))}

        {items.length > 5 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-pharma-700 hover:underline px-1"
          >
            +{items.length - 5} {t('pos.quick_items_more')}
          </button>
        )}

        {!loading && items.length === 0 && isAdmin && (
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-pharma-700"
          >
            <Settings size={12} />
            {t('pos.quick_items_setup')}
          </Link>
        )}
      </div>

      {open && items.length > 0 && (
        <div
          className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[78vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Package size={20} />
                  {t('pos.quick_items_title')}
                </h2>
                <p className="text-xs text-white/85 mt-0.5">{t('pos.quick_items_subtitle')}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/15">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAdd(p)}
                  className="flex flex-col items-start p-3 rounded-xl border-2 border-slate-100 bg-slate-50 hover:border-pharma-400 hover:bg-pharma-50 text-start transition-all active:scale-[0.98]"
                >
                  <span className="font-semibold text-sm text-slate-800 line-clamp-2 leading-snug min-h-[2.5em]">
                    {label(p)}
                  </span>
                  <span className="text-pharma-700 font-bold text-sm mt-1 tabular-nums">
                    {t('pos.egp')} {formatMoney(p.price)}
                  </span>
                </button>
              ))}
            </div>
            {isAdmin && (
              <div className="px-4 py-3 border-t bg-slate-50 text-center">
                <Link to="/settings" className="text-xs font-semibold text-pharma-700 hover:underline" onClick={() => setOpen(false)}>
                  {t('pos.quick_items_manage')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
