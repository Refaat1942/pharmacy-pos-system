import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Layers, Download, Building2, Package } from 'lucide-react'
import Layout from '../components/Layout'
import BranchStockPickPanel from '../components/BranchStockPickPanel'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api, { branchesAPI, type Branch } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  autoPickKeysPerTerm,
  isMultiTermSearch,
  looksLikeMultiInput,
  parseSearchTerms,
} from '../lib/branchStockPick'
import i18n from '../lib/i18n'

const fmtInt = (n: number) =>
  Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')

type Row = {
  key: string
  barcode: string | null
  international_barcode?: string | null
  name_en: string
  name_ar: string
  category: string | null
  unit: string
  total_stock: number
  total_min: number
  branches: {
    branch_id: number
    branch_name_en: string
    branch_name_ar: string
    stock: number
    min_stock: number
    product_id: number | null
  }[]
}

function BarcodePill({
  value,
  variant = 'local',
}: {
  value: string | null | undefined
  variant?: 'local' | 'intl'
}) {
  if (!value) {
    return <span className="text-slate-300 text-xs">—</span>
  }
  const styles =
    variant === 'intl'
      ? 'bg-indigo-50 text-indigo-900 border-indigo-200/80'
      : 'bg-slate-100 text-slate-800 border-slate-200/80'
  return (
    <span
      className={`inline-block max-w-[11rem] truncate font-mono text-[11px] tracking-wide px-2 py-1 rounded-md border ${styles}`}
      title={value}
    >
      {value}
    </span>
  )
}

function stockStatus(stock: number, min: number, missing: boolean) {
  if (missing) return 'missing' as const
  if (stock <= 0) return 'out' as const
  if (stock <= min) return 'low' as const
  return 'ok' as const
}

