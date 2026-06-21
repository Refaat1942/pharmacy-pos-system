import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Edit2, Trash2, History, Sliders, AlertTriangle, TrendingUp, FileSpreadsheet, X, Wand2, Printer, ScanLine } from 'lucide-react'
import Layout from '../components/Layout'
import BranchStockPickPanel from '../components/BranchStockPickPanel'
import api, { formatApiError } from '../lib/api'
import {
  autoPickKeysPerTerm,
  isMultiTermSearch,
  looksLikeMultiInput,
  parseSearchTerms,
} from '../lib/branchStockPick'
import { downloadApiExcel } from '../lib/downloadExcel'
import { formatInt, formatMoney } from '../lib/formatNumber'
import {
  formatDecimalBoxes,
  formatMajorSubLabel,
  formatPackStockInput,
  formatPackStockLabel,
  formatVarianceMajorUnits,
  formatVarianceSubFraction,
  packSizeOf,
  parsePackStockInput,
  stockVarianceSplit,
} from '../lib/packStock'
import { formatDate, formatDateTime } from '../lib/formatDate'
import DateInput from '../components/DateInput'
import { TableLoadingRow } from '../components/LoadingSpinner'
import BarcodeDesigner from '../components/BarcodeDesigner'
import BulkBarcodePrint, { type BulkItem } from '../components/BulkBarcodePrint'
import DoseLabelPrint, { type DoseLabelItem } from '../components/DoseLabelPrint'
import { formatExpiryForLabel } from '../lib/barcodeLabel'
import { useAuth } from '../lib/auth'
import { inventoryTabEnabled } from '../lib/featureGates'
import {
  DEFAULT_MATERIAL_GROUP,
  MATERIAL_GROUP_CODES,
  materialGroupLabel,
  originFromMaterialGroup,
} from '../lib/materialGroups'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'

const SORT_TH_CLASS = 'font-semibold text-xs uppercase tracking-wider'

function ExcelExportButton({
  onExport,
  disabled,
}: {
  onExport: () => Promise<void>
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onExport()
        } finally {
          setBusy(false)
        }
      }}
      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-40"
    >
      <FileSpreadsheet size={15} />
      {busy ? t('common.loading') : t('inventory.export_excel')}
    </button>
  )
}

type ProductBatch = {
  id: number
  expiry_date: string | null
  quantity: number
}

type Product = {
  id: number
  barcode: string | null
  international_barcode?: string | null
  name_ar: string
  name_en: string
  category: string | null
  unit: string
  price: number
  cost: number | null
  stock: number
  min_stock: number
  expiry_date: string | null
  batches?: ProductBatch[] | null
  branch_id: number | null
  active: boolean
  branch_name_en?: string
  branch_name_ar?: string
  pack_size?: number | null
  sub_unit?: string | null
  sub_price?: number | null
}

function productLabelExpiry(it: Product): string | null {
  const batches = Array.isArray(it.batches) ? it.batches.filter((b) => b.quantity > 0) : []
  if (batches.length === 1 && batches[0].expiry_date) {
    return formatExpiryForLabel(batches[0].expiry_date)
  }
  if (batches.length > 1) {
    const dated = batches
      .map((b) => formatExpiryForLabel(b.expiry_date))
      .filter(Boolean) as string[]
    if (dated.length) return dated.sort()[0]
  }
  return formatExpiryForLabel(it.expiry_date)
}

function bulkItemsForProduct(it: Product, isAr: boolean): BulkItem[] {
  const name = isAr ? it.name_ar : it.name_en
  const batches = Array.isArray(it.batches) ? it.batches.filter((b) => b.quantity > 0) : []
  if (batches.length > 0) {
    return batches.map((b) => ({
      id: b.id,
      barcode: it.barcode,
      name: batches.length > 1
        ? `${name} · ${formatExpiryForLabel(b.expiry_date) || '—'}`
        : name,
      price: it.price,
      expiryDate: b.expiry_date,
      defaultQty: b.quantity,
    }))
  }
  return [{
    id: it.id,
    barcode: it.barcode,
    name,
    price: it.price,
    expiryDate: it.expiry_date,
    defaultQty: 1,
  }]
}

