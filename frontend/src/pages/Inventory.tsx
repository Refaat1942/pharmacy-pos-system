import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Edit2, Trash2, History, Sliders, AlertTriangle, TrendingUp, FileSpreadsheet, X, Wand2, Printer } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import BarcodeDesigner from '../components/BarcodeDesigner'
import BulkBarcodePrint from '../components/BulkBarcodePrint'
import { useAuth } from '../lib/auth'

type Product = {
  id: number
  barcode: string | null
  name_ar: string
  name_en: string
  category: string | null
  unit: string
  price: number
  cost: number | null
  stock: number
  min_stock: number
  expiry_date: string | null
  branch_id: number | null
  active: boolean
  branch_name_en?: string
  branch_name_ar?: string
  pack_size?: number | null
  sub_unit?: string | null
  sub_price?: number | null
}

type Movement = {
  id: number
  product_id: number
  movement_type: string
  quantity: number
  balance_after: number
  reason: string | null
  user_name_en: string | null
  user_name_ar: string | null
  branch_name_en: string | null
  branch_name_ar: string | null
  created_at: string
}

type Tab = 'items' | 'branch_stock' | 'movements' | 'velocity' | 'alerts'

type BranchStockRow = {
  key: string
  barcode: string | null
  name_en: string
  name_ar: string
  category: string | null
  unit: string
  total_stock: number
  total_min: number
  branches: { branch_id: number; branch_name_en: string; branch_name_ar: string; stock: number; min_stock: number; product_id: number | null }[]
}

const STANDARD_CATEGORIES = [
  'Medicine',
  'Cosmetics',
  'Medical Supplies',
  'Baby Care',
  'Personal Care',
  'Supplements',
  'Other',
] as const

