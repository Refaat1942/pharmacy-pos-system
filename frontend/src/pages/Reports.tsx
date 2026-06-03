import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, DollarSign, RotateCcw, PieChart, Building2, CreditCard,
  Package as PackageIcon, BarChart3, Download, ShieldAlert, Stethoscope,
  Smartphone, ArrowLeft, FileSpreadsheet, type LucideIcon,
} from 'lucide-react'
import { ListLoadingPanel } from '../components/LoadingSpinner'
import Layout from '../components/Layout'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import { DIGITAL_PLATFORMS, platformBadgeClass } from '../lib/digitalPlatforms'

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
type SalesByItemRow = {
  id: number
  name_en: string
  name_ar: string
  barcode: string | null
  category: string
  current_stock: number
  qty_total: number
  revenue_total: number
  qty_cash: number
  revenue_cash: number
  qty_delivery: number
  revenue_delivery: number
  qty_digital: number
  revenue_digital: number
  qty_return: number
  revenue_return: number
}
type TrendRow = { month: string; revenue: number; invoice_count: number; cogs: number; profit: number; returns_value: number }
type ClinicRow = { clinic_id: number; clinic_name: string; invoice_count: number; gross: number; discount: number; net: number }
type DigitalPlatformRow = {
  digital_type: string
  platform_name: string
  invoice_count: number
  charged: number
  paid: number
  balance: number
  collected_in_period: number
  total_owed_all_time: number
}
type DigitalInvoiceRow = {
  id: number
  invoice_number: string
  created_at: string
  digital_type: string
  platform_name: string
  net_total: number
  paid_total: number
  balance: number
  branch_name_en: string
  branch_name_ar: string
  notes: string | null
}
type DigitalAccountReport = {
  date_from: string
  date_to: string
  summary: { invoice_count: number; total_charged: number; total_paid: number; total_balance: number }
  by_platform: DigitalPlatformRow[]
  invoices: DigitalInvoiceRow[]
}

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
}
const fmt = (n: number) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')

