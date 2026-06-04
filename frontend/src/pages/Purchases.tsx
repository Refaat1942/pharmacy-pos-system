import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Plus, Eye, Check, X, Trash2, AlertTriangle, FileDown, Search } from 'lucide-react'
import Layout from '../components/Layout'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import { LoadingSpinner } from '../components/LoadingSpinner'
import api, { purchasesAPI, suppliersAPI, branchesAPI, PurchaseOrder, Supplier, Branch, POItem, ReplenishmentItem } from '../lib/api'
import { useAuth } from '../lib/auth'
import DateInput from '../components/DateInput'
import { formatDateTime } from '../lib/formatDate'
import i18n from '../lib/i18n'
import { formatMoney, formatInt, formatNumber } from '../lib/formatNumber'

type StatusFilter = '' | 'draft' | 'received' | 'cancelled'

type POExpiryLot = { expiry_date: string; quantity: number }

type POItemDraft = POItem & { expiry_lots: POExpiryLot[] }

function defaultExpiryLots(qty = 1): POExpiryLot[] {
  return [{ expiry_date: '', quantity: qty }]
}

function lotsTotal(lots: POExpiryLot[]): number {
  return lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
}

function flattenPOItemsForApi(items: POItemDraft[]): POItem[] {
  return items.flatMap((it) => {
    const lots = (it.expiry_lots || []).filter((l) => (Number(l.quantity) || 0) > 0)
    if (lots.length === 0) {
      return [{
        ...it,
        expiry_date: it.expiry_date || undefined,
      }]
    }
    if (lots.length === 1 && !lots[0].expiry_date?.trim()) {
      return [{
        ...it,
        quantity: lots[0].quantity || it.quantity,
        expiry_date: undefined,
      }]
    }
    return lots.map((l) => ({
      ...it,
      quantity: Number(l.quantity) || 1,
      expiry_date: l.expiry_date?.trim() || undefined,
    }))
  })
}

function initialPOBranchId(userBranchId?: number | null): number | '' {
  if (userBranchId) return userBranchId
  const raw = localStorage.getItem('pharma_active_branch')
  if (raw && raw !== 'all') {
    const n = Number(raw)
    if (!Number.isNaN(n) && n > 0) return n
  }
  return ''
}