export default function Inventory() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [tab, setTab] = useState<Tab>('items')
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [stockFilter, setStockFilter] = useState<'' | 'low' | 'zero' | 'ok'>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Product | null>(null)
  const [adjustItem, setAdjustItem] = useState<Product | null>(null)
  const [historyItem, setHistoryItem] = useState<Product | null>(null)
  const [showExcel, setShowExcel] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showBulkPrint, setShowBulkPrint] = useState(false)

  const toggleOne = (id: number) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleAll = () => {
    setSelected(s => {
      const visibleIds = items.map(i => i.id)
      const allSelected = visibleIds.every(id => s.has(id))
      if (allSelected) {
        const n = new Set(s); visibleIds.forEach(id => n.delete(id)); return n
      }
      const n = new Set(s); visibleIds.forEach(id => n.add(id)); return n
    })
  }

  const loadItems = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (q) params.q = q
      if (stockFilter) params.stock_filter = stockFilter
      if (categoryFilter) params.category = categoryFilter
      const { data } = await api.get('/inventory/items', { params })
      setItems(data)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    const { data } = await api.get('/inventory/categories')
    setCategories(data)
  }

  useEffect(() => {
    if (tab === 'items') {
      loadItems()
      loadCategories()
    }
  }, [tab])

  // Debounced search
  useEffect(() => {
    if (tab !== 'items') return
    const id = setTimeout(loadItems, 300)
    return () => clearTimeout(id)
  }, [q, stockFilter, categoryFilter])

  const stats = useMemo(() => {
    const total = items.length
    const low = items.filter(i => i.stock > 0 && i.stock <= i.min_stock).length
    const zero = items.filter(i => i.stock <= 0).length
    const totalValue = items.reduce((s, i) => s + Number(i.stock) * Number(i.cost || 0), 0)
    return { total, low, zero, totalValue }
  }, [items])

  const onDelete = async (id: number) => {
    if (!confirm(t('inventory.confirm_delete') as string)) return
    await api.delete(`/inventory/products/${id}`)
    loadItems()
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full">
        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">{t('inventory.title')}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          {([
            ['items', t('inventory.tab_items')],
            ['branch_stock', t('inventory.tab_branch_stock')],
            ['movements', t('inventory.tab_movements')],
            ['velocity', t('inventory.tab_velocity')],
            ['alerts', t('inventory.tab_alerts')],
          ] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                tab === k
                  ? 'border-pharma-600 text-pharma-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'items' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label={t('inventory.stat_total')} value={stats.total} color="slate" />
              <StatCard label={t('inventory.stat_low')} value={stats.low} color="amber" />
              <StatCard label={t('inventory.stat_zero')} value={stats.zero} color="red" />
              <StatCard
                label={t('inventory.stat_value')}
                value={`${stats.totalValue.toFixed(0)} ${t('pos.egp')}`}
                color="emerald"
              />
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-64 relative">
                <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                <input
                  type="text"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder={t('inventory.search_placeholder') as string}
                  className="w-full ps-9 pe-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pharma-500 focus:border-pharma-500 text-sm"
                />
              </div>
              <select
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pharma-500"
              >
                <option value="">{t('inventory.filter_all_stock')}</option>
                <option value="ok">{t('inventory.filter_ok')}</option>
                <option value="low">{t('inventory.filter_low')}</option>
                <option value="zero">{t('inventory.filter_zero')}</option>
              </select>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pharma-500"
              >
                <option value="">{t('inventory.filter_all_categories')}</option>
                {STANDARD_CATEGORIES.map(c => <option key={c} value={c}>{t(`inventory.cat_${c}`, c)}</option>)}
                {categories.filter(c => !(STANDARD_CATEGORIES as readonly string[]).includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => setShowExcel(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
              >
                <FileSpreadsheet size={15} />
                {t('inventory.bulk_upload')}
              </button>
              <button
                onClick={() => setShowBulkPrint(true)}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-pharma-200 text-pharma-700 hover:bg-pharma-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
              >
                <Printer size={15} />
                {t('bulk_barcode.open')}
                {selected.size > 0 && <span className="ms-1 px-1.5 py-0.5 bg-pharma-600 text-white text-[10px] rounded-full">{selected.size}</span>}
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg text-sm font-medium shadow-sm"
              >
                <Plus size={15} />
                {t('inventory.add_item')}
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <Th className="w-8 text-center">
                        <input type="checkbox"
                          checked={items.length > 0 && items.every(i => selected.has(i.id))}
                          onChange={toggleAll} />
                      </Th>
                      <Th>{t('inventory.col_barcode')}</Th>
                      <Th>{t('inventory.col_name')}</Th>
                      <Th>{t('inventory.col_category')}</Th>
                      <Th>{t('inventory.col_unit')}</Th>
                      <Th className="text-end">{t('inventory.col_price')}</Th>
                      <Th className="text-end">{t('inventory.col_cost')}</Th>
                      <Th className="text-center">{t('inventory.col_stock')}</Th>
                      <Th className="text-center">{t('inventory.col_min')}</Th>
                      <Th className="text-end">{t('inventory.col_actions')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={10} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>
                    )}
                    {!loading && items.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-8 text-slate-400">{t('inventory.no_items')}</td></tr>
                    )}
                    {items.map(it => {
                      const isZero = it.stock <= 0
                      const isLow = !isZero && it.stock <= it.min_stock
                      return (
                        <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)} />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{it.barcode || '—'}</td>
                          <td className="px-3 py-2 font-medium">{isAr ? it.name_ar : it.name_en}</td>
                          <td className="px-3 py-2 text-slate-600">{it.category || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {it.unit}
                            {it.pack_size && it.pack_size > 1 && it.sub_unit && (
                              <div className="text-[10px] text-slate-400">
                                1 {it.unit} = {it.pack_size} {it.sub_unit}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-end font-medium">{Number(it.price).toFixed(2)}</td>
                          <td className="px-3 py-2 text-end text-slate-600">{it.cost ? Number(it.cost).toFixed(2) : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              isZero ? 'bg-red-100 text-red-700' :
                              isLow ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>{it.stock}</span>
                            {it.pack_size && it.pack_size > 1 && it.sub_unit && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {Math.floor(it.stock / it.pack_size)} {it.unit}
                                {it.stock % it.pack_size > 0 && ` + ${it.stock % it.pack_size} ${it.sub_unit}`}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-500">{it.min_stock}</td>
                          <td className="px-3 py-2 text-end">
                            <div className="flex items-center justify-end gap-1">
                              <IconBtn onClick={() => setAdjustItem(it)} title={t('inventory.adjust') as string} color="amber"><Sliders size={14} /></IconBtn>
                              <IconBtn onClick={() => setHistoryItem(it)} title={t('inventory.history') as string} color="slate"><History size={14} /></IconBtn>
                              <IconBtn onClick={() => setEditItem(it)} title={t('inventory.edit') as string} color="blue"><Edit2 size={14} /></IconBtn>
                              {isAdmin && <IconBtn onClick={() => onDelete(it.id)} title={t('inventory.delete') as string} color="red"><Trash2 size={14} /></IconBtn>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'branch_stock' && <BranchStockTab />}
        {tab === 'movements' && <MovementsTab />}
        {tab === 'velocity' && <VelocityTab />}
        {tab === 'alerts' && <AlertsTab />}
      </div>

      {showCreate && <ItemFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadItems() }} />}
      {editItem && <ItemFormModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); loadItems() }} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={() => { setAdjustItem(null); loadItems() }} />}
      {historyItem && <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} onDone={() => { setShowExcel(false); loadItems() }} />}
      {showBulkPrint && (
        <BulkBarcodePrint
          items={items.filter(i => selected.has(i.id)).map(i => ({
            id: i.id,
            barcode: i.barcode,
            name: isAr ? i.name_ar : i.name_en,
            price: i.price,
          }))}
          currency={t('pos.egp') as string}
          onClose={() => setShowBulkPrint(false)}
        />
      )}
    </Layout>
  )
}

