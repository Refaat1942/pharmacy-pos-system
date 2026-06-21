import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Filter, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { returnsAPI, salesAPI } from '../lib/api'
import type { ReturnRow } from '../lib/api'
import i18n from '../lib/i18n'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import DateInput from '../components/DateInput'
import { formatDateTime } from '../lib/formatDate'

export default function Returns() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [rows, setRows] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [salesTotal, setSalesTotal] = useState(0)

  const load = () => {
    setLoading(true)
    Promise.all([
      returnsAPI.list({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
      salesAPI.aggregate({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    ])
      .then(([r, agg]) => {
        setRows(r.data)
        setSalesTotal(agg.data.net)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalReturned = rows.reduce((s, r) => s + Number(r.total_returned || 0), 0)
  const ratio = salesTotal > 0 ? (totalReturned / salesTotal) * 100 : 0

  const sellerName = (r: ReturnRow) => (lang === 'ar' ? r.seller_name_ar : r.seller_name_en) || ''
  const filter = useQuickFilter(rows, [
    (r) => r.return_invoice_number,
    (r) => r.invoice_number,
    (r) => r.type,
    (r) => sellerName(r),
    (r) => r.reason,
  ])
  const accessors = useMemo(() => ({
    return_no: (r: ReturnRow) => r.return_invoice_number,
    invoice_no: (r: ReturnRow) => r.invoice_number,
    date: (r: ReturnRow) => r.created_at,
    type: (r: ReturnRow) => r.type,
    seller: (r: ReturnRow) => sellerName(r),
    reason: (r: ReturnRow) => r.reason,
    value: (r: ReturnRow) => Number(r.total_returned || 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lang])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="feature-page-title">{t('returns.title')}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {rows.length} {t('payment.items')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-gray-500 font-medium uppercase">{t('returns.count')}</p>
                <p className="text-sm font-bold tabular-nums">{rows.length}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-gray-500 font-medium uppercase">{t('returns.value')}</p>
                <p className="text-sm font-bold text-amber-600 tabular-nums">
                  {t('sales.egp')} {totalReturned.toFixed(2)}
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-gray-500 font-medium uppercase">{t('returns.ratio')}</p>
                <p className={`text-sm font-bold tabular-nums ${ratio > 10 ? 'text-red-600' : 'text-gray-700'}`}>
                  {ratio.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold uppercase">
              <Filter size={14} /> {t('sales.filters')}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.date_from')}</label>
              <DateInput value={dateFrom} onChange={setDateFrom} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.date_to')}</label>
              <DateInput value={dateTo} onChange={setDateTo} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <button onClick={load}
              className="bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">
              {t('sales.apply')}
            </button>
            <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(load, 0) }}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium">
              {t('sales.reset')}
            </button>
            <div className="ms-auto">
              <TableFilter value={filter.query} onChange={filter.setQuery}
                placeholder={t('common.filter_placeholder') as string} className="w-full md:w-64" />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 size={24} className="animate-spin me-2" />
              {t('common.loading')}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
              <RotateCcw size={48} className="opacity-20" />
              <p>{t('returns.empty')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <SortTh k="return_no" sort={sort} onToggle={toggle} align="start">{t('returns.return_no')}</SortTh>
                    <SortTh k="invoice_no" sort={sort} onToggle={toggle} align="start">{t('returns.invoice_no')}</SortTh>
                    <SortTh k="date" sort={sort} onToggle={toggle} align="start">{t('returns.date')}</SortTh>
                    <SortTh k="type" sort={sort} onToggle={toggle} align="start">{t('returns.type')}</SortTh>
                    <SortTh k="seller" sort={sort} onToggle={toggle} align="start">{t('sales.seller')}</SortTh>
                    <SortTh k="reason" sort={sort} onToggle={toggle} align="start">{t('returns.reason')}</SortTh>
                    <SortTh k="value" sort={sort} onToggle={toggle} align="end">{t('returns.value')}</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{r.return_invoice_number}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.invoice_number || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${
                          r.type === 'full' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>{r.type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {lang === 'ar' ? r.seller_name_ar || '—' : r.seller_name_en || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.reason || '—'}</td>
                      <td className="px-4 py-3 text-end font-bold text-amber-700 tabular-nums">
                        {t('sales.egp')} {Number(r.total_returned).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
