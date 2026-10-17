import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2, Undo2, Search, Ban } from 'lucide-react'
import api, { formatApiError, Product, Supplier, Branch } from '../lib/api'
import { useAuth } from '../lib/auth'
import { sellUnitsOf, unitsPerBox, type SellUnit } from '../lib/packStock'
import { formatDateTime } from '../lib/formatDate'
import { formatMoney } from '../lib/formatNumber'

const REASONS = ['expired', 'near_expiry', 'damaged', 'surplus', 'recall', 'other'] as const

interface Lot { expiry_date: string | null; quantity: number }
interface Line {
  product: Product
  lots: Lot[]
  boxCost: number
  unit_type: SellUnit
  quantity: number | ''
  unit_cost: number | ''
  expiry_date: string // '' = earliest (expired) first
}
interface ReturnRow {
  id: number; return_number: string; supplier_name: string; branch_name_ar?: string; branch_name_en?: string
  total: number; status: 'done' | 'cancelled'; reason: string | null; created_at: string; item_count: number
  po_number?: string | null; notes?: string | null
}

/** Return goods to the supplier: list of returns + new return form. */
export default function SupplierReturnsModal({ suppliers, branches, onClose }: {
  suppliers: Supplier[]; branches: Branch[]; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const [rows, setRows] = useState<ReturnRow[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<number>(user?.branch_id || branches[0]?.id || 1)
  const [reason, setReason] = useState<string>('expired')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Product[]>([])

  const load = () => api.get<ReturnRow[]>('/supplier-returns').then((r) => setRows(r.data)).catch(() => setRows([]))
  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    const tm = setTimeout(() => {
      // Products belong to a branch: search the branch the goods leave from.
      api.get<(Product & { branch_id?: number | null })[]>('/products', { params: { q: q.trim() }, headers: { 'X-Active-Branch': String(branchId) } })
        .then((r) => setHits(r.data.filter((p) => p.branch_id === branchId).slice(0, 8))).catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(tm)
  }, [q, branchId])

  const addProduct = async (p: Product) => {
    setQ(''); setHits([])
    if (lines.some((l) => l.product.id === p.id)) return
    try {
      const { data } = await api.get(`/supplier-returns/product/${p.id}`, { params: { supplier_id: supplierId || undefined } })
      const lots: Lot[] = data.lots
      const today = new Date().toISOString().slice(0, 10)
      const expired = lots.find((l) => l.expiry_date && l.expiry_date < today)
      setLines((ls) => [...ls, {
        product: p, lots, boxCost: Number(data.box_cost) || 0, unit_type: 'pack',
        quantity: 1, unit_cost: Number(data.box_cost) || 0, expiry_date: expired?.expiry_date || '',
      }])
    } catch (e) { setError(formatApiError(e, t('supplier_returns.failed') as string)) }
  }

  const patch = (i: number, ch: Partial<Line>) => setLines((ls) => ls.map((l, k) => {
    if (k !== i) return l
    const next = { ...l, ...ch }
    // Changing the unit re-prices the line from the box cost.
    if (ch.unit_type && ch.unit_type !== l.unit_type) next.unit_cost = +(l.boxCost / unitsPerBox(l.product, ch.unit_type)).toFixed(2)
    return next
  }))

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0)
  const unitName = (p: Product, u: SellUnit) => (u === 'pack' ? p.unit : u === 'mid' ? p.mid_unit : p.sub_unit) || t(`supplier_returns.unit_${u}`)
  const lotLabel = (l: Lot, p: Product) => {
    const pack = Math.max(1, p.pack_size || 1)
    const qty = pack > 1 ? `${+(l.quantity / pack).toFixed(2)} ${p.unit || ''}` : `${l.quantity}`
    return `${l.expiry_date || t('supplier_returns.no_expiry')} — ${qty}`
  }

  const save = async () => {
    if (!supplierId || lines.length === 0) return
    setBusy(true); setError('')
    try {
      await api.post('/supplier-returns', {
        supplier_id: supplierId, branch_id: branchId, reason, notes: notes || null,
        items: lines.map((l) => ({
          product_id: l.product.id, quantity: Number(l.quantity) || 0, unit_type: l.unit_type,
          unit_cost: Number(l.unit_cost) || 0, expiry_date: l.expiry_date || null,
        })),
      })
      setCreating(false); setLines([]); setNotes('')
      void load()
    } catch (e) { setError(formatApiError(e, t('supplier_returns.failed') as string)) } finally { setBusy(false) }
  }

  const cancel = async (r: ReturnRow) => {
    if (!window.confirm(t('supplier_returns.cancel_confirm', { n: r.return_number }) as string)) return
    try { await api.post(`/supplier-returns/${r.id}/cancel`); void load() } catch (e) { setError(formatApiError(e, '')) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><Undo2 size={18} className="text-rose-600" />{t('supplier_returns.title')}</h2>
            <p className="text-xs text-slate-500">{t('supplier_returns.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            {!creating && (
              <button onClick={() => { setCreating(true); setError('') }}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5">
                <Plus size={15} />{t('supplier_returns.new')}
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4 text-sm">
          {error && <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

          {creating ? (
            <div className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600 font-medium">{t('supplier_returns.supplier')} *</span>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? +e.target.value : '')}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 bg-white">
                    <option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                {user?.role === 'admin' && branches.length > 1 && (
                  <label className="block">
                    <span className="text-xs text-slate-600 font-medium">{t('supplier_returns.branch')}</span>
                    <select value={branchId} onChange={(e) => { setBranchId(+e.target.value); setLines([]) }}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 bg-white">
                      {branches.map((b) => <option key={b.id} value={b.id}>{isAr ? b.name_ar : b.name_en}</option>)}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-xs text-slate-600 font-medium">{t('supplier_returns.reason')}</span>
                  <select value={reason} onChange={(e) => setReason(e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 bg-white">
                    {REASONS.map((r) => <option key={r} value={r}>{t(`supplier_returns.reason_${r}`)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-600 font-medium">{t('supplier_returns.notes')}</span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2" />
                </label>
              </div>

              <div className="relative">
                <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!supplierId}
                  placeholder={(supplierId ? t('supplier_returns.search') : t('supplier_returns.pick_supplier_first')) as string}
                  className="w-full border border-slate-300 rounded-lg ps-9 pe-3 py-2 disabled:bg-slate-50" />
                {hits.length > 0 && (
                  <div className="absolute z-10 inset-x-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {hits.map((p) => (
                      <button key={p.id} onClick={() => void addProduct(p)}
                        className="w-full text-start px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex justify-between">
                        <span className="font-medium">{isAr ? p.name_ar || p.name_en : p.name_en}</span>
                        <span className="text-xs text-slate-400 font-mono">{p.barcode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lines.length > 0 && (
                <div className="overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-start">{t('supplier_returns.item')}</th>
                        <th className="px-3 py-2 text-start">{t('supplier_returns.lot')}</th>
                        <th className="px-3 py-2 text-start">{t('supplier_returns.unit')}</th>
                        <th className="px-3 py-2 text-start">{t('supplier_returns.qty')}</th>
                        <th className="px-3 py-2 text-start">{t('supplier_returns.cost')}</th>
                        <th className="px-3 py-2 text-end">{t('supplier_returns.line_total')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={l.product.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold">{isAr ? l.product.name_ar || l.product.name_en : l.product.name_en}</td>
                          <td className="px-3 py-2">
                            <select value={l.expiry_date} onChange={(e) => patch(i, { expiry_date: e.target.value })}
                              className="border border-slate-300 rounded-md px-2 py-1 bg-white">
                              <option value="">{t('supplier_returns.earliest_first')}</option>
                              {l.lots.filter((x) => x.expiry_date).map((x) => (
                                <option key={x.expiry_date} value={x.expiry_date as string}>{lotLabel(x, l.product)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={l.unit_type} onChange={(e) => patch(i, { unit_type: e.target.value as SellUnit })}
                              className="border border-slate-300 rounded-md px-2 py-1 bg-white">
                              {sellUnitsOf(l.product).map((u) => <option key={u} value={u}>{unitName(l.product, u)}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={1} value={l.quantity} onChange={(e) => patch(i, { quantity: e.target.value === '' ? '' : +e.target.value })}
                              className="w-20 border border-slate-300 rounded-md px-2 py-1" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => patch(i, { unit_cost: e.target.value === '' ? '' : +e.target.value })}
                              className="w-24 border border-slate-300 rounded-md px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 text-end font-semibold tabular-nums">{formatMoney((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}</td>
                          <td className="px-2">
                            <button onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500">{t('supplier_returns.hint')}</p>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-400 py-10">{t('supplier_returns.empty')}</p>
          ) : (
            <div className="overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-start">#</th>
                    <th className="px-3 py-2 text-start">{t('supplier_returns.date')}</th>
                    <th className="px-3 py-2 text-start">{t('supplier_returns.supplier')}</th>
                    <th className="px-3 py-2 text-start">{t('supplier_returns.reason')}</th>
                    <th className="px-3 py-2 text-start">{t('supplier_returns.items')}</th>
                    <th className="px-3 py-2 text-end">{t('supplier_returns.total')}</th>
                    <th className="px-3 py-2 text-start">{t('supplier_returns.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2 font-mono">{r.return_number}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="px-3 py-2 font-semibold">{r.supplier_name}</td>
                      <td className="px-3 py-2">{r.reason ? t(`supplier_returns.reason_${r.reason}`) : '—'}</td>
                      <td className="px-3 py-2">{r.item_count}</td>
                      <td className="px-3 py-2 text-end font-semibold tabular-nums">{formatMoney(Number(r.total))}</td>
                      <td className="px-3 py-2">{t(`supplier_returns.status_${r.status}`)}</td>
                      <td className="px-2">
                        {r.status === 'done' && (
                          <button onClick={() => void cancel(r)} title={t('supplier_returns.cancel') as string}
                            className="p-1 text-slate-400 hover:text-red-600"><Ban size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {creating && (
          <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
            <span className="font-bold">{t('supplier_returns.total')}: {formatMoney(total)}</span>
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setLines([]) }} className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100">{t('common.cancel')}</button>
              <button onClick={() => void save()} disabled={busy || !supplierId || lines.length === 0 || lines.some((l) => !(Number(l.quantity) > 0))}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium disabled:opacity-50">
                {t('supplier_returns.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