// ─── Components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color] ? '' : ''}`}>
        <span className={`inline-block px-2 py-0.5 rounded ${colors[color]}`}>{value}</span>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2.5 text-start font-semibold text-xs uppercase tracking-wider ${className}`}>{children}</th>
}

function IconBtn({ onClick, title, color, children }: any) {
  const colors: Record<string, string> = {
    amber: 'text-amber-600 hover:bg-amber-50',
    blue: 'text-blue-600 hover:bg-blue-50',
    red: 'text-red-600 hover:bg-red-50',
    slate: 'text-slate-600 hover:bg-slate-100',
  }
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded ${colors[color]}`}>{children}</button>
  )
}

// ─── Item Create/Edit Modal ─────────────────────────────────────────────

function ItemFormModal({ item, onClose, onSaved }: { item?: Product; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    barcode: item?.barcode || '',
    name_ar: item?.name_ar || '',
    name_en: item?.name_en || '',
    category: item?.category || '',
    unit: item?.unit || 'box',
    price: item?.price?.toString() || '',
    cost: item?.cost?.toString() || '',
    stock: item?.stock?.toString() || '0',
    min_stock: item?.min_stock?.toString() || '5',
    expiry_date: item?.expiry_date || '',
    pack_size: item?.pack_size?.toString() || '1',
    sub_unit: item?.sub_unit || '',
    sub_price: item?.sub_price != null ? String(item.sub_price) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showBarcodeDesigner, setShowBarcodeDesigner] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: any = {
        barcode: f.barcode || null,
        name_ar: f.name_ar,
        name_en: f.name_en,
        category: f.category || null,
        unit: f.unit,
        price: parseFloat(f.price),
        cost: f.cost ? parseFloat(f.cost) : null,
        min_stock: parseInt(f.min_stock) || 0,
        expiry_date: f.expiry_date || null,
        pack_size: Math.max(1, parseInt(f.pack_size) || 1),
        sub_unit: f.sub_unit || null,
        sub_price: f.sub_price ? parseFloat(f.sub_price) : null,
      }
      if (item) {
        await api.put(`/inventory/products/${item.id}`, payload)
      } else {
        payload.stock = parseInt(f.stock) || 0
        await api.post('/products', payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={item ? t('inventory.edit_item') : t('inventory.add_item')}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label={t('inventory.f_barcode')}>
          <div className="flex gap-2">
            <input value={f.barcode} onChange={e => setF({ ...f, barcode: e.target.value })} className="input flex-1" />
            <button type="button" onClick={() => setShowBarcodeDesigner(true)}
              className="px-3 py-2 text-xs rounded-lg border border-pharma-200 text-pharma-700 bg-pharma-50 hover:bg-pharma-100 inline-flex items-center gap-1 whitespace-nowrap">
              <Wand2 size={13} /> {t('barcode_studio.open')}
            </button>
          </div>
        </Field>
        <Field label={t('inventory.f_category')}>
          <input
            list="product-categories-list"
            value={f.category}
            onChange={e => setF({ ...f, category: e.target.value })}
            className="input"
            placeholder={t('inventory.cat_placeholder') as string}
          />
          <datalist id="product-categories-list">
            {STANDARD_CATEGORIES.map(c => (
              <option key={c} value={t(`inventory.cat_${c}`, c) as string} />
            ))}
          </datalist>
        </Field>
        <Field label={t('inventory.f_name_en') + ' *'}>
          <input required value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} className="input" />
        </Field>
        <Field label={t('inventory.f_name_ar')}>
          <input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} className="input" dir="rtl" />
        </Field>
        <Field label={t('inventory.f_unit')}>
          <select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} className="input">
            <option value="box">Box</option>
            <option value="strip">Strip</option>
            <option value="piece">Piece</option>
            <option value="bottle">Bottle</option>
            <option value="vial">Vial</option>
            <option value="tube">Tube</option>
            <option value="sachet">Sachet</option>
            <option value="kg">Kg</option>
            <option value="g">Gram</option>
            <option value="ml">ml</option>
            <option value="l">Liter</option>
          </select>
        </Field>
        <Field label={t('inventory.f_expiry')}>
          <input type="date" value={f.expiry_date} onChange={e => setF({ ...f, expiry_date: e.target.value })} className="input" />
        </Field>
        <Field label={t('inventory.f_price') + ' *'}>
          <input required type="number" step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} className="input" />
        </Field>
        <Field label={t('inventory.f_cost')}>
          <input type="number" step="0.01" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} className="input" />
        </Field>
        {!item && (
          <Field label={t('inventory.f_initial_stock')}>
            <input type="number" value={f.stock} onChange={e => setF({ ...f, stock: e.target.value })} className="input" />
          </Field>
        )}
        <Field label={t('inventory.f_min_stock')}>
          <input type="number" value={f.min_stock} onChange={e => setF({ ...f, min_stock: e.target.value })} className="input" />
        </Field>

        {/* ─── Packaging: 1 Box = N Strips (optional) ─── */}
        <div className="col-span-2 mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-2">
            {t('inventory.pack_hint')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('inventory.f_sub_unit')}>
              <select
                value={f.sub_unit}
                onChange={e => setF({ ...f, sub_unit: e.target.value })}
                className="input"
              >
                <option value="">{t('inventory.sub_unit_none')}</option>
                <option value="strip">{t('inventory.su_strip')}</option>
                <option value="ampoule">{t('inventory.su_ampoule')}</option>
                <option value="tablet">{t('inventory.su_tablet')}</option>
                <option value="capsule">{t('inventory.su_capsule')}</option>
                <option value="sachet">{t('inventory.su_sachet')}</option>
                <option value="vial">{t('inventory.su_vial')}</option>
                <option value="piece">{t('inventory.su_piece')}</option>
                <option value="ml">{t('inventory.su_ml')}</option>
              </select>
            </Field>
            <Field label={t('inventory.f_units_per', { unit: f.unit })}>
              <input
                type="number" min={1}
                value={f.pack_size}
                onChange={e => setF({ ...f, pack_size: e.target.value })}
                className="input"
                placeholder="10"
              />
            </Field>
            <Field label={t('inventory.f_price_per', { unit: f.sub_unit || t('inventory.sub_unit_word') })}>
              <input
                type="number" step="0.01"
                value={f.sub_price}
                onChange={e => setF({ ...f, sub_price: e.target.value })}
                className="input"
                placeholder={
                  f.price && f.pack_size && parseInt(f.pack_size) > 1
                    ? (parseFloat(f.price) / parseInt(f.pack_size)).toFixed(2)
                    : 'auto'
                }
                disabled={!f.sub_unit || parseInt(f.pack_size) <= 1}
              />
            </Field>
          </div>
          {f.sub_unit && parseInt(f.pack_size) > 1 && (
            <p className="text-[11px] text-slate-500 mt-2">
              1 {f.unit} = {f.pack_size} {f.sub_unit}. {t('inventory.stock_tracked_in', { unit: f.sub_unit })}
            </p>
          )}
        </div>

        {error && <div className="col-span-2 text-red-600 text-sm">{error}</div>}
        <div className="col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">{t('common.cancel')}</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg disabled:opacity-50">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
      {showBarcodeDesigner && (
        <BarcodeDesigner
          initialValue={f.barcode}
          productName={f.name_en || f.name_ar}
          onClose={() => setShowBarcodeDesigner(false)}
          onUse={(v) => { setF({ ...f, barcode: v }); setShowBarcodeDesigner(false) }}
        />
      )}
    </Modal>
  )
}