function exportCSV(filename: string, rows: any[], columns: { key: string; label: string }[]) {
  const head = columns.map((c) => `"${c.label}"`).join(',')
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c.key]
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    }).join(','),
  ).join('\n')
  const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function PlatformBadge({ platformId, label }: { platformId: string; label: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${platformBadgeClass(platformId)}`}>
      {label}
    </span>
  )
}

type ReportId =
  | 'pnl'
  | 'trend'
  | 'category'
  | 'branch'
  | 'clinic'
  | 'digital'
  | 'payment'
  | 'sales_by_item'
  | 'top_products'

type ReportDef = {
  id: ReportId
  labelKey: string
  Icon: LucideIcon
  adminOnly?: boolean
  needsClinics?: boolean
  fixedPeriod?: boolean
}

const REPORT_DEFS: ReportDef[] = [
  { id: 'pnl', labelKey: 'reports.pnl_title', Icon: DollarSign },
  { id: 'trend', labelKey: 'reports.monthly_trend', Icon: TrendingUp, fixedPeriod: true },
  { id: 'category', labelKey: 'reports.by_category', Icon: PieChart },
  { id: 'branch', labelKey: 'reports.by_branch', Icon: Building2, adminOnly: true },
  { id: 'clinic', labelKey: 'reports.by_clinic', Icon: Stethoscope, needsClinics: true },
  { id: 'digital', labelKey: 'reports.digital_account_title', Icon: Smartphone },
  { id: 'payment', labelKey: 'reports.by_payment', Icon: CreditCard },
  { id: 'sales_by_item', labelKey: 'reports.sales_by_item', Icon: BarChart3 },
  { id: 'top_products', labelKey: 'reports.top_profit_products', Icon: PackageIcon },
]

export default function Reports() {
  const { t } = useTranslation()
  const { user, hasFeature } = useAuth()
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [digitalPlatformFilter, setDigitalPlatformFilter] = useState('')

  const [pnl, setPnl] = useState<PnL | null>(null)
  const [cats, setCats] = useState<CatRow[]>([])
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [pays, setPays] = useState<PayRow[]>([])
  const [prods, setProds] = useState<ProdRow[]>([])
  const [salesByItem, setSalesByItem] = useState<SalesByItemRow[]>([])
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [clinicRows, setClinicRows] = useState<ClinicRow[]>([])
  const [digitalAccount, setDigitalAccount] = useState<DigitalAccountReport | null>(null)
  const [activeReport, setActiveReport] = useState<ReportId | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const canSee = isAdmin || user?.role === 'pharmacist'

  const dateParams = useMemo(() => ({ date_from: from, date_to: to }), [from, to])

  const visibleReports = useMemo(
    () => REPORT_DEFS.filter((r) => {
      if (r.adminOnly && !isAdmin) return false
      if (r.needsClinics && !hasFeature('clinics')) return false
      return true
    }),
    [isAdmin, hasFeature],
  )

  const loadReport = async (id: ReportId) => {
    setLoading(true)
    setError(null)
    const params = dateParams
    try {
      switch (id) {
        case 'pnl': {
          const { data } = await api.get('/reports/pnl', { params })
          setPnl(data)
          break
        }
        case 'trend': {
          const { data } = await api.get('/reports/monthly-trend', { params: { months: 12 } })
          setTrend(data)
          break
        }
        case 'category': {
          const { data } = await api.get('/reports/sales-by-category', { params })
          setCats(data)
          break
        }
        case 'branch': {
          const { data } = await api.get('/reports/sales-by-branch', { params })
          setBranches(data)
          break
        }
        case 'clinic': {
          const { data } = await api.get('/sales/by-clinic', { params })
          setClinicRows(data)
          break
        }
        case 'digital': {
          const { data } = await api.get('/reports/digital-platform-account', {
            params: {
              ...params,
              ...(digitalPlatformFilter ? { digital_type: digitalPlatformFilter } : {}),
            },
          })
          setDigitalAccount(data)
          break
        }
        case 'payment': {
          const { data } = await api.get('/reports/sales-by-payment', { params })
          setPays(data)
          break
        }
        case 'sales_by_item': {
          const { data } = await api.get('/reports/sales-by-item', { params: { ...params, limit: 2000 } })
          setSalesByItem(data)
          break
        }
        case 'top_products': {
          const { data } = await api.get('/reports/product-profitability', { params: { ...params, limit: 20 } })
          setProds(data)
          break
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canSee || !activeReport) return
    void loadReport(activeReport)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, from, to, digitalPlatformFilter, canSee])

  const exportActiveReport = () => {
    if (!activeReport) return
    const suffix = `${from}_${to}`
    switch (activeReport) {
      case 'pnl':
        if (pnl) exportCSV(`profit-and-loss-${suffix}.csv`, [pnl], [
          { key: 'date_from', label: 'From' }, { key: 'date_to', label: 'To' },
          { key: 'gross_revenue', label: 'Gross Revenue' }, { key: 'total_discount', label: 'Total Discount' },
          { key: 'returns_value', label: 'Returns' }, { key: 'net_revenue', label: 'Net Revenue' },
          { key: 'cogs', label: 'COGS' }, { key: 'gross_profit', label: 'Gross Profit' },
          { key: 'margin_pct', label: 'Margin %' }, { key: 'invoice_count', label: 'Invoices' },
          { key: 'returns_count', label: 'Returns Count' },
        ])
        break
      case 'trend':
        exportCSV(`monthly-trend.csv`, trend, [
          { key: 'month', label: 'Month' }, { key: 'revenue', label: 'Revenue' },
          { key: 'invoice_count', label: 'Invoices' }, { key: 'cogs', label: 'COGS' },
          { key: 'profit', label: 'Profit' }, { key: 'returns_value', label: 'Returns' },
        ])
        break
      case 'category':
        exportCSV(`sales-by-category-${suffix}.csv`, cats, [
          { key: 'category', label: 'Category' }, { key: 'qty', label: 'Qty' },
          { key: 'revenue', label: 'Revenue' }, { key: 'cost', label: 'Cost' }, { key: 'profit', label: 'Profit' },
        ])
        break
      case 'branch':
        exportCSV(`sales-by-branch-${suffix}.csv`, branches, [
          { key: 'name_en', label: 'Branch' }, { key: 'invoice_count', label: 'Invoices' },
          { key: 'revenue', label: 'Gross Revenue' }, { key: 'returns_value', label: 'Returns' },
          { key: 'net_revenue', label: 'Net Revenue' },
        ])
        break
      case 'clinic':
        exportCSV(`sales-by-clinic-${suffix}.csv`, clinicRows, [
          { key: 'clinic_name', label: 'Clinic' }, { key: 'invoice_count', label: 'Invoices' },
          { key: 'gross', label: 'Gross' }, { key: 'discount', label: 'Discount' }, { key: 'net', label: 'Net' },
        ])
        break
      case 'digital':
        if (digitalAccount?.invoices) {
          exportCSV(`digital-platform-account-${suffix}.csv`, digitalAccount.invoices.map((r) => ({
            ...r,
            branch: i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en,
            sale_date: r.created_at?.slice(0, 10),
          })), [
            { key: 'invoice_number', label: 'Invoice' }, { key: 'sale_date', label: 'Date' },
            { key: 'platform_name', label: 'Platform' }, { key: 'branch', label: 'Branch' },
            { key: 'net_total', label: 'Charged' }, { key: 'paid_total', label: 'Paid' },
            { key: 'balance', label: 'Balance' }, { key: 'notes', label: 'Notes' },
          ])
        }
        break
      case 'payment':
        exportCSV(`sales-by-payment-${suffix}.csv`, pays, [
          { key: 'sale_type', label: 'Sale Type' }, { key: 'payment_method', label: 'Payment Method' },
          { key: 'invoice_count', label: 'Invoices' }, { key: 'revenue', label: 'Revenue' },
        ])
        break
      case 'sales_by_item':
        exportCSV(`sales-by-item-${suffix}.csv`, salesByItem, [
          { key: 'name_en', label: 'Name EN' }, { key: 'name_ar', label: 'Name AR' },
          { key: 'barcode', label: 'Barcode' }, { key: 'category', label: 'Category' },
          { key: 'current_stock', label: 'Stock' }, { key: 'qty_total', label: 'Qty total' },
          { key: 'revenue_total', label: 'Revenue total' },
          { key: 'qty_cash', label: 'Qty cash' }, { key: 'revenue_cash', label: 'Revenue cash' },
          { key: 'qty_delivery', label: 'Qty delivery' }, { key: 'revenue_delivery', label: 'Revenue delivery' },
          { key: 'qty_digital', label: 'Qty digital' }, { key: 'revenue_digital', label: 'Revenue digital' },
          { key: 'qty_return', label: 'Qty return' }, { key: 'revenue_return', label: 'Revenue return' },
        ])
        break
      case 'top_products':
        exportCSV(`top-profit-products-${suffix}.csv`, prods, [
          { key: 'name_en', label: 'Name' }, { key: 'category', label: 'Category' },
          { key: 'qty', label: 'Qty' }, { key: 'revenue', label: 'Revenue' },
          { key: 'cost', label: 'Cost' }, { key: 'profit', label: 'Profit' }, { key: 'margin_pct', label: 'Margin %' },
        ])
        break
    }
  }

  const activeDef = visibleReports.find((r) => r.id === activeReport)
  const showDateRange = activeDef && !activeDef.fixedPeriod

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

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('reports.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('reports.subtitle')}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-1">{t('reports.pick_report')}</p>
          <p className="text-xs text-slate-500 mb-3">{t('reports.pick_report_hint')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {visibleReports.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveReport(id)}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-start text-sm font-medium transition-all ${
                  activeReport === id
                    ? 'border-pharma-500 bg-pharma-50 text-pharma-800 ring-2 ring-pharma-200'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-pharma-300 hover:bg-white'
                }`}
              >
                <Icon size={18} className="shrink-0 text-pharma-600" />
                <span className="leading-tight">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {activeReport && (
          <div className="flex flex-wrap items-end justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveReport(null)}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-pharma-700"
            >
              <ArrowLeft size={16} /> {t('reports.back_to_list')}
            </button>
            {showDateRange && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.from')}</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.to')}</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
                </div>
              </>
            )}
            {activeReport === 'trend' && (
              <p className="text-xs text-slate-500 self-center">{t('reports.last_12_months')}</p>
            )}
            <button
              type="button"
              onClick={() => void loadReport(activeReport)}
              disabled={loading}
              className="bg-pharma-600 hover:bg-pharma-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('reports.apply')}
            </button>
            <button
              type="button"
              onClick={exportActiveReport}
              disabled={loading}
              className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <FileSpreadsheet size={15} /> {t('reports.export_excel')}
            </button>
          </div>
        )}

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        {loading && activeReport && <ListLoadingPanel />}

        {/* P&L summary */}
        {!loading && activeReport === 'pnl' && pnl && (
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
        {!loading && activeReport === 'trend' && (
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
        )}

        {/* Category breakdown */}
        {!loading && activeReport === 'category' && (
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
        )}

        {/* Branch performance — admin only */}
        {!loading && activeReport === 'branch' && isAdmin && (
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
                { key: 'name', label: t('reports.branch'), render: (r) => i18n.language === 'ar' ? r.name_ar : r.name_en, sortValue: (r) => i18n.language === 'ar' ? r.name_ar : r.name_en },
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
        {!loading && activeReport === 'clinic' && hasFeature('clinics') && (
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

        {/* Digital platform on-account (receivables) */}
        {!loading && activeReport === 'digital' && digitalAccount?.summary && (
          <section className="print:break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <SectionHead
                icon={<Smartphone size={18} />}
                title={t('reports.digital_account_title')}
                subtitle={`${digitalAccount.date_from} → ${digitalAccount.date_to}${
                  digitalPlatformFilter
                    ? ` · ${t(DIGITAL_PLATFORMS.find((p) => p.id === digitalPlatformFilter)?.labelKey || 'sales.talabat')}`
                    : ''
                }`}
                inline
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700 border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                >
                  {t('common.print')}
                </button>
                <button
                  type="button"
                  onClick={() => exportCSV(
                    `digital-platform-account-${digitalAccount.date_from}-${digitalAccount.date_to}.csv`,
                    digitalAccount.invoices.map((r) => ({
                      ...r,
                      branch: i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en,
                      sale_date: r.created_at?.slice(0, 10),
                    })),
                    [
                      { key: 'invoice_number', label: 'Invoice' },
                      { key: 'sale_date', label: 'Date' },
                      { key: 'platform_name', label: 'Platform' },
                      { key: 'branch', label: 'Branch' },
                      { key: 'net_total', label: 'Charged' },
                      { key: 'paid_total', label: 'Paid' },
                      { key: 'balance', label: 'Balance' },
                      { key: 'notes', label: 'Notes' },
                    ],
                  )}
                  className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700"
                >
                  <Download size={13} /> CSV
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-3 max-w-3xl">{t('reports.digital_account_hint')}</p>
            <div className="flex flex-wrap items-end gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  {t('reports.filter_platform')}
                </label>
                <select
                  value={digitalPlatformFilter}
                  onChange={(e) => setDigitalPlatformFilter(e.target.value)}
                  className="input text-sm min-w-[10rem] bg-white"
                >
                  <option value="">{t('common.all')}</option>
                  {DIGITAL_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>{t(p.labelKey)}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void loadReport('digital')}
                disabled={loading}
                className="bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {loading ? t('common.loading') : t('reports.apply')}
              </button>
              <p className="text-xs text-slate-500 w-full sm:w-auto sm:ms-1">
                {t('reports.digital_account_dates_hint', { from, to })}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Kpi tone="blue" label={t('reports.digital_account_charged')} value={fmt(digitalAccount.summary.total_charged)} sub={`${digitalAccount.summary.invoice_count} ${t('reports.invoices')}`} />
              <Kpi tone="green" label={t('reports.digital_account_paid')} value={fmt(digitalAccount.summary.total_paid)} />
              <Kpi tone="amber" label={t('reports.digital_account_balance')} value={fmt(digitalAccount.summary.total_balance)} sub={t('reports.digital_account_balance_sub')} />
              <Kpi tone="red" label={t('reports.digital_account_owed')} value={fmt(digitalAccount.by_platform.reduce((s, p) => s + p.total_owed_all_time, 0))} sub={t('reports.digital_account_owed_sub')} />
            </div>
            <DataTable
              empty={t('reports.digital_account_empty')}
              cols={[
                {
                  key: 'platform_name',
                  label: t('reports.digital_platform'),
                  render: (r: DigitalPlatformRow) => (
                    <PlatformBadge platformId={r.digital_type} label={r.platform_name} />
                  ),
                },
                { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r: DigitalPlatformRow) => fmtInt(r.invoice_count) },
                { key: 'charged', label: t('reports.digital_account_charged'), align: 'end', render: (r: DigitalPlatformRow) => fmt(r.charged) },
                { key: 'paid', label: t('reports.digital_account_paid'), align: 'end', render: (r: DigitalPlatformRow) => fmt(r.paid) },
                { key: 'balance', label: t('reports.digital_account_balance'), align: 'end', render: (r: DigitalPlatformRow) => <span className="font-semibold text-amber-800">{fmt(r.balance)}</span> },
                { key: 'collected_in_period', label: t('reports.digital_account_collected'), align: 'end', render: (r: DigitalPlatformRow) => fmt(r.collected_in_period) },
                { key: 'total_owed_all_time', label: t('reports.digital_account_total_owed'), align: 'end', render: (r: DigitalPlatformRow) => <span className="font-semibold text-red-700">{fmt(r.total_owed_all_time)}</span> },
              ]}
              rows={digitalAccount.by_platform}
            />
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('reports.digital_account_invoices')}</h3>
              <DataTable
                empty={t('reports.digital_account_empty')}
                cols={[
                  { key: 'invoice_number', label: t('reports.invoice_no') },
                  { key: 'created_at', label: t('reports.sale_date'), render: (r: DigitalInvoiceRow) => r.created_at?.slice(0, 16).replace('T', ' ') },
                  {
                    key: 'platform_name',
                    label: t('reports.digital_platform'),
                    render: (r: DigitalInvoiceRow) => (
                      <PlatformBadge platformId={r.digital_type} label={r.platform_name} />
                    ),
                  },
                  { key: 'branch', label: t('reports.branch'), render: (r: DigitalInvoiceRow) => i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en },
                  { key: 'net_total', label: t('reports.digital_account_charged'), align: 'end', render: (r: DigitalInvoiceRow) => fmt(r.net_total) },
                  { key: 'paid_total', label: t('reports.digital_account_paid'), align: 'end', render: (r: DigitalInvoiceRow) => fmt(r.paid_total) },
                  { key: 'balance', label: t('reports.digital_account_balance'), align: 'end', render: (r: DigitalInvoiceRow) => <span className={r.balance > 0 ? 'text-amber-800 font-semibold' : 'text-emerald-700'}>{fmt(r.balance)}</span> },
                ]}
                rows={digitalAccount.invoices}
              />
            </div>
          </section>
        )}

        {/* Payment breakdown */}
        {!loading && activeReport === 'payment' && (
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
        )}

        {/* Sales by item */}
        {!loading && activeReport === 'sales_by_item' && (
        <section>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <SectionHead icon={<BarChart3 size={18} />} title={t('reports.sales_by_item')} inline />
            <button
              onClick={() => exportCSV('sales-by-item.csv', salesByItem, [
                { key: 'name_en', label: 'Name EN' },
                { key: 'name_ar', label: 'Name AR' },
                { key: 'barcode', label: 'Barcode' },
                { key: 'category', label: 'Category' },
                { key: 'current_stock', label: 'Stock' },
                { key: 'qty_total', label: 'Qty total' },
                { key: 'revenue_total', label: 'Revenue total' },
                { key: 'qty_cash', label: 'Qty cash' },
                { key: 'revenue_cash', label: 'Revenue cash' },
                { key: 'qty_delivery', label: 'Qty delivery' },
                { key: 'revenue_delivery', label: 'Revenue delivery' },
                { key: 'qty_digital', label: 'Qty digital' },
                { key: 'revenue_digital', label: 'Revenue digital' },
                { key: 'qty_return', label: 'Qty return' },
                { key: 'revenue_return', label: 'Revenue return' },
              ])}
              disabled={salesByItem.length === 0}
              className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700 disabled:opacity-50"
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">{t('reports.sales_by_item_hint')}</p>
          <DataTable
            empty={t('reports.no_data')}
            cols={[
              {
                key: 'name',
                label: t('reports.product'),
                render: (r: SalesByItemRow) => (i18n.language === 'ar' ? r.name_ar : r.name_en),
                sortValue: (r: SalesByItemRow) => (i18n.language === 'ar' ? r.name_ar : r.name_en),
              },
              { key: 'barcode', label: t('inventory.col_barcode'), render: (r: SalesByItemRow) => r.barcode || '—' },
              { key: 'category', label: t('reports.category') },
              {
                key: 'current_stock',
                label: t('reports.current_stock'),
                align: 'end',
                render: (r: SalesByItemRow) => fmtInt(r.current_stock),
                sortValue: (r: SalesByItemRow) => r.current_stock,
              },
              {
                key: 'qty_total',
                label: t('reports.qty'),
                align: 'end',
                render: (r: SalesByItemRow) => fmtInt(r.qty_total),
                sortValue: (r: SalesByItemRow) => r.qty_total,
              },
              {
                key: 'revenue_total',
                label: t('reports.revenue'),
                align: 'end',
                render: (r: SalesByItemRow) => fmt(r.revenue_total),
                sortValue: (r: SalesByItemRow) => r.revenue_total,
              },
              {
                key: 'qty_cash',
                label: t('reports.qty_cash'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.qty_cash > 0 ? fmtInt(r.qty_cash) : '—'),
                sortValue: (r: SalesByItemRow) => r.qty_cash,
              },
              {
                key: 'revenue_cash',
                label: t('reports.revenue_cash'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.revenue_cash > 0 ? fmt(r.revenue_cash) : '—'),
                sortValue: (r: SalesByItemRow) => r.revenue_cash,
              },
              {
                key: 'qty_delivery',
                label: t('reports.qty_delivery'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.qty_delivery > 0 ? fmtInt(r.qty_delivery) : '—'),
                sortValue: (r: SalesByItemRow) => r.qty_delivery,
              },
              {
                key: 'revenue_delivery',
                label: t('reports.revenue_delivery'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.revenue_delivery > 0 ? fmt(r.revenue_delivery) : '—'),
                sortValue: (r: SalesByItemRow) => r.revenue_delivery,
              },
              {
                key: 'qty_digital',
                label: t('reports.qty_digital'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.qty_digital > 0 ? fmtInt(r.qty_digital) : '—'),
                sortValue: (r: SalesByItemRow) => r.qty_digital,
              },
              {
                key: 'revenue_digital',
                label: t('reports.revenue_digital'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.revenue_digital > 0 ? fmt(r.revenue_digital) : '—'),
                sortValue: (r: SalesByItemRow) => r.revenue_digital,
              },
              {
                key: 'qty_return',
                label: t('reports.qty_return'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.qty_return > 0 ? fmtInt(r.qty_return) : '—'),
                sortValue: (r: SalesByItemRow) => r.qty_return,
              },
              {
                key: 'revenue_return',
                label: t('reports.revenue_return'),
                align: 'end',
                render: (r: SalesByItemRow) => (r.revenue_return > 0 ? fmt(r.revenue_return) : '—'),
                sortValue: (r: SalesByItemRow) => r.revenue_return,
              },
            ]}
            rows={salesByItem}
          />
        </section>
        )}

        {/* Top profitable products */}
        {!loading && activeReport === 'top_products' && (
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
              { key: 'name', label: t('reports.product'), render: (r) => i18n.language === 'ar' ? r.name_ar : r.name_en, sortValue: (r) => i18n.language === 'ar' ? r.name_ar : r.name_en },
              { key: 'category', label: t('reports.category') },
              { key: 'qty', label: t('reports.qty'), align: 'end', render: (r) => fmtInt(r.qty) },
              { key: 'revenue', label: t('reports.revenue'), align: 'end', render: (r) => fmt(r.revenue) },
              { key: 'profit', label: t('reports.profit'), align: 'end', render: (r) => <span className={r.profit >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{fmt(r.profit)}</span> },
              { key: 'margin_pct', label: t('reports.margin'), align: 'end', render: (r) => `${fmt(r.margin_pct)}%` },
            ]}
            rows={prods}
          />
        </section>
        )}

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
  cols: { key: string; label: string; align?: 'start' | 'end'; render?: (r: any) => React.ReactNode; sortValue?: (r: any) => unknown }[]
  rows: any[]
  empty: string
}) {
  const { t } = useTranslation()
  const fields = useMemo(
    () => cols.map((c) => (r: any) => (c.sortValue ? c.sortValue(r) : r[c.key])),
    [cols],
  )
  const quick = useQuickFilter(rows, fields)
  const accessors = useMemo(() => {
    const acc: Record<string, (r: any) => unknown> = {}
    cols.forEach((c) => { acc[c.key] = c.sortValue ? c.sortValue : (r: any) => r[c.key] })
    return acc
  }, [cols])
  const { sorted, sort, toggle } = useSort(quick.filtered, accessors)

  if (!rows || rows.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">{empty}</div>
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-3 border-b border-slate-100">
        <TableFilter value={quick.query} onChange={quick.setQuery} placeholder={t('common.filter_placeholder')} className="max-w-xs" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {cols.map((c) => (
                <SortTh key={c.key} k={c.key} sort={sort} onToggle={toggle} align={c.align === 'end' ? 'end' : 'start'}>{c.label}</SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => (
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
