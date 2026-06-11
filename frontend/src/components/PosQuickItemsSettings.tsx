import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Trash2, ChevronUp, ChevronDown, Package } from 'lucide-react'
import { productsAPI, type Product } from '../lib/api'
import i18n from '../lib/i18n'

interface Props {
  productIds: number[]
  onChange: (ids: number[]) => void
}

export default function PosQuickItemsSettings({ productIds, onChange }: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Product[]>([])
  const [cached, setCached] = useState<Record<number, Product>>({})

  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    const tmr = setTimeout(() => {
      productsAPI.search(q.trim()).then((r) => setHits(r.data.slice(0, 10))).catch(() => setHits([]))
    }, 200)
    return () => clearTimeout(tmr)
  }, [q])

  useEffect(() => {
    const missing = productIds.filter((id) => !cached[id])
    if (!missing.length) return
    Promise.all(
      missing.map((id) => productsAPI.get(id).then((r) => r.data).catch(() => undefined)),
    ).then((found) => {
      setCached((prev) => {
        const next = { ...prev }
        found.forEach((p) => { if (p) next[p.id] = p })
        return next
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds])

  const add = (p: Product) => {
    if (productIds.includes(p.id)) return
    if (productIds.length >= 30) return
    setCached((c) => ({ ...c, [p.id]: p }))
    onChange([...productIds, p.id])
    setQ('')
    setHits([])
  }

  const remove = (id: number) => onChange(productIds.filter((x) => x !== id))

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= productIds.length) return
    const next = [...productIds]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }

  const name = (id: number) => {
    const p = cached[id]
    if (!p) return `#${id}`
    return lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <Package size={16} className="text-amber-600" />
        {t('settings.pharma.quick_items_title')}
      </h3>
      <p className="text-xs text-slate-500 mb-4">{t('settings.pharma.quick_items_hint')}</p>

      <div className="relative mb-3">
        <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('settings.pharma.quick_items_search') as string}
          className="w-full ps-10 pe-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>
      {hits.length > 0 && (
        <div className="border rounded-lg mb-4 max-h-40 overflow-y-auto">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={productIds.includes(p.id)}
              onClick={() => add(p)}
              className="w-full text-start px-3 py-2 text-sm hover:bg-amber-50 border-b last:border-0 disabled:opacity-40"
            >
              {lang === 'ar' ? (p.name_ar || p.name_en) : p.name_en}
              <span className="text-slate-400 font-mono text-xs ms-2">{p.barcode}</span>
            </button>
          ))}
        </div>
      )}

      {productIds.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">{t('settings.pharma.quick_items_empty')}</p>
      ) : (
        <ul className="space-y-1">
          {productIds.map((id, idx) => (
            <li key={id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm font-medium truncate">{name(id)}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === productIds.length - 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
                <button type="button" onClick={() => remove(id)} className="p-1 rounded text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