function formatExpiryLots(it: Product): string {
  const batches = Array.isArray(it.batches) ? it.batches : []
  const pack = it.pack_size && it.pack_size > 1 ? it.pack_size : 1
  if (batches.length > 0) {
    return batches
      .map((b) => {
        const d = b.expiry_date ? String(b.expiry_date).slice(0, 10) : '—'
        // Batch quantities are stored in sub-units; show the same decimal-box value
        // used by the Stock column so the two columns never disagree (e.g. 9.5 vs 19).
        const qty = pack > 1 ? formatDecimalBoxes(b.quantity, pack) : String(b.quantity)
        return `${qty}× ${d}`
      })
      .join(' · ')
  }
  return it.expiry_date ? String(it.expiry_date).slice(0, 10) : '—'
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

type Tab = 'items' | 'barcodes' | 'dose_labels' | 'branch_stock' | 'stocktake' | 'movements' | 'velocity' | 'alerts'

type BranchStockRow = {
  key: string
  barcode: string | null
  international_barcode?: string | null
  name_en: string
  name_ar: string
  category: string | null
  unit: string
  sub_unit?: string | null
  pack_size?: number | null
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

/** Box count for valuation (stock is stored in sub-units when pack_size > 1). */
function stockQtyBoxes(i: { stock: number; pack_size?: number | null }): number {
  const pack = i.pack_size && i.pack_size > 1 ? i.pack_size : 1
  return Number(i.stock) / pack
}

function stockValueCost(i: { stock: number; pack_size?: number | null; cost?: number | null }): number {
  return stockQtyBoxes(i) * Number(i.cost || 0)
}

function stockValueRetail(i: { stock: number; pack_size?: number | null; price?: number | null }): number {
  return stockQtyBoxes(i) * Number(i.price || 0)
}

export default function Inventory() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user, hasFeatureOption } = useAuth()
  const isAdmin = user?.role === 'admin'

  const tabAllowed = useCallback((k: Tab) => inventoryTabEnabled(k, hasFeatureOption), [hasFeatureOption])
  const visibleTabs = useMemo(
    () => (['items', 'barcodes', 'dose_labels', 'branch_stock', 'stocktake', 'movements', 'velocity', 'alerts'] as Tab[])
      .filter(tabAllowed),
    [tabAllowed],
  )
  const [tab, setTab] = useState<Tab>('items')

  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab(visibleTabs[0] ?? 'items')
    }
  }, [visibleTabs, tab])
  const [items, setItems] = useState<Product[]>([])
  const [itemStats, setItemStats] = useState<{
    total: number; zero: number; low_stock: number
    stock_value_cost: number; stock_value_retail: number
  } | null>(null)
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
  const [showCategoryMgr, setShowCategoryMgr] = useState(false)
  const [showAllItems, setShowAllItems] = useState(false)
  const [listPage, setListPage] = useState(0)
  const [listTotal, setListTotal] = useState(0)
  const LIST_PAGE_SIZE = 500

  const toggleOne = (id: number) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleAll = (rows: Product[]) => {
    setSelected(s => {
      const visibleIds = rows.map(i => i.id)
      const allSelected = visibleIds.every(id => s.has(id))
      if (allSelected) {
        const n = new Set(s); visibleIds.forEach(id => n.delete(id)); return n
      }
      const n = new Set(s); visibleIds.forEach(id => n.add(id)); return n
    })
  }

  const loadItems = async (silent = false) => {
    const searchQ = q.trim()
    if (!showAllItems && !searchQ) {
      setItems([])
      setItemStats(null)
      setListTotal(0)
      return
    }
    if (!showAllItems && searchQ.length > 0 && searchQ.length < 2) {
      setItems([])
      setItemStats(null)
      setListTotal(0)
      return
    }
    if (!silent) setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (searchQ) params.q = searchQ
      if (showAllItems) {
        params.load_all = 'true'
        params.paged = 'true'
        params.offset = String(listPage * LIST_PAGE_SIZE)
        params.limit = String(LIST_PAGE_SIZE)
      }
      if (stockFilter) params.stock_filter = stockFilter
      if (categoryFilter) params.category = categoryFilter
      const summaryParams = { ...params }
      delete summaryParams.load_all
      delete summaryParams.paged
      delete summaryParams.offset
      delete summaryParams.limit
      const [listRes, sumRes] = await Promise.all([
        api.get('/inventory/items', { params }),
        api.get<{
          total: number; zero_stock: number; low_stock: number
          stock_value_cost: number; stock_value_retail: number
        }>('/inventory/summary', { params: summaryParams }),
      ])
      const payload = listRes.data as Product[] | { items: Product[]; total: number }
      if (showAllItems && payload && typeof payload === 'object' && 'items' in payload) {
        setItems(payload.items)
        setListTotal(payload.total)
      } else {
        setItems(Array.isArray(payload) ? payload : [])
        setListTotal(Array.isArray(payload) ? payload.length : 0)
      }
      setItemStats({
        total: sumRes.data.total,
        zero: sumRes.data.zero_stock,
        low_stock: sumRes.data.low_stock,
        stock_value_cost: sumRes.data.stock_value_cost,
        stock_value_retail: sumRes.data.stock_value_retail,
      })
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadCategories = async () => {
    const { data } = await api.get('/inventory/categories')
    setCategories(data)
  }

  const exportItems = () =>
    downloadApiExcel('/inventory/items/export', `inventory-items-${new Date().toISOString().slice(0, 10)}.xlsx`, {
      q: q.trim() || undefined,
      load_all: showAllItems && !q.trim() ? true : undefined,
      stock_filter: stockFilter || undefined,
      category: categoryFilter || undefined,
    })

  useEffect(() => {
    if (tab === 'items') loadCategories()
  }, [tab])

  useEffect(() => {
    setListPage(0)
  }, [showAllItems, q, stockFilter, categoryFilter])

  useEffect(() => {
    if (tab !== 'items') return
    const id = setTimeout(loadItems, 400)
    return () => clearTimeout(id)
  }, [tab, q, stockFilter, categoryFilter, showAllItems, listPage])

  // Soft auto-refresh every 120s: silently re-fetch the current view without a spinner.
  useEffect(() => {
    if (tab !== 'items') return
    const id = setInterval(() => loadItems(true), 120_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, stockFilter, categoryFilter, showAllItems, listPage])

  const stats = useMemo(() => {
    if (itemStats) {
      return {
        total: itemStats.total,
        zero: itemStats.zero,
        low: itemStats.low_stock,
        valueCost: itemStats.stock_value_cost,
        valueRetail: itemStats.stock_value_retail,
      }
    }
    if (!showAllItems && !q.trim()) {
      return { total: 0, zero: 0, low: 0, valueCost: 0, valueRetail: 0 }
    }
    const total = items.length
    const zero = items.filter((i) => i.stock <= 0).length
    const valueCost = items.reduce((s, i) => s + stockValueCost(i), 0)
    const valueRetail = items.reduce((s, i) => s + stockValueRetail(i), 0)
    return { total, zero, low: 0, valueCost, valueRetail }
  }, [items, itemStats, showAllItems, q])

  const itemFilter = useQuickFilter(items, [
    i => i.barcode,
    i => i.name_en,
    i => i.name_ar,
    i => i.category,
    i => i.unit,
  ])
  const itemAccessors = useMemo(() => ({
    barcode: (i: Product) => i.barcode,
    name: (i: Product) => (isAr ? i.name_ar : i.name_en),
    category: (i: Product) => i.category,
    unit: (i: Product) => i.unit,
    price: (i: Product) => Number(i.price),
    cost: (i: Product) => (i.cost == null ? null : Number(i.cost)),
    stock: (i: Product) => Number(i.stock),
    min_stock: (i: Product) => Number(i.min_stock),
  }), [isAr])
  const { sorted: sortedItems, sort: itemSort, toggle: itemToggle } = useSort(itemFilter.filtered, itemAccessors)

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
          <h1 className="feature-page-title">{t('inventory.title')}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          {([
            ['items', t('inventory.tab_items')],
            ['barcodes', t('inventory.tab_barcodes')],
            ['dose_labels', t('inventory.tab_dose_labels')],
            ['branch_stock', t('inventory.tab_branch_stock')],
            ['stocktake', t('inventory.tab_stocktake')],
            ['movements', t('inventory.tab_movements')],
            ['velocity', t('inventory.tab_velocity')],
            ['alerts', t('inventory.tab_alerts')],
          ] as [Tab, string][]).filter(([k]) => tabAllowed(k)).map(([k, label]) => (
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <StatCard label={t('inventory.stat_total')} value={formatInt(stats.total)} color="slate" />
              <StatCard label={t('inventory.stat_low')} value={formatInt(stats.low)} color="amber" />
              <StatCard label={t('inventory.stat_zero')} value={formatInt(stats.zero)} color="red" />
              <StatCard
                label={q || stockFilter || categoryFilter ? t('inventory.stat_value_cost_filtered') : t('inventory.stat_value_cost')}
                value={`${formatInt(stats.valueCost)} ${t('pos.egp')}`}
                color="emerald"
              />
              <StatCard
                label={q || stockFilter || categoryFilter ? t('inventory.stat_value_retail_filtered') : t('inventory.stat_value_retail')}
                value={`${formatInt(stats.valueRetail)} ${t('pos.egp')}`}
                color="sky"
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
              {user?.role === 'admin' && (
                <button
                  onClick={() => setShowCategoryMgr(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
                >
                  <Sliders size={15} />
                  {t('inventory.manage_categories')}
                </button>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer whitespace-nowrap px-2 py-2 border border-slate-200 rounded-lg bg-slate-50">
                <input
                  type="checkbox"
                  checked={showAllItems}
                  onChange={(e) => setShowAllItems(e.target.checked)}
                  className="rounded border-slate-300 text-pharma-600 focus:ring-pharma-500"
                />
                {t('inventory.show_all_items')}
              </label>
              {hasFeatureOption('inventory', 'import_export') && (
              <button
                onClick={() => setShowExcel(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
              >
                <FileSpreadsheet size={15} />
                {t('inventory.bulk_upload')}
              </button>
              )}
              <ExcelExportButton onExport={exportItems} disabled={items.length === 0} />
              <button
                onClick={() => setShowBulkPrint(true)}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-pharma-200 text-pharma-700 hover:bg-pharma-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
              >
                <Printer size={15} />
                {t('inventory.barcode_labels_btn')}
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

            <div className="mb-4 max-w-sm">
              <TableFilter value={itemFilter.query} onChange={itemFilter.setQuery} placeholder={t('common.filter_placeholder') as string} />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <Th className="w-8 text-center">
                        <input type="checkbox"
                          checked={sortedItems.length > 0 && sortedItems.every(i => selected.has(i.id))}
                          onChange={() => toggleAll(sortedItems)} />
                      </Th>
                      <SortTh k="barcode" sort={itemSort} onToggle={itemToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_barcode')}</SortTh>
                      <SortTh k="name" sort={itemSort} onToggle={itemToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_name')}</SortTh>
                      <SortTh k="category" sort={itemSort} onToggle={itemToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_category')}</SortTh>
                      <SortTh k="unit" sort={itemSort} onToggle={itemToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_unit')}</SortTh>
                      <SortTh k="price" sort={itemSort} onToggle={itemToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.col_price')}</SortTh>
                      <SortTh k="cost" sort={itemSort} onToggle={itemToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.col_cost')}</SortTh>
                      <SortTh k="stock" sort={itemSort} onToggle={itemToggle} align="center" className={SORT_TH_CLASS}>{t('inventory.col_stock')}</SortTh>
                      <Th className="text-start">{t('inventory.col_expiry_lots')}</Th>
                      <SortTh k="min_stock" sort={itemSort} onToggle={itemToggle} align="center" className={SORT_TH_CLASS}>{t('inventory.col_min')}</SortTh>
                      <Th className="text-end">{t('inventory.col_actions')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && <TableLoadingRow colSpan={11} />}
                    {!loading && sortedItems.length === 0 && (
                      <tr>
                        <td colSpan={11} className="text-center py-8 text-slate-500 text-sm max-w-md mx-auto">
                          {!showAllItems && !q.trim()
                            ? t('inventory.search_or_show_all_hint')
                            : !showAllItems && q.trim().length > 0 && q.trim().length < 2
                              ? t('inventory.search_min_chars')
                              : t('inventory.no_items')}
                        </td>
                      </tr>
                    )}
                    {sortedItems.map(it => {
                      const isNegative = it.stock < 0
                      const isZero = it.stock <= 0 && !isNegative
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
                          <td className="px-3 py-2 text-end font-medium">{formatMoney(it.price)}</td>
                          <td className="px-3 py-2 text-end text-slate-600">{it.cost ? formatMoney(it.cost) : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              isNegative ? 'bg-red-200 text-red-900' :
                              isZero ? 'bg-red-100 text-red-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {it.pack_size && it.pack_size > 1
                                ? formatPackStockInput(it.stock, it.pack_size)
                                : formatInt(it.stock)}
                            </span>
                            {it.pack_size && it.pack_size > 1 && it.sub_unit && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {formatMajorSubLabel(
                                  it.stock,
                                  it.pack_size,
                                  it.unit,
                                  it.sub_unit,
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 max-w-[12rem]">
                            <span className="line-clamp-2" title={formatExpiryLots(it)}>{formatExpiryLots(it)}</span>
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
              {showAllItems && listTotal > LIST_PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
                  <span>
                    {t('inventory.list_page_info', {
                      from: listPage * LIST_PAGE_SIZE + 1,
                      to: Math.min((listPage + 1) * LIST_PAGE_SIZE, listTotal),
                      total: listTotal,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={listPage === 0 || loading}
                      onClick={() => setListPage((p) => Math.max(0, p - 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                    >
                      {t('common.previous', 'Previous')}
                    </button>
                    <button
                      type="button"
                      disabled={(listPage + 1) * LIST_PAGE_SIZE >= listTotal || loading}
                      onClick={() => setListPage((p) => p + 1)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                    >
                      {t('common.next', 'Next')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'barcodes' && <BarcodeLabelsTab />}
        {tab === 'dose_labels' && <DoseLabelsTab />}
        {tab === 'branch_stock' && <BranchStockTab />}
        {tab === 'stocktake' && <StocktakeTab />}
        {tab === 'movements' && <MovementsTab />}
        {tab === 'velocity' && <VelocityTab />}
        {tab === 'alerts' && <AlertsTab />}
      </div>

      {showCreate && <ItemFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadItems() }} />}
      {editItem && <ItemFormModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); loadItems() }} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={() => { setAdjustItem(null); loadItems() }} />}
      {historyItem && <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} onDone={() => { setShowExcel(false); loadItems() }} />}
      {showCategoryMgr && (
        <CategoryManagerModal
          onClose={() => setShowCategoryMgr(false)}
          onChanged={() => { loadCategories(); loadItems() }}
        />
      )}
      {showBulkPrint && (
        <BulkBarcodePrint
          items={items.filter(i => selected.has(i.id)).flatMap((i) => bulkItemsForProduct(i, isAr))}
          currency={t('pos.egp') as string}
          defaultSize="medium"
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
    sky: 'bg-sky-100 text-sky-700',
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

// ─── Expiry lots (multiple batches per product) ──────────────────────────

function ExpiryBatchesPanel({
  productId,
  packSize,
  unit,
  subUnit,
  onChanged,
}: {
  productId: number
  packSize: number
  unit: string
  subUnit: string
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [batches, setBatches] = useState<ProductBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [expiry, setExpiry] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const pack = packSize > 1 ? packSize : 1

  const load = () => {
    setLoading(true)
    api.get<ProductBatch[]>(`/inventory/products/${productId}/batches`)
      .then((r) => setBatches(r.data))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [productId])

  const addLot = async () => {
    const n = pack > 1 ? parsePackStockInput(qty, pack) : parseInt(qty, 10)
    if (n === null || n <= 0) return
    setSaving(true)
    try {
      await api.post(`/inventory/products/${productId}/batches`, {
        expiry_date: expiry || null,
        quantity: n,
      })
      setExpiry('')
      setQty('')
      load()
      onChanged()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const removeLot = async (batchId: number) => {
    if (!confirm(t('inventory.batches_remove_confirm') as string)) return
    try {
      await api.delete(`/inventory/batches/${batchId}`)
      load()
      onChanged()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Error')
    }
  }

  return (
    <div className="col-span-2 mt-2 p-3 rounded-lg bg-amber-50/80 border border-amber-200">
      <div className="text-xs font-semibold text-amber-900 mb-1">{t('inventory.batches_title')}</div>
      <p className="text-[11px] text-amber-800/90 mb-3">{t('inventory.batches_hint')}</p>
      {loading ? (
        <div className="text-xs text-slate-500">{t('common.loading')}</div>
      ) : batches.length === 0 ? (
        <div className="text-xs text-slate-500 mb-2">{t('inventory.batches_none')}</div>
      ) : (
        <ul className="space-y-1 mb-3">
          {batches.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-sm bg-white rounded-lg px-2 py-1.5 border border-amber-100">
              <span className="font-mono tabular-nums">
                <b>
                  {pack > 1
                    ? formatPackStockInput(b.quantity, pack)
                    : b.quantity}
                </b>
                {pack > 1 && (
                  <span className="text-slate-500 text-[10px] ms-1">
                    ({formatPackStockLabel(b.quantity, pack, unit, subUnit || t('inventory.sub_unit_word'))})
                  </span>
                )}
                <span className="text-slate-500 mx-1">×</span>
                {b.expiry_date ? String(b.expiry_date).slice(0, 10) : '—'}
              </span>
              <button
                type="button"
                onClick={() => removeLot(b.id)}
                className="text-xs text-red-600 hover:bg-red-50 px-2 py-0.5 rounded"
              >
                {t('inventory.batches_remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] text-slate-600 block mb-0.5">{t('inventory.batches_expiry')}</label>
          <DateInput value={expiry} onChange={setExpiry} className="input text-sm w-36" />
        </div>
        <div>
          <label className="text-[10px] text-slate-600 block mb-0.5">{t('inventory.batches_qty')}</label>
          <input
            type="text"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={pack > 1 ? (t('inventory.pack_stock_ph') as string) : undefined}
            className="input text-sm w-24"
          />
        </div>
        <button
          type="button"
          onClick={addLot}
          disabled={saving}
          className="px-3 py-2 text-xs rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50"
        >
          {t('inventory.batches_add')}
        </button>
      </div>
    </div>
  )
}

// ─── Item Create/Edit Modal ─────────────────────────────────────────────

function ItemFormModal({ item, onClose, onSaved }: { item?: Product; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const itemExt = item as Product & { material_group?: string; origin_type?: string; medication_type?: string }
  const [f, setF] = useState({
    barcode: item?.barcode || '',
    international_barcode: item?.international_barcode || '',
    name_ar: item?.name_ar || '',
    name_en: item?.name_en || '',
    category: item?.category || '',
    unit: item?.unit || 'box',
    price: item?.price?.toString() || '',
    cost: item?.cost?.toString() || '',
    stock: item?.stock != null
      ? formatPackStockInput(item.stock, packSizeOf(item))
      : '0',
    min_stock: item?.min_stock?.toString() || '5',
    expiry_date: item?.expiry_date || '',
    pack_size: item?.pack_size?.toString() || '1',
    sub_unit: item?.sub_unit || '',
    sub_price: item?.sub_price != null ? String(item.sub_price) : '',
    material_group: itemExt?.material_group || (itemExt?.origin_type === 'imported' ? 'DI' : DEFAULT_MATERIAL_GROUP),
    medication_type: itemExt?.medication_type || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showBarcodeDesigner, setShowBarcodeDesigner] = useState(false)
  const packSize = Math.max(1, parseInt(f.pack_size, 10) || 1)
  const stockPreviewSub = (() => {
    if (!f.stock.trim()) return null
    const n = parsePackStockInput(f.stock, packSize)
    if (n === null) return null
    if (packSize > 1) {
      return formatPackStockLabel(n, packSize, f.unit, f.sub_unit || t('inventory.sub_unit_word'))
    }
    return String(n)
  })()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const priceNum = parseFloat(f.price)
      const payload: any = {
        barcode: f.barcode || null,
        international_barcode: f.international_barcode || null,
        name_ar: f.name_ar,
        name_en: f.name_en,
        category: f.category || null,
        unit: f.unit,
        price: priceNum,
        cost: f.cost ? parseFloat(f.cost) : (priceNum > 0 ? priceNum : null),
        min_stock: parseInt(f.min_stock) || 0,
        ...(item ? {} : { expiry_date: f.expiry_date || null }),
        pack_size: packSize,
        sub_unit: packSize > 1 ? (f.sub_unit || 'piece') : null,
        sub_price: packSize > 1
          ? (f.sub_price ? parseFloat(f.sub_price) : Math.round((priceNum / packSize) * 100) / 100)
          : null,
        material_group: f.material_group || DEFAULT_MATERIAL_GROUP,
        origin_type: originFromMaterialGroup(f.material_group || DEFAULT_MATERIAL_GROUP),
        medication_type: f.medication_type || null,
      }
      if (item) {
        if (f.stock.trim()) {
          const newStock = parsePackStockInput(f.stock, packSize)
          if (newStock === null) {
            setError(t('inventory.err_pack_qty') as string)
            setSaving(false)
            return
          }
          await api.put(`/inventory/products/${item.id}`, payload)
          if (newStock !== Number(item.stock)) {
            await api.post('/inventory/adjustments', {
              product_id: item.id,
              set_to: newStock,
              reason: t('inventory.edit_stock_reason'),
            })
          }
        } else {
          await api.put(`/inventory/products/${item.id}`, payload)
        }
      } else {
        payload.stock = parsePackStockInput(f.stock, packSize) ?? 0
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
    <Modal wide onClose={onClose} title={item ? t('inventory.edit_item') : t('inventory.add_item')}>
      <form onSubmit={submit} className="space-y-6">
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 border-b border-slate-100 pb-2">
            {t('inventory.form_section_basic')}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Field label={t('inventory.f_name_en') + ' *'}>
              <input required value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} className="input" />
            </Field>
            <Field label={t('inventory.f_name_ar')}>
              <input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} className="input" dir="rtl" />
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
            <Field label={t('inventory.f_material_group')}>
              <select
                value={f.material_group}
                onChange={e => setF({ ...f, material_group: e.target.value })}
                className="input"
              >
                {MATERIAL_GROUP_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} — {materialGroupLabel(code, t, lang)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {t('inventory.material_group_hint', {
                  origin: originFromMaterialGroup(f.material_group) === 'imported'
                    ? t('inventory.origin_imported')
                    : t('inventory.origin_local'),
                })}
              </p>
            </Field>
            <Field label={t('inventory.f_medication_type')}>
              <select value={f.medication_type} onChange={e => setF({ ...f, medication_type: e.target.value })} className="input">
                <option value="">{t('common.all')}</option>
                <option value="acute">{t('inventory.med_acute')}</option>
                <option value="chronic">{t('inventory.med_chronic')}</option>
              </select>
            </Field>
            <Field label={t('inventory.f_barcode')}>
              <div className="flex gap-2">
                <input value={f.barcode} onChange={e => setF({ ...f, barcode: e.target.value })} className="input flex-1" placeholder={t('inventory.barcode_auto_ph') as string} />
                <button type="button" onClick={() => setShowBarcodeDesigner(true)}
                  className="px-3 py-2 text-xs rounded-lg border border-pharma-200 text-pharma-700 bg-pharma-50 hover:bg-pharma-100 inline-flex items-center gap-1 whitespace-nowrap">
                  <Wand2 size={13} /> {t('barcode_studio.open')}
                </button>
              </div>
              {!f.barcode.trim() && (
                <p className="text-[11px] text-slate-500 mt-1">{t('inventory.barcode_auto_hint')}</p>
              )}
            </Field>
            <Field label={t('inventory.f_international_barcode')}>
              <input value={f.international_barcode} onChange={e => setF({ ...f, international_barcode: e.target.value })} className="input" />
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
          </div>
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 border-b border-slate-100 pb-2">
            {t('inventory.form_section_pricing')}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Field label={t('inventory.f_price') + ' *'}>
              <input required type="number" step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} className="input" />
            </Field>
            <Field label={t('inventory.f_cost')}>
              <input type="number" step="0.01" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} className="input" />
            </Field>
            <Field label={t('inventory.f_min_stock')}>
              <input type="number" value={f.min_stock} onChange={e => setF({ ...f, min_stock: e.target.value })} className="input" />
            </Field>
          </div>
        </section>

        <section className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
            {t('inventory.form_section_packaging')}
          </h4>
          <p className="text-xs text-slate-500 mb-3">{t('inventory.pack_hint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
          {f.sub_unit && parseInt(f.pack_size) > 1 && (
            <p className="text-[11px] text-slate-500 mt-2">
              1 {f.unit} = {f.pack_size} {f.sub_unit}. {t('inventory.stock_tracked_in', { unit: f.sub_unit })}
              {f.price && (
                <> · {t('inventory.f_price_per', { unit: f.sub_unit })}: {(parseFloat(f.price) / packSize).toFixed(2)} {t('pos.egp')}</>
              )}
            </p>
          )}
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 border-b border-slate-100 pb-2">
            {t('inventory.form_section_stock')}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {!item && (
              <>
                <Field label={t('inventory.f_initial_stock')}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={f.stock}
                    onChange={e => setF({ ...f, stock: e.target.value })}
                    className="input"
                    placeholder={packSize > 1 ? (t('inventory.pack_stock_ph') as string) : undefined}
                  />
                  {packSize > 1 && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      {t('inventory.pack_stock_hint', {
                        unit: f.unit,
                        sub: f.sub_unit || t('inventory.sub_unit_word'),
                        pack: packSize,
                      })}
                    </p>
                  )}
                  {stockPreviewSub && (
                    <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                      = {stockPreviewSub}
                    </p>
                  )}
                </Field>
                <Field label={t('inventory.f_expiry')}>
                  <DateInput value={f.expiry_date} onChange={(v) => setF({ ...f, expiry_date: v })} className="input" />
                </Field>
              </>
            )}
            {item && (
              <Field label={t('inventory.col_stock') + ((item as any).branch_name_en || (item as any).branch_name_ar ? ` — ${i18n.language === 'ar' ? ((item as any).branch_name_ar || (item as any).branch_name_en) : ((item as any).branch_name_en || (item as any).branch_name_ar)}` : '')}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={f.stock}
                  onChange={e => setF({ ...f, stock: e.target.value })}
                  className="input"
                  placeholder={packSize > 1 ? (t('inventory.pack_stock_ph') as string) : undefined}
                />
                {packSize > 1 && f.stock && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {t('inventory.pack_stock_hint', {
                      unit: f.unit,
                      sub: f.sub_unit || t('inventory.sub_unit_word'),
                      pack: packSize,
                    })}
                    {' '}
                    ({t('inventory.stock_tracked_in', { unit: f.sub_unit || t('inventory.sub_unit_word') })})
                  </p>
                )}
                {stockPreviewSub && packSize > 1 && (
                  <p className="text-[11px] text-emerald-700 mt-1 font-medium">= {stockPreviewSub}</p>
                )}
              </Field>
            )}
          </div>
          {item && (
            <div className="mt-4">
              <ExpiryBatchesPanel
                productId={item.id}
                packSize={packSize}
                unit={f.unit}
                subUnit={f.sub_unit || t('inventory.sub_unit_word')}
                onChanged={() => {}}
              />
            </div>
          )}
        </section>

        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
          expiryDate={f.expiry_date || (item ? productLabelExpiry(item) : null)}
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
  const pack = packSizeOf(item)
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add')
  const [qty, setQty] = useState('')
  const [packQty, setPackQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const n = pack > 1
      ? parsePackStockInput(packQty, pack)
      : parseInt(qty, 10)
    if (n === null || n <= 0) {
      setError(pack > 1 ? (t('inventory.err_pack_qty') as string) : (t('inventory.err_qty') as string))
      return
    }
    if (!reason.trim()) { setError(t('inventory.err_reason') as string); return }
    if (mode === 'set' && n === Number(item.stock)) {
      setError(t('inventory.err_same') as string)
      return
    }
    if (mode !== 'set' && n <= 0) {
      setError(pack > 1 ? (t('inventory.err_pack_qty') as string) : (t('inventory.err_qty') as string))
      return
    }
    setSaving(true)
    try {
      if (mode === 'set') {
        await api.post('/inventory/adjustments', {
          product_id: item.id,
          set_to: n,
          reason,
        })
      } else {
        const delta = mode === 'add' ? n : -n
        await api.post('/inventory/adjustments', {
          product_id: item.id,
          delta,
          reason,
        })
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title={t('inventory.adjust_title')}>
      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
        <div className="font-semibold">{i18n.language === 'ar' ? item.name_ar : item.name_en}</div>
        <div className="text-sm text-slate-600">
          {t('inventory.current_stock')}:{' '}
          <span className="font-bold">
            {pack > 1
              ? formatPackStockLabel(item.stock, pack, item.unit, item.sub_unit || t('inventory.sub_unit_word'))
              : item.stock}
          </span>
          {pack > 1 && (
            <span className="text-slate-400 text-xs ms-1">
              ({formatPackStockInput(item.stock, pack)})
            </span>
          )}
        </div>
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
        {pack > 1 ? (
          <Field label={mode === 'set' ? t('inventory.new_stock') : t('inventory.quantity')}>
            <input
              type="text"
              inputMode="decimal"
              value={packQty}
              onChange={e => setPackQty(e.target.value)}
              className="input"
              autoFocus
              placeholder={t('inventory.pack_stock_ph') as string}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {t('inventory.pack_stock_hint', {
                unit: item.unit,
                sub: item.sub_unit || t('inventory.sub_unit_word'),
                pack,
              })}
            </p>
          </Field>
        ) : (
          <Field label={mode === 'set' ? t('inventory.new_stock') : t('inventory.quantity')}>
            <input type="number" required value={qty} onChange={e => setQty(e.target.value)} className="input" autoFocus />
          </Field>
        )}
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
                  <td className="px-3 py-1.5 text-xs">{formatDateTime(m.created_at)}</td>
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

  const moveFilter = useQuickFilter(moves, [
    (m: any) => m.product_name_en,
    (m: any) => m.product_name_ar,
    (m: any) => m.reason,
    (m: any) => m.user_name_en,
    (m: any) => m.user_name_ar,
    (m: any) => t(`inventory.move_${m.movement_type}`, { defaultValue: m.movement_type }),
  ])
  const moveAccessors = useMemo(() => ({
    created_at: (m: any) => m.created_at,
    product: (m: any) => (i18n.language === 'ar' ? m.product_name_ar : m.product_name_en),
    movement_type: (m: any) => m.movement_type,
    quantity: (m: any) => Number(m.quantity),
    balance_after: (m: any) => Number(m.balance_after),
    reason: (m: any) => m.reason,
    user: (m: any) => (i18n.language === 'ar' ? m.user_name_ar : m.user_name_en),
  }), [i18n.language])
  const { sorted: sortedMoves, sort: moveSort, toggle: moveToggle } = useSort(moveFilter.filtered, moveAccessors)

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <select value={type} onChange={e => setType(e.target.value)} className="input max-w-48">
          <option value="">{t('inventory.filter_all_types')}</option>
          <option value="sale">{t('inventory.move_sale')}</option>
          <option value="return">{t('inventory.move_return')}</option>
          <option value="adjustment">{t('inventory.move_adjustment')}</option>
          <option value="initial">{t('inventory.move_initial')}</option>
          <option value="transfer_in">{t('inventory.move_transfer_in')}</option>
          <option value="transfer_out">{t('inventory.move_transfer_out')}</option>
        </select>
        <DateInput value={start} onChange={setStart} className="input max-w-40" />
        <DateInput value={end} onChange={setEnd} className="input max-w-40" />
        <TableFilter value={moveFilter.query} onChange={moveFilter.setQuery} placeholder={t('common.filter_placeholder') as string} className="flex-1 min-w-48" />
        <ExcelExportButton
          onExport={() =>
            downloadApiExcel('/inventory/movements/export', `stock-movements-${new Date().toISOString().slice(0, 10)}.xlsx`, {
              movement_type: type || undefined,
              start_date: start || undefined,
              end_date: end || undefined,
            })
          }
          disabled={moves.length === 0}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <SortTh k="created_at" sort={moveSort} onToggle={moveToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_date')}</SortTh>
              <SortTh k="product" sort={moveSort} onToggle={moveToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_product')}</SortTh>
              <SortTh k="movement_type" sort={moveSort} onToggle={moveToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_type')}</SortTh>
              <SortTh k="quantity" sort={moveSort} onToggle={moveToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.col_qty')}</SortTh>
              <SortTh k="balance_after" sort={moveSort} onToggle={moveToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.col_balance')}</SortTh>
              <SortTh k="reason" sort={moveSort} onToggle={moveToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_reason')}</SortTh>
              <SortTh k="user" sort={moveSort} onToggle={moveToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_user')}</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <TableLoadingRow colSpan={7} />}
            {!loading && sortedMoves.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-slate-400">{t('inventory.no_movements')}</td></tr>}
            {sortedMoves.map((m: any) => (
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
  const todayIso = () => new Date().toISOString().slice(0, 10)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filter, setFilter] = useState<'' | 'fast' | 'slow' | 'dead'>('')

  const useCustom = dateFrom !== '' && dateTo !== ''

  useEffect(() => {
    setLoading(true)
    const params = useCustom ? { date_from: dateFrom, date_to: dateTo } : { days }
    api.get('/inventory/velocity', { params })
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }, [days, useCustom, dateFrom, dateTo])

  const onPresetChange = (value: string) => {
    setDays(parseInt(value, 10))
    setDateFrom('')
    setDateTo('')
  }

  const shown = filter ? rows.filter(r => r.classification === filter) : rows
  const counts = useMemo(() => ({
    fast: rows.filter(r => r.classification === 'fast').length,
    slow: rows.filter(r => r.classification === 'slow').length,
    dead: rows.filter(r => r.classification === 'dead').length,
  }), [rows])

  const velFilter = useQuickFilter(shown, [
    (r: any) => r.name_en,
    (r: any) => r.name_ar,
    (r: any) => r.barcode,
  ])
  const velAccessors = useMemo(() => ({
    name: (r: any) => (i18n.language === 'ar' ? r.name_ar : r.name_en),
    barcode: (r: any) => r.barcode,
    stock: (r: any) => Number(r.stock),
    sold_qty: (r: any) => Number(r.sold_qty),
    classification: (r: any) => r.classification,
  }), [i18n.language])
  const { sorted: sortedVel, sort: velSort, toggle: velToggle } = useSort(velFilter.filtered, velAccessors)

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
            {t('inventory.period')}
          </label>
          <select
            value={String(days)}
            onChange={e => onPresetChange(e.target.value)}
            disabled={useCustom}
            className="input max-w-36 disabled:opacity-50"
          >
            <option value={30}>30 {t('inventory.days')}</option>
            <option value={60}>60 {t('inventory.days')}</option>
            <option value={90}>90 {t('inventory.days')}</option>
          </select>
        </div>
        <span className="text-xs text-slate-400 pb-2 hidden sm:inline">{t('inventory.or_custom_dates')}</span>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
            {t('inventory.from')}
          </label>
          <DateInput
            value={dateFrom}
            max={dateTo || todayIso()}
            onChange={setDateFrom}
            className="input max-w-40"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
            {t('inventory.to')}
          </label>
          <DateInput
            value={dateTo}
            min={dateFrom || undefined}
            max={todayIso()}
            onChange={setDateTo}
            className="input max-w-40"
          />
        </div>
        {useCustom && (
          <button
            type="button"
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs text-slate-500 hover:text-pharma-700 pb-2"
          >
            {t('inventory.clear_dates')}
          </button>
        )}
        <TableFilter value={velFilter.query} onChange={velFilter.setQuery} placeholder={t('common.filter_placeholder') as string} className="flex-1 min-w-48" />
        <ExcelExportButton
          onExport={() =>
            downloadApiExcel('/inventory/velocity/export', `inventory-velocity-${new Date().toISOString().slice(0, 10)}.xlsx`,
              useCustom ? { date_from: dateFrom, date_to: dateTo } : { days },
            )
          }
          disabled={rows.length === 0}
        />
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
              <SortTh k="name" sort={velSort} onToggle={velToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_product')}</SortTh>
              <SortTh k="barcode" sort={velSort} onToggle={velToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_barcode')}</SortTh>
              <SortTh k="stock" sort={velSort} onToggle={velToggle} align="center" className={SORT_TH_CLASS}>{t('inventory.col_stock')}</SortTh>
              <SortTh k="sold_qty" sort={velSort} onToggle={velToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.col_sold')}</SortTh>
              <SortTh k="classification" sort={velSort} onToggle={velToggle} align="center" className={SORT_TH_CLASS}>{t('inventory.col_class')}</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <TableLoadingRow colSpan={5} />}
            {!loading && sortedVel.map((r: any) => (
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

  const alertFilter = useQuickFilter(rows, [
    (r: any) => r.name_en,
    (r: any) => r.name_ar,
  ])
  const alertAccessors = useMemo(() => ({
    name: (r: any) => (i18n.language === 'ar' ? r.name_ar : r.name_en),
    stock: (r: any) => Number(r.stock),
    avg_daily: (r: any) => Number(r.avg_daily),
    days_remaining: (r: any) => (r.days_remaining == null ? null : Number(r.days_remaining)),
    suggested_min: (r: any) => Number(r.suggested_min),
  }), [i18n.language])
  const { sorted: sortedAlerts, sort: alertSort, toggle: alertToggle } = useSort(alertFilter.filtered, alertAccessors)

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
        {t('inventory.alerts_hint')}
      </div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-4 items-center">
        <div className="flex flex-col gap-1">
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
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">{t('inventory.coverage_days')}:</label>
            <select value={coverage} onChange={e => setCoverage(parseInt(e.target.value))} className="input max-w-32">
              <option value={3}>3</option>
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-500 max-w-xs">{t('inventory.coverage_days_hint')}</p>
        </div>
        <TableFilter value={alertFilter.query} onChange={alertFilter.setQuery} placeholder={t('common.filter_placeholder') as string} className="flex-1 min-w-48" />
        <ExcelExportButton
          onExport={() =>
            downloadApiExcel('/inventory/consumption-alerts/export', `inventory-alerts-${new Date().toISOString().slice(0, 10)}.xlsx`, {
              days,
              coverage_days: coverage,
            })
          }
          disabled={rows.length === 0}
        />
        <div className="ms-auto flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg text-sm">
          <AlertTriangle size={15} /> {rows.length} {t('inventory.alerts')}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <SortTh k="name" sort={alertSort} onToggle={alertToggle} align="start" className={SORT_TH_CLASS}>{t('inventory.col_product')}</SortTh>
              <SortTh k="stock" sort={alertSort} onToggle={alertToggle} align="center" className={SORT_TH_CLASS}>{t('inventory.col_stock')}</SortTh>
              <SortTh k="avg_daily" sort={alertSort} onToggle={alertToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.avg_daily')}</SortTh>
              <SortTh k="days_remaining" sort={alertSort} onToggle={alertToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.days_left')}</SortTh>
              <SortTh k="suggested_min" sort={alertSort} onToggle={alertToggle} align="end" className={SORT_TH_CLASS}>{t('inventory.suggested_min')}</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <TableLoadingRow colSpan={5} />}
            {!loading && sortedAlerts.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-emerald-600"><TrendingUp size={28} className="inline mb-1" /> {t('inventory.no_alerts')}</td></tr>}
            {sortedAlerts.map((r: any) => (
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

// ─── Barcode labels tab ────────────────────────────────────────────────

function BarcodeLabelsTab() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showPrint, setShowPrint] = useState(false)

  const load = async () => {
    const searchQ = q.trim()
    if (!searchQ) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const { data } = await api.get<Product[]>('/inventory/items', { params: { q: searchQ } })
      setItems(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const id = setTimeout(load, 300)
    return () => clearTimeout(id)
  }, [q])

  const toggleOne = (id: number) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const withBarcode = items.filter((i) => i.barcode && i.barcode.trim())
  const printItems = withBarcode
    .filter((i) => selected.has(i.id))
    .flatMap((i) => bulkItemsForProduct(i, isAr))

  return (
    <div className="space-y-4">
      <div className="bg-pharma-50 border border-pharma-200 rounded-xl p-4 text-sm text-pharma-900">
        <h2 className="font-semibold text-base mb-2">{t('inventory.barcodes_panel_title')}</h2>
        <p className="mb-2">{t('inventory.barcodes_panel_hint')}</p>
        <ul className="list-disc ps-5 space-y-1 text-pharma-800">
          <li>{t('inventory.barcodes_thermal_note')}</li>
          <li>
            {t('inventory.barcodes_po_note')}{' '}
            <Link to="/purchases" className="font-semibold underline hover:text-pharma-700">
              {t('nav.purchases')}
            </Link>
          </li>
          <li>
            {t('inventory.barcodes_receipt_note')}{' '}
            <Link to="/settings" className="font-semibold underline hover:text-pharma-700">
              {t('nav.settings')}
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-64 relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('inventory.barcodes_search_placeholder') as string}
            className="w-full ps-9 pe-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pharma-500 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowPrint(true)}
          disabled={printItems.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-sm"
        >
          <Printer size={16} />
          {t('inventory.barcode_labels_btn')}
          {selected.size > 0 && (
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">{selected.size}</span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th className="w-8 text-center">
                <input
                  type="checkbox"
                  checked={withBarcode.length > 0 && withBarcode.every((i) => selected.has(i.id))}
                  onChange={() => {
                    setSelected((s) => {
                      const ids = withBarcode.map((i) => i.id)
                      const all = ids.every((id) => s.has(id))
                      if (all) {
                        const n = new Set(s)
                        ids.forEach((id) => n.delete(id))
                        return n
                      }
                      const n = new Set(s)
                      ids.forEach((id) => n.add(id))
                      return n
                    })
                  }}
                />
              </Th>
              <Th>{t('inventory.col_barcode')}</Th>
              <Th>{t('inventory.col_name')}</Th>
              <Th>{t('inventory.col_expiry_lots')}</Th>
              <Th className="text-center">{t('inventory.col_stock')}</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableLoadingRow colSpan={5} />}
            {!loading && !q.trim() && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">
                  {t('inventory.barcodes_search_required')}
                </td>
              </tr>
            )}
            {!loading && q.trim() && items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">{t('inventory.no_items')}</td>
              </tr>
            )}
            {items.map((it) => {
              const hasBc = Boolean(it.barcode && it.barcode.trim())
              return (
                <tr key={it.id} className={`border-t border-slate-100 ${!hasBc ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      disabled={!hasBc}
                      checked={selected.has(it.id)}
                      onChange={() => toggleOne(it.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{it.barcode || '—'}</td>
                  <td className="px-3 py-2 font-medium">{isAr ? it.name_ar : it.name_en}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatExpiryLots(it)}</td>
                  <td className="px-3 py-2 text-center">{formatInt(it.stock)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showPrint && (
        <BulkBarcodePrint
          items={printItems}
          currency={t('pos.egp') as string}
          defaultSize="medium"
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}

// ─── Dose labels tab ─────────────────────────────────────────────────

function DoseLabelsTab() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showPrint, setShowPrint] = useState(false)

  useEffect(() => {
    const searchQ = q.trim()
    if (!searchQ) {
      setItems([])
      return
    }
    const id = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get<Product[]>('/inventory/items', { params: { q: searchQ } })
        setItems(data)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [q])

  const toggleOne = (id: number) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const printItems: DoseLabelItem[] = items
    .filter((i) => selected.has(i.id))
    .map((i) => ({
      id: i.id,
      name: (isAr ? i.name_ar : i.name_en) || i.name_en || i.name_ar || '',
      doseText: '',
      defaultQty: 1,
    }))

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <h2 className="font-semibold text-base mb-2">{t('inventory.dose_panel_title')}</h2>
        <p className="mb-2">{t('inventory.dose_panel_hint')}</p>
        <ul className="list-disc ps-5 space-y-1 text-blue-800">
          <li>{t('inventory.dose_presets_hint')}</li>
          <li>{t('inventory.dose_custom_hint')}</li>
          <li>
            {t('inventory.dose_settings_hint')}{' '}
            <Link to="/settings" className="font-semibold underline hover:text-blue-700">
              {t('nav.settings')}
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-64 relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('inventory.dose_search_placeholder') as string}
            className="w-full ps-9 pe-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowPrint(true)}
          disabled={printItems.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-sm"
        >
          <Printer size={16} />
          {t('inventory.dose_labels_btn')}
          {selected.size > 0 && (
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">{selected.size}</span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th className="w-8 text-center">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((i) => selected.has(i.id))}
                  onChange={() => {
                    setSelected((s) => {
                      const ids = items.map((i) => i.id)
                      const all = ids.every((id) => s.has(id))
                      const n = new Set(s)
                      if (all) ids.forEach((id) => n.delete(id))
                      else ids.forEach((id) => n.add(id))
                      return n
                    })
                  }}
                />
              </Th>
              <Th>{t('inventory.col_name')}</Th>
              <Th>{t('inventory.col_barcode')}</Th>
              <Th className="text-center">{t('inventory.col_stock')}</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && !q.trim() && (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('inventory.dose_search_required')}</td></tr>
            )}
            {!loading && q.trim() && items.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('pos.no_products')}</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)} />
                </td>
                <td className="px-3 py-2 font-medium">{isAr ? it.name_ar : it.name_en}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.barcode || '—'}</td>
                <td className="px-3 py-2 text-center">{formatInt(it.stock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPrint && (
        <DoseLabelPrint items={printItems} onClose={() => setShowPrint(false)} />
      )}
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
  const [progress, setProgress] = useState<{ processed?: number; total?: number; message?: string } | null>(null)

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const submit = async () => {
    if (!file) return
    setError('')
    setProgress(null)
    setResult(null)
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const { data: start } = await api.post('/inventory/bulk-upload', fd, { timeout: 120000 })
      const jobId = start.job_id as string
      setProgress({ message: t('inventory.upload_processing') as string })

      for (let i = 0; i < 3600; i++) {
        await sleep(i === 0 ? 500 : 2000)
        let st: any
        try {
          const res = await api.get(`/inventory/bulk-upload/status/${jobId}`)
          st = res.data
        } catch (pollErr: any) {
          if (pollErr?.response?.status === 404 && i < 5) continue
          throw pollErr
        }
        setProgress({
          processed: st.processed,
          total: st.total,
          message: st.message || (t('inventory.upload_processing') as string),
        })
        if (st.status === 'done') {
          setResult(st)
          break
        }
        if (st.status === 'failed') {
          setError(st.error || st.message || (t('inventory.upload_failed') as string))
          break
        }
      }
    } catch (e: any) {
      setError(formatApiError(e, t('inventory.upload_failed') as string))
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/inventory/bulk-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pharmacy_bulk_template.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(t('inventory.download_failed'))
    }
  }

  return (
    <Modal wide onClose={onClose} title={t('inventory.bulk_upload')}>
      <div className="space-y-4 text-sm">
        <div className="bg-slate-50 p-4 rounded-lg text-slate-700">
          <div className="font-semibold mb-1">{t('inventory.excel_help_title')}</div>
          <div>{t('inventory.excel_help_cols')}</div>
          <div className="text-xs mt-1 text-slate-600">{t('inventory.excel_help_auto')}</div>
          <code className="block mt-2 text-xs bg-white p-3 rounded border border-slate-200 leading-relaxed">
            Code, Material Name, [Name (Arabic)], International Barcode, Material Group, Stock, Unit, Sub unit, Subunit Quantity, Sales Price, Cost, Category, Min Stock, Expiry Date
          </code>
          <p className="text-[11px] text-slate-500 mt-1">{t('inventory.excel_help_optional_ar')}</p>
          <button type="button" onClick={downloadTemplate} className="text-pharma-700 hover:underline text-xs mt-2 inline-block">
            ⬇ {t('inventory.download_template')}
          </button>
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)}
          className="w-full p-2 border border-dashed border-slate-300 rounded-lg" />
        {error && <div className="text-red-600 text-sm whitespace-pre-wrap">{error}</div>}
        {uploading && progress && (
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-900 space-y-1">
            <div className="font-medium">{progress.message}</div>
            {progress.total != null && progress.total > 0 && (
              <div className="text-xs">
                {(progress.processed ?? 0).toLocaleString()} / {progress.total.toLocaleString()} {t('inventory.upload_items')}
              </div>
            )}
            <div className="text-xs text-sky-700">{t('inventory.upload_large_hint')}</div>
          </div>
        )}
        {result && (
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-800">
            ✅ {result.inserted} {t('inventory.imported')}, {result.updated} {t('inventory.updated_count')}, {result.errors} {t('inventory.errors')}
            {(result.merged_duplicates > 0) && (
              <div className="text-xs mt-1">{t('inventory.merged_duplicates', { count: result.merged_duplicates })}</div>
            )}
            {(result.auto_codes > 0 || result.auto_categories > 0) && (
              <div className="text-xs mt-1">
                {result.auto_codes > 0 && <span>{t('inventory.auto_codes', { count: result.auto_codes })} </span>}
                {result.auto_categories > 0 && <span>{t('inventory.auto_categories', { count: result.auto_categories })}</span>}
              </div>
            )}
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
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} max-h-[92vh] overflow-auto`} onClick={e => e.stopPropagation()}>
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
  const { user } = useAuth()
  const isAr = i18n.language === 'ar'
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState<{ branches: { id: number; name_en: string; name_ar: string }[]; items: BranchStockRow[] }>({ branches: [], items: [] })
  const [allBranches, setAllBranches] = useState<{ id: number; name_en: string; name_ar: string }[]>([])
  const [q, setQ] = useState('')
  const [activeQ, setActiveQ] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(() => new Set())
  const [showAllItems, setShowAllItems] = useState(false)
  const [showAllStockInTable, setShowAllStockInTable] = useState(false)
  const [catalog, setCatalog] = useState<{ branches: { id: number; name_en: string; name_ar: string }[]; items: BranchStockRow[] }>({ branches: [], items: [] })
  const lastAutoPickQ = useRef('')

  const searchTerms = useMemo(() => parseSearchTerms(activeQ), [activeQ])
  const multiPick = isMultiTermSearch(activeQ)
  const inputLooksMulti = looksLikeMultiInput(q)

  useEffect(() => {
    if (!isAdmin) return
    api.get('/inventory/branches').then((r) => setAllBranches(r.data)).catch(() => setAllBranches([]))
  }, [isAdmin])

  const branchParams = (): Record<string, number> => {
    const p: Record<string, number> = {}
    if (isAdmin && branchFilter) p.branch_id = parseInt(branchFilter, 10)
    return p
  }

  const loadCatalog = async () => {
    const { data: res } = await api.get('/inventory/branch-stock', {
      params: { ...branchParams(), load_all: true },
    })
    setCatalog({ branches: res.branches || [], items: res.items || [] })
    return res
  }

  const emptyBranchData = () => ({
    branches: allBranches.length > 0 ? allBranches : data.branches,
    items: [] as BranchStockRow[],
    summary: { total_count: 0, shown_count: 0, low_stock: 0, out_of_stock: 0, truncated: false },
  })

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const searchQ = activeQ.trim()
      if (!searchQ && !showAllItems) {
        if (silent) return
        setData(emptyBranchData())
        setPickedKeys(new Set())
        setShowAllStockInTable(false)
        lastAutoPickQ.current = ''
        return
      }
      if (!searchQ && showAllItems) {
        const res = await loadCatalog()
        setData(res)
        if (!silent) {
          setPickedKeys(new Set())
          setShowAllStockInTable(true)
          lastAutoPickQ.current = ''
        }
        return
      }
      const params: Record<string, string | number> = { ...branchParams(), q: searchQ }
      const { data: res } = await api.get('/inventory/branch-stock', { params })
      setData(res)
      // On a silent refresh only the numbers update; never disturb the user's pick state.
      if (silent) return
      if (multiPick) {
        if (lastAutoPickQ.current !== searchQ) {
          lastAutoPickQ.current = searchQ
          setPickedKeys(autoPickKeysPerTerm(res.items || [], searchTerms))
          setShowAllStockInTable(false)
        }
      } else {
        setPickedKeys(new Set())
        setShowAllStockInTable(false)
        lastAutoPickQ.current = ''
      }
      if (catalog.items.length === 0) await loadCatalog()
    } finally { if (!silent) setLoading(false) }
  }

  const applySearch = () => setActiveQ(q.trim())

  useEffect(() => {
    if (inputLooksMulti) return
    const id = setTimeout(() => setActiveQ(q.trim()), 400)
    return () => clearTimeout(id)
  }, [q, inputLooksMulti])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 120_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQ, branchFilter, showAllItems, isAdmin])

  useEffect(() => {
    if (!multiPick) {
      setPickedKeys(new Set())
      setShowAllStockInTable(false)
      lastAutoPickQ.current = ''
    }
  }, [multiPick])

  const tableBranches = multiPick && showAllStockInTable ? catalog.branches : data.branches

  const displayItems = useMemo(() => {
    if (!activeQ.trim() && !showAllItems) return []
    if (!multiPick) return data.items
    if (showAllStockInTable || showAllItems) return catalog.items.length > 0 ? catalog.items : data.items
    if (pickedKeys.size === 0) return []
    return data.items.filter((r) => pickedKeys.has(r.key))
  }, [data.items, catalog.items, multiPick, pickedKeys, showAllStockInTable, showAllItems, activeQ])

  const togglePick = (key: string) => {
    setPickedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const branchName = (b: { name_en: string; name_ar: string }) => isAr ? b.name_ar : b.name_en

  const visibleBranches = useMemo(() => {
    if (tableBranches.length > 0) return tableBranches
    if (data.branches.length > 0) return data.branches
    if (isAdmin && branchFilter) {
      const b = allBranches.find((x) => x.id === parseInt(branchFilter, 10))
      return b ? [b] : []
    }
    return allBranches
  }, [tableBranches, data.branches, allBranches, isAdmin, branchFilter])

  const bsFilter = useQuickFilter(displayItems, [
    (r: BranchStockRow) => r.name_en,
    (r: BranchStockRow) => r.name_ar,
    (r: BranchStockRow) => r.barcode,
    (r: BranchStockRow) => r.international_barcode,
    (r: BranchStockRow) => r.category,
  ])
  const bsAccessors = useMemo(() => ({
    name: (r: BranchStockRow) => (isAr ? r.name_ar : r.name_en),
    barcode: (r: BranchStockRow) => r.barcode,
    total_stock: (r: BranchStockRow) => Number(r.total_stock),
  }), [isAr])
  const { sorted: sortedBs, sort: bsSort, toggle: bsToggle } = useSort(bsFilter.filtered, bsAccessors)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-64 relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('inventory.bs_multi_search_placeholder') as string}
            className="w-full ps-10 pe-3 py-2 border border-slate-300 rounded-lg text-sm"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applySearch()
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          disabled={loading}
          className="bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap"
        >
          {t('inventory.bs_search_btn')}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer whitespace-nowrap px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
          <input
            type="checkbox"
            checked={showAllItems}
            onChange={(e) => {
              setShowAllItems(e.target.checked)
              if (e.target.checked) {
                setActiveQ('')
                setQ('')
              }
            }}
            className="rounded border-slate-300 text-pharma-600 focus:ring-pharma-500"
          />
          {t('inventory.show_all_items')}
        </label>
        {isAdmin && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[10rem]"
          >
            <option value="">{t('inventory.bs_all_branches')}</option>
            {allBranches.map((b) => (
              <option key={b.id} value={b.id}>{branchName(b)}</option>
            ))}
          </select>
        )}
        <TableFilter value={bsFilter.query} onChange={bsFilter.setQuery} placeholder={t('common.filter_placeholder') as string} className="flex-1 min-w-48" />
        <ExcelExportButton
          onExport={async () => {
            const params: Record<string, string | number | boolean> = {}
            if (activeQ.trim()) params.q = activeQ.trim()
            else if (showAllItems) params.load_all = true
            if (multiPick && !showAllStockInTable && !showAllItems && pickedKeys.size > 0) {
              params.keys = Array.from(pickedKeys).join(',')
            }
            if (isAdmin && branchFilter) params.branch_id = parseInt(branchFilter, 10)
            await downloadApiExcel(
              '/inventory/branch-stock/export',
              `branches_stock_${new Date().toISOString().slice(0, 10)}.xlsx`,
              params,
            )
          }}
          disabled={displayItems.length === 0 && !activeQ.trim()}
        />
      </div>

      {multiPick && !loading && activeQ && (
        <BranchStockPickPanel
          items={data.items}
          pickedKeys={pickedKeys}
          onToggle={togglePick}
          onSelectAll={() => setPickedKeys(new Set(data.items.map((r) => r.key)))}
          onClear={() => setPickedKeys(new Set())}
          showAllStock={showAllStockInTable}
          onShowAllStockChange={setShowAllStockInTable}
          isAr={isAr}
        />
      )}
      {multiPick && !loading && activeQ && data.items.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('inventory.bs_multi_no_matches')}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[48rem]">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="name" sort={bsSort} onToggle={bsToggle} align="start">{t('inventory.col_name')}</SortTh>
                <SortTh k="barcode" sort={bsSort} onToggle={bsToggle} align="start">{t('inventory.col_barcode')}</SortTh>
                <th className="px-3 py-2.5 text-start whitespace-nowrap">{t('inventory.col_intl_barcode')}</th>
                {visibleBranches.map(b => (
                  <th key={b.id} className="px-3 py-2.5 text-center whitespace-nowrap">{branchName(b)}</th>
                ))}
                <SortTh k="total_stock" sort={bsSort} onToggle={bsToggle} align="center" className="bg-slate-100">{t('inventory.bs_total')}</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && <TableLoadingRow colSpan={visibleBranches.length + 4} />}
              {!loading && displayItems.length === 0 && data.items.length === 0 && (
                <tr>
                  <td colSpan={visibleBranches.length + 4} className="text-center py-8 text-slate-500 text-sm">
                    {!activeQ.trim() && !showAllItems
                      ? t('inventory.search_or_show_all_hint')
                      : t('inventory.no_items')}
                  </td>
                </tr>
              )}
              {!loading && multiPick && !showAllStockInTable && data.items.length > 0 && sortedBs.length === 0 && (
                <tr><td colSpan={visibleBranches.length + 4} className="text-center py-8 text-slate-500">{t('inventory.bs_pick_none')}</td></tr>
              )}
              {sortedBs.map(row => (
                <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{isAr ? row.name_ar : row.name_en}</div>
                    {row.category && <div className="text-[11px] text-slate-400">{row.category}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">{row.barcode || '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[11px] bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded border border-indigo-100">{row.international_barcode || '—'}</span>
                  </td>
                  {visibleBranches.map(b => {
                    const cell = row.branches.find(x => x.branch_id === b.id)
                    const stock = cell?.stock ?? 0
                    const min = cell?.min_stock ?? 0
                    const missing = cell?.product_id == null
                    const pack = row.pack_size && row.pack_size > 1 ? row.pack_size : 1
                    const cls = missing
                      ? 'text-slate-300'
                      : stock < 0
                        ? 'text-red-700 font-bold'
                        : stock <= 0
                        ? 'text-red-600 font-bold'
                        : stock <= min
                          ? 'text-amber-600 font-semibold'
                          : 'text-slate-700'
                    return (
                      <td
                        key={b.id}
                        className={`px-3 py-2.5 text-center font-mono ${cls}`}
                      >
                        {missing ? '—' : (pack > 1 ? formatDecimalBoxes(stock, pack) : stock)}
                        {!missing && pack > 1 && (
                          <div className="text-[10px] text-slate-400 font-sans">
                            {formatMajorSubLabel(stock, pack, row.unit, row.sub_unit)}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-center font-mono font-bold bg-slate-50">
                    {row.pack_size && row.pack_size > 1
                      ? formatDecimalBoxes(row.total_stock, row.pack_size)
                      : row.total_stock}
                    {row.pack_size && row.pack_size > 1 && (
                      <div className="text-[10px] text-slate-400 font-sans font-normal">
                        {formatMajorSubLabel(row.total_stock, row.pack_size, row.unit, row.sub_unit)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CategoryManagerModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<{ name: string; product_count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/inventory/categories/usage')
      setRows(data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const saveRename = async (oldName: string) => {
    const next = editValue.trim()
    if (!next || next === oldName) { setEditing(null); return }
    setBusy(true)
    try {
      await api.post('/inventory/categories/rename', { old_name: oldName, new_name: next })
      setEditing(null)
      await load()
      onChanged()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally { setBusy(false) }
  }

  const remove = async (name: string) => {
    const reassign = prompt(t('inventory.cat_delete_prompt', { name }) as string, '')
    if (reassign === null) return // cancelled
    if (!confirm((t('inventory.cat_delete_confirm', { name }) as string))) return
    setBusy(true)
    try {
      await api.post('/inventory/categories/delete', { name, reassign_to: reassign.trim() || null })
      await load()
      onChanged()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{t('inventory.manage_categories')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="px-5 py-2 text-xs text-slate-500 border-b bg-slate-50">{t('inventory.cat_manager_hint')}</div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-8 text-slate-400">{t('common.loading')}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-slate-400">{t('inventory.cat_none')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-start">{t('inventory.col_category')}</th>
                  <th className="px-4 py-2 text-center">{t('inventory.col_items')}</th>
                  <th className="px-4 py-2 text-end">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {editing === r.name ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRename(r.name) }}
                          className="w-full border border-slate-300 rounded px-2 py-1"
                        />
                      ) : (
                        <span className="font-medium text-slate-800">{r.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center font-mono text-slate-500">{r.product_count}</td>
                    <td className="px-4 py-2 text-end whitespace-nowrap">
                      {editing === r.name ? (
                        <>
                          <button disabled={busy} onClick={() => saveRename(r.name)} className="text-emerald-600 hover:text-emerald-800 font-medium me-3">{t('common.save')}</button>
                          <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">{t('common.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditing(r.name); setEditValue(r.name) }} className="text-pharma-600 hover:text-pharma-800 me-3"><Edit2 size={15} /></button>
                          <button disabled={busy} onClick={() => remove(r.name)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t bg-slate-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-100">{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}

function StocktakeTab() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isAr = i18n.language === 'ar'
  const isAdmin = user?.role === 'admin'
  const [branches, setBranches] = useState<{ id: number; name_en: string; name_ar: string }[]>([])
  const [branchId, setBranchId] = useState<number | ''>(user?.branch_id || '')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [items, setItems] = useState<any[]>([])
  const [counted, setCounted] = useState<Record<number, string>>({})
  const [expiries, setExpiries] = useState<Record<number, string>>({})
  const [categoriesEdits, setCategoriesEdits] = useState<Record<number, string>>({})
  // Per-product expiry breakdown (multi-expiry mode). Presence of a key = active.
  type StLot = { expiry_date: string; quantity: string }
  const [lotsEdits, setLotsEdits] = useState<Record<number, StLot[]>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [report, setReport] = useState<StocktakeReport | null>(null)
  const [pastRuns, setPastRuns] = useState<StocktakeRunSummary[]>([])
  // Cache of every product seen (loaded or scanned) so counts are never lost
  // when the filtered list changes between scans.
  const cacheRef = useRef<Record<number, any>>({})
  useEffect(() => { items.forEach((it) => { cacheRef.current[it.id] = it }) }, [items])
  const [scan, setScan] = useState('')
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Product IDs in the order they were scanned (most recent first) so the
  // stocktake table lists items as they are scanned, not alphabetically.
  const [scanOrder, setScanOrder] = useState<number[]>([])
  const noteScanOrder = (id: number) =>
    setScanOrder(prev => [id, ...prev.filter(x => x !== id)])
  const scanRef = useRef<HTMLInputElement | null>(null)
  const focusScan = () => window.setTimeout(() => scanRef.current?.focus(), 30)

  const loadPastRuns = async () => {
    if (!branchId) { setPastRuns([]); return }
    try {
      const { data } = await api.get('/inventory/stocktake/runs', { params: { branch_id: branchId, limit: 15 } })
      setPastRuns(data)
    } catch {
      setPastRuns([])
    }
  }

  useEffect(() => {
    api.get('/inventory/branches').then(r => setBranches(r.data)).catch(() => setBranches([]))
    api.get('/inventory/categories').then(r => setCategories(r.data)).catch(() => setCategories([]))
  }, [])

  useEffect(() => { void loadPastRuns() }, [branchId])

  const load = async () => {
    if (!branchId) { setItems([]); return }
    setLoading(true)
    try {
      const params: any = { branch_id: branchId }
      if (q) params.q = q
      if (category) params.category = category
      const { data } = await api.get('/inventory/items', { params })
      setItems(data)
    } finally { setLoading(false) }
  }
  useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id) }, [branchId, q, category])

  const branchName = (b: { name_en: string; name_ar: string }) => isAr ? b.name_ar : b.name_en

  const origExpiry = (it: any) => (it.expiry_date ? String(it.expiry_date).slice(0, 10) : '')
  const curExpiry = (it: any) => (expiries[it.id] !== undefined ? expiries[it.id] : origExpiry(it))
  const origCategory = (it: any) => it.category || ''
  const curCategory = (it: any) => (categoriesEdits[it.id] !== undefined ? categoriesEdits[it.id] : origCategory(it))

  // ─── Multi-expiry (per-batch) stocktake helpers ──────────────────────────
  const origBatches = (it: any): StLot[] =>
    Array.isArray(it.batches)
      ? it.batches
          .filter((b: any) => Number(b.quantity) > 0)
          .map((b: any) => ({
            expiry_date: b.expiry_date ? String(b.expiry_date).slice(0, 10) : '',
            quantity: String(b.quantity),
          }))
      : []
  const lotsActive = (it: any) => lotsEdits[it.id] !== undefined
  const curLots = (it: any): StLot[] => {
    if (lotsEdits[it.id] !== undefined) return lotsEdits[it.id]
    const ob = origBatches(it)
    return ob.length ? ob : [{ expiry_date: origExpiry(it), quantity: String(it.stock || 0) }]
  }
  const lotsSum = (lots: StLot[]) => lots.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0), 0)
  const lotsSig = (lots: StLot[]) =>
    lots
      .filter(l => (parseInt(l.quantity, 10) || 0) > 0)
      .map(l => `${l.expiry_date || '∞'}:${parseInt(l.quantity, 10) || 0}`)
      .sort()
      .join('|')
  const enableLots = (it: any) => setLotsEdits(prev => ({ ...prev, [it.id]: curLots(it) }))
  const disableLots = (it: any) => setLotsEdits(prev => { const n = { ...prev }; delete n[it.id]; return n })
  const updateLot = (id: number, idx: number, field: keyof StLot, value: string) =>
    setLotsEdits(prev => {
      const lots = [...(prev[id] || [])]
      lots[idx] = { ...lots[idx], [field]: value }
      return { ...prev, [id]: lots }
    })
  const addLot = (id: number) =>
    setLotsEdits(prev => ({ ...prev, [id]: [...(prev[id] || []), { expiry_date: '', quantity: '' }] }))
  const removeLot = (id: number, idx: number) =>
    setLotsEdits(prev => ({ ...prev, [id]: (prev[id] || []).filter((_, i) => i !== idx) }))

  const categoryOptions = useMemo(() => {
    const set = new Set<string>([...STANDARD_CATEGORIES, ...categories])
    items.forEach((it) => { if (it.category) set.add(it.category) })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [categories, items])

  // Increment a product's counted quantity by `by` (used by the scanner).
  const bumpCount = (id: number, by = 1) =>
    setCounted(prev => {
      const base = parseInt(prev[id] ?? '', 10)
      return { ...prev, [id]: String((Number.isFinite(base) ? base : 0) + by) }
    })

  const handleScan = async (raw: string) => {
    const code = (raw || '').trim()
    if (!code) return
    setScan('')
    const norm = (s: any) => String(s || '').trim().toLowerCase()
    const isBarcodeHit = (p: any) =>
      (p?.barcode && norm(p.barcode) === norm(code)) ||
      (p?.international_barcode && norm(p.international_barcode) === norm(code))
    let prod: any = Object.values(cacheRef.current).find(isBarcodeHit)
    if (!prod) {
      try {
        const { data } = await api.get('/inventory/items', { params: { branch_id: branchId, q: code } })
        const list = Array.isArray(data) ? data : []
        // Prefer an exact barcode match; the backend already normalizes scanner
        // wrappers/EAN variants. Only accept a non-barcode result when the
        // query is unambiguous (a single hit) so we never count the wrong item.
        prod = list.find(isBarcodeHit) || (list.length === 1 ? list[0] : undefined)
        if (prod) cacheRef.current[prod.id] = prod
      } catch { /* ignore */ }
    }
    if (!prod) {
      setScanMsg({ ok: false, text: (t('inventory.st_scan_notfound', { code }) as string) })
      focusScan()
      return
    }
    cacheRef.current[prod.id] = prod
    noteScanOrder(prod.id)
    const base = parseInt(counted[prod.id] ?? '', 10)
    const newCount = (Number.isFinite(base) ? base : 0) + 1
    bumpCount(prod.id, 1)
    const nm = isAr ? prod.name_ar : prod.name_en
    setScanMsg({ ok: true, text: `${nm} × ${newCount}` })
    focusScan()
  }

  // Products that have any edit (counted/expiry/category/lots) — resolved from
  // the cache so previously scanned items survive list/filter changes.
  const applyPool = useMemo(() => {
    const m = new Map<number, any>()
    items.forEach((it) => m.set(it.id, it))
    const ids = new Set<number>([
      ...Object.keys(counted),
      ...Object.keys(expiries),
      ...Object.keys(categoriesEdits),
      ...Object.keys(lotsEdits),
    ].map(Number))
    ids.forEach((id) => { if (!m.has(id) && cacheRef.current[id]) m.set(id, cacheRef.current[id]) })
    return [...m.values()]
  }, [items, counted, expiries, categoriesEdits, lotsEdits])

  // Counted items summary (running tally), independent of the current filter.
  const countedSummary = useMemo(() => {
    return Object.keys(counted)
      .filter((id) => counted[+id] !== '' && counted[+id] !== undefined)
      .map((id) => cacheRef.current[+id])
      .filter(Boolean)
  }, [counted])

  const toApply = applyPool
    .map(it => {
      const curCat = curCategory(it)
      const catChanged = curCat !== origCategory(it)
      if (lotsActive(it)) {
        const lots = curLots(it)
        const total = lotsSum(lots)
        const countChanged = total !== Number(it.stock)
        const lotsChanged = lotsSig(lots) !== lotsSig(origBatches(it))
        return {
          it, counted: total, curExp: '', curCat,
          countChanged, expChanged: false, catChanged, isLots: true, lotsChanged, lots,
        }
      }
      const raw = counted[it.id]
      const hasC = raw !== '' && raw !== undefined
      const pack = packSizeOf(it)
      const cnum = hasC ? parsePackStockInput(String(raw), pack) : null
      const countChanged = cnum !== null && cnum !== Number(it.stock)
      const curExp = curExpiry(it)
      const expChanged = curExp !== '' && curExp !== origExpiry(it)
      return {
        it,
        counted: countChanged && cnum !== null ? cnum : Number(it.stock),
        curExp,
        curCat,
        countChanged,
        expChanged,
        catChanged,
        isLots: false,
        lotsChanged: false,
        lots: [] as StLot[],
      }
    })
    .filter(r => r.countChanged || r.expChanged || r.catChanged || r.lotsChanged)

  // Table shows the searched/loaded items PLUS any scanned/counted items
  // (resolved from the cache) so scanned products appear in the full editable
  // table even when nothing is searched. Scanned items are listed first in
  // scan order (most recent on top); the rest follow the loaded list order.
  const tableSource = useMemo(() => {
    const byId = new Map<number, any>()
    countedSummary.forEach((it) => byId.set(it.id, it))
    items.forEach((it) => { if (!byId.has(it.id)) byId.set(it.id, it) })

    const ordered: any[] = []
    const used = new Set<number>()
    // 1) Scanned items, newest first.
    scanOrder.forEach((id) => {
      const it = byId.get(id) || cacheRef.current[id]
      if (it && !used.has(id)) { ordered.push(it); used.add(id) }
    })
    // 2) Remaining counted/loaded items in their existing order.
    byId.forEach((it, id) => { if (!used.has(id)) { ordered.push(it); used.add(id) } })
    return ordered
  }, [items, countedSummary, scanOrder])

  const stFilter = useQuickFilter(tableSource, [
    (it: any) => it.name_en,
    (it: any) => it.name_ar,
    (it: any) => it.barcode,
    (it: any) => it.category,
  ])
  const stAccessors = useMemo(() => ({
    name: (it: any) => (isAr ? it.name_ar : it.name_en),
    category: (it: any) => it.category || '',
    barcode: (it: any) => it.barcode,
    stock: (it: any) => Number(it.stock),
  }), [isAr])
  const { sorted: sortedSt, sort: stSort, toggle: stToggle } = useSort(stFilter.filtered, stAccessors)

  const apply = async () => {
    if (toApply.length === 0) return
    const msg = (t('inventory.st_confirm') as string).replace('{n}', String(toApply.length))
    if (!confirm(msg)) return
    setApplying(true)
    try {
      const payload = {
        items: toApply.map(r => r.isLots ? ({
          product_id: r.it.id,
          counted: r.counted,
          category: r.catChanged ? r.curCat : undefined,
          lots: r.lots
            .filter(l => (parseInt(l.quantity, 10) || 0) > 0)
            .map(l => ({ expiry_date: l.expiry_date || null, quantity: parseInt(l.quantity, 10) || 0 })),
        }) : ({
          product_id: r.it.id,
          counted: r.counted,
          expiry_date: r.expChanged ? r.curExp : undefined,
          category: r.catChanged ? r.curCat : undefined,
        })),
        note: note.trim() || undefined,
      }
      const { data } = await api.post('/inventory/stocktake', payload)
      if (data.report) {
        setReport(data.report)
      } else {
        alert((t('inventory.st_done') as string).replace('{n}', String(data.changed)))
      }
      setCounted({})
      setExpiries({})
      setCategoriesEdits({})
      setLotsEdits({})
      setScanMsg(null)
      setScanOrder([])
      cacheRef.current = {}
      await load()
      await loadPastRuns()
      focusScan()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('inventory.st_error'))
    } finally { setApplying(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <select
          value={branchId}
          onChange={e => { setBranchId(e.target.value ? Number(e.target.value) : ''); setCounted({}); setCategoriesEdits({}); setExpiries({}); setLotsEdits({}); cacheRef.current = {}; setScanMsg(null); setScanOrder([]) }}
          disabled={!isAdmin}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-pharma-500 disabled:bg-slate-50"
        >
          <option value="">{t('inventory.st_select_branch')}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{branchName(b)}</option>)}
        </select>
        <div className="flex-1 min-w-56 relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('inventory.search_placeholder') as string}
            className="w-full ps-10 pe-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-pharma-500"
        >
          <option value="">{t('inventory.filter_all_categories')}</option>
          {categories.map(c => <option key={c} value={c}>{t(`inventory.cat_${c}`, c)}</option>)}
        </select>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('inventory.st_note_ph') as string}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-48"
        />
        <TableFilter value={stFilter.query} onChange={stFilter.setQuery} placeholder={t('common.filter_placeholder') as string} className="flex-1 min-w-48" />
        <ExcelExportButton
          onExport={() =>
            downloadApiExcel('/inventory/items/export', `stocktake-${new Date().toISOString().slice(0, 10)}.xlsx`, {
              branch_id: branchId as number,
              q: q || undefined,
              category: category || undefined,
            })
          }
          disabled={!branchId || items.length === 0}
        />
        <button
          onClick={apply}
          disabled={toApply.length === 0 || applying}
          className="flex items-center gap-1.5 px-4 py-2 bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg text-sm font-medium disabled:opacity-40"
        >
          {applying ? t('common.loading') : `${t('inventory.st_apply')}${toApply.length ? ` (${toApply.length})` : ''}`}
        </button>
      </div>

      {branchId && (
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-72 relative">
            <ScanLine size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-pharma-600" />
            <input
              ref={scanRef}
              type="text"
              value={scan}
              autoFocus
              onChange={e => setScan(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan((e.target as HTMLInputElement).value) } }}
              placeholder={t('inventory.st_scan_ph') as string}
              className="w-full ps-10 pe-3 py-2.5 border-2 border-pharma-300 rounded-lg text-sm focus:ring-2 focus:ring-pharma-500"
            />
          </div>
          {scanMsg && (
            <span className={`text-sm font-semibold ${scanMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {scanMsg.ok ? '✓ ' : '✕ '}{scanMsg.text}
            </span>
          )}
          {countedSummary.length > 0 ? (
            <span className="text-xs text-slate-600">
              {t('inventory.st_scanned_title')}: <b>{countedSummary.length}</b>
              <button
                onClick={() => { setCounted({}); setScanMsg(null); setScanOrder([]); focusScan() }}
                className="ms-2 text-red-500 hover:text-red-700 font-medium"
              >
                {t('inventory.st_clear_counts')}
              </button>
            </span>
          ) : (
            <span className="text-xs text-slate-400">{t('inventory.st_scan_help')}</span>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 px-1">{t('inventory.st_hint')}</div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="name" sort={stSort} onToggle={stToggle} align="start">{t('inventory.col_name')}</SortTh>
                <SortTh k="category" sort={stSort} onToggle={stToggle} align="start">{t('inventory.col_category')}</SortTh>
                <SortTh k="barcode" sort={stSort} onToggle={stToggle} align="start">{t('inventory.col_barcode')}</SortTh>
                <SortTh k="stock" sort={stSort} onToggle={stToggle} align="center">{t('inventory.st_system')}</SortTh>
                <th className="px-3 py-2.5 text-center">{t('inventory.st_counted')}</th>
                <th className="px-3 py-2.5 text-center">{t('inventory.st_variance_major')}</th>
                <th className="px-3 py-2.5 text-center">{t('inventory.st_variance_sub')}</th>
                <th className="px-3 py-2.5 text-center">{t('inventory.f_expiry')}</th>
              </tr>
            </thead>
            <tbody>
              {!branchId && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('inventory.st_select_branch')}</td></tr>
              )}
              {branchId && loading && <TableLoadingRow colSpan={8} />}
              {branchId && !loading && sortedSt.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('inventory.no_items')}</td></tr>
              )}
              {branchId && sortedSt.map(it => {
                const raw = counted[it.id]
                const has = raw !== '' && raw !== undefined
                const pack = packSizeOf(it)
                const isLots = lotsActive(it)
                const lots = isLots ? curLots(it) : []
                const val = isLots ? lotsSum(lots) : (has ? parsePackStockInput(String(raw), pack) : null)
                const split = val !== null ? stockVarianceSplit(val, Number(it.stock), pack) : null
                const unitLabel = it.unit || t('inventory.sub_unit_word')
                const subLabel = it.sub_unit || t('inventory.sub_unit_word')
                const varianceCell = (n: number, zeroClass = 'text-slate-400') => {
                  if (n === 0) return <span className={zeroClass}>0</span>
                  if (n > 0) return <span className="text-emerald-600">{formatVarianceMajorUnits(n)}</span>
                  return <span className="text-red-600">{formatVarianceMajorUnits(n)}</span>
                }
                const subVarianceCell = (n: number) => {
                  if (n === 0) return <span className="text-slate-400">0</span>
                  if (n > 0) return <span className="text-emerald-600">{formatVarianceSubFraction(n)}</span>
                  return <span className="text-red-600">{formatVarianceSubFraction(n)}</span>
                }
                return (
                  <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">{isAr ? it.name_ar : it.name_en}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={curCategory(it)}
                        onChange={e => setCategoriesEdits(prev => ({ ...prev, [it.id]: e.target.value }))}
                        className="w-full min-w-[7rem] border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-pharma-500"
                      >
                        <option value="">—</option>
                        {categoryOptions.map(c => (
                          <option key={c} value={c}>{String(t(`inventory.cat_${c}`, c))}</option>
                        ))}
                        {curCategory(it) && !categoryOptions.includes(curCategory(it)) && (
                          <option value={curCategory(it)}>{curCategory(it)}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{it.barcode || '—'}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-slate-700">
                      {pack > 1
                        ? formatPackStockLabel(it.stock, pack, it.unit, it.sub_unit || t('inventory.sub_unit_word'))
                        : it.stock}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isLots ? (
                        <div className="text-sm font-mono text-slate-700">
                          {val}
                          <div className="text-[10px] text-slate-400 font-sans">{t('inventory.st_from_lots')}</div>
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={raw ?? ''}
                          onChange={e => setCounted(prev => ({ ...prev, [it.id]: e.target.value }))}
                          placeholder={pack > 1 ? (t('inventory.pack_stock_ph') as string) : undefined}
                          className="w-28 text-center border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-pharma-500"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs">
                      {split === null ? <span className="text-slate-300">—</span> : (
                        <span className="font-semibold">
                          {varianceCell(split.major)}
                          {pack > 1 && split.major !== 0 && (
                            <span className="text-slate-500 font-normal ms-0.5">{unitLabel}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs">
                      {split === null ? <span className="text-slate-300">—</span>
                        : pack <= 1 ? <span className="text-slate-300">—</span> : (
                          <span className="font-semibold">
                            {subVarianceCell(split.subFraction)}
                            {split.subFraction !== 0 && (
                              <span className="text-slate-500 font-normal ms-0.5">{subLabel}</span>
                            )}
                          </span>
                        )}
                    </td>
                    <td className="px-3 py-2.5 text-center align-top">
                      {isLots ? (
                        <div className="min-w-[17rem] text-start bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            <span className="flex-1">{t('inventory.f_expiry')}</span>
                            <span className="w-16 text-end">{t('inventory.st_qty')}</span>
                            <span className="w-5" />
                          </div>
                          {lots.map((lot, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <DateInput
                                value={lot.expiry_date}
                                onChange={(v) => updateLot(it.id, idx, 'expiry_date', v)}
                                className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-pharma-500"
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={lot.quantity}
                                onChange={(e) => updateLot(it.id, idx, 'quantity', e.target.value)}
                                placeholder="0"
                                className="w-16 text-end font-mono tabular-nums border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-pharma-500"
                              />
                              <button
                                type="button"
                                onClick={() => removeLot(it.id, idx)}
                                className="w-5 flex-shrink-0 text-slate-400 hover:text-red-500"
                                title={t('common.remove') as string}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5">
                            <button
                              type="button"
                              onClick={() => addLot(it.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-pharma-600 hover:text-pharma-800 font-medium"
                            >
                              <Plus size={12} /> {t('inventory.st_add_expiry')}
                            </button>
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`text-[11px] font-semibold tabular-nums ${
                                  val === Number(it.stock)
                                    ? 'text-slate-500'
                                    : (val ?? 0) > Number(it.stock)
                                      ? 'text-emerald-600'
                                      : 'text-red-600'
                                }`}
                                title={`${t('inventory.st_system')}: ${it.stock}`}
                              >
                                {t('inventory.st_total')}: {val} / {it.stock}
                              </span>
                              <button
                                type="button"
                                onClick={() => disableLots(it)}
                                className="text-[11px] text-slate-400 hover:text-slate-600"
                              >
                                {t('inventory.st_single_expiry')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <DateInput
                            value={curExpiry(it)}
                            onChange={(v) => setExpiries(prev => ({ ...prev, [it.id]: v }))}
                            className="w-28 text-center border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-pharma-500"
                          />
                          <button
                            type="button"
                            onClick={() => enableLots(it)}
                            className="text-[11px] text-pharma-600 hover:text-pharma-800 font-medium"
                          >
                            {t('inventory.st_multi_expiry')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pastRuns.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">{t('inventory.st_report_recent')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t('inventory.st_report_date')}</th>
                  <th className="px-3 py-2 text-start">{t('inventory.st_report_note')}</th>
                  <th className="px-3 py-2 text-end">{t('inventory.st_report_shortages')}</th>
                  <th className="px-3 py-2 text-end">{t('inventory.st_report_increases')}</th>
                  <th className="px-3 py-2 text-end">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pastRuns.map((run) => (
                  <tr key={run.run_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(run.created_at)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{run.note || '—'}</td>
                    <td className="px-3 py-2 text-end text-xs font-mono text-red-600">{run.shortages_count || 0}</td>
                    <td className="px-3 py-2 text-end text-xs font-mono text-emerald-600">{run.increases_count || 0}</td>
                    <td className="px-3 py-2 text-end">
                      <button
                        type="button"
                        onClick={async () => {
                          const { data } = await api.get(`/inventory/stocktake/runs/${run.run_id}`)
                          setReport(data)
                        }}
                        className="text-xs text-pharma-600 hover:text-pharma-800 font-medium"
                      >
                        {t('inventory.st_report_view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report && (
        <StocktakeReportModal report={report} onClose={() => setReport(null)} />
      )}
    </div>
  )
}

type StocktakeReportLine = {
  product_id: number
  name_en: string
  name_ar: string
  barcode: string | null
  category: string | null
  pack_size: number
  unit: string
  sub_unit: string | null
  old_stock: number
  new_stock: number
  delta: number
  cost?: number
  cost_value?: number
  variance_major: number
  variance_sub_fraction: number
  old_category?: string | null
  new_category?: string | null
  old_expiry?: string | null
  new_expiry?: string | null
}

type StocktakeReport = {
  run_id: number
  branch_id: number
  branch_name_en: string
  branch_name_ar: string
  note: string | null
  created_at: string
  user_name_en: string | null
  user_name_ar: string | null
  summary: {
    total_lines: number
    shortages_count: number
    increases_count: number
    other_count: number
    shortage_units: number
    increase_units: number
    shortage_cost?: number
    increase_cost?: number
    net_cost?: number
  }
  shortages: StocktakeReportLine[]
  increases: StocktakeReportLine[]
  other_changes: StocktakeReportLine[]
}

type StocktakeRunSummary = {
  run_id: number
  created_at: string
  note: string | null
  shortages_count: number
  increases_count: number
}

function StocktakeReportModal({ report, onClose }: { report: StocktakeReport; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const branchName = isAr ? report.branch_name_ar : report.branch_name_en
  const userName = isAr ? report.user_name_ar : report.user_name_en

  const renderSection = (
    title: string,
    rows: StocktakeReportLine[],
    tone: 'red' | 'green' | 'slate',
  ) => (
    <div className="space-y-2">
      <h4 className={`text-sm font-semibold ${tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-slate-700'}`}>
        {title} ({rows.length})
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">{t('inventory.st_report_none')}</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2 text-start">{t('inventory.col_name')}</th>
                <th className="px-2 py-2 text-start">{t('inventory.col_barcode')}</th>
                <th className="px-2 py-2 text-end">{t('inventory.st_system')}</th>
                <th className="px-2 py-2 text-end">{t('inventory.st_counted')}</th>
                <th className="px-2 py-2 text-center">{t('inventory.st_variance_major')}</th>
                <th className="px-2 py-2 text-center">{t('inventory.st_variance_sub')}</th>
                <th className="px-2 py-2 text-end">{t('inventory.st_report_cost')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ln) => {
                const pack = packSizeOf(ln)
                const unitLabel = ln.unit || t('inventory.sub_unit_word')
                const subLabel = ln.sub_unit || t('inventory.sub_unit_word')
                return (
                  <tr key={ln.product_id} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-800">{isAr ? ln.name_ar : ln.name_en}</td>
                    <td className="px-2 py-2 font-mono text-slate-500">{ln.barcode || '—'}</td>
                    <td className="px-2 py-2 text-end font-mono">
                      {pack > 1 ? formatPackStockLabel(ln.old_stock, pack, ln.unit, subLabel) : ln.old_stock}
                    </td>
                    <td className="px-2 py-2 text-end font-mono">
                      {pack > 1 ? formatPackStockLabel(ln.new_stock, pack, ln.unit, subLabel) : ln.new_stock}
                    </td>
                    <td className={`px-2 py-2 text-center font-mono font-semibold ${tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {ln.delta === 0 ? '—' : (
                        <>
                          {formatVarianceMajorUnits(ln.variance_major)}
                          {pack > 1 && ln.variance_major !== 0 && <span className="text-slate-400 font-normal ms-0.5">{unitLabel}</span>}
                        </>
                      )}
                    </td>
                    <td className={`px-2 py-2 text-center font-mono font-semibold ${tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {pack <= 1 || ln.delta === 0 ? '—' : (
                        <>
                          {formatVarianceSubFraction(ln.variance_sub_fraction)}
                          {ln.variance_sub_fraction !== 0 && <span className="text-slate-400 font-normal ms-0.5">{subLabel}</span>}
                        </>
                      )}
                    </td>
                    <td className={`px-2 py-2 text-end font-mono font-semibold ${(ln.cost_value || 0) < 0 ? 'text-red-600' : (ln.cost_value || 0) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {ln.cost_value ? formatMoney(ln.cost_value) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('inventory.st_report_title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {branchName} · {formatDateTime(report.created_at)}
              {userName ? ` · ${userName}` : ''}
              {report.note ? ` · ${report.note}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-[10px] uppercase text-red-600 font-semibold">{t('inventory.st_report_shortages')}</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums">{report.summary.shortages_count}</p>
              <p className="text-[10px] text-red-600/80">{t('inventory.st_report_cost')}: {formatMoney(report.summary.shortage_cost || 0)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-[10px] uppercase text-emerald-600 font-semibold">{t('inventory.st_report_increases')}</p>
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{report.summary.increases_count}</p>
              <p className="text-[10px] text-emerald-600/80">{t('inventory.st_report_cost')}: {formatMoney(report.summary.increase_cost || 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">{t('inventory.st_report_total')}</p>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{report.summary.total_lines}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-[10px] uppercase text-amber-700 font-semibold">{t('inventory.st_report_other')}</p>
              <p className="text-2xl font-bold text-amber-800 tabular-nums">{report.summary.other_count}</p>
              <p className="text-[10px] text-amber-700/80">{t('inventory.st_report_other_hint')}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{t('inventory.st_report_net_cost')}</span>
            <span className={`text-lg font-bold tabular-nums ${(report.summary.net_cost || 0) < 0 ? 'text-red-700' : (report.summary.net_cost || 0) > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
              {formatMoney(report.summary.net_cost || 0)}
            </span>
          </div>
          {renderSection(t('inventory.st_report_shortages'), report.shortages, 'red')}
          {renderSection(t('inventory.st_report_increases'), report.increases, 'green')}
          {report.other_changes.length > 0 && renderSection(t('inventory.st_report_other'), report.other_changes, 'slate')}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void downloadApiExcel(
              `/inventory/stocktake/runs/${report.run_id}/export`,
              `stocktake_report_${report.run_id}.xlsx`,
            )}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet size={15} /> {t('inventory.st_report_export')}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-pharma-600 text-white rounded-lg text-sm font-medium hover:bg-pharma-700">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