// ─── Adjust Modal ──────────────────────────────────────────────────────

function AdjustModal({ item, onClose, onSaved }: { item: Product; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const n = parseInt(qty)
    if (!n || n <= 0) { setError(t('inventory.err_qty') as string); return }
    if (!reason.trim()) { setError(t('inventory.err_reason') as string); return }
    let delta = mode === 'add' ? n : mode === 'remove' ? -n : (n - item.stock)
    if (delta === 0) { setError(t('inventory.err_same') as string); return }
    setSaving(true)
    try {
      await api.post('/inventory/adjustments', {
        product_id: item.id, delta, reason,
      })
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title={t('inventory.adjust_title')}>
      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
        <div className="font-semibold">{i18n.language === 'ar' ? item.name_ar : item.name_en}</div>
        <div className="text-sm text-slate-600">{t('inventory.current_stock')}: <span className="font-bold">{item.stock}</span></div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          {(['add', 'remove', 'set'] as const).map(m => (
            <button type="button" key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                mode === m ? 'bg-pharma-600 text-white border-pharma-600' : 'bg-white text-slate-600 border-slate-200'
              }`}>
              {t(`inventory.mode_${m}`)}
            </button>
          ))}
        </div>
        <Field label={mode === 'set' ? t('inventory.new_stock') : t('inventory.quantity')}>
          <input type="number" required value={qty} onChange={e => setQty(e.target.value)} className="input" autoFocus />
        </Field>
        <Field label={t('inventory.reason') + ' *'}>
          <textarea required value={reason} onChange={e => setReason(e.target.value)} className="input min-h-20" />
        </Field>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">{t('common.cancel')}</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50">
            {saving ? t('common.loading') : t('inventory.confirm_adjust')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── History Modal ─────────────────────────────────────────────────────

function HistoryModal({ item, onClose }: { item: Product; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [moves, setMoves] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/inventory/movements', { params: { product_id: item.id, limit: 500 } })
      .then(r => setMoves(r.data))
      .finally(() => setLoading(false))
  }, [item.id])
  return (
    <Modal onClose={onClose} title={`${t('inventory.history')} — ${i18n.language === 'ar' ? item.name_ar : item.name_en}`} wide>
      <div className="max-h-96 overflow-auto">
        {loading && <div className="text-center py-4 text-slate-400">{t('common.loading')}</div>}
        {!loading && moves.length === 0 && <div className="text-center py-4 text-slate-400">{t('inventory.no_movements')}</div>}
        {!loading && moves.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <Th>{t('inventory.col_date')}</Th>
                <Th>{t('inventory.col_type')}</Th>
                <Th className="text-end">{t('inventory.col_qty')}</Th>
                <Th className="text-end">{t('inventory.col_balance')}</Th>
                <Th>{t('inventory.col_reason')}</Th>
                <Th>{t('inventory.col_user')}</Th>
              </tr>
            </thead>
            <tbody>
              {moves.map(m => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(m.movement_type)}`}>
                      {t(`inventory.move_${m.movement_type}`, { defaultValue: m.movement_type })}
                    </span>
                  </td>
                  <td className={`px-3 py-1.5 text-end font-semibold ${m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </td>
                  <td className="px-3 py-1.5 text-end font-bold">{m.balance_after}</td>
                  <td className="px-3 py-1.5 text-slate-600 text-xs">{m.reason || '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{i18n.language === 'ar' ? m.user_name_ar : m.user_name_en || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}

function typeColor(t: string) {
  switch (t) {
    case 'initial': return 'bg-blue-100 text-blue-700'
    case 'sale': return 'bg-slate-100 text-slate-700'
    case 'return': return 'bg-purple-100 text-purple-700'
    case 'adjustment': return 'bg-amber-100 text-amber-700'
    case 'transfer_in': return 'bg-emerald-100 text-emerald-700'
    case 'transfer_out': return 'bg-orange-100 text-orange-700'
    case 'purchase': return 'bg-teal-100 text-teal-700'
    default: return 'bg-slate-100 text-slate-700'
  }
}

// ─── Movements Tab (global) ────────────────────────────────────────────

function MovementsTab() {
  const { t, i18n } = useTranslation()
  const [moves, setMoves] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params: any = { limit: 500 }
      if (type) params.movement_type = type
      if (start) params.start_date = start
      if (end) params.end_date = end
      const { data } = await api.get('/inventory/movements', { params })
      setMoves(data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [type, start, end])

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3">
        <select value={type} onChange={e => setType(e.target.value)} className="input max-w-48">
          <option value="">{t('inventory.filter_all_types')}</option>
          <option value="sale">{t('inventory.move_sale')}</option>
          <option value="return">{t('inventory.move_return')}</option>
          <option value="adjustment">{t('inventory.move_adjustment')}</option>
          <option value="initial">{t('inventory.move_initial')}</option>
          <option value="transfer_in">{t('inventory.move_transfer_in')}</option>
          <option value="transfer_out">{t('inventory.move_transfer_out')}</option>
        </select>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} className="input max-w-40" placeholder={t('inventory.from') as string} />
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="input max-w-40" placeholder={t('inventory.to') as string} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>{t('inventory.col_date')}</Th>
              <Th>{t('inventory.col_product')}</Th>
              <Th>{t('inventory.col_type')}</Th>
              <Th className="text-end">{t('inventory.col_qty')}</Th>
              <Th className="text-end">{t('inventory.col_balance')}</Th>
              <Th>{t('inventory.col_reason')}</Th>
              <Th>{t('inventory.col_user')}</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center py-6 text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && moves.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-slate-400">{t('inventory.no_movements')}</td></tr>}
            {moves.map((m: any) => (
              <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                <td className="px-3 py-1.5 font-medium">{i18n.language === 'ar' ? m.product_name_ar : m.product_name_en}</td>
                <td className="px-3 py-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(m.movement_type)}`}>
                    {t(`inventory.move_${m.movement_type}`, { defaultValue: m.movement_type })}
                  </span>
                </td>
                <td className={`px-3 py-1.5 text-end font-semibold ${m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </td>
                <td className="px-3 py-1.5 text-end font-bold">{m.balance_after}</td>
                <td className="px-3 py-1.5 text-slate-600 text-xs">{m.reason || '—'}</td>
                <td className="px-3 py-1.5 text-xs">{i18n.language === 'ar' ? m.user_name_ar : m.user_name_en || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Velocity Tab ──────────────────────────────────────────────────────

function VelocityTab() {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)
  const [filter, setFilter] = useState<'' | 'fast' | 'slow' | 'dead'>('')

  useEffect(() => {
    setLoading(true)
    api.get('/inventory/velocity', { params: { days } })
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }, [days])

  const shown = filter ? rows.filter(r => r.classification === filter) : rows
  const counts = useMemo(() => ({
    fast: rows.filter(r => r.classification === 'fast').length,
    slow: rows.filter(r => r.classification === 'slow').length,
    dead: rows.filter(r => r.classification === 'dead').length,
  }), [rows])

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <label className="text-sm text-slate-600">{t('inventory.period')}:</label>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))} className="input max-w-32">
          <option value={30}>30 {t('inventory.days')}</option>
          <option value={90}>90 {t('inventory.days')}</option>
          <option value={180}>180 {t('inventory.days')}</option>
        </select>
        <div className="flex gap-2 ms-auto">
          <ClsPill label={t('inventory.cls_fast')} count={counts.fast} active={filter === 'fast'} color="emerald" onClick={() => setFilter(filter === 'fast' ? '' : 'fast')} />
          <ClsPill label={t('inventory.cls_slow')} count={counts.slow} active={filter === 'slow'} color="amber" onClick={() => setFilter(filter === 'slow' ? '' : 'slow')} />
          <ClsPill label={t('inventory.cls_dead')} count={counts.dead} active={filter === 'dead'} color="red" onClick={() => setFilter(filter === 'dead' ? '' : 'dead')} />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>{t('inventory.col_product')}</Th>
              <Th>{t('inventory.col_barcode')}</Th>
              <Th className="text-center">{t('inventory.col_stock')}</Th>
              <Th className="text-end">{t('inventory.col_sold')}</Th>
              <Th className="text-center">{t('inventory.col_class')}</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-6 text-slate-400">{t('common.loading')}</td></tr>}
            {shown.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium">{i18n.language === 'ar' ? r.name_ar : r.name_en}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.barcode || '—'}</td>
                <td className="px-3 py-1.5 text-center">{r.stock}</td>
                <td className="px-3 py-1.5 text-end font-bold">{r.sold_qty}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.classification === 'fast' ? 'bg-emerald-100 text-emerald-700' :
                    r.classification === 'slow' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{t(`inventory.cls_${r.classification}`)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClsPill({ label, count, active, color, onClick }: any) {
  const colors: Record<string, string> = {
    emerald: active ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    amber: active ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    red: active ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100',
  }
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${colors[color]}`}>
      {label} <span className="font-bold ms-1">{count}</span>
    </button>
  )
}

// ─── Alerts Tab ────────────────────────────────────────────────────────

function AlertsTab() {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [coverage, setCoverage] = useState(7)

  useEffect(() => {
    setLoading(true)
    api.get('/inventory/consumption-alerts', { params: { days, coverage_days: coverage } })
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }, [days, coverage])

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">{t('inventory.based_on_days')}:</label>
          <select value={days} onChange={e => setDays(parseInt(e.target.value))} className="input max-w-32">
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={90}>90</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">{t('inventory.coverage_days')}:</label>
          <select value={coverage} onChange={e => setCoverage(parseInt(e.target.value))} className="input max-w-32">
            <option value={3}>3</option>
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
          </select>
        </div>
        <div className="ms-auto flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg text-sm">
          <AlertTriangle size={15} /> {rows.length} {t('inventory.alerts')}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>{t('inventory.col_product')}</Th>
              <Th className="text-center">{t('inventory.col_stock')}</Th>
              <Th className="text-end">{t('inventory.avg_daily')}</Th>
              <Th className="text-end">{t('inventory.days_left')}</Th>
              <Th className="text-end">{t('inventory.suggested_min')}</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-6 text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-emerald-600"><TrendingUp size={28} className="inline mb-1" /> {t('inventory.no_alerts')}</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium">{i18n.language === 'ar' ? r.name_ar : r.name_en}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">{r.stock}</span>
                </td>
                <td className="px-3 py-1.5 text-end">{r.avg_daily}</td>
                <td className="px-3 py-1.5 text-end font-bold text-amber-700">{r.days_remaining ?? '—'}</td>
                <td className="px-3 py-1.5 text-end font-semibold text-emerald-700">{r.suggested_min}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Excel Upload Modal ────────────────────────────────────────────────

function ExcelUploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!file) return
    setError(''); setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const { data } = await api.post('/inventory/bulk-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally { setUploading(false) }
  }

  return (
    <Modal onClose={onClose} title={t('inventory.bulk_upload')}>
      <div className="space-y-4 text-sm">
        <div className="bg-slate-50 p-3 rounded-lg text-slate-700">
          <div className="font-semibold mb-1">{t('inventory.excel_help_title')}</div>
          <div>{t('inventory.excel_help_cols')}</div>
          <code className="block mt-2 text-xs bg-white p-2 rounded border border-slate-200">
            Code, Material Name, Unit, Small Unit, Quantity, Sales Price, Cost, Category, Min Stock
          </code>
          <a href="/api/inventory/bulk-template" className="text-pharma-700 hover:underline text-xs mt-2 inline-block">
            ⬇ {t('inventory.download_template')}
          </a>
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)}
          className="w-full p-2 border border-dashed border-slate-300 rounded-lg" />
        {error && <div className="text-red-600">{error}</div>}
        {result && (
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-800">
            ✅ {result.inserted} {t('inventory.imported')}, {result.updated} {t('inventory.updated_count')}, {result.errors} {t('inventory.errors')}
            {result.error_details?.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer">{t('inventory.show_errors')}</summary>
                <ul className="mt-1 list-disc list-inside">
                  {result.error_details.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">{t('common.close')}</button>
          {!result && (
            <button onClick={submit} disabled={!file || uploading} className="px-4 py-2 bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg disabled:opacity-50">
              {uploading ? t('common.loading') : t('inventory.upload')}
            </button>
          )}
          {result && <button onClick={onDone} className="px-4 py-2 bg-pharma-600 text-white rounded-lg">{t('common.close')}</button>}
        </div>
      </div>
    </Modal>
  )
}

// ─── Generic Modal & Field ─────────────────────────────────────────────

function Modal({ children, onClose, title, wide }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} max-h-[90vh] overflow-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: any) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function BranchStockTab() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [data, setData] = useState<{ branches: { id: number; name_en: string; name_ar: string }[]; items: BranchStockRow[] }>({ branches: [], items: [] })
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/inventory/branch-stock', { params: q ? { q } : {} })
      setData(data)
    } finally { setLoading(false) }
  }
  useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id) }, [q])

  const branchName = (b: { name_en: string; name_ar: string }) => isAr ? b.name_ar : b.name_en

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-64 relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('inventory.search_placeholder') as string}
            className="w-full ps-10 pe-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div className="text-xs text-slate-500">{t('inventory.bs_hint')}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-start">{t('inventory.col_name')}</th>
                <th className="px-3 py-2.5 text-start">{t('inventory.col_barcode')}</th>
                {data.branches.map(b => (
                  <th key={b.id} className="px-3 py-2.5 text-center whitespace-nowrap">{branchName(b)}</th>
                ))}
                <th className="px-3 py-2.5 text-center bg-slate-100">{t('inventory.bs_total')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={data.branches.length + 3} className="text-center py-8 text-slate-400">…</td></tr>}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={data.branches.length + 3} className="text-center py-8 text-slate-400">{t('inventory.no_items')}</td></tr>
              )}
              {data.items.map(row => (
                <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{isAr ? row.name_ar : row.name_en}</div>
                    {row.category && <div className="text-[11px] text-slate-400">{row.category}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{row.barcode || '—'}</td>
                  {data.branches.map(b => {
                    const cell = row.branches.find(x => x.branch_id === b.id)
                    const stock = cell?.stock ?? 0
                    const min = cell?.min_stock ?? 0
                    const missing = cell?.product_id == null
                    const cls = missing
                      ? 'text-slate-300'
                      : stock <= 0
                        ? 'text-red-600 font-bold'
                        : stock <= min
                          ? 'text-amber-600 font-semibold'
                          : 'text-slate-700'
                    return (
                      <td key={b.id} className={`px-3 py-2.5 text-center font-mono ${cls}`}>
                        {missing ? '—' : stock}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-center font-mono font-bold bg-slate-50">{row.total_stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