export default function BranchesStock() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isAr = i18n.language === 'ar'
  const isAdmin = user?.role === 'admin'

  const [data, setData] = useState<{
    branches: Branch[]
    items: Row[]
    summary?: {
      total_count: number
      shown_count: number
      low_stock: number
      out_of_stock: number
      truncated?: boolean
    }
  }>({ branches: [], items: [] })
  const [allBranches, setAllBranches] = useState<Branch[]>([])
  const [q, setQ] = useState('')
  const [activeQ, setActiveQ] = useState('')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(() => new Set())
  const [showAllStockInTable, setShowAllStockInTable] = useState(false)
  const [catalog, setCatalog] = useState<{ branches: Branch[]; items: Row[] }>({ branches: [], items: [] })
  const lastAutoPickQ = useRef('')

  const searchTerms = useMemo(() => parseSearchTerms(activeQ), [activeQ])
  const multiPick = isMultiTermSearch(activeQ)
  const inputLooksMulti = looksLikeMultiInput(q)

  useEffect(() => {
    if (!isAdmin) return
    branchesAPI
      .list()
      .then((r) => setAllBranches(r.data))
      .catch(() => setAllBranches([]))
  }, [isAdmin])

  const branchName = (b: { name_en: string; name_ar: string }) => (isAr ? b.name_ar : b.name_en)

  const branchParams = (): Record<string, number> => {
    const p: Record<string, number> = {}
    if (isAdmin && branchFilter) p.branch_id = parseInt(branchFilter, 10)
    return p
  }

  const loadCatalog = async () => {
    const { data: res } = await api.get('/inventory/branch-stock', { params: branchParams() })
    setCatalog({ branches: res.branches || [], items: res.items || [] })
    return res
  }

  const load = async () => {
    setLoading(true)
    try {
      const searchQ = activeQ.trim()
      if (!searchQ) {
        const res = await loadCatalog()
        setData(res)
        setPickedKeys(new Set())
        setShowAllStockInTable(false)
        lastAutoPickQ.current = ''
        return
      }
      const params: Record<string, string | number> = { ...branchParams(), q: searchQ }
      const { data: res } = await api.get('/inventory/branch-stock', { params })
      setData(res)
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
      if (catalog.items.length === 0) {
        await loadCatalog()
      }
    } finally {
      setLoading(false)
    }
  }

  const applySearch = () => setActiveQ(q.trim())

  useEffect(() => {
    if (inputLooksMulti) return
    const id = setTimeout(() => setActiveQ(q.trim()), 400)
    return () => clearTimeout(id)
  }, [q, inputLooksMulti])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQ, branchFilter, isAdmin])

  useEffect(() => {
    if (!multiPick) {
      setPickedKeys(new Set())
      setShowAllStockInTable(false)
      lastAutoPickQ.current = ''
    }
  }, [multiPick])

  const tableBranches = multiPick && showAllStockInTable ? catalog.branches : data.branches
  const singleBranch = isAdmin && branchFilter !== ''
  const visibleBranches =
    tableBranches.length > 0 ? tableBranches : data.branches.length > 0 ? data.branches : allBranches

  const displayItems = useMemo(() => {
    if (!multiPick) return data.items
    if (showAllStockInTable) return catalog.items
    if (pickedKeys.size === 0) return []
    return data.items.filter((r) => pickedKeys.has(r.key))
  }, [data.items, catalog.items, multiPick, pickedKeys, showAllStockInTable])

  const bsFilter = useQuickFilter(displayItems, [
    (r: Row) => r.name_en,
    (r: Row) => r.name_ar,
    (r: Row) => r.barcode,
    (r: Row) => r.international_barcode,
    (r: Row) => r.category,
  ])
  const bsAccessors = useMemo(() => {
    const acc: Record<string, (r: Row) => unknown> = {
      name: (r) => (isAr ? r.name_ar : r.name_en) || '',
      barcode: (r) => r.barcode || '',
      intl_barcode: (r) => r.international_barcode || '',
      category: (r) => r.category || '',
      total_stock: (r) => Number(r.total_stock) || 0,
    }
    if (singleBranch && visibleBranches[0]) {
      const bid = visibleBranches[0].id
      acc.stock = (r) => r.branches.find((x) => x.branch_id === bid)?.stock ?? 0
      acc.min_stock = (r) => r.branches.find((x) => x.branch_id === bid)?.min_stock ?? 0
    }
    return acc
  }, [isAr, singleBranch, visibleBranches])
  const { sorted: sortedDisplayItems, sort: bsSort, toggle: bsToggle } = useSort(
    bsFilter.filtered,
    bsAccessors,
    singleBranch ? { key: 'stock', dir: 'asc' } : { key: 'total_stock', dir: 'asc' },
  )

  const togglePick = (key: string) => {
    setPickedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      const params: Record<string, string | number> = {}
      if (activeQ.trim()) params.q = activeQ.trim()
      if (multiPick && !showAllStockInTable && pickedKeys.size > 0) {
        params.keys = Array.from(pickedKeys).join(',')
      }
      if (isAdmin && branchFilter) params.branch_id = parseInt(branchFilter, 10)
      const res = await api.get('/inventory/branch-stock/export', {
        params,
        responseType: 'blob',
      })
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `branches_stock_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const stats = useMemo(() => {
    const s = data.summary
    return {
      items: s?.total_count ?? data.items.length,
      shown: s?.shown_count ?? data.items.length,
      low: s?.low_stock ?? 0,
      out: s?.out_of_stock ?? 0,
      truncated: s?.truncated ?? false,
    }
  }, [data.summary, data.items.length])

  const statusBadge = (st: ReturnType<typeof stockStatus>) => {
    if (st === 'ok') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
          {t('inventory.filter_ok')}
        </span>
      )
    }
    if (st === 'low') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-100">
          {t('inventory.filter_low')}
        </span>
      )
    }
    if (st === 'out') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
          {t('inventory.filter_zero')}
        </span>
      )
    }
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-100">
        —
      </span>
    )
  }

  const colSpan =
    3 +
    (singleBranch ? 3 : visibleBranches.length + 1)

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-[100rem] mx-auto w-full min-w-0">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-pharma-100 text-pharma-700 rounded-xl p-2.5">
              <Layers size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{t('nav.branches_stock')}</h1>
              <p className="text-sm text-slate-500 mt-0.5 max-w-xl">{t('inventory.bs_hint')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-sm">
              <Package size={16} className="text-pharma-600" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  {t('inventory.stat_total')}
                </p>
                <p className="text-lg font-bold text-slate-800 tabular-nums">{fmtInt(stats.items)}</p>
                {stats.truncated && (
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    {t('inventory.bs_showing', { shown: stats.shown, total: stats.items })}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-sm">
              <p className="text-lg font-bold text-amber-700 tabular-nums">{fmtInt(stats.low)}</p>
              <p className="text-xs text-amber-700">{t('inventory.filter_low')}</p>
            </div>
            <div className="bg-white border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-sm">
              <p className="text-lg font-bold text-red-700 tabular-nums">{fmtInt(stats.out)}</p>
              <p className="text-xs text-red-700">{t('inventory.filter_zero')}</p>
            </div>
          </div>
        </div>

        {stats.truncated && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('inventory.bs_showing', { shown: fmtInt(stats.shown), total: fmtInt(stats.items) })}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[16rem] relative">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              {t('common.search')}
            </label>
            <Search size={16} className="absolute bottom-2.5 start-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applySearch()
                }
              }}
              placeholder={t('inventory.bs_multi_search_placeholder')}
              className="w-full ps-10 pe-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pharma-400/40"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={applySearch}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap"
          >
            <Search size={16} />
            {t('inventory.bs_search_btn')}
          </button>
          {isAdmin && (
            <div className="min-w-[12rem]">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Building2 size={12} />
                {t('inventory.bs_filter_branch')}
              </label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pharma-400/40"
              >
                <option value="">{t('inventory.bs_all_branches')}</option>
                {allBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchName(b)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={exportExcel}
            disabled={
              exporting ||
              (multiPick && !showAllStockInTable ? pickedKeys.size === 0 : displayItems.length === 0)
            }
            className="inline-flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap"
          >
            <Download size={16} />
            {exporting ? '…' : t('inventory.bs_export')}
          </button>
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
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('inventory.bs_multi_no_matches')}
          </div>
        )}

        <div className="mb-3">
          <TableFilter
            value={bsFilter.query}
            onChange={bsFilter.setQuery}
            placeholder={t('common.filter_placeholder') as string}
            className="max-w-md"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[56rem]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <SortTh k="name" sort={bsSort} onToggle={bsToggle} align="start" className="px-4 py-3 sticky start-0 bg-slate-50 z-10 min-w-[12rem]">
                    {t('inventory.col_name')}
                  </SortTh>
                  <SortTh k="barcode" sort={bsSort} onToggle={bsToggle} align="start" className="px-3 py-3 whitespace-nowrap">
                    {t('inventory.col_barcode')}
                  </SortTh>
                  <SortTh k="intl_barcode" sort={bsSort} onToggle={bsToggle} align="start" className="px-3 py-3 whitespace-nowrap">
                    {t('inventory.col_intl_barcode')}
                  </SortTh>
                  {!singleBranch && (
                    <SortTh k="category" sort={bsSort} onToggle={bsToggle} align="start" className="px-3 py-3 whitespace-nowrap hidden lg:table-cell">
                      {t('inventory.col_category')}
                    </SortTh>
                  )}
                  {singleBranch ? (
                    <>
                      <SortTh k="stock" sort={bsSort} onToggle={bsToggle} align="center" className="px-3 py-3 whitespace-nowrap">
                        {t('inventory.bs_stock')}
                      </SortTh>
                      <SortTh k="min_stock" sort={bsSort} onToggle={bsToggle} align="center" className="px-3 py-3 whitespace-nowrap">
                        {t('inventory.bs_min')}
                      </SortTh>
                      <th className="px-3 py-3 text-center whitespace-nowrap">{t('inventory.bs_status')}</th>
                    </>
                  ) : (
                    <>
                      {visibleBranches.map((b) => (
                        <th key={b.id} className="px-3 py-3 text-center whitespace-nowrap">
                          {branchName(b)}
                        </th>
                      ))}
                      <SortTh k="total_stock" sort={bsSort} onToggle={bsToggle} align="center" className="px-3 py-3 bg-pharma-50 text-pharma-800 whitespace-nowrap">
                        {t('inventory.bs_total')}
                      </SortTh>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && (
                  <tr>
                    <td colSpan={colSpan} className="text-center py-12 text-slate-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                )}
                {!loading && data.items.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="text-center py-12 text-slate-400">
                      {t('inventory.no_items')}
                    </td>
                  </tr>
                )}
                {!loading && multiPick && !showAllStockInTable && data.items.length > 0 && displayItems.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="text-center py-12 text-slate-500">
                      {t('inventory.bs_pick_none')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  sortedDisplayItems.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 sticky start-0 bg-white z-[1] border-e border-slate-50">
                        <div className="font-semibold text-slate-800 leading-snug">
                          {isAr ? row.name_ar : row.name_en}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {row.category && (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {row.category}
                            </span>
                          )}
                          {row.unit && (
                            <span className="text-[10px] text-slate-400">{row.unit}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <BarcodePill value={row.barcode} variant="local" />
                      </td>
                      <td className="px-3 py-3">
                        <BarcodePill value={row.international_barcode} variant="intl" />
                      </td>
                      {!singleBranch && (
                        <td className="px-3 py-3 text-slate-500 text-xs hidden lg:table-cell">
                          {row.category || '—'}
                        </td>
                      )}
                      {singleBranch && visibleBranches[0] ? (
                        (() => {
                          const b = visibleBranches[0]
                          const cell = row.branches.find((x) => x.branch_id === b.id)
                          const stock = cell?.stock ?? 0
                          const min = cell?.min_stock ?? 0
                          const missing = cell?.product_id == null
                          const st = stockStatus(stock, min, missing)
                          const cls =
                            st === 'out'
                              ? 'text-red-600 font-bold'
                              : st === 'low'
                                ? 'text-amber-600 font-semibold'
                                : st === 'missing'
                                  ? 'text-slate-300'
                                  : 'text-slate-800'
                          return (
                            <>
                              <td className={`px-3 py-3 text-center font-mono text-base ${cls}`}>
                                {missing ? '—' : stock}
                              </td>
                              <td className="px-3 py-3 text-center font-mono text-xs text-slate-500">
                                {missing ? '—' : min}
                              </td>
                              <td className="px-3 py-3 text-center">{statusBadge(st)}</td>
                            </>
                          )
                        })()
                      ) : (
                        <>
                          {visibleBranches.map((b) => {
                            const cell = row.branches.find((x) => x.branch_id === b.id)
                            const stock = cell?.stock ?? 0
                            const min = cell?.min_stock ?? 0
                            const missing = cell?.product_id == null
                            const st = stockStatus(stock, min, missing)
                            const cls =
                              st === 'out'
                                ? 'text-red-600 font-bold bg-red-50/50'
                                : st === 'low'
                                  ? 'text-amber-600 font-semibold bg-amber-50/40'
                                  : st === 'missing'
                                    ? 'text-slate-300'
                                    : 'text-slate-700'
                            return (
                              <td
                                key={b.id}
                                className={`px-3 py-3 text-center font-mono tabular-nums ${cls}`}
                                title={
                                  missing
                                    ? undefined
                                    : `${t('inventory.bs_min')}: ${min}`
                                }
                              >
                                {missing ? '—' : stock}
                              </td>
                            )
                          })}
                          <td className="px-3 py-3 text-center font-mono font-bold tabular-nums bg-pharma-50/50 text-pharma-800">
                            {row.total_stock}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
