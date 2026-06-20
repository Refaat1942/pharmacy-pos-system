import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Download, Sparkles } from 'lucide-react'
import Layout from '../components/Layout'
import { ListLoadingPanel } from '../components/LoadingSpinner'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api from '../lib/api'
import { downloadApiExcel } from '../lib/downloadExcel'
import i18n from '../lib/i18n'

type ReallocationRow = {
  barcode: string
  name_en: string
  name_ar: string
  from_branch_id: number
  from_branch_name_en: string
  from_branch_name_ar: string
  from_stock: number
  to_branch_id: number
  to_branch_name_en: string
  to_branch_name_ar: string
  to_stock: number
  suggested_qty: number
  need_branch_avg_daily: number
  from_branch_avg_daily: number
  priority_score: number
}

type ReallocationReport = {
  days: number
  coverage_days: number
  surplus_factor: number
  count: number
  suggestions: ReallocationRow[]
}

export default function StockReallocation() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [coverageDays, setCoverageDays] = useState(7)
  const [surplusFactor, setSurplusFactor] = useState(2)
  const [report, setReport] = useState<ReallocationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ReallocationReport>('/inventory/reallocation-suggestions', {
        params: { days, coverage_days: coverageDays, surplus_factor: surplusFactor },
      })
      setReport(data)
    } finally {
      setLoading(false)
    }
  }, [days, coverageDays, surplusFactor])

  useEffect(() => { load() }, [load])

  const rows = report?.suggestions ?? []
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const accessors = useMemo(() => ({
    barcode: (r: ReallocationRow) => r.barcode,
    name: (r: ReallocationRow) => (lang === 'ar' ? r.name_ar : r.name_en) || r.barcode,
    from_branch: (r: ReallocationRow) => (lang === 'ar' ? r.from_branch_name_ar : r.from_branch_name_en) || '',
    to_branch: (r: ReallocationRow) => (lang === 'ar' ? r.to_branch_name_ar : r.to_branch_name_en) || '',
    suggested_qty: (r: ReallocationRow) => r.suggested_qty,
    priority_score: (r: ReallocationRow) => r.priority_score,
    from_stock: (r: ReallocationRow) => r.from_stock,
    to_stock: (r: ReallocationRow) => r.to_stock,
  }), [lang])
  const quick = useQuickFilter(rows, [
    (r) => r.barcode,
    (r) => r.name_en,
    (r) => r.name_ar,
    (r) => r.from_branch_name_en,
    (r) => r.to_branch_name_en,
  ])
  const { sorted, sort, toggle } = useSort(quick.filtered, accessors)

  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadApiExcel('/inventory/reallocation-suggestions/export', 'stock_reallocation.xlsx', {
        days,
        coverage_days: coverageDays,
        surplus_factor: surplusFactor,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="text-pharma-600" size={28} />
              {t('reallocation.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('reallocation.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting || !rows.length}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Download size={16} /> {t('reallocation.export_excel')}
          </button>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900">
          {t('reallocation.hint')}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-700 mb-1">{t('reallocation.analysis_days')}</span>
            <input type="number" min={7} max={365} className="border rounded-lg px-3 py-2 text-sm w-28" value={days} onChange={(e) => setDays(Number(e.target.value))} />
            <span className="block text-[11px] text-slate-500 mt-1 max-w-[11rem]">{t('reallocation.analysis_days_hint')}</span>
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-700 mb-1">{t('reallocation.coverage_days')}</span>
            <input type="number" min={1} max={60} className="border rounded-lg px-3 py-2 text-sm w-28" value={coverageDays} onChange={(e) => setCoverageDays(Number(e.target.value))} />
            <span className="block text-[11px] text-slate-500 mt-1 max-w-[14rem]">{t('reallocation.coverage_days_hint')}</span>
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-700 mb-1">{t('reallocation.surplus_factor')}</span>
            <input type="number" min={1.2} max={5} step={0.1} className="border rounded-lg px-3 py-2 text-sm w-28" value={surplusFactor} onChange={(e) => setSurplusFactor(Number(e.target.value))} />
            <span className="block text-[11px] text-slate-500 mt-1 max-w-[14rem]">{t('reallocation.surplus_factor_hint')}</span>
          </label>
          <button type="button" onClick={load} className="bg-pharma-600 hover:bg-pharma-700 text-white text-sm px-4 py-2 rounded-lg">
            {t('reports.apply')}
          </button>
        </div>

        {loading ? (
          <ListLoadingPanel label={t('common.loading')} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <TableFilter value={quick.query} onChange={quick.setQuery} placeholder={t('common.filter_placeholder')} className="max-w-xs" />
              <span className="text-xs text-slate-500">{sorted.length} {t('reallocation.suggestions')}</span>
            </div>
            {sorted.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">{t('reallocation.no_suggestions')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <SortTh k="barcode" sort={sort} onToggle={toggle}>{t('reallocation.barcode')}</SortTh>
                      <SortTh k="name" sort={sort} onToggle={toggle}>{t('reallocation.product')}</SortTh>
                      <SortTh k="from_branch" sort={sort} onToggle={toggle}>{t('reallocation.from_branch')}</SortTh>
                      <SortTh k="from_stock" sort={sort} onToggle={toggle} align="end">{t('reallocation.from_stock')}</SortTh>
                      <th className="px-2 py-2.5 text-center w-8"><ArrowRightLeft size={14} className="mx-auto text-slate-400" /></th>
                      <SortTh k="to_branch" sort={sort} onToggle={toggle}>{t('reallocation.to_branch')}</SortTh>
                      <SortTh k="to_stock" sort={sort} onToggle={toggle} align="end">{t('reallocation.to_stock')}</SortTh>
                      <SortTh k="suggested_qty" sort={sort} onToggle={toggle} align="end">{t('reallocation.move_qty')}</SortTh>
                      <SortTh k="priority_score" sort={sort} onToggle={toggle} align="end">{t('reallocation.priority')}</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-mono text-xs">{r.barcode}</td>
                        <td className="px-4 py-2.5 font-medium">{lang === 'ar' ? r.name_ar : r.name_en}</td>
                        <td className="px-4 py-2.5">{lang === 'ar' ? r.from_branch_name_ar : r.from_branch_name_en}</td>
                        <td className="px-4 py-2.5 text-end font-mono">{r.from_stock}</td>
                        <td />
                        <td className="px-4 py-2.5">{lang === 'ar' ? r.to_branch_name_ar : r.to_branch_name_en}</td>
                        <td className="px-4 py-2.5 text-end font-mono">{r.to_stock}</td>
                        <td className="px-4 py-2.5 text-end font-mono font-bold text-pharma-700">{r.suggested_qty}</td>
                        <td className="px-4 py-2.5 text-end font-mono text-slate-500">{r.priority_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
