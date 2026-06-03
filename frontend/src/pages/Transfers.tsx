import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Plus, Check, X, Eye, Trash2, ScanLine, Printer } from 'lucide-react'
import Layout from '../components/Layout'
import { branchesAPI, transfersAPI, Branch, Transfer, TransferItem } from '../lib/api'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'

type StatusFilter = '' | 'in_transit' | 'completed' | 'cancelled'

export default function Transfers() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [viewing, setViewing] = useState<Transfer | null>(null)

  const load = () => {
    setLoading(true)
    transfersAPI
      .list(statusFilter || undefined)
      .then((r) => setTransfers(r.data))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    branchesAPI.list().then((r) => setBranches(r.data)).catch(() => {})
  }, [])
  useEffect(load, [statusFilter])

  const branchName = (b?: Branch | null) =>
    b ? (i18n.language === 'ar' ? b.name_ar : b.name_en) : '—'

  const isAr = i18n.language === 'ar'
  const fromName = (t2: Transfer) => (isAr ? t2.from_name_ar : t2.from_name_en) || ''
  const toName = (t2: Transfer) => (isAr ? t2.to_name_ar : t2.to_name_en) || ''
  const filter = useQuickFilter(transfers, [
    (t2) => t2.transfer_number,
    (t2) => fromName(t2),
    (t2) => toName(t2),
    (t2) => t2.status,
  ])
  const accessors = useMemo(() => ({
    number: (t2: Transfer) => t2.transfer_number,
    from: (t2: Transfer) => fromName(t2),
    to: (t2: Transfer) => toName(t2),
    status: (t2: Transfer) => t2.status,
    date: (t2: Transfer) => t2.created_at,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [isAr])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      in_transit: 'bg-amber-100 text-amber-800',
      completed: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-slate-200 text-slate-600',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[s] || ''}`}>
        {t(`transfers.status_${s}`, { defaultValue: s })}
      </span>
    )
  }

  const handleReceive = async (id: number) => {
    if (!confirm(t('transfers.confirm_receive') as string)) return
    try {
      await transfersAPI.receive(id)
      load()
      setViewing(null)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    }
  }
  const handleCancel = async (id: number) => {
    if (!confirm(t('transfers.confirm_cancel') as string)) return
    try {
      await transfersAPI.cancel(id)
      load()
      setViewing(null)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    }
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="text-pharma-600" />
            {t('transfers.title')}
          </h1>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Plus size={16} />
            {t('transfers.new')}
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['', 'in_transit', 'completed', 'cancelled'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                statusFilter === s
                  ? 'bg-pharma-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s === '' ? t('transfers.all') : t(`transfers.status_${s}`)}
            </button>
          ))}
          <TableFilter value={filter.query} onChange={filter.setQuery}
            placeholder={t('common.filter_placeholder') as string} className="ms-auto w-full md:w-64" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="number" sort={sort} onToggle={toggle} align="start">{t('transfers.col_number')}</SortTh>
                <SortTh k="from" sort={sort} onToggle={toggle} align="start">{t('transfers.col_from')}</SortTh>
                <SortTh k="to" sort={sort} onToggle={toggle} align="start">{t('transfers.col_to')}</SortTh>
                <SortTh k="status" sort={sort} onToggle={toggle} align="start">{t('transfers.col_status')}</SortTh>
                <SortTh k="date" sort={sort} onToggle={toggle} align="start">{t('transfers.col_date')}</SortTh>
                <th className="px-3 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('transfers.empty')}</td></tr>
              )}
              {sorted.map((t2) => (
                <tr key={t2.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{t2.transfer_number}</td>
                  <td className="px-3 py-2">{i18n.language === 'ar' ? t2.from_name_ar : t2.from_name_en}</td>
                  <td className="px-3 py-2">{i18n.language === 'ar' ? t2.to_name_ar : t2.to_name_en}</td>
                  <td className="px-3 py-2">{statusBadge(t2.status)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(t2.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-end">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => transfersAPI.get(t2.id).then((r) => setViewing(r.data))}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                        title={t('common.view') as string}
                      >
                        <Eye size={14} />
                      </button>
                      {t2.status === 'in_transit' && (user?.role === 'admin' || user?.branch_id === t2.to_branch_id) && (
                        <button
                          onClick={() => handleReceive(t2.id)}
                          className="p-1.5 hover:bg-emerald-100 rounded text-emerald-700"
                          title={t('transfers.receive') as string}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {t2.status === 'in_transit' && user?.role === 'admin' && (
                        <button
                          onClick={() => handleCancel(t2.id)}
                          className="p-1.5 hover:bg-red-100 rounded text-red-700"
                          title={t('transfers.cancel') as string}
                        >
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

      {showCreate && (
        <CreateTransferModal
          branches={branches}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}

      {viewing && (
        <TransferDetailModal
          transfer={viewing}
          onClose={() => setViewing(null)}
          onReceive={() => handleReceive(viewing.id)}
          onCancel={() => handleCancel(viewing.id)}
          canReceive={user?.role === 'admin' || user?.branch_id === viewing.to_branch_id}
          canCancel={user?.role === 'admin'}
        />
      )}
    </Layout>
  )
}

interface CartLine {
  product_id: number
  name_en: string
  name_ar: string
  barcode: string
  international_barcode?: string | null
  stock: number
  quantity: number
  unit: string
  sub_unit?: string | null
  pack_size?: number | null
}

function unitLabel(l: { unit: string; sub_unit?: string | null; pack_size?: number | null }) {
  return (l.pack_size && l.pack_size > 1 && l.sub_unit) ? l.sub_unit : (l.unit || 'unit')
}

function CreateTransferModal({
  branches,
  onClose,
  onSaved,
}: {
  branches: Branch[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [fromBranch, setFromBranch] = useState<number | ''>(user?.branch_id || '')
  const [toBranch, setToBranch] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [showResults, setShowResults] = useState(false)
  const [lines, setLines] = useState<CartLine[]>([])
  const [saving, setSaving] = useState(false)
  const [scan, setScan] = useState('')
  const [scanError, setScanError] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { scanRef.current?.focus() }, [fromBranch])

  useEffect(() => {
    if (!fromBranch) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      api
        .get('/inventory/items', { params: { q: search, branch_id: fromBranch } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [search, fromBranch])

  const addLine = (p: any, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id)
      if (existing) {
        const next = Math.min(p.stock, existing.quantity + qty)
        return prev.map((l) => l.product_id === p.id ? { ...l, quantity: next } : l)
      }
      return [...prev, {
        product_id: p.id,
        name_en: p.name_en,
        name_ar: p.name_ar,
        barcode: p.barcode,
        international_barcode: p.international_barcode,
        stock: p.stock,
        quantity: Math.min(p.stock, qty) || 1,
        unit: p.unit,
        sub_unit: p.sub_unit,
        pack_size: p.pack_size,
      }]
    })
  }
  const updateQty = (pid: number, qty: number) =>
    setLines(lines.map((l) => l.product_id === pid ? { ...l, quantity: qty } : l))
  const removeLine = (pid: number) => setLines(lines.filter((l) => l.product_id !== pid))

  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = scan.trim()
    if (!code || !fromBranch) return
    setScanError('')
    try {
      const r = await api.get('/inventory/items', { params: { q: code, branch_id: fromBranch } })
      const norm = code.toLowerCase()
      const exact = r.data.find((p: any) => (p.barcode || '').trim().toLowerCase() === norm)
      let p = exact || (r.data.length === 1 ? r.data[0] : null)
      if (!p) {
        setScanError(
          r.data.length > 1
            ? (t('transfers.scan_ambiguous') as string)
            : (t('transfers.scan_not_found') as string)
        )
        return
      }
      if (Number(p.stock) <= 0) {
        setScanError(t('transfers.scan_no_stock') as string)
        return
      }
      addLine(p, 1)
      setScan('')
    } catch {
      setScanError(t('transfers.scan_not_found') as string)
    }
  }

  const submit = async () => {
    if (!fromBranch || !toBranch || lines.length === 0) {
      alert(t('transfers.fill_required'))
      return
    }
    if (fromBranch === toBranch) {
      alert(t('transfers.same_branch_error'))
      return
    }
    setSaving(true)
    try {
      await transfersAPI.create({
        from_branch_id: Number(fromBranch),
        to_branch_id: Number(toBranch),
        items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        notes: notes || undefined,
      })
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('transfers.new')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('transfers.from_branch')}</label>
              <select
                value={fromBranch}
                onChange={(e) => setFromBranch(e.target.value ? Number(e.target.value) : '')}
                disabled={!isAdmin}
                className="input mt-1 w-full"
              >
                <option value="">--</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {i18n.language === 'ar' ? b.name_ar : b.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('transfers.to_branch')}</label>
              <select
                value={toBranch}
                onChange={(e) => setToBranch(e.target.value ? Number(e.target.value) : '')}
                className="input mt-1 w-full"
              >
                <option value="">--</option>
                {branches.filter((b) => b.id !== fromBranch).map((b) => (
                  <option key={b.id} value={b.id}>
                    {i18n.language === 'ar' ? b.name_ar : b.name_en}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-slate-600 font-medium">{t('transfers.notes')}</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input mt-1 w-full"
              placeholder={t('transfers.notes_placeholder') as string}
            />
          </div>

          <div className="border-t pt-4 mt-2">
            <label className="text-xs text-slate-600 font-medium flex items-center gap-1">
              <ScanLine size={14} className="text-pharma-600" />
              {t('transfers.scan')}
            </label>
            <div className="flex gap-2 mt-1">
              <input
                ref={scanRef}
                value={scan}
                onChange={(e) => { setScan(e.target.value); setScanError('') }}
                onKeyDown={handleScan}
                disabled={!fromBranch}
                className="input flex-1 font-mono"
                placeholder={t('transfers.scan_placeholder') as string}
                autoComplete="off"
              />
            </div>
            {scanError && <div className="text-xs text-red-600 mt-1">{scanError}</div>}
            <p className="text-[11px] text-slate-400 mt-1">{t('transfers.scan_hint')}</p>
          </div>

          <div className="border-t pt-4 mt-4">
            <label className="text-xs text-slate-600 font-medium">{t('transfers.add_products')}</label>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowResults(true) }}
              onFocus={() => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); setShowResults(true) }}
              onBlur={() => {
                if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
                hideTimerRef.current = setTimeout(() => setShowResults(false), 200)
              }}
              disabled={!fromBranch}
              className="input mt-1 w-full"
              placeholder={t('transfers.search_placeholder') as string}
            />
            {showResults && fromBranch && (
              <div className="mt-2 max-h-56 overflow-auto border border-slate-200 rounded-lg">
                {results.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addLine(p)}
                    className="w-full px-3 py-2 text-start hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <div className="text-sm font-medium text-slate-800 truncate">{i18n.language === 'ar' ? p.name_ar : p.name_en}</div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs font-mono text-slate-600 tabular-nums">
                        {p.barcode}
                        {p.international_barcode ? ` · ${p.international_barcode}` : ''}
                      </span>
                      <span className="text-xs text-slate-500 shrink-0">{t('transfers.stock')}: {p.stock} {unitLabel(p)}</span>
                    </div>
                  </button>
                ))}
                {results.length === 0 && (
                  <div className="px-3 py-3 text-xs text-slate-400 text-center">{t('transfers.no_results')}</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('transfers.items')} ({lines.length})</h3>
            {lines.length === 0 && <div className="text-sm text-slate-400 py-3 text-center">{t('transfers.no_items')}</div>}
            {lines.map((l) => (
              <div key={l.product_id} className="flex items-center gap-2 py-2 border-b border-slate-100">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i18n.language === 'ar' ? l.name_ar : l.name_en}</div>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono text-slate-600 tabular-nums">{l.barcode}{l.international_barcode ? ` · ${l.international_barcode}` : ''}</span> · {t('transfers.stock')}: {l.stock} {unitLabel(l)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={l.stock}
                    value={l.quantity}
                    onChange={(e) => updateQty(l.product_id, Math.max(1, Math.min(l.stock, Number(e.target.value))))}
                    className="input w-20 text-end"
                  />
                  <span className="text-xs text-slate-500 w-12">{unitLabel(l)}</span>
                </div>
                <button onClick={() => removeLine(l.product_id)} className="p-1.5 hover:bg-red-100 rounded text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={saving || lines.length === 0 || !fromBranch || !toBranch}
            className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('transfers.create')}
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferDetailModal({
  transfer,
  onClose,
  onReceive,
  onCancel,
  canReceive,
  canCancel,
}: {
  transfer: Transfer
  onClose: () => void
  onReceive: () => void
  onCancel: () => void
  canReceive: boolean
  canCancel: boolean
}) {
  const { t } = useTranslation()
  const isAr = i18n.language === 'ar'
  const dir: 'rtl' | 'ltr' = isAr ? 'rtl' : 'ltr'
  const tr = (k: string) => i18n.getFixedT(isAr ? 'ar' : 'en')(k)
  const items = transfer.items || []
  const itemAccessors = useMemo(() => ({
    name: (it: TransferItem) => (isAr ? it.product_name_ar : it.product_name_en) || '',
    barcode: (it: TransferItem) => it.barcode || '',
    quantity: (it: TransferItem) => Number(it.quantity) || 0,
  }), [isAr])
  const { sorted: sortedItems, sort: itemSort, toggle: itemToggle } = useSort(items, itemAccessors)
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  const fromName = isAr ? transfer.from_name_ar : transfer.from_name_en
  const toName = isAr ? transfer.to_name_ar : transfer.to_name_en
  const sentByName = isAr ? transfer.created_by_name_ar : transfer.created_by_name_en
  const handlePrint = () => window.print()
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col no-print">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{transfer.transfer_number}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 text-slate-700"
            >
              <Printer size={15} />
              {t('transfers.print')}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
          </div>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div><span className="text-slate-500">{t('transfers.col_from')}: </span><b>{i18n.language === 'ar' ? transfer.from_name_ar : transfer.from_name_en}</b></div>
            <div><span className="text-slate-500">{t('transfers.col_to')}: </span><b>{i18n.language === 'ar' ? transfer.to_name_ar : transfer.to_name_en}</b></div>
            <div><span className="text-slate-500">{t('transfers.col_status')}: </span><b>{t(`transfers.status_${transfer.status}`)}</b></div>
            <div><span className="text-slate-500">{t('transfers.col_date')}: </span>{new Date(transfer.created_at).toLocaleString()}</div>
            {transfer.notes && <div className="col-span-2"><span className="text-slate-500">{t('transfers.notes')}: </span>{transfer.notes}</div>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="name" sort={itemSort} onToggle={itemToggle} align="start">{t('transfers.product')}</SortTh>
                <SortTh k="barcode" sort={itemSort} onToggle={itemToggle} align="start">{t('transfers.col_barcode')}</SortTh>
                <SortTh k="quantity" sort={itemSort} onToggle={itemToggle} align="end">{t('transfers.quantity')}</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((it: TransferItem) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{i18n.language === 'ar' ? it.product_name_ar : it.product_name_en}</td>
                  <td className="px-3 py-2 text-xs font-mono">{it.barcode || '—'}</td>
                  <td className="px-3 py-2 text-end font-semibold">
                    {it.quantity} <span className="text-xs font-normal text-slate-500">{it.unit_label || ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transfer.status === 'in_transit' && (
          <div className="px-5 py-3 border-t flex justify-end gap-2">
            {canCancel && (
              <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
                {t('transfers.cancel')}
              </button>
            )}
            {canReceive && (
              <button onClick={onReceive} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">
                {t('transfers.receive')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="receipt-print print-only" dir={dir} style={{ width: '80mm', padding: '4mm', color: '#000', fontSize: '12px', lineHeight: 1.5 }}>
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{tr('transfers.slip_title')}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '2px' }}>{transfer.transfer_number}</div>
        </div>
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.col_from')}</span><b>{fromName}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.col_to')}</span><b>{toName}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.col_status')}</span><span>{tr(`transfers.status_${transfer.status}`)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.col_date')}</span><span>{new Date(transfer.created_at).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span></div>
          {sentByName && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.sent_by')}</span><span>{sentByName}</span></div>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'start', padding: '2px 0' }}>{tr('transfers.product')}</th>
              <th style={{ textAlign: 'end', padding: '2px 0', whiteSpace: 'nowrap' }}>{tr('transfers.quantity')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ borderBottom: '1px dotted #999' }}>
                <td style={{ padding: '3px 0' }}>
                  <div>{isAr ? it.product_name_ar : it.product_name_en}</div>
                  {it.barcode && <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#444' }}>{it.barcode}</div>}
                </td>
                <td style={{ textAlign: 'end', padding: '3px 0', whiteSpace: 'nowrap', fontWeight: 700 }}>
                  {it.quantity} <span style={{ fontWeight: 400, fontSize: '10px' }}>{it.unit_label || ''}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.total_items')}</span><b>{items.length}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tr('transfers.total_qty')}</span><b>{totalQty}</b></div>
        </div>
        {transfer.notes && (
          <div style={{ marginBottom: '10px' }}>
            <b>{tr('transfers.notes')}: </b>{transfer.notes}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '18px' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '3px', fontSize: '11px' }}>{tr('transfers.sent_by')}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '3px', fontSize: '11px' }}>{tr('transfers.received_sig')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
