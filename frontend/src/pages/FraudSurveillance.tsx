import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, Download, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { ListLoadingPanel } from '../components/LoadingSpinner'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api from '../lib/api'
import { downloadApiExcel } from '../lib/downloadExcel'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import DateInput from '../components/DateInput'

type FraudAlert = {
  alert_type: string
  severity: 'high' | 'medium' | 'low'
  branch_id: number | null
  branch_name_en: string | null
  branch_name_ar: string | null
  seller_id: number | null
  seller_name_en: string | null
  seller_name_ar: string | null
  reference: string
  amount: number
  detail: string
  occurred_at: string
}

type FraudReport = {
  date_from: string
  date_to: string
  count: number
  summary: { high: number; medium: number; low: number }
  alerts: FraudAlert[]
}

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
}
const fmt = (n: number) =>
  Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2 })

const SEV_CLS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function FraudSurveillance() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [severity, setSeverity] = useState('')
  const [report, setReport] = useState<FraudReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<FraudReport>('/fraud/alerts', {
        params: { date_from: from, date_to: to, ...(severity ? { min_severity: severity } : {}) },
      })
      setReport(data)
    } finally {
      setLoading(false)
    }
  }, [from, to, severity])

  useEffect(() => { load() }, [load])

  const rows = report?.alerts ?? []
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const accessors = useMemo(() => ({
    severity: (r: FraudAlert) => r.severity,
    alert_type: (r: FraudAlert) => r.alert_type,
    branch: (r: FraudAlert) => (lang === 'ar' ? r.branch_name_ar : r.branch_name_en) || '',
    seller: (r: FraudAlert) => (lang === 'ar' ? r.seller_name_ar : r.seller_name_en) || '',
    reference: (r: FraudAlert) => r.reference,
    amount: (r: FraudAlert) => r.amount,
    occurred_at: (r: FraudAlert) => r.occurred_at,
  }), [lang])
  const quick = useQuickFilter(rows, [
    (r) => r.detail,
    (r) => r.reference,
    (r) => r.alert_type,
    (r) => r.branch_name_en,
    (r) => r.seller_name_en,
  ])
  const { sorted, sort, toggle } = useSort(quick.filtered, accessors)

  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadApiExcel('/fraud/alerts/export', `fraud_alerts_${from}_${to}.xlsx`, {
        date_from: from,
        date_to: to,
      })
    } finally {
      setExporting(false)
    }
  }

  if (user?.role !== 'admin') {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
          <ShieldAlert size={48} className="mb-3 text-red-400" />
          <p>{t('fraud.admin_only')}</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="text-red-600" size={28} />
              {t('fraud.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('fraud.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting || !rows.length}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Download size={16} /> {t('fraud.export_excel')}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">{t('reports.from')}</span>
            <DateInput className="border rounded-lg px-3 py-2 text-sm" value={from} onChange={setFrom} />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">{t('reports.to')}</span>
            <DateInput className="border rounded-lg px-3 py-2 text-sm" value={to} onChange={setTo} />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">{t('fraud.min_severity')}</span>
            <select className="border rounded-lg px-3 py-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">{t('fraud.all_severities')}</option>
              <option value="high">{t('fraud.severity_high')}</option>
              <option value="medium">{t('fraud.severity_medium')}</option>
            </select>
          </label>
          <button type="button" onClick={load} className="bg-pharma-600 hover:bg-pharma-700 text-white text-sm px-4 py-2 rounded-lg">
            {t('reports.apply')}
          </button>
        </div>

        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={t('fraud.total_alerts')} value={String(report.count)} tone="slate" />
            <Kpi label={t('fraud.severity_high')} value={String(report.summary.high)} tone="red" />
            <Kpi label={t('fraud.severity_medium')} value={String(report.summary.medium)} tone="amber" />
            <Kpi label={t('fraud.period')} value={`${report.date_from} → ${report.date_to}`} tone="blue" small />
          </div>
        )}

        {loading ? (
          <ListLoadingPanel label={t('common.loading')} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <TableFilter value={quick.query} onChange={quick.setQuery} placeholder={t('common.filter_placeholder')} className="max-w-xs" />
              <span className="text-xs text-slate-500">{sorted.length} {t('fraud.alerts')}</span>
            </div>
            {sorted.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <AlertTriangle size={32} className="text-emerald-400" />
                {t('fraud.no_alerts')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <SortTh k="severity" sort={sort} onToggle={toggle}>{t('fraud.severity')}</SortTh>
                      <SortTh k="alert_type" sort={sort} onToggle={toggle}>{t('fraud.type')}</SortTh>
                      <SortTh k="branch" sort={sort} onToggle={toggle}>{t('reports.branch')}</SortTh>
                      <SortTh k="seller" sort={sort} onToggle={toggle}>{t('fraud.seller')}</SortTh>
                      <SortTh k="reference" sort={sort} onToggle={toggle}>{t('fraud.reference')}</SortTh>
                      <SortTh k="amount" sort={sort} onToggle={toggle} align="end">{t('fraud.amount')}</SortTh>
                      <SortTh k="occurred_at" sort={sort} onToggle={toggle}>{t('fraud.when')}</SortTh>
                      <th className="px-4 py-2.5 text-start">{t('fraud.detail')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${SEV_CLS[r.severity] || SEV_CLS.low}`}>
                            {t(`fraud.severity_${r.severity}`, r.severity)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{t(`fraud.type_${r.alert_type}`, r.alert_type)}</td>
                        <td className="px-4 py-2.5">{lang === 'ar' ? r.branch_name_ar : r.branch_name_en || '—'}</td>
                        <td className="px-4 py-2.5">{lang === 'ar' ? r.seller_name_ar : r.seller_name_en || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{r.reference}</td>
                        <td className="px-4 py-2.5 text-end font-mono tabular-nums">{fmt(r.amount)}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{r.occurred_at?.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 max-w-md">{r.detail}</td>
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

function Kpi({ label, value, tone, small }: { label: string; value: string; tone: string; small?: boolean }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200',
    red: 'bg-red-50 border-red-200 text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className={`font-bold tabular-nums mt-1 ${small ? 'text-sm' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}
