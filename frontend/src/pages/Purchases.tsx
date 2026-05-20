import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Plus, Eye, Check, X, Trash2 } from 'lucide-react'
import Header from '../components/Header'
import api, { purchasesAPI, suppliersAPI, branchesAPI, PurchaseOrder, Supplier, Branch, POItem } from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

type StatusFilter = '' | 'draft' | 'received' | 'cancelled'

export default function Purchases() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null)

  const load = () => {
    setLoading(true)
    purchasesAPI.list({ status: statusFilter || undefined })
      .then((r) => setPOs(r.data))
      .catch(() => setPOs([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    suppliersAPI.list().then((r) => setSuppliers(r.data)).catch(() => {})
    branchesAPI.list().then((r) => setBranches(r.data)).catch(() => {})
  }, [])
  useEffect(load, [statusFilter])

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-200 text-slate-700',
      received: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-red-100 text-red-700',
    }
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[s] || ''}`}>{t(`purchases.status_${s}`)}</span>
  }

  const handleReceive = async (id: number) => {
    if (!confirm(t('purchases.confirm_receive') as string)) return
    try { await purchasesAPI.receive(id); load(); setViewing(null) }
    catch (e: any) { alert(e.response?.data?.detail || 'Error') }
  }
  const handleCancel = async (id: number) => {
    if (!confirm(t('purchases.confirm_cancel') as string)) return
    try { await purchasesAPI.cancel(id); load(); setViewing(null) }
    catch (e: any) { alert(e.response?.data?.detail || 'Error') }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-pharma-600" />
            {t('purchases.title')}
          </h1>
          <button onClick={() => setCreating(true)} className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <Plus size={16} />{t('purchases.new')}
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          {(['', 'draft', 'received', 'cancelled'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                statusFilter === s ? 'bg-pharma-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}>
              {s === '' ? t('purchases.all') : t(`purchases.status_${s}`)}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('purchases.col_number')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_supplier')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_branch')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_invoice')}</th>
                <th className="px-3 py-2 text-end">{t('purchases.col_total')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_status')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_date')}</th>
                <th className="px-3 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && pos.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('purchases.empty')}</td></tr>}
              {pos.map((po) => (
                <tr key={po.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{po.po_number}</td>
                  <td className="px-3 py-2 font-medium">{po.supplier_name}</td>
                  <td className="px-3 py-2 text-slate-600">{i18n.language === 'ar' ? po.branch_name_ar : po.branch_name_en}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{po.supplier_invoice_number || '—'}</td>
                  <td className="px-3 py-2 text-end font-semibold">{Number(po.total).toFixed(2)}</td>
                  <td className="px-3 py-2">{statusBadge(po.status)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(po.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-end">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => purchasesAPI.get(po.id).then((r) => setViewing(r.data))} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title={t('common.view') as string}>
                        <Eye size={14} />
                      </button>
                      {po.status === 'draft' && (user?.role === 'admin' || user?.branch_id === po.branch_id) && (
                        <>
                          <button onClick={() => handleReceive(po.id)} className="p-1.5 hover:bg-emerald-100 rounded text-emerald-700" title={t('purchases.receive') as string}>
                            <Check size={14} />
                          </button>
                          <button onClick={() => handleCancel(po.id)} className="p-1.5 hover:bg-red-100 rounded text-red-700" title={t('purchases.cancel') as string}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {creating && (
        <CreatePOModal
          suppliers={suppliers}
          branches={branches}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load() }}
        />
      )}
      {viewing && (
        <PODetailModal
          po={viewing}
          onClose={() => setViewing(null)}
          onReceive={() => handleReceive(viewing.id)}
          onCancel={() => handleCancel(viewing.id)}
          canManage={user?.role === 'admin' || user?.branch_id === viewing.branch_id}
        />
      )}
    </div>
  )
}

function CreatePOModal({
  suppliers, branches, onClose, onSaved,
}: { suppliers: Supplier[]; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<number | ''>(user?.branch_id || '')
  const [invNum, setInvNum] = useState('')
  const [invDate, setInvDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [tax, setTax] = useState(0)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [items, setItems] = useState<POItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!branchId) { setResults([]); return }
    const tm = setTimeout(() => {
      api.get('/inventory/items', { params: { q: search, branch_id: branchId } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(tm)
  }, [search, branchId])

  const addItem = (p?: any) => {
    if (p) {
      if (items.find((i) => i.product_id === p.id)) return
      setItems([...items, { product_id: p.id, barcode: p.barcode, product_name_en: p.name_en, product_name_ar: p.name_ar, quantity: 1, unit_cost: p.cost || 0, expiry_date: null }])
    } else {
      // blank line for new product
      setItems([...items, { product_id: null, barcode: '', product_name_en: '', product_name_ar: '', quantity: 1, unit_cost: 0, expiry_date: null }])
    }
  }
  const update = (i: number, patch: Partial<POItem>) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const total = subtotal - discount + tax

  const submit = async () => {
    if (!supplierId || !branchId || items.length === 0) { alert(t('purchases.fill_required')); return }
    setSaving(true)
    try {
      await purchasesAPI.create({
        supplier_id: Number(supplierId),
        branch_id: Number(branchId),
        supplier_invoice_number: invNum || undefined,
        supplier_invoice_date: invDate || undefined,
        discount, tax, notes: notes || undefined,
        items: items.map((i) => ({
          product_id: i.product_id ?? undefined,
          barcode: i.barcode || undefined,
          product_name_ar: i.product_name_ar || undefined,
          product_name_en: i.product_name_en || undefined,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          expiry_date: i.expiry_date || undefined,
        })),
      })
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('purchases.new')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('purchases.supplier')}</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} className="input mt-1 w-full">
                <option value="">--</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('purchases.branch')}</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')} disabled={!isAdmin} className="input mt-1 w-full">
                <option value="">--</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{i18n.language === 'ar' ? b.name_ar : b.name_en}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('purchases.invoice_number')}</label>
              <input value={invNum} onChange={(e) => setInvNum(e.target.value)} className="input mt-1 w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('purchases.invoice_date')}</label>
              <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className="input mt-1 w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('purchases.discount')}</label>
              <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="input mt-1 w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('purchases.tax')}</label>
              <input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} className="input mt-1 w-full" />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{t('purchases.items')} ({items.length})</h3>
              <button onClick={() => addItem()} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded">+ {t('purchases.add_new_product')}</button>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!branchId}
              className="input w-full mb-2"
              placeholder={t('purchases.search_existing') as string}
            />
            {results.length > 0 && (
              <div className="mb-2 max-h-40 overflow-auto border border-slate-200 rounded-lg">
                {results.slice(0, 20).map((p) => (
                  <button key={p.id} onClick={() => addItem(p)} className="w-full px-3 py-1.5 text-start hover:bg-slate-50 text-sm border-b border-slate-100 flex justify-between">
                    <span>{i18n.language === 'ar' ? p.name_ar : p.name_en}</span>
                    <span className="text-xs text-slate-500">{p.barcode} · {t('purchases.cost')}: {p.cost}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                  <input className="input col-span-3 text-xs" placeholder={t('purchases.col_name') as string}
                         value={it.product_name_en || ''} onChange={(e) => update(i, { product_name_en: e.target.value })} />
                  <input className="input col-span-2 text-xs" placeholder={t('purchases.col_barcode') as string}
                         value={it.barcode || ''} onChange={(e) => update(i, { barcode: e.target.value })} />
                  <input type="number" min={1} className="input col-span-1 text-xs text-end" placeholder={t('purchases.qty') as string}
                         value={it.quantity} onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value)) })} />
                  <input type="number" min={0} step="0.01" className="input col-span-2 text-xs text-end" placeholder={t('purchases.cost') as string}
                         value={it.unit_cost} onChange={(e) => update(i, { unit_cost: Math.max(0, Number(e.target.value)) })} />
                  <input type="date" className="input col-span-3 text-xs" value={it.expiry_date || ''} onChange={(e) => update(i, { expiry_date: e.target.value })} />
                  <button onClick={() => remove(i)} className="p-1 hover:bg-red-100 rounded text-red-600 col-span-1 justify-self-end">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {items.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">{t('purchases.no_items')}</div>}
            </div>
          </div>

          <div className="mt-4 border-t pt-3 text-sm space-y-1 text-end">
            <div>{t('purchases.subtotal')}: <b>{subtotal.toFixed(2)}</b></div>
            <div className="text-base">{t('purchases.col_total')}: <b className="text-pharma-700">{total.toFixed(2)}</b></div>
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={submit} disabled={saving || items.length === 0} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('purchases.create_draft')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PODetailModal({ po, onClose, onReceive, onCancel, canManage }: {
  po: PurchaseOrder; onClose: () => void; onReceive: () => void; onCancel: () => void; canManage: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{po.po_number}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div><span className="text-slate-500">{t('purchases.supplier')}: </span><b>{po.supplier_name}</b></div>
            <div><span className="text-slate-500">{t('purchases.branch')}: </span><b>{i18n.language === 'ar' ? po.branch_name_ar : po.branch_name_en}</b></div>
            <div><span className="text-slate-500">{t('purchases.col_status')}: </span><b>{t(`purchases.status_${po.status}`)}</b></div>
            <div><span className="text-slate-500">{t('purchases.col_date')}: </span>{new Date(po.created_at).toLocaleString()}</div>
            {po.supplier_invoice_number && <div><span className="text-slate-500">{t('purchases.invoice_number')}: </span>{po.supplier_invoice_number}</div>}
            {po.supplier_invoice_date && <div><span className="text-slate-500">{t('purchases.invoice_date')}: </span>{po.supplier_invoice_date}</div>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('purchases.col_name')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_barcode')}</th>
                <th className="px-3 py-2 text-end">{t('purchases.qty')}</th>
                <th className="px-3 py-2 text-end">{t('purchases.cost')}</th>
                <th className="px-3 py-2 text-start">{t('purchases.col_expiry')}</th>
                <th className="px-3 py-2 text-end">{t('purchases.col_total')}</th>
              </tr>
            </thead>
            <tbody>
              {(po.items || []).map((it: any) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{i18n.language === 'ar' ? it.product_name_ar : it.product_name_en}</td>
                  <td className="px-3 py-2 font-mono text-xs">{it.barcode || '—'}</td>
                  <td className="px-3 py-2 text-end">{it.quantity}</td>
                  <td className="px-3 py-2 text-end">{Number(it.unit_cost).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">{it.expiry_date || '—'}</td>
                  <td className="px-3 py-2 text-end font-semibold">{Number(it.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-sm text-end space-y-1">
            <div>{t('purchases.subtotal')}: <b>{Number(po.subtotal).toFixed(2)}</b></div>
            <div>{t('purchases.discount')}: <b>{Number(po.discount).toFixed(2)}</b></div>
            <div>{t('purchases.tax')}: <b>{Number(po.tax).toFixed(2)}</b></div>
            <div className="text-base">{t('purchases.col_total')}: <b className="text-pharma-700">{Number(po.total).toFixed(2)}</b></div>
          </div>
        </div>
        {po.status === 'draft' && canManage && (
          <div className="px-5 py-3 border-t flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
              {t('purchases.cancel')}
            </button>
            <button onClick={onReceive} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">
              {t('purchases.receive')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
