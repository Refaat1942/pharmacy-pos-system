import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, DollarSign, RotateCcw, PieChart, Building2, CreditCard,
  Package as PackageIcon, BarChart3, Download, ShieldAlert, Calendar, Stethoscope,
} from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

type PnL = {
  date_from: string; date_to: string
  gross_revenue: number; total_discount: number; returns_value: number
  net_revenue: number; cogs: number; gross_profit: number; margin_pct: number
  invoice_count: number; returns_count: number
}
type CatRow = { category: string; qty: number; revenue: number; cost: number; profit: number }
type BranchRow = { branch_id: number; name_en: string; name_ar: string; revenue: number; invoice_count: number; returns_value: number; net_revenue: number }
type PayRow = { payment_method: string; sale_type: string; invoice_count: number; revenue: number }
type ProdRow = { id: number; name_en: string; name_ar: string; barcode: string | null; category: string; qty: number; revenue: number; cost: number; profit: number; margin_pct: number }
type TrendRow = { month: string; revenue: number; invoice_count: number; cogs: number; profit: number; returns_value: number }
type ClinicRow = { clinic_id: number; clinic_name: string; invoice_count: number; gross: number; discount: number; net: number }

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
}
const fmt = (n: number) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')

export default function Reports() {
  const { t } = useTranslation()
  const { user, hasFeature } = useAuth()
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())

  const [pnl, setPnl] = useState<PnL | null>(null)
  const [cats, setCats] = useState<CatRow[]>([])
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [pays, setPays] = useState<PayRow[]>([])
  const [prods, setProds] = useState<ProdRow[]>([])
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [clinicRows, setClinicRows] = useState<ClinicRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const canSee = isAdmin || user?.role === 'pharmacist'

  const load = async () => {
    setLoading(true); setError(null)
    const params = { date_from: from, date_to: to }
    try {
      const showClinics = hasFeature('clinics')
      const reqs: Promise<any>[] = [
        api.get('/reports/pnl', { params }),
        api.get('/reports/sales-by-category', { params }),
        api.get('/reports/sales-by-payment', { params }),
        api.get('/reports/product-profitability', { params: { ...params, limit: 20 } }),
        api.get('/reports/monthly-trend', { params: { months: 12 } }),
      ]
      const clinicIdx = showClinics ? reqs.length : -1
      if (showClinics) reqs.push(api.get('/sales/by-clinic', { params }))
      const branchIdx = isAdmin ? reqs.length : -1
      if (isAdmin) reqs.push(api.get('/reports/sales-by-branch', { params }))
      const results = await Promise.all(reqs)
      setPnl(results[0].data)
      setCats(results[1].data)
      setPays(results[2].data)
      setProds(results[3].data)
      setTrend(results[4].data)
      if (clinicIdx >= 0) setClinicRows(results[clinicIdx].data)
      if (branchIdx >= 0) setBranches(results[branchIdx].data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (canSee) load() }, [])

  if (!canSee) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <ShieldAlert size={48} className="mb-3 text-red-400" />
          <p className="text-lg font-medium">{t('reports.access_denied')}</p>
        </div>
      </Layout>
    )
  }

  const exportCSV = (filename: string, rows: any[], columns: { key: string; label: string }[]) => {
    const head = columns.map((c) => `"${c.label}"`).join(',')
    const body = rows.map((r) =>
      columns.map((c) => {
        const v = r[c.key]
        if (v == null) return ''
        const s = String(v).replace(/"/g, '""')
        return `"${s}"`
      }).join(',')
    ).join('\n')
    const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('reports.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('reports.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.from')}</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.to')}</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
            </div>
            <button onClick={load} disabled={loading} className="bg-pharma-600 hover:bg-pharma-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {loading ? t('common.loading') : t('reports.apply')}
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        {/* P&L summary */}
        {pnl && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionHead icon={<DollarSign size={18} />} title={t('reports.pnl_title')}
                subtitle={`${pnl.date_from} → ${pnl.date_to}`} inline />
              <button onClick={() => exportCSV('profit-and-loss.csv', [pnl], [
                { key: 'date_from', label: 'From' },
                { key: 'date_to', label: 'To' },
                { key: 'gross_revenue', label: 'Gross Revenue' },
                { key: 'total_discount', label: 'Total Discount' },
                { key: 'returns_value', label: 'Returns' },
                { key: 'net_revenue', label: 'Net Revenue' },
                { key: 'cogs', label: 'COGS' },
                { key: 'gross_profit', label: 'Gross Profit' },
                { key: 'margin_pct', label: 'Margin %' },
                { key: 'invoice_count', label: 'Invoices' },
                { key: 'returns_count', label: 'Returns Count' },
              ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
                <Download size={13} /> CSV
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi tone="blue" label={t('reports.gross_revenue')} value={fmt(pnl.gross_revenue)} sub={`${pnl.invoice_count} ${t('reports.invoices')}`} />
              <Kpi tone="red" label={t('reports.returns')} value={fmt(pnl.returns_value)} sub={`${pnl.returns_count} ${t('reports.returns')}`} />
              <Kpi tone="amber" label={t('reports.cogs')} value={fmt(pnl.cogs)} />
              <Kpi tone="green" label={t('reports.gross_profit')} value={fmt(pnl.gross_profit)} sub={`${fmt(pnl.margin_pct)}% ${t('reports.margin')}`} />
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <PnlRow label={t('reports.net_revenue')} value={fmt(pnl.net_revenue)} accent />
              <PnlRow label={t('reports.total_discount')} value={fmt(pnl.total_discount)} />
              <PnlRow label={t('reports.avg_invoice')} value={fmt(pnl.invoice_count ? pnl.gross_revenue / pnl.invoice_count : 0)} />
            </div>
          </section>
        )}

        {/* Monthly trend */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionHead icon={<TrendingUp size={18} />} title={t('reports.monthly_trend')} subtitle={t('reports.last_12_months')} inline />
            <button onClick={() => exportCSV('monthly-trend.csv', trend, [
              { key: 'month', label: 'Month' },
              { key: 'revenue', label: 'Revenue' },
              { key: 'invoice_count', label: 'Invoices' },
              { key: 'cogs', label: 'COGS' },
              { key: 'profit', label: 'Profit' },
              { key: 'returns_value', label: 'Returns' },
            ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
              <Download size={13} /> CSV
            </button>
          </div>
          <TrendChart rows={trend} />
        </section>

        {/* Category breakdown */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionHead icon={<PieChart size={18} />} title={t('reports.by_category')} inline />
            <button onClick={() => exportCSV('sales-by-category.csv', cats, [
              { key: 'category', label: 'Category' },
              { key: 'qty', label: 'Qty' },
              { key: 'revenue', label: 'Revenue' },
              { key: 'cost', label: 'Cost' },
              { key: 'profit', label: 'Profit' },
            ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
              <Download size={13} /> CSV
            </button>
          </div>
          <DataTable
            empty={t('reports.no_data')}
            cols={[
              { key: 'category', label: t('reports.category') },
              { key: 'qty', label: t('reports.qty'), align: 'end', render: (r) => fmtInt(r.qty) },
              { key: 'revenue', label: t('reports.revenue'), align: 'end', render: (r) => fmt(r.revenue) },
              { key: 'cost', label: t('reports.cost'), align: 'end', render: (r) => fmt(r.cost) },
              { key: 'profit', label: t('reports.profit'), align: 'end', render: (r) => <span className={r.profit >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{fmt(r.profit)}</span> },
            ]}
            rows={cats}
          />
        </section>

        {/* Branch performance — admin only */}
        {isAdmin && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionHead icon={<Building2 size={18} />} title={t('reports.by_branch')} inline />
              <button onClick={() => exportCSV('sales-by-branch.csv', branches, [
                { key: 'name_en', label: 'Branch' },
                { key: 'invoice_count', label: 'Invoices' },
                { key: 'revenue', label: 'Gross Revenue' },
                { key: 'returns_value', label: 'Returns' },
                { key: 'net_revenue', label: 'Net Revenue' },
              ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
                <Download size={13} /> CSV
              </button>
            </div>
            <DataTable
              empty={t('reports.no_data')}
              cols={[
                { key: 'name', label: t('reports.branch'), render: (r) => i18n.language === 'ar' ? r.name_ar : r.name_en },
                { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r) => fmtInt(r.invoice_count) },
                { key: 'revenue', label: t('reports.gross_revenue'), align: 'end', render: (r) => fmt(r.revenue) },
                { key: 'returns_value', label: t('reports.returns'), align: 'end', render: (r) => fmt(r.returns_value) },
                { key: 'net_revenue', label: t('reports.net_revenue'), align: 'end', render: (r) => <span className="font-semibold text-slate-800">{fmt(r.net_revenue)}</span> },
              ]}
              rows={branches}
            />
          </section>
        )}

        {/* Sales by clinic */}
        {hasFeature('clinics') && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionHead icon={<Stethoscope size={18} />} title={t('reports.by_clinic')} inline />
            <button onClick={() => exportCSV('sales-by-clinic.csv', clinicRows, [
              { key: 'clinic_name', label: 'Clinic' },
              { key: 'invoice_count', label: 'Invoices' },
              { key: 'gross', label: 'Gross' },
              { key: 'discount', label: 'Discount' },
              { key: 'net', label: 'Net' },
            ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
              <Download size={13} /> CSV
            </button>
          </div>
          <DataTable
            empty={t('reports.no_clinic_sales')}
            cols={[
              { key: 'clinic_name', label: t('reports.clinic') },
              { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r) => fmtInt(r.invoice_count) },
              { key: 'gross', label: t('reports.gross_revenue'), align: 'end', render: (r) => fmt(r.gross) },
              { key: 'discount', label: t('reports.total_discount'), align: 'end', render: (r) => fmt(r.discount) },
              { key: 'net', label: t('reports.net_revenue'), align: 'end', render: (r) => <span className="font-semibold text-slate-800">{fmt(r.net)}</span> },
            ]}
            rows={clinicRows}
          />
        </section>
        )}

        {/* Payment breakdown */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionHead icon={<CreditCard size={18} />} title={t('reports.by_payment')} inline />
            <button onClick={() => exportCSV('sales-by-payment.csv', pays, [
              { key: 'sale_type', label: 'Sale Type' },
              { key: 'payment_method', label: 'Payment Method' },
              { key: 'invoice_count', label: 'Invoices' },
              { key: 'revenue', label: 'Revenue' },
            ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
              <Download size={13} /> CSV
            </button>
          </div>
          <DataTable
            empty={t('reports.no_data')}
            cols={[
              { key: 'sale_type', label: t('reports.sale_type'), render: (r) => <span className={`capitalize${r.sale_type === 'return' ? ' text-red-600' : ''}`}>{r.sale_type === 'return' ? t('reports.return_type') : r.sale_type}</span> },
              { key: 'payment_method', label: t('reports.payment_method'), render: (r) => <span className="capitalize">{r.payment_method === 'return' ? t('reports.return_type') : r.payment_method === 'instapay' ? t('payment.instapay') : r.payment_method === 'vodafone_cash' ? t('payment.vodafone_cash') : r.payment_method}</span> },
              { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r) => fmtInt(r.invoice_count) },
              { key: 'revenue', label: t('reports.revenue'), align: 'end', render: (r) => <span className={r.revenue < 0 ? 'text-red-600 font-medium' : undefined}>{fmt(r.revenue)}</span> },
            ]}
            rows={pays}
          />
        </section>

        {/* Top profitable products */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionHead icon={<PackageIcon size={18} />} title={t('reports.top_profit_products')} inline />
            <button onClick={() => exportCSV('top-profit-products.csv', prods, [
              { key: 'name_en', label: 'Name' },
              { key: 'category', label: 'Category' },
              { key: 'qty', label: 'Qty' },
              { key: 'revenue', label: 'Revenue' },
              { key: 'cost', label: 'Cost' },
              { key: 'profit', label: 'Profit' },
              { key: 'margin_pct', label: 'Margin %' },
            ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
              <Download size={13} /> CSV
            </button>
          </div>
          <DataTable
            empty={t('reports.no_data')}
            cols={[
              { key: 'name', label: t('reports.product'), render: (r) => i18n.language === 'ar' ? r.name_ar : r.name_en },
              { key: 'category', label: t('reports.category') },
              { key: 'qty', label: t('reports.qty'), align: 'end', render: (r) => fmtInt(r.qty) },
              { key: 'revenue', label: t('reports.revenue'), align: 'end', render: (r) => fmt(r.revenue) },
              { key: 'profit', label: t('reports.profit'), align: 'end', render: (r) => <span className={r.profit >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{fmt(r.profit)}</span> },
              { key: 'margin_pct', label: t('reports.margin'), align: 'end', render: (r) => `${fmt(r.margin_pct)}%` },
            ]}
            rows={prods}
          />
        </section>

        <div className="h-4" />
      </div>
    </Layout>
  )
}

// ---------------- Subcomponents ----------------

function SectionHead({ icon, title, subtitle, inline }: { icon: React.ReactNode; title: string; subtitle?: string; inline?: boolean }) {
  return (
    <div className={inline ? '' : 'mb-2'}>
      <div className="flex items-center gap-2">
        <div className="bg-pharma-100 text-pharma-700 p-1.5 rounded-lg">{icon}</div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {subtitle && <span className="text-xs text-slate-500 ms-2 font-mono">{subtitle}</span>}
      </div>
    </div>
  )
}

function Kpi({ tone, label, value, sub }: { tone: 'blue' | 'red' | 'amber' | 'green'; label: string; value: string; sub?: string }) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[11px] mt-0.5 opacity-70">{sub}</p>}
    </div>
  )
}

function PnlRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between ${accent ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700'}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </div>
  )
}

function DataTable({ cols, rows, empty }: {
  cols: { key: string; label: string; align?: 'start' | 'end'; render?: (r: any) => React.ReactNode }[]
  rows: any[]
  empty: string
}) {
  if (!rows || rows.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">{empty}</div>
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 ${c.align === 'end' ? 'text-end' : 'text-start'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50/50">
                {cols.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.align === 'end' ? 'text-end font-mono tabular-nums' : 'text-slate-700'}`}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TrendChart({ rows }: { rows: TrendRow[] }) {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.profit))), [rows])
  if (!rows || rows.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">—</div>
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-end gap-2 h-48">
        {rows.map((r) => {
          const revH = (r.revenue / max) * 100
          const profH = (Math.max(r.profit, 0) / max) * 100
          return (
            <div key={r.month} className="flex-1 flex flex-col items-center justify-end gap-1 group">
              <div className="w-full flex items-end gap-0.5 h-full">
                <div className="flex-1 bg-pharma-200 rounded-t" style={{ height: `${revH}%` }} title={`Revenue: ${fmt(r.revenue)}`} />
                <div className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${profH}%` }} title={`Profit: ${fmt(r.profit)}`} />
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{r.month.slice(5)}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-pharma-200 rounded-sm" /> Revenue</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-sm" /> Profit</span>
      </div>
    </div>
  )
}
