import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Calendar, Download } from 'lucide-react'
import Layout from '../components/Layout'
import { expiryAPI, ExpiryItem, ExpirySummary } from '../lib/api'
import i18n from '../lib/i18n'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'

type Tab = 'near' | 'expired'

export default function Expiry() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('near')
  const [days, setDays] = useState(30)
  const [items, setItems] = useState<ExpiryItem[]>([])
  const [summary, setSummary] = useState<ExpirySummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      expiryAPI.list({ status: tab, days }),
      expiryAPI.summary({ days }),
    ])
      .then(([list, sum]) => {
        if (cancelled) return
        const payload = list.data
        setItems(Array.isArray(payload) ? payload : payload.items)
        setSummary(sum.data)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, days])

  const exportExcel = () => {
    const rows = [
      [
        t('expiry.col_barcode'),
        t('expiry.col_name'),
        t('expiry.col_category'),
        t('expiry.col_branch'),
        t('expiry.col_stock'),
        t('expiry.col_cost'),
        t('expiry.col_expiry'),
        t('expiry.col_days_left'),
        t('expiry.col_loss_value'),
      ],
      ...items.map((i) => [
        i.barcode || '',
        i18n.language === 'ar' ? i.name_ar : i.name_en,
        i.category || '',
        (i18n.language === 'ar' ? i.branch_name_ar : i.branch_name_en) || '',
        i.stock,
        i.cost ?? '',
        i.expiry_date,
        i.days_left,
        Number(i.loss_value).toFixed(2),
      ]),
    ]
    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            let s = String(c ?? '')
            // Neutralize CSV formula injection
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expiry-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rowColor = (d: number) => {
    if (d < 0) return 'bg-red-50'
    if (d <= 7) return 'bg-red-50'
    if (d <= 30) return 'bg-amber-50'
    return ''
  }

  const expFilter = useQuickFilter(items, [
    (i) => i.barcode,
    (i) => i.name_en,
    (i) => i.name_ar,
    (i) => i.category,
    (i) => i.branch_name_en,
    (i) => i.branch_name_ar,
  ])
  const expAccessors = useMemo(() => ({
    barcode: (i: ExpiryItem) => i.barcode,
    name: (i: ExpiryItem) => (i18n.language === 'ar' ? i.name_ar : i.name_en),
    category: (i: ExpiryItem) => i.category,
    branch: (i: ExpiryItem) => (i18n.language === 'ar' ? i.branch_name_ar : i.branch_name_en),
    stock: (i: ExpiryItem) => Number(i.stock),
    expiry_date: (i: ExpiryItem) => i.expiry_date,
    days_left: (i: ExpiryItem) => Number(i.days_left),
    loss_value: (i: ExpiryItem) => Number(i.loss_value),
  }), [])
  const { sorted: sortedItems, sort, toggle } = useSort(expFilter.filtered, expAccessors)

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="text-pharma-600" />
            {t('expiry.title')}
          </h1>
          <button
            onClick={exportExcel}
            disabled={items.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-40"
          >
            <Download size={16} />
            {t('expiry.export')}
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              label={t('expiry.stat_expired_count')}
              value={summary.expired_count}
              color="red"
            />
            <StatCard
              label={t('expiry.stat_expired_value')}
              value={`${Number(summary.expired_value).toFixed(0)} ${t('pos.egp')}`}
              color="red"
            />
            <StatCard
              label={t('expiry.stat_near_count', { days })}
              value={summary.near_count}
              color="amber"
            />
            <StatCard
              label={t('expiry.stat_near_value', { days })}
              value={`${Number(summary.near_value).toFixed(0)} ${t('pos.egp')}`}
              color="amber"
            />
          </div>
        )}

        <div className="flex gap-2 mb-4 border-b border-slate-200">
          {(['near', 'expired'] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                tab === k
                  ? 'border-pharma-600 text-pharma-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t(`expiry.tab_${k}`)}
            </button>
          ))}
          {tab === 'near' && (
            <div className="ms-auto flex items-center gap-2 pb-2">
              <label className="text-xs text-slate-600">{t('expiry.within_days')}:</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="input text-xs py-1"
              >
                {[7, 14, 30, 60, 90, 180].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mb-4 max-w-sm">
          <TableFilter value={expFilter.query} onChange={expFilter.setQuery} placeholder={t('common.filter_placeholder') as string} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="barcode" sort={sort} onToggle={toggle} align="start">{t('expiry.col_barcode')}</SortTh>
                <SortTh k="name" sort={sort} onToggle={toggle} align="start">{t('expiry.col_name')}</SortTh>
                <SortTh k="category" sort={sort} onToggle={toggle} align="start">{t('expiry.col_category')}</SortTh>
                <SortTh k="branch" sort={sort} onToggle={toggle} align="start">{t('expiry.col_branch')}</SortTh>
                <SortTh k="stock" sort={sort} onToggle={toggle} align="end">{t('expiry.col_stock')}</SortTh>
                <SortTh k="expiry_date" sort={sort} onToggle={toggle} align="start">{t('expiry.col_expiry')}</SortTh>
                <SortTh k="days_left" sort={sort} onToggle={toggle} align="end">{t('expiry.col_days_left')}</SortTh>
                <SortTh k="loss_value" sort={sort} onToggle={toggle} align="end">{t('expiry.col_loss_value')}</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>
              )}
              {!loading && sortedItems.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('expiry.empty')}</td></tr>
              )}
              {sortedItems.map((it) => (
                <tr key={it.id} className={`border-t border-slate-100 ${rowColor(Number(it.days_left))}`}>
                  <td className="px-3 py-2 font-mono text-xs">{it.barcode || '—'}</td>
                  <td className="px-3 py-2 font-medium">{i18n.language === 'ar' ? it.name_ar : it.name_en}</td>
                  <td className="px-3 py-2 text-slate-600">{it.category || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{(i18n.language === 'ar' ? it.branch_name_ar : it.branch_name_en) || '—'}</td>
                  <td className="px-3 py-2 text-end">{it.stock}</td>
                  <td className="px-3 py-2 text-xs">{it.expiry_date}</td>
                  <td className={`px-3 py-2 text-end font-semibold ${Number(it.days_left) < 0 ? 'text-red-700' : Number(it.days_left) <= 7 ? 'text-red-600' : Number(it.days_left) <= 30 ? 'text-amber-700' : 'text-slate-700'}`}>
                    {Number(it.days_left) < 0
                      ? `${Math.abs(Number(it.days_left))}d ${t('expiry.ago')}`
                      : `${it.days_left}d`}
                  </td>
                  <td className="px-3 py-2 text-end font-semibold">{Number(it.loss_value).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </Layout>
  )
}

function StatCard({
  label, value, color,
}: { label: string; value: any; color: 'red' | 'amber' }) {
  const bg = color === 'red' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
  const txt = color === 'red' ? 'text-red-700' : 'text-amber-700'
  return (
    <div className={`${bg} border rounded-xl p-4`}>
      <div className="text-xs uppercase text-slate-500 font-medium flex items-center gap-1">
        <AlertTriangle size={12} className={txt} />
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${txt}`}>{value}</div>
    </div>
  )
}
