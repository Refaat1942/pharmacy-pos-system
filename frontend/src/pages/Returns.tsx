import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Filter, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { returnsAPI, salesAPI } from '../lib/api'
import type { ReturnRow } from '../lib/api'
import i18n from '../lib/i18n'

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

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('returns.title')}</h1>
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
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.date_to')}</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <button onClick={load}
              className="bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">
              {t('sales.apply')}
            </button>
            <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(load, 0) }}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium">
              {t('sales.reset')}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 size={24} className="animate-spin me-2" />
              {t('common.loading')}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
              <RotateCcw size={48} className="opacity-20" />
              <p>{t('returns.empty')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      t('returns.return_no'),
                      t('returns.invoice_no'),
                      t('returns.date'),
                      t('returns.type'),
                      t('sales.seller'),
                      t('returns.reason'),
                      t('returns.value'),
                    ].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider ${
                        i === 6 ? 'text-end' : 'text-start'
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{r.return_invoice_number}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.invoice_number || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
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