export default function Purchases() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [replenishing, setReplenishing] = useState(false)
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

  const quick = useQuickFilter(pos, [
    (p) => p.po_number,
    (p) => p.supplier_name,
    (p) => (i18n.language === 'ar' ? p.branch_name_ar : p.branch_name_en),
    (p) => p.supplier_invoice_number,
    (p) => t(`purchases.status_${p.status}`),
  ])
  const sortAccessors = useMemo(() => ({
    po_number: (p: PurchaseOrder) => p.po_number,
    supplier_name: (p: PurchaseOrder) => p.supplier_name,
    branch: (p: PurchaseOrder) => (i18n.language === 'ar' ? p.branch_name_ar : p.branch_name_en),
    supplier_invoice_number: (p: PurchaseOrder) => p.supplier_invoice_number,
    total: (p: PurchaseOrder) => Number(p.total || 0),
    status: (p: PurchaseOrder) => p.status,
    created_at: (p: PurchaseOrder) => p.created_at,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])
  const { sorted, sort, toggle } = useSort(quick.filtered, sortAccessors)

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-pharma-600" />
            {t('purchases.title')}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setReplenishing(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              title={t('purchases.replenish_hint') as string}
            >
              <AlertTriangle size={16} />{t('purchases.replenish')}
            </button>
            <button onClick={() => setCreating(true)} className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus size={16} />{t('purchases.new')}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['', 'draft', 'received', 'cancelled'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                statusFilter === s ? 'bg-pharma-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}>
              {s === '' ? t('purchases.all') : t(`purchases.status_${s}`)}
            </button>
          ))}
          <TableFilter value={quick.query} onChange={quick.setQuery} placeholder={t('common.filter_placeholder')} className="ms-auto w-64" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="po_number" sort={sort} onToggle={toggle} align="start">{t('purchases.col_number')}</SortTh>
                <SortTh k="supplier_name" sort={sort} onToggle={toggle} align="start">{t('purchases.col_supplier')}</SortTh>
                <SortTh k="branch" sort={sort} onToggle={toggle} align="start">{t('purchases.col_branch')}</SortTh>
                <SortTh k="supplier_invoice_number" sort={sort} onToggle={toggle} align="start">{t('purchases.col_invoice')}</SortTh>
                <SortTh k="total" sort={sort} onToggle={toggle} align="end">{t('purchases.col_total')}</SortTh>
                <SortTh k="status" sort={sort} onToggle={toggle} align="start">{t('purchases.col_status')}</SortTh>
                <SortTh k="created_at" sort={sort} onToggle={toggle} align="start">{t('purchases.col_date')}</SortTh>
                <th className="px-3 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && sorted.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('purchases.empty')}</td></tr>}
              {sorted.map((po) => (
                <tr key={po.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{po.po_number}</td>
                  <td className="px-3 py-2 font-medium">{po.supplier_name}</td>
                  <td className="px-3 py-2 text-slate-600">{i18n.language === 'ar' ? po.branch_name_ar : po.branch_name_en}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{po.supplier_invoice_number || '—'}</td>
                  <td className="px-3 py-2 text-end font-semibold">{formatMoney(po.total)}</td>
                  <td className="px-3 py-2">{statusBadge(po.status)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(po.created_at)}</td>
                  <td className="px-3 py-2 text-end">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => purchasesAPI.get(po.id).then((r) => setViewing(r.data))} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title={t('common.view') as string}>
                        <Eye size={14} />
                      </button>
                      {po.status === 'draft' && (user?.role === 'admin' || user?.branch_id === po.branch_id) && (
                        <button onClick={() => handleReceive(po.id)} className="p-1.5 hover:bg-emerald-100 rounded text-emerald-700" title={t('purchases.receive') as string}>
                          <Check size={14} />
                        </button>
                      )}
                      {po.status === 'draft' && user?.role === 'admin' && (
                        <button onClick={() => handleCancel(po.id)} className="p-1.5 hover:bg-red-100 rounded text-red-700" title={t('purchases.cancel') as string}>
                          <Trash2 size={14} />
                        </button>
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
      {replenishing && (
        <ReplenishmentModal
          suppliers={suppliers}
          branches={branches}
          onClose={() => setReplenishing(false)}
          onSaved={() => { setReplenishing(false); load() }}
        />
      )}
      {viewing && (
        <PODetailModal
          po={viewing}
          onClose={() => setViewing(null)}
          onReceive={() => handleReceive(viewing.id)}
          onCancel={() => handleCancel(viewing.id)}
          canReceive={user?.role === 'admin' || user?.branch_id === viewing.branch_id}
          canCancel={user?.role === 'admin'}
        />
      )}
    </Layout>
  )
}

function CreatePOModal({
  suppliers, branches, onClose, onSaved,
}: { suppliers: Supplier[]; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<number | ''>(() => initialPOBranchId(user?.branch_id))
  const [invNum, setInvNum] = useState('')
  const [invDate, setInvDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [tax, setTax] = useState(0)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [items, setItems] = useState<POItemDraft[]>([])
  const [saving, setSaving] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!branchId || !search.trim()) {
      setResults([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    const tm = setTimeout(() => {
      api.get('/inventory/items', { params: { q: search.trim(), branch_id: branchId } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]))
        .finally(() => setSearchLoading(false))
    }, 250)
    return () => clearTimeout(tm)
  }, [search, branchId])

  const addItem = (p?: any) => {
    if (p) {
      setItems((prev) => {
        const existing = prev.find((i) => i.product_id === p.id)
        if (existing) {
          return prev.map((i) => {
            if (i.product_id !== p.id) return i
            const lots = i.expiry_lots?.length
              ? i.expiry_lots.map((l, li, arr) =>
                  li === arr.length - 1
                    ? { ...l, quantity: (Number(l.quantity) || 0) + 1 }
                    : l,
                )
              : defaultExpiryLots(i.quantity + 1)
            const quantity = lotsTotal(lots)
            return { ...i, quantity, expiry_lots: lots }
          })
        }
        return [...prev, {
          product_id: p.id,
          barcode: p.barcode,
          product_name_en: p.name_en,
          product_name_ar: p.name_ar,
          quantity: 1,
          unit_cost: p.cost || 0,
          discount_pct: 0,
          vat_pct: 0,
          public_price: p.price ?? null,
          expiry_date: null,
          expiry_lots: defaultExpiryLots(1),
        }]
      })
      setSearch('')
      setResults([])
      setShowResults(false)
    } else {
      setItems((prev) => [...prev, {
        product_id: null,
        barcode: '',
        product_name_en: '',
        product_name_ar: '',
        quantity: 1,
        unit_cost: 0,
        discount_pct: 0,
        vat_pct: 0,
        public_price: null,
        expiry_date: null,
        expiry_lots: defaultExpiryLots(1),
      }])
    }
  }
  const update = (i: number, patch: Partial<POItemDraft>) =>
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it
      const next = { ...it, ...patch }
      if (patch.quantity != null && next.expiry_lots?.length === 1) {
        next.expiry_lots = [{ ...next.expiry_lots[0], quantity: patch.quantity }]
      }
      return next
    }))
  const updateLot = (itemIdx: number, lotIdx: number, patch: Partial<POExpiryLot>) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== itemIdx) return it
      const lots = it.expiry_lots.map((l, li) => (li === lotIdx ? { ...l, ...patch } : l))
      const qty = lotsTotal(lots)
      return { ...it, expiry_lots: lots, quantity: qty > 0 ? qty : it.quantity }
    }))
  }
  const addLot = (itemIdx: number) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== itemIdx) return it
      return { ...it, expiry_lots: [...it.expiry_lots, { expiry_date: '', quantity: 1 }] }
    }))
  }
  const removeLot = (itemIdx: number, lotIdx: number) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== itemIdx) return it
      const lots = it.expiry_lots.filter((_, li) => li !== lotIdx)
      const nextLots = lots.length > 0 ? lots : defaultExpiryLots(1)
      const qty = lotsTotal(nextLots)
      return { ...it, expiry_lots: nextLots, quantity: qty > 0 ? qty : 1 }
    }))
  }
  const remove = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i))

  const lineNet = (i: POItem) => i.quantity * i.unit_cost * (1 - (i.discount_pct || 0) / 100) * (1 + (i.vat_pct || 0) / 100)
  const subtotal = items.reduce((s, i) => s + lineNet(i), 0)
  const total = subtotal - discount + tax

  const submit = async () => {
    if (!supplierId || !branchId || items.length === 0) { alert(t('purchases.fill_required')); return }
    for (const it of items) {
      const lt = lotsTotal(it.expiry_lots)
      if (lt > 0 && lt !== it.quantity) {
        alert(t('purchases.expiry_lots_qty_mismatch', { name: it.product_name_en || it.barcode || '#' }) as string)
        return
      }
    }
    setSaving(true)
    try {
      const flat = flattenPOItemsForApi(items)
      await purchasesAPI.create({
        supplier_id: Number(supplierId),
        branch_id: Number(branchId),
        supplier_invoice_number: invNum || undefined,
        supplier_invoice_date: invDate || undefined,
        discount, tax, notes: notes || undefined,
        items: flat.map((i) => ({
          product_id: i.product_id ?? undefined,
          barcode: i.barcode || undefined,
          product_name_ar: i.product_name_ar || undefined,
          product_name_en: i.product_name_en || undefined,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          discount_pct: i.discount_pct || 0,
          vat_pct: i.vat_pct || 0,
          public_price: i.public_price ?? undefined,
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
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
              <DateInput value={invDate} onChange={setInvDate} className="input mt-1 w-full" />
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
              onChange={(e) => { setSearch(e.target.value); setShowResults(true) }}
              onFocus={() => {
                if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
                setShowResults(true)
              }}
              onBlur={() => {
                if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
                hideTimerRef.current = setTimeout(() => setShowResults(false), 200)
              }}
              disabled={!branchId}
              className="input w-full mb-2"
              placeholder={branchId ? (t('purchases.search_existing') as string) : (t('purchases.select_branch_first') as string)}
            />
            {!branchId && (
              <p className="text-xs text-amber-600 mb-2">{t('purchases.select_branch_first')}</p>
            )}
            {showResults && branchId && search.trim() && (
              <div className="mb-2 max-h-40 overflow-auto border border-slate-200 rounded-lg">
                {searchLoading && (
                  <div className="px-3 py-3 text-xs text-slate-500 flex items-center justify-center gap-2">
                    <LoadingSpinner size={16} />
                    {t('common.loading')}
                  </div>
                )}
                {!searchLoading && results.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addItem(p)}
                    className="w-full px-3 py-1.5 text-start hover:bg-slate-50 text-sm border-b border-slate-100 flex justify-between"
                  >
                    <span>{i18n.language === 'ar' ? p.name_ar : p.name_en}</span>
                    <span className="text-xs text-slate-500">{p.barcode} · {t('purchases.cost')}: {p.cost}</span>
                  </button>
                ))}
                {!searchLoading && results.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400 text-center">{t('purchases.no_results')}</div>
                )}
              </div>
            )}
            <div className="space-y-2">
              {items.length > 0 && (
                <div className="grid grid-cols-12 gap-2 px-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  <div className="col-span-2">{t('purchases.col_name')}</div>
                  <div className="col-span-2">{t('purchases.col_barcode')}</div>
                  <div className="col-span-1 text-end">{t('purchases.qty')}</div>
                  <div className="col-span-1 text-end">{t('purchases.cost')}</div>
                  <div className="col-span-1 text-end">{t('purchases.discount_pct')}</div>
                  <div className="col-span-1 text-end">{t('purchases.vat_pct')}</div>
                  <div className="col-span-1 text-end">{t('purchases.public_price')}</div>
                  <div className="col-span-3">{t('purchases.col_expiry')}</div>
                  <div className="col-span-1" />
                </div>
              )}
              {items.map((it, i) => {
                const lotSum = lotsTotal(it.expiry_lots)
                const qtyMismatch = lotSum > 0 && lotSum !== it.quantity
                return (
                <div key={i} className="bg-slate-50 p-2 rounded-lg space-y-2 border border-slate-100">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input className="input col-span-2 text-xs" placeholder={t('purchases.col_name') as string}
                           value={it.product_name_en || ''} onChange={(e) => update(i, { product_name_en: e.target.value })} />
                    <input className="input col-span-2 text-xs" placeholder={t('purchases.col_barcode') as string}
                           value={it.barcode || ''} onChange={(e) => update(i, { barcode: e.target.value })} />
                    <input type="number" min={1} className="input col-span-1 text-xs text-end" placeholder={t('purchases.qty') as string}
                           value={it.quantity} onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value)) })} />
                    <input type="number" min={0} step="0.01" className="input col-span-1 text-xs text-end" placeholder={t('purchases.cost') as string}
                           value={it.unit_cost} onChange={(e) => update(i, { unit_cost: Math.max(0, Number(e.target.value)) })} />
                    <input type="number" min={0} max={100} step="0.01" className="input col-span-1 text-xs text-end" placeholder="%"
                           value={it.discount_pct ?? 0} onChange={(e) => update(i, { discount_pct: Math.min(100, Math.max(0, Number(e.target.value))) })} />
                    <input type="number" min={0} step="0.01" className="input col-span-1 text-xs text-end" placeholder="%"
                           value={it.vat_pct ?? 0} onChange={(e) => update(i, { vat_pct: Math.max(0, Number(e.target.value)) })} />
                    <input type="number" min={0} step="0.01" className="input col-span-1 text-xs text-end" placeholder={t('purchases.public_price') as string}
                           value={it.public_price ?? ''} onChange={(e) => update(i, { public_price: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
                    <div className="col-span-2 text-[10px] text-slate-500 text-end">
                      {t('purchases.expiry_lots_sum')}: <b className={qtyMismatch ? 'text-red-600' : 'text-slate-800'}>{formatInt(lotSum)}</b>
                    </div>
                    <button onClick={() => remove(i)} className="p-1 hover:bg-red-100 rounded text-red-600 col-span-1 justify-self-end">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                        {t('purchases.expiry_lots_title')}
                      </span>
                      <button type="button" onClick={() => addLot(i)}
                        className="text-[10px] font-medium text-pharma-700 hover:underline inline-flex items-center gap-0.5">
                        <Plus size={12} /> {t('purchases.expiry_lot_add')}
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-800/90">{t('purchases.expiry_lots_hint')}</p>
                    {it.expiry_lots.map((lot, li) => (
                      <div key={li} className="flex flex-wrap items-center gap-2">
                        <DateInput className="input text-xs flex-1 min-w-[8rem]"
                          value={lot.expiry_date || ''}
                          onChange={(v) => updateLot(i, li, { expiry_date: v })} />
                        <input type="number" min={1} className="input text-xs w-20 text-end"
                          value={lot.quantity}
                          onChange={(e) => updateLot(i, li, { quantity: Math.max(1, Number(e.target.value)) })} />
                        <span className="text-[10px] text-slate-500">{t('purchases.qty')}</span>
                        {it.expiry_lots.length > 1 && (
                          <button type="button" onClick={() => removeLot(i, li)}
                            className="text-[10px] text-red-600 hover:underline">
                            {t('common.remove')}
                          </button>
                        )}
                      </div>
                    ))}
                    {qtyMismatch && (
                      <p className="text-[10px] text-red-700 font-medium">{t('purchases.expiry_lots_qty_mismatch_short')}</p>
                    )}
                  </div>
                </div>
              )})}
              {items.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">{t('purchases.no_items')}</div>}
            </div>
          </div>

          <div className="mt-4 border-t pt-3 text-sm space-y-1 text-end">
            <div>{t('purchases.subtotal')}: <b>{formatMoney(subtotal)}</b></div>
            <div className="text-base">{t('purchases.col_total')}: <b className="text-pharma-700">{formatMoney(total)}</b></div>
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

function PODetailModal({ po, onClose, onReceive, onCancel, canReceive, canCancel }: {
  po: PurchaseOrder; onClose: () => void; onReceive: () => void; onCancel: () => void; canReceive: boolean; canCancel: boolean
}) {
  const { t } = useTranslation()
  const items = po.items || []
  const poItemAccessors = useMemo(() => ({
    name: (it: POItem) => (i18n.language === 'ar' ? it.product_name_ar : it.product_name_en) || '',
    barcode: (it: POItem) => it.barcode || '',
    quantity: (it: POItem) => Number(it.quantity) || 0,
    unit_cost: (it: POItem) => Number(it.unit_cost) || 0,
    discount_pct: (it: POItem) => Number(it.discount_pct) || 0,
    vat_pct: (it: POItem) => Number(it.vat_pct) || 0,
    public_price: (it: POItem) => it.public_price == null ? null : Number(it.public_price),
    expiry_date: (it: POItem) => it.expiry_date || '',
    total: (it: POItem) => Number(it.total) || 0,
  }), [])
  const { sorted: sortedPoItems, sort: poItemSort, toggle: poItemToggle } = useSort(items, poItemAccessors)
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
            <div><span className="text-slate-500">{t('purchases.col_date')}: </span>{formatDateTime(po.created_at)}</div>
            {po.supplier_invoice_number && <div><span className="text-slate-500">{t('purchases.invoice_number')}: </span>{po.supplier_invoice_number}</div>}
            {po.supplier_invoice_date && <div><span className="text-slate-500">{t('purchases.invoice_date')}: </span>{po.supplier_invoice_date}</div>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="name" sort={poItemSort} onToggle={poItemToggle} align="start">{t('purchases.col_name')}</SortTh>
                <SortTh k="barcode" sort={poItemSort} onToggle={poItemToggle} align="start">{t('purchases.col_barcode')}</SortTh>
                <SortTh k="quantity" sort={poItemSort} onToggle={poItemToggle} align="end">{t('purchases.qty')}</SortTh>
                <SortTh k="unit_cost" sort={poItemSort} onToggle={poItemToggle} align="end">{t('purchases.cost')}</SortTh>
                <SortTh k="discount_pct" sort={poItemSort} onToggle={poItemToggle} align="end">{t('purchases.discount_pct')}</SortTh>
                <SortTh k="vat_pct" sort={poItemSort} onToggle={poItemToggle} align="end">{t('purchases.vat_pct')}</SortTh>
                <SortTh k="public_price" sort={poItemSort} onToggle={poItemToggle} align="end">{t('purchases.public_price')}</SortTh>
                <SortTh k="expiry_date" sort={poItemSort} onToggle={poItemToggle} align="start">{t('purchases.col_expiry')}</SortTh>
                <SortTh k="total" sort={poItemSort} onToggle={poItemToggle} align="end">{t('purchases.col_total')}</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortedPoItems.map((it: any) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{i18n.language === 'ar' ? it.product_name_ar : it.product_name_en}</td>
                  <td className="px-3 py-2 font-mono text-xs">{it.barcode || '—'}</td>
                  <td className="px-3 py-2 text-end">{formatInt(it.quantity)}</td>
                  <td className="px-3 py-2 text-end">{formatMoney(it.unit_cost)}</td>
                  <td className="px-3 py-2 text-end">{formatNumber(it.discount_pct || 0, { minDecimals: 2, maxDecimals: 2 })}%</td>
                  <td className="px-3 py-2 text-end">{formatNumber(it.vat_pct || 0, { minDecimals: 2, maxDecimals: 2 })}%</td>
                  <td className="px-3 py-2 text-end">{it.public_price != null ? formatMoney(it.public_price) : '—'}</td>
                  <td className="px-3 py-2 text-xs">{it.expiry_date || '—'}</td>
                  <td className="px-3 py-2 text-end font-semibold">{formatMoney(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-sm text-end space-y-1">
            <div>{t('purchases.subtotal')}: <b>{formatMoney(po.subtotal)}</b></div>
            <div>{t('purchases.discount')}: <b>{formatMoney(po.discount)}</b></div>
            <div>{t('purchases.tax')}: <b>{formatMoney(po.tax)}</b></div>
            <div className="text-base">{t('purchases.col_total')}: <b className="text-pharma-700">{formatMoney(po.total)}</b></div>
          </div>
        </div>
        {po.status === 'draft' && (canReceive || canCancel) && (
          <div className="px-5 py-3 border-t flex justify-end gap-2">
            {canCancel && (
              <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
                {t('purchases.cancel')}
              </button>
            )}
            {canReceive && (
              <button onClick={onReceive} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">
                {t('purchases.receive')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────── Replenishment / Auto-PO ───────────

interface ReplLine extends ReplenishmentItem {
  selected: boolean
  qty: number
  cost: number
}

function ReplenishmentModal({
  suppliers, branches, onClose, onSaved,
}: { suppliers: Supplier[]; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [branchId, setBranchId] = useState<number | ''>(user?.branch_id || '')
  const [supplierFilter, setSupplierFilter] = useState<number | ''>('')
  const [onlyZero, setOnlyZero] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<ReplLine[]>([])
  const [poSupplier, setPoSupplier] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [working, setWorking] = useState(false)

  const shouldFetch = Boolean(branchId) && (showAll || onlyZero || activeSearch.trim().length >= 2)

  const load = () => {
    if (!branchId) {
      setLines([])
      return
    }
    setLoading(true)
    purchasesAPI.replenishment({
      branch_id: Number(branchId),
      supplier_id: supplierFilter ? Number(supplierFilter) : undefined,
      only_zero: onlyZero || undefined,
      include_all: showAll || undefined,
      q: activeSearch.trim() || undefined,
    })
      .then((r) => setLines(r.data.map((it) => ({
        ...it,
        selected: it.needs_replenish !== false,
        qty: it.suggested_quantity,
        cost: Number(it.cost) || 0,
      }))))
      .catch(() => setLines([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!shouldFetch) {
      setLines([])
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, supplierFilter, onlyZero, showAll, activeSearch])

  useEffect(() => {
    const id = setTimeout(() => setActiveSearch(search.trim()), 400)
    return () => clearTimeout(id)
  }, [search])

  const update = (id: number, patch: Partial<ReplLine>) =>
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l))

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return lines
    return lines.filter((l) =>
      (l.name_en || '').toLowerCase().includes(term) ||
      (l.name_ar || '').toLowerCase().includes(term) ||
      (l.barcode || '').toLowerCase().includes(term) ||
      (l.supplier_name || '').toLowerCase().includes(term),
    )
  }, [lines, search])

  const replAccessors = useMemo(() => ({
    name: (l: ReplLine) => (i18n.language === 'ar' ? l.name_ar : l.name_en) || '',
    barcode: (l: ReplLine) => l.barcode || '',
    supplier: (l: ReplLine) => l.supplier_name || '',
    stock: (l: ReplLine) => Number(l.stock) || 0,
    min_stock: (l: ReplLine) => Number(l.min_stock) || 0,
    qty: (l: ReplLine) => Number(l.qty) || 0,
    cost: (l: ReplLine) => Number(l.cost) || 0,
    line_total: (l: ReplLine) => (Number(l.qty) || 0) * (Number(l.cost) || 0),
  }), [])
  const { sorted: sortedRepl, sort: replSort, toggle: replToggle } = useSort(
    filtered,
    replAccessors,
    { key: 'stock', dir: 'asc' },
  )

  const toggleAll = (v: boolean) => {
    const ids = new Set(sortedRepl.map((l) => l.id))
    setLines((prev) => prev.map((l) => ids.has(l.id) ? { ...l, selected: v } : l))
  }

  // When a PO supplier is chosen, lock out lines that belong to a *different* supplier
  // (lines with no supplier set remain selectable since they're "unassigned").
  useEffect(() => {
    if (!poSupplier) return
    setLines((prev) => prev.map((l) => (
      l.supplier_id && l.supplier_id !== Number(poSupplier)
        ? { ...l, selected: false }
        : l
    )))
  }, [poSupplier])

  const selected = lines.filter((l) => l.selected && l.qty > 0)
  const totalCost = useMemo(
    () => selected.reduce((s, l) => s + l.qty * l.cost, 0),
    [selected],
  )
  const allSelected = sortedRepl.length > 0 && sortedRepl.every((l) => l.selected)

  const downloadExcel = async () => {
    if (selected.length === 0) { alert(t('purchases.repl_select_items')); return }
    setWorking(true)
    try {
      const res = await purchasesAPI.exportReplenishment({
        supplier_id: poSupplier ? Number(poSupplier) : undefined,
        branch_id: branchId ? Number(branchId) : undefined,
        notes: notes || undefined,
        items: selected.map((l) => ({ product_id: l.id, quantity: l.qty, unit_cost: l.cost })),
      })
      const blob = new Blob([res.data as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const sup = suppliers.find((s) => s.id === Number(poSupplier))
      a.download = `PO_${(sup?.name || 'all').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setWorking(false) }
  }

  const createDraftPO = async () => {
    if (!poSupplier) { alert(t('purchases.repl_need_supplier')); return }
    if (!branchId) { alert(t('purchases.repl_need_branch')); return }
    if (selected.length === 0) { alert(t('purchases.repl_select_items')); return }
    setWorking(true)
    try {
      const r = await purchasesAPI.create({
        supplier_id: Number(poSupplier),
        branch_id: Number(branchId),
        notes: notes || undefined,
        items: selected.map((l) => ({
          product_id: l.id,
          barcode: l.barcode || undefined,
          product_name_ar: l.name_ar,
          product_name_en: l.name_en,
          quantity: l.qty,
          unit_cost: l.cost,
          expiry_date: undefined,
        })),
      })
      alert(`${t('purchases.repl_po_created')}: ${r.data.po_number}`)
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setWorking(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} />
            {t('purchases.replenish_title')}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b bg-slate-50 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('purchases.branch')}</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
              disabled={!isAdmin}
              className="input w-full mt-1"
            >
              <option value="">{t('purchases.all_branches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{i18n.language === 'ar' ? b.name_ar : b.name_en}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('purchases.filter_supplier')}</label>
            <select
              value={supplierFilter}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : ''
                setSupplierFilter(v)
                // Mirror filter into the PO supplier so the draft PO + Excel header are consistent
                if (v) setPoSupplier(v)
              }}
              className="input w-full mt-1"
            >
              <option value="">{t('purchases.all_suppliers')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
              <input type="checkbox" checked={onlyZero} disabled={showAll} onChange={(e) => setOnlyZero(e.target.checked)} />
              {t('purchases.only_out_of_stock')}
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
              <input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); if (e.target.checked) setOnlyZero(false) }} />
              {t('inventory.show_all_items')}
            </label>
          </div>
          <div className="flex items-end justify-end text-xs text-slate-500">
            {shouldFetch
              ? `${filtered.length} ${showAll ? t('purchases.items_total') : t('purchases.items_need')}`
              : t('inventory.search_or_show_all_hint')}
          </div>
        </div>

        <div className="px-5 py-2 border-b bg-white">
          <div className="relative">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('purchases.search_items') as string}
              className="input w-full ps-9"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">{t('inventory.search_or_show_all_hint')}</p>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && <div className="text-center py-10 text-slate-400">{t('common.loading')}</div>}
          {!loading && !shouldFetch && (
            <div className="text-center py-10 text-slate-500 text-sm px-6">
              {t('inventory.search_or_show_all_hint')}
            </div>
          )}
          {!loading && shouldFetch && lines.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              <Check size={32} className="mx-auto mb-2 text-emerald-500" />
              {t('purchases.repl_all_ok')}
            </div>
          )}
          {!loading && lines.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  <SortTh k="name" sort={replSort} onToggle={replToggle} align="start">{t('purchases.col_name')}</SortTh>
                  <SortTh k="barcode" sort={replSort} onToggle={replToggle} align="start">{t('purchases.col_barcode')}</SortTh>
                  <SortTh k="supplier" sort={replSort} onToggle={replToggle} align="start">{t('purchases.col_supplier')}</SortTh>
                  <SortTh k="stock" sort={replSort} onToggle={replToggle} align="end">{t('purchases.in_stock')}</SortTh>
                  <SortTh k="min_stock" sort={replSort} onToggle={replToggle} align="end">{t('purchases.min_stock')}</SortTh>
                  <SortTh k="qty" sort={replSort} onToggle={replToggle} align="end">{t('purchases.order_qty')}</SortTh>
                  <SortTh k="cost" sort={replSort} onToggle={replToggle} align="end">{t('purchases.cost')}</SortTh>
                  <SortTh k="line_total" sort={replSort} onToggle={replToggle} align="end">{t('purchases.line_total')}</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortedRepl.map((l) => (
                  <tr key={l.id} className={`border-t border-slate-100 ${l.stock <= 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={l.selected} onChange={(e) => update(l.id, { selected: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2">{i18n.language === 'ar' ? l.name_ar : l.name_en}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.barcode || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{l.supplier_name || t('purchases.unassigned_supplier')}</td>
                    <td className={`px-3 py-2 text-end ${l.stock <= 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                      {l.stock} {l.unit_label}
                    </td>
                    <td className="px-3 py-2 text-end text-slate-500">{l.min_stock}</td>
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => update(l.id, { qty: Math.max(1, Number(e.target.value)) })}
                        className="input w-20 text-end"
                      />
                    </td>
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.cost}
                        onChange={(e) => update(l.id, { cost: Math.max(0, Number(e.target.value)) })}
                        className="input w-24 text-end"
                      />
                    </td>
                    <td className="px-3 py-2 text-end font-semibold">{formatMoney(l.qty * l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Action bar */}
        <div className="border-t bg-slate-50 px-5 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('purchases.supplier')}</label>
            <select
              value={poSupplier}
              onChange={(e) => setPoSupplier(e.target.value ? Number(e.target.value) : '')}
              className="input w-full mt-1"
            >
              <option value="">--</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 font-medium">{t('purchases.notes_optional')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full mt-1" />
          </div>
          <div className="text-end">
            <div className="text-xs text-slate-500">{t('purchases.selected_total')}</div>
            <div className="text-lg font-bold text-pharma-700">{formatMoney(totalCost)}</div>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={downloadExcel}
            disabled={working || selected.length === 0}
            className="px-4 py-2 text-sm rounded-lg border border-emerald-200 bg-white text-emerald-700 font-medium hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-2"
          >
            <FileDown size={14} />
            {t('purchases.download_excel')}
          </button>
          <button
            onClick={createDraftPO}
            disabled={working || selected.length === 0 || !poSupplier}
            className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50"
          >
            {working ? t('common.saving') : t('purchases.create_draft_po')}
          </button>
        </div>
      </div>
    </div>
  )
}
