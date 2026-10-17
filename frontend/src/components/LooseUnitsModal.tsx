import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Pill, CheckCircle2 } from 'lucide-react'
import api, { formatApiError } from '../lib/api'

interface Row {
  product_id: number; name_en: string | null; name_ar: string | null; barcode: string | null
  stock_boxes: number; price: number; unit: string | null
  sub_unit: string; pack_size: number | null; mid_unit: string | null; mid_size: number | null
  sub_price: number | null; mid_price: number | null; confidence: 'high' | 'medium' | 'needs_count'
}
type Edit = Row & { selected: boolean }

const CONF: Record<Row['confidence'], string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-sky-100 text-sky-800',
  needs_count: 'bg-amber-100 text-amber-800',
}
const quarterUp = (x: number) => Math.ceil(Math.round(x * 4 * 1e6) / 1e6) / 4

/** Items set up as whole boxes whose name says they hold tablets / capsules / sachets:
 * pick the packaging and convert stock (boxes × units per box) in one go. */
export default function LooseUnitsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [rows, setRows] = useState<Edit[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [allBranches, setAllBranches] = useState(true)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    api.get<{ rows: Row[] }>('/inventory/unit-suggestions')
      .then((r) => setRows(r.data.rows.map((x) => ({ ...x, selected: x.confidence === 'high' }))))
      .catch((e) => { setError(formatApiError(e, 'Error')); setRows([]) })
  }, [])

  const patch = (i: number, ch: Partial<Edit>) => setRows((rs) => rs && rs.map((r, k) => {
    if (k !== i) return r
    const n = { ...r, ...ch }
    if ('pack_size' in ch || 'mid_size' in ch) {
      // Re-price loose units from the box price (rounded up to 25 piasters).
      const pack = Number(n.pack_size) || 0
      n.sub_price = pack > 1 ? quarterUp(n.price / pack) : null
      n.mid_price = pack > 1 && n.mid_size ? quarterUp(n.price * n.mid_size / pack) : null
      if (pack > 1 && n.confidence === 'needs_count') n.selected = true
    }
    return n
  }))

  const ready = useMemo(() => (rows || []).filter((r) => r.selected && (r.pack_size || 0) > 1), [rows])

  const apply = async () => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post('/inventory/unit-suggestions/apply', {
        all_branches: allBranches,
        items: ready.map((r) => ({
          product_id: r.product_id, pack_size: r.pack_size, sub_unit: r.sub_unit,
          mid_unit: r.mid_size ? (r.mid_unit || 'شريط') : null, mid_size: r.mid_size || null,
          sub_price: r.sub_price, mid_price: r.mid_size ? r.mid_price : null,
        })),
      })
      setDone(data.converted)
    } catch (e) { setError(formatApiError(e, 'Error')) } finally { setBusy(false) }
  }

  const num = 'w-16 border border-slate-300 rounded px-1.5 py-1 text-xs'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><Pill size={18} className="text-pharma-600" />{t('loose.title')}</h2>
            <p className="text-xs text-slate-500">{t('loose.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-5 text-sm space-y-3">
          {error && <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
          {done !== null ? (
            <p className="flex items-center gap-2 text-emerald-800 font-semibold text-base"><CheckCircle2 size={18} />{t('loose.done', { n: done })}</p>
          ) : rows === null ? (
            <p className="text-pharma-700">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-400 py-10">{t('loose.none')}</p>
          ) : (
            <div className="overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2"><input type="checkbox" checked={rows.every((r) => r.selected || !(r.pack_size && r.pack_size > 1))}
                      onChange={(e) => setRows(rows.map((r) => ({ ...r, selected: e.target.checked && (r.pack_size || 0) > 1 })))} /></th>
                    <th className="px-2 py-2 text-start">{t('loose.item')}</th>
                    <th className="px-2 py-2 text-start">{t('loose.per_box')}</th>
                    <th className="px-2 py-2 text-start">{t('loose.strip')}</th>
                    <th className="px-2 py-2 text-end">{t('loose.box_price')}</th>
                    <th className="px-2 py-2 text-start">{t('loose.loose_prices')}</th>
                    <th className="px-2 py-2 text-start">{t('loose.stock')}</th>
                    <th className="px-2 py-2 text-start">{t('loose.confidence')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.product_id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={r.selected} disabled={!((r.pack_size || 0) > 1)} onChange={(e) => patch(i, { selected: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold">{(isAr ? r.name_ar || r.name_en : r.name_en || r.name_ar) || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.barcode}</div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <input type="number" min={2} max={500} className={num} value={r.pack_size ?? ''} placeholder="?"
                            onChange={(e) => patch(i, { pack_size: e.target.value ? Number(e.target.value) : null })} />
                          <input className="w-20 border border-slate-300 rounded px-1.5 py-1 text-xs" value={r.sub_unit} onChange={(e) => patch(i, { sub_unit: e.target.value })} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} className={num} value={r.mid_size ?? ''} placeholder="—"
                          title={t('loose.strip_hint') as string}
                          onChange={(e) => patch(i, { mid_size: e.target.value ? Number(e.target.value) : null })} />
                      </td>
                      <td className="px-2 py-1.5 text-end tabular-nums">{r.price.toFixed(2)}</td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {r.sub_price != null && <div>{r.sub_unit}: <b>{r.sub_price.toFixed(2)}</b></div>}
                        {r.mid_price != null && r.mid_size && <div>{t('loose.strip_word')} ({r.mid_size}): <b>{r.mid_price.toFixed(2)}</b></div>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {r.stock_boxes} {r.unit || ''}
                        {(r.pack_size || 0) > 1 && <span className="text-emerald-700"> → {r.stock_boxes * (r.pack_size || 0)} {r.sub_unit}</span>}
                      </td>
                      <td className="px-2 py-1.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONF[r.confidence]}`}>{t(`loose.conf_${r.confidence}`)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {done === null && rows && rows.length > 0 && <p className="text-[11px] text-slate-500">{t('loose.hint')}</p>}
        </div>
        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
          {done === null ? (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />{t('loose.all_branches')}
              </label>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100">{t('common.cancel')}</button>
                <button onClick={() => void apply()} disabled={busy || ready.length === 0}
                  className="px-4 py-2 rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium disabled:opacity-50">
                  {t('loose.apply', { n: ready.length })}
                </button>
              </div>
            </>
          ) : (
            <button onClick={onDone} className="ms-auto px-4 py-2 rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium">{t('common.close')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
