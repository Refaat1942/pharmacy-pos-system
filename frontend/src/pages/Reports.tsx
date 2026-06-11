import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, DollarSign, RotateCcw, PieChart, Building2, CreditCard,
  Package as PackageIcon, BarChart3, Download, ShieldAlert, Stethoscope,
  Smartphone, ArrowLeft, FileSpreadsheet, UserRound, Bike, MapPin, Users, Receipt, Gift, type LucideIcon,
} from 'lucide-react'
import { ListLoadingPanel } from '../components/LoadingSpinner'
import Layout from '../components/Layout'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api from '../lib/api'
import { downloadApiExcel } from '../lib/downloadExcel'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import { DIGITAL_PLATFORMS, platformBadgeClass } from '../lib/digitalPlatforms'
import { formatDate as fmtDateDisplay, formatTime as fmtTimeDisplay, formatDateTime } from '../lib/formatDate'
import DateInput from '../components/DateInput'

type PnL = {
  date_from: string; date_to: string
  gross_revenue: number; total_discount: number; returns_value: number
  net_revenue: number; cogs: number; gross_profit: number; margin_pct: number
  invoice_count: number; returns_count: number
}
type CatRow = { category: string; qty: number; revenue: number; cost: number; profit: number }
type BranchRow = { branch_id: number; name_en: string; name_ar: string; revenue: number; invoice_count: number; returns_value: number; net_revenue: number }
type PayRow = {
  branch_id: number
  branch_name_en: string
  branch_name_ar: string
  payment_method: string
  sale_type: string
  invoice_count: number
  revenue: number
  total_discount: number
}
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
type SellerRow = {
  seller_id: number
  username: string
  seller_name_en: string
  seller_name_ar: string
  seller_role: string
  branch_name_en: string
  branch_name_ar: string
  invoice_count: number
  revenue: number
  total_discount: number
  cash_count: number
  delivery_count: number
  digital_count: number
  delivery_revenue: number
  return_count: number
  return_value: number
  return_pct: number
  net_revenue: number
}
type DeliveryDriverRow = {
  delivery_person_id: number
  delivery_person_name: string
  branch_id: number
  branch_name_en: string
  branch_name_ar: string
  order_count: number
  pending_count: number
  out_for_delivery_count: number
  delivered_count: number
  revenue: number
  delivery_fees: number
}
type DeliveryTimeRow = {
  hour_start: number
  interval_hours: number
  interval_label: string
  order_count: number
  pending_count: number
  out_for_delivery_count: number
  delivered_count: number
  revenue: number
  delivery_fees: number
}
type DeliveryOrderRow = {
  invoice_id: number
  invoice_number: string
  created_at: string
  hour: number
  delivery_person_id: number
  delivery_person_name: string
  branch_id: number
  branch_name_en: string
  branch_name_ar: string
  delivery_status: string
  net_total: number
  delivery_fee: number
}
type DeliveryReport = {
  date_from: string
  date_to: string
  orders: DeliveryOrderRow[]
  by_time_interval: DeliveryTimeRow[]
  by_driver: DeliveryDriverRow[]
  by_branch: Omit<DeliveryDriverRow, 'delivery_person_id' | 'delivery_person_name' | 'delivery_fees'>[]
  totals: { order_count: number; pending_count: number; delivered_count: number }
}
type ZoneRow = {
  region_key: string
  region_name_en: string
  region_name_ar: string
  group?: string
  order_count: number
  revenue: number
  delivery_count: number
  digital_count: number
  rank: number
  avg_order_value: number
}
type MarketingSuggestion = {
  region_key: string
  region_name_en: string
  region_name_ar: string
  priority: 'high' | 'medium' | 'low'
  reason_en: string
  reason_ar: string
}
type DeliveryZonesReport = {
  date_from: string
  date_to: string
  totals: { order_count: number; revenue: number; regions_with_sales: number; regions_total: number }
  zones: ZoneRow[]
  top_regions: ZoneRow[]
  bottom_regions: ZoneRow[]
  marketing_suggestions: MarketingSuggestion[]
}
type CustomerRow = {
  customer_id: number
  customer_code: string | null
  customer_name: string
  phone: string | null
  region: string | null
  invoice_count: number
  total_spent: number
  total_discount: number
  avg_order_value: number
  first_invoice_at: string | null
  last_invoice_at: string | null
  days_since_last_invoice: number | null
  avg_days_between_invoices: number | null
  total_items_qty: number
  distinct_products: number
  buyer_tier: 'high' | 'medium' | 'low'
}
type CustomerItemRow = {
  customer_id: number
  customer_code: string | null
  customer_name: string
  phone: string | null
  product_name: string
  barcode: string | null
  qty: number
  revenue: number
  line_discount: number
  purchase_count: number
  last_purchased_at: string | null
}
type CustomerAnalysisReport = {
  date_from: string
  date_to: string
  summary: {
    customer_count: number
    total_revenue: number
    high_buyers: number
    low_buyers: number
  }
  customers: CustomerRow[]
  top_buyers: CustomerRow[]
  low_buyers: CustomerRow[]
  items: CustomerItemRow[]
}
type SalesTypeRow = {
  sale_type: string
  payment_method: string
  invoice_count: number
  revenue: number
  total_discount: number
  items_qty: number
}
type SalesSellerRow = {
  seller_id: number
  username: string
  seller_name_en: string
  seller_name_ar: string
  invoice_count: number
  revenue: number
  items_qty: number
  cash_count: number
  delivery_count: number
  digital_count: number
}
type SalesTerminalRow = {
  branch_id: number
  branch_name_en: string
  branch_name_ar: string
  invoice_count: number
  revenue: number
  items_qty: number
}
type SalesInvoiceRow = {
  invoice_id: number
  invoice_number: string
  created_at: string
  sale_type: string
  payment_method: string
  digital_type: string | null
  subtotal: number
  discount: number
  net_total: number
  seller_id: number | null
  seller_username: string | null
  seller_name_en: string | null
  seller_name_ar: string | null
  branch_id: number | null
  branch_name_en: string | null
  branch_name_ar: string | null
  customer_name: string | null
  items_qty: number
}
type SalesLineItemRow = {
  invoice_number: string
  created_at: string
  sale_type: string
  payment_method: string
  seller_name_en: string | null
  seller_name_ar: string | null
  branch_name_en: string | null
  branch_name_ar: string | null
  product_name: string
  barcode: string | null
  qty: number
  unit_price: number
  line_discount: number
  line_total: number
}
type SalesReport = {
  date_from: string
  date_to: string
  summary: { invoice_count: number; total_revenue: number; total_discount: number; items_qty: number }
  by_sale_type: SalesTypeRow[]
  by_seller: SalesSellerRow[]
  by_terminal: SalesTerminalRow[]
  invoices: SalesInvoiceRow[]
  line_items: SalesLineItemRow[]
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
  | 'sales_by_seller'
  | 'delivery_summary'
  | 'delivery_zones'
  | 'customer_analysis'
  | 'sales_report'
  | 'offer_sales'

type ReportDef = {
  id: ReportId
  labelKey: string
  Icon: LucideIcon
  adminOnly?: boolean
  needsClinics?: boolean
  fixedPeriod?: boolean
  xlsxExport?: boolean
  needsOffers?: boolean
}

type OfferSalesReport = {
  date_from: string
  date_to: string
  invoice_count: number
  total_offer_savings: number
  invoices: {
    invoice_number: string
    created_at: string
    net_total: number
    offer_savings: number
    offer_names: string | null
    seller_name_en: string | null
    branch_name_en: string | null
  }[]
  by_offer: {
    offer_id: number
    name_en: string
    offer_type: string
    invoice_count: number
    total_discount: number
    units_sold: number
  }[]
}

const REPORT_DEFS: ReportDef[] = [
  { id: 'pnl', labelKey: 'reports.pnl_title', Icon: DollarSign },
  { id: 'trend', labelKey: 'reports.monthly_trend', Icon: TrendingUp, fixedPeriod: true },
  { id: 'category', labelKey: 'reports.by_category', Icon: PieChart },
  { id: 'branch', labelKey: 'reports.by_branch', Icon: Building2, adminOnly: true },
  { id: 'clinic', labelKey: 'reports.by_clinic', Icon: Stethoscope, needsClinics: true, xlsxExport: true },
  { id: 'digital', labelKey: 'reports.digital_account_title', Icon: Smartphone },
  { id: 'payment', labelKey: 'reports.by_payment', Icon: CreditCard },
  { id: 'sales_by_seller', labelKey: 'reports.sales_by_seller', Icon: UserRound, xlsxExport: true },
  { id: 'delivery_summary', labelKey: 'reports.delivery_summary', Icon: Bike, xlsxExport: true },
  { id: 'delivery_zones', labelKey: 'reports.delivery_zones', Icon: MapPin, xlsxExport: true },
  { id: 'customer_analysis', labelKey: 'reports.customer_analysis', Icon: Users, xlsxExport: true },
  { id: 'sales_report', labelKey: 'reports.sales_report', Icon: Receipt, xlsxExport: true },
  { id: 'offer_sales', labelKey: 'reports.offer_sales', Icon: Gift, xlsxExport: true, needsOffers: true },
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
  const [payBranchFilter, setPayBranchFilter] = useState('')
  const [paySaleTypeFilter, setPaySaleTypeFilter] = useState('')
  const [payMethodFilter, setPayMethodFilter] = useState('')
  const [reportBranches, setReportBranches] = useState<{ id: number; name_en: string; name_ar: string }[]>([])
  const [prods, setProds] = useState<ProdRow[]>([])
  const [salesByItem, setSalesByItem] = useState<SalesByItemRow[]>([])
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [clinicRows, setClinicRows] = useState<ClinicRow[]>([])
  const [digitalAccount, setDigitalAccount] = useState<DigitalAccountReport | null>(null)
  const [sellers, setSellers] = useState<SellerRow[]>([])
  const [deliveryReport, setDeliveryReport] = useState<DeliveryReport | null>(null)
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZonesReport | null>(null)
  const [customerAnalysis, setCustomerAnalysis] = useState<CustomerAnalysisReport | null>(null)
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null)
  const [offerSalesReport, setOfferSalesReport] = useState<OfferSalesReport | null>(null)
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
      if (r.needsOffers && !hasFeature('offers')) return false
      return true
    }),
    [isAdmin, hasFeature],
  )

  useEffect(() => {
    api.get('/inventory/branches').then((r) => setReportBranches(r.data)).catch(() => setReportBranches([]))
  }, [])

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
          const { data } = await api.get('/reports/sales-by-clinic', { params })
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
          const { data } = await api.get('/reports/sales-by-payment', {
            params: {
              ...params,
              branch_id: payBranchFilter ? Number(payBranchFilter) : undefined,
              sale_type: paySaleTypeFilter || undefined,
              payment_method: payMethodFilter || undefined,
            },
          })
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
        case 'sales_by_seller': {
          const { data } = await api.get('/reports/sales-by-seller', { params })
          setSellers(data)
          break
        }
        case 'delivery_summary': {
          const { data } = await api.get('/reports/delivery-summary', { params })
          setDeliveryReport(data)
          break
        }
        case 'delivery_zones': {
          const { data } = await api.get('/reports/delivery-zones', { params })
          setDeliveryZones(data)
          break
        }
        case 'customer_analysis': {
          const { data } = await api.get('/reports/customer-analysis', { params })
          setCustomerAnalysis(data)
          break
        }
        case 'sales_report': {
          const { data } = await api.get('/reports/sales-report', { params })
          setSalesReport(data)
          break
        }
        case 'offer_sales': {
          const { data } = await api.get('/reports/offer-sales', { params })
          setOfferSalesReport(data)
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
  }, [activeReport, from, to, digitalPlatformFilter, payBranchFilter, paySaleTypeFilter, payMethodFilter, canSee])

  const exportActiveReport = async () => {
    if (!activeReport) return
    const suffix = `${from}_${to}`
    const def = REPORT_DEFS.find((r) => r.id === activeReport)
    if (def?.xlsxExport) {
      if (activeReport === 'sales_by_seller') {
        await downloadApiExcel('/reports/sales-by-seller/export', `sales_by_seller_${suffix}.xlsx`, dateParams)
        return
      }
      if (activeReport === 'delivery_summary') {
        await downloadApiExcel('/reports/delivery-summary/export', `delivery_summary_${suffix}.xlsx`, dateParams)
        return
      }
      if (activeReport === 'delivery_zones') {
        await downloadApiExcel('/reports/delivery-zones/export', `delivery_zones_${suffix}.xlsx`, dateParams)
        return
      }
      if (activeReport === 'clinic') {
        await downloadApiExcel('/reports/sales-by-clinic/export', `sales_by_clinic_${suffix}.xlsx`, dateParams)
        return
      }
      if (activeReport === 'customer_analysis') {
        await downloadApiExcel('/reports/customer-analysis/export', `customer_analysis_${suffix}.xlsx`, dateParams)
        return
      }
      if (activeReport === 'sales_report') {
        await downloadApiExcel('/reports/sales-report/export', `sales_report_${suffix}.xlsx`, dateParams)
        return
      }
      if (activeReport === 'offer_sales') {
        await downloadApiExcel('/reports/offer-sales/export', `offer_sales_${suffix}.xlsx`, dateParams)
        return
      }
    }
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
                  <DateInput value={from} onChange={setFrom} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.to')}</label>
                  <DateInput value={to} onChange={setTo} max={today()} />
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
              onClick={() => void exportActiveReport()}
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
          <SectionHead icon={<Stethoscope size={18} />} title={t('reports.by_clinic')} subtitle={`${from} → ${to}`} />
          <DataTable
            empty={t('reports.no_clinic_sales')}
            cols={[
              { key: 'clinic_name', label: t('reports.clinic'), sortValue: (r: ClinicRow) => r.clinic_name },
              { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r: ClinicRow) => fmtInt(r.invoice_count), sortValue: (r: ClinicRow) => r.invoice_count },
              { key: 'gross', label: t('reports.gross_revenue'), align: 'end', render: (r: ClinicRow) => fmt(r.gross), sortValue: (r: ClinicRow) => r.gross },
              { key: 'discount', label: t('reports.total_discount'), align: 'end', render: (r: ClinicRow) => fmt(r.discount), sortValue: (r: ClinicRow) => r.discount },
              { key: 'net', label: t('reports.net_revenue'), align: 'end', render: (r: ClinicRow) => <span className="font-semibold text-slate-800">{fmt(r.net)}</span>, sortValue: (r: ClinicRow) => r.net },
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
                  { key: 'created_at', label: t('reports.sale_date'), render: (r: DigitalInvoiceRow) => formatDateTime(r.created_at) },
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
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <SectionHead icon={<CreditCard size={18} />} title={t('reports.by_payment')} inline />
            <button onClick={() => exportCSV(`sales-by-payment-${from}_${to}.csv`, pays, [
              { key: 'branch_name_en', label: 'Branch' },
              { key: 'sale_type', label: 'Sale Type' },
              { key: 'payment_method', label: 'Payment Method' },
              { key: 'invoice_count', label: 'Invoices' },
              { key: 'total_discount', label: 'Discount' },
              { key: 'revenue', label: 'Revenue' },
            ])} className="text-xs flex items-center gap-1 text-slate-600 hover:text-pharma-700">
              <Download size={13} /> CSV
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm mb-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.branch')}</label>
                <select value={payBranchFilter} onChange={(e) => setPayBranchFilter(e.target.value)} className="input text-sm min-w-[9rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {reportBranches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {i18n.language === 'ar' ? b.name_ar : b.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.sale_type')}</label>
                <select value={paySaleTypeFilter} onChange={(e) => setPaySaleTypeFilter(e.target.value)} className="input text-sm min-w-[7rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {['cash', 'delivery', 'digital', 'return'].map((v) => (
                    <option key={v} value={v}>{v === 'return' ? t('reports.return_type') : saleTypeLabel(t, v)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.payment_method')}</label>
                <select value={payMethodFilter} onChange={(e) => setPayMethodFilter(e.target.value)} className="input text-sm min-w-[7rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {['cash', 'visa', 'hybrid', 'account', 'instapay', 'vodafone_cash', 'return'].map((v) => (
                    <option key={v} value={v}>{paymentLabel(t, v)}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => { setPayBranchFilter(''); setPaySaleTypeFilter(''); setPayMethodFilter('') }}
                className="text-xs text-slate-600 hover:text-pharma-700 px-2 py-2">{t('reports.reset_filters')}</button>
            </div>
          </div>
          <DataTable
            empty={t('reports.no_data')}
            cols={[
              { key: 'branch', label: t('reports.branch'), render: (r: PayRow) => i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en },
              { key: 'sale_type', label: t('reports.sale_type'), render: (r: PayRow) => <span className={`capitalize${r.sale_type === 'return' ? ' text-red-600' : ''}`}>{r.sale_type === 'return' ? t('reports.return_type') : r.sale_type}</span> },
              { key: 'payment_method', label: t('reports.payment_method'), render: (r: PayRow) => <span className="capitalize">{r.payment_method === 'return' ? t('reports.return_type') : paymentLabel(t, r.payment_method)}</span> },
              { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r: PayRow) => fmtInt(r.invoice_count) },
              { key: 'total_discount', label: t('sales.discount'), align: 'end', render: (r: PayRow) => r.total_discount > 0 ? fmt(r.total_discount) : '—' },
              { key: 'revenue', label: t('reports.revenue'), align: 'end', render: (r: PayRow) => <span className={r.revenue < 0 ? 'text-red-600 font-medium' : undefined}>{fmt(r.revenue)}</span> },
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

        {/* Sales by seller */}
        {!loading && activeReport === 'sales_by_seller' && (
        <section>
          <SectionHead icon={<UserRound size={18} />} title={t('reports.sales_by_seller')} subtitle={`${from} → ${to}`} />
          <DataTable
            empty={t('reports.no_data')}
            cols={[
              { key: 'seller', label: t('reports.seller'), render: (r: SellerRow) => i18n.language === 'ar' ? r.seller_name_ar : r.seller_name_en, sortValue: (r: SellerRow) => i18n.language === 'ar' ? r.seller_name_ar : r.seller_name_en },
              { key: 'branch', label: t('reports.branch'), render: (r: SellerRow) => i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en },
              { key: 'invoice_count', label: t('reports.invoices'), align: 'end', render: (r: SellerRow) => fmtInt(r.invoice_count) },
              { key: 'revenue', label: t('reports.revenue'), align: 'end', render: (r: SellerRow) => fmt(r.revenue) },
              { key: 'delivery_count', label: t('reports.delivery_orders'), align: 'end', render: (r: SellerRow) => fmtInt(r.delivery_count) },
              { key: 'return_count', label: t('reports.returns'), align: 'end', render: (r: SellerRow) => fmtInt(r.return_count) },
              { key: 'return_pct', label: t('reports.return_pct'), align: 'end', render: (r: SellerRow) => `${fmt(r.return_pct)}%` },
              { key: 'net_revenue', label: t('reports.net_revenue'), align: 'end', render: (r: SellerRow) => <span className="font-semibold text-emerald-700">{fmt(r.net_revenue)}</span> },
            ]}
            rows={sellers}
          />
        </section>
        )}

        {/* Delivery summary */}
        {!loading && activeReport === 'delivery_summary' && deliveryReport && (
          <DeliverySummaryPanel report={deliveryReport} reportFrom={from} reportTo={to} dateParams={dateParams} />
        )}

        {/* Customer analysis */}
        {!loading && activeReport === 'customer_analysis' && customerAnalysis && (
          <CustomerAnalysisPanel report={customerAnalysis} reportFrom={from} reportTo={to} dateParams={dateParams} />
        )}

        {/* Sales report */}
        {!loading && activeReport === 'sales_report' && salesReport && (
          <SalesReportPanel report={salesReport} reportFrom={from} reportTo={to} dateParams={dateParams} />
        )}

        {!loading && activeReport === 'offer_sales' && offerSalesReport && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase font-semibold">{t('reports.offer_invoices')}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{offerSalesReport.invoice_count}</p>
              </div>
              <div className="bg-white rounded-xl border border-pharma-100 p-4">
                <p className="text-xs text-pharma-700 uppercase font-semibold">{t('reports.offer_total_savings')}</p>
                <p className="text-2xl font-bold text-pharma-700 mt-1">{fmt(offerSalesReport.total_offer_savings)}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b font-semibold text-slate-800">{t('reports.offer_by_promo')}</div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('offers.col_name')}</th>
                    <th className="px-3 py-2 text-start">{t('offers.col_type')}</th>
                    <th className="px-3 py-2 text-end">{t('reports.invoices')}</th>
                    <th className="px-3 py-2 text-end">{t('reports.offer_units')}</th>
                    <th className="px-3 py-2 text-end">{t('reports.total_discount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {offerSalesReport.by_offer.map((r) => (
                    <tr key={r.offer_id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{r.name_en}</td>
                      <td className="px-3 py-2 text-slate-600">{r.offer_type}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{r.invoice_count}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{r.units_sold}</td>
                      <td className="px-3 py-2 text-end tabular-nums font-semibold text-pharma-700">{fmt(r.total_discount)}</td>
                    </tr>
                  ))}
                  {offerSalesReport.by_offer.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('common.no_data')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Delivery zones */}
        {!loading && activeReport === 'delivery_zones' && deliveryZones && (
          <DeliveryZonesPanel report={deliveryZones} reportFrom={from} reportTo={to} dateParams={dateParams} />
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

const fmtDate = fmtDateDisplay
const fmtTime = fmtTimeDisplay

function saleTypeLabel(t: (k: string) => string, type: string) {
  const map: Record<string, string> = {
    cash: t('sales.cash'),
    delivery: t('sales.delivery'),
    digital: t('sales.digital'),
    return: t('sales.return_type'),
  }
  return map[type] || type
}

function paymentLabel(t: (k: string) => string, method: string) {
  const map: Record<string, string> = {
    cash: t('sales.cash'),
    visa: t('sales.visa'),
    hybrid: t('sales.hybrid'),
    account: t('pos.account'),
    return: t('sales.return_type'),
  }
  return map[method] || method
}

type SalesSectionFilters = {
  saleType: string
  paymentMethod: string
  sellerId: string
  branchId: string
  dateFrom: string
  dateTo: string
}

type SalesFilterFields = {
  saleType?: boolean
  payment?: boolean
  seller?: boolean
  terminal?: boolean
  date?: boolean
}

function defaultSalesFilters(from: string, to: string): SalesSectionFilters {
  return { saleType: '', paymentMethod: '', sellerId: '', branchId: '', dateFrom: from, dateTo: to }
}

function inSectionDateRange(iso: string, from: string, to: string) {
  const d = iso.slice(0, 10)
  return d >= from && d <= to
}

function filterSalesReportClient(report: SalesReport, filters: SalesSectionFilters) {
  let invoices = report.invoices
  if (filters.saleType) invoices = invoices.filter((r) => r.sale_type === filters.saleType)
  if (filters.paymentMethod) invoices = invoices.filter((r) => r.payment_method === filters.paymentMethod)
  if (filters.sellerId) invoices = invoices.filter((r) => String(r.seller_id) === filters.sellerId)
  if (filters.branchId) invoices = invoices.filter((r) => String(r.branch_id) === filters.branchId)
  if (filters.dateFrom || filters.dateTo) {
    invoices = invoices.filter((r) => inSectionDateRange(r.created_at, filters.dateFrom, filters.dateTo))
  }
  const allowed = new Set(invoices.map((r) => r.invoice_number))
  const invoiceFiltered = Boolean(
    filters.saleType || filters.paymentMethod || filters.sellerId || filters.branchId
    || filters.dateFrom !== report.date_from || filters.dateTo !== report.date_to,
  )

  let bySaleType = report.by_sale_type
  if (filters.saleType) bySaleType = bySaleType.filter((r) => r.sale_type === filters.saleType)
  if (filters.paymentMethod) bySaleType = bySaleType.filter((r) => r.payment_method === filters.paymentMethod)

  let bySeller = report.by_seller
  if (filters.sellerId) bySeller = bySeller.filter((r) => String(r.seller_id) === filters.sellerId)
  if (filters.saleType) {
    bySeller = bySeller.filter((r) => {
      if (filters.saleType === 'cash') return r.cash_count > 0
      if (filters.saleType === 'delivery') return r.delivery_count > 0
      if (filters.saleType === 'digital') return r.digital_count > 0
      return true
    })
  }

  let byTerminal = report.by_terminal
  if (filters.branchId) byTerminal = byTerminal.filter((r) => String(r.branch_id) === filters.branchId)

  let lineItems = report.line_items
  if (filters.saleType) lineItems = lineItems.filter((r) => r.sale_type === filters.saleType)
  if (filters.paymentMethod) lineItems = lineItems.filter((r) => r.payment_method === filters.paymentMethod)
  if (filters.dateFrom || filters.dateTo) {
    lineItems = lineItems.filter((r) => inSectionDateRange(r.created_at, filters.dateFrom, filters.dateTo))
  }
  if (invoiceFiltered) lineItems = lineItems.filter((r) => allowed.has(r.invoice_number))

  return { bySaleType, bySeller, byTerminal, invoices, lineItems }
}

function salesExportParams(
  dateParams: { date_from: string; date_to: string },
  section: string,
  filters: SalesSectionFilters,
) {
  return {
    ...dateParams,
    section,
    sale_type: filters.saleType || undefined,
    payment_method: filters.paymentMethod || undefined,
    seller_id: filters.sellerId ? Number(filters.sellerId) : undefined,
    branch_id: filters.branchId ? Number(filters.branchId) : undefined,
    section_date_from: filters.dateFrom || undefined,
    section_date_to: filters.dateTo || undefined,
  }
}

function SalesReportSection({
  title,
  filters,
  onFiltersChange,
  filterFields,
  onExport,
  cols,
  rows,
  empty,
  dateBounds,
  saleTypes,
  paymentMethods,
  sellers,
  terminals,
}: {
  title: string
  filters: SalesSectionFilters
  onFiltersChange: (f: SalesSectionFilters) => void
  filterFields: SalesFilterFields
  onExport: () => void
  cols: Parameters<typeof DataTable>[0]['cols']
  rows: any[]
  empty: string
  dateBounds: { from: string; to: string }
  saleTypes: string[]
  paymentMethods: string[]
  sellers: SalesSellerRow[]
  terminals: SalesTerminalRow[]
}) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const set = (patch: Partial<SalesSectionFilters>) => onFiltersChange({ ...filters, ...patch })
  const hasFilters = filterFields.saleType || filterFields.payment || filterFields.seller
    || filterFields.terminal || filterFields.date

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <button
          type="button"
          onClick={() => void onExport()}
          className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 rounded-lg"
        >
          <FileSpreadsheet size={14} /> {t('reports.export_section')}
        </button>
      </div>
      {hasFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            {filterFields.saleType && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.sale_type')}</label>
                <select value={filters.saleType} onChange={(e) => set({ saleType: e.target.value })} className="input text-sm min-w-[7rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {saleTypes.map((v) => <option key={v} value={v}>{saleTypeLabel(t, v)}</option>)}
                </select>
              </div>
            )}
            {filterFields.payment && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.payment_method')}</label>
                <select value={filters.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })} className="input text-sm min-w-[7rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {paymentMethods.map((v) => <option key={v} value={v}>{paymentLabel(t, v)}</option>)}
                </select>
              </div>
            )}
            {filterFields.seller && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.seller')}</label>
                <select value={filters.sellerId} onChange={(e) => set({ sellerId: e.target.value })} className="input text-sm min-w-[9rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {sellers.map((s) => (
                    <option key={s.seller_id} value={String(s.seller_id)}>
                      {lang === 'ar' ? s.seller_name_ar : s.seller_name_en}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filterFields.terminal && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.terminal')}</label>
                <select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className="input text-sm min-w-[9rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {terminals.map((b) => (
                    <option key={b.branch_id} value={String(b.branch_id)}>
                      {lang === 'ar' ? b.branch_name_ar : b.branch_name_en}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filterFields.date && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.from')}</label>
                  <DateInput value={filters.dateFrom} min={dateBounds.from} max={filters.dateTo || dateBounds.to}
                    onChange={(v) => set({ dateFrom: v })} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.to')}</label>
                  <DateInput value={filters.dateTo} min={filters.dateFrom || dateBounds.from} max={dateBounds.to}
                    onChange={(v) => set({ dateTo: v })} />
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => onFiltersChange(defaultSalesFilters(dateBounds.from, dateBounds.to))}
              className="text-xs text-slate-600 hover:text-pharma-700 px-2 py-2"
            >
              {t('reports.reset_filters')}
            </button>
          </div>
        </div>
      )}
      <DataTable empty={empty} cols={cols} rows={rows} />
    </div>
  )
}

function SalesReportPanel({
  report,
  reportFrom,
  reportTo,
  dateParams,
}: {
  report: SalesReport
  reportFrom: string
  reportTo: string
  dateParams: { date_from: string; date_to: string }
}) {
  const { t } = useTranslation()
  const bounds = { from: reportFrom, to: reportTo }
  const suffix = `${reportFrom}_${reportTo}`

  const [typeFilters, setTypeFilters] = useState(() => defaultSalesFilters(reportFrom, reportTo))
  const [sellerFilters, setSellerFilters] = useState(() => defaultSalesFilters(reportFrom, reportTo))
  const [terminalFilters, setTerminalFilters] = useState(() => defaultSalesFilters(reportFrom, reportTo))
  const [invoiceFilters, setInvoiceFilters] = useState(() => defaultSalesFilters(reportFrom, reportTo))
  const [lineFilters, setLineFilters] = useState(() => defaultSalesFilters(reportFrom, reportTo))

  useEffect(() => {
    const d = defaultSalesFilters(reportFrom, reportTo)
    setTypeFilters(d)
    setSellerFilters(d)
    setTerminalFilters(d)
    setInvoiceFilters(d)
    setLineFilters(d)
  }, [reportFrom, reportTo, report.date_from])

  const saleTypes = useMemo(
    () => [...new Set(report.by_sale_type.map((r) => r.sale_type))].sort(),
    [report.by_sale_type],
  )
  const paymentMethods = useMemo(
    () => [...new Set(report.by_sale_type.map((r) => r.payment_method))].sort(),
    [report.by_sale_type],
  )

  const typeRows = useMemo(() => filterSalesReportClient(report, typeFilters).bySaleType, [report, typeFilters])
  const sellerRows = useMemo(() => filterSalesReportClient(report, sellerFilters).bySeller, [report, sellerFilters])
  const terminalRows = useMemo(() => filterSalesReportClient(report, terminalFilters).byTerminal, [report, terminalFilters])
  const invoiceRows = useMemo(() => filterSalesReportClient(report, invoiceFilters).invoices, [report, invoiceFilters])
  const lineRows = useMemo(() => filterSalesReportClient(report, lineFilters).lineItems, [report, lineFilters])

  return (
    <section className="space-y-4">
      <SectionHead icon={<Receipt size={18} />} title={t('reports.sales_report')} subtitle={`${reportFrom} → ${reportTo}`} />
      <p className="text-xs text-slate-500">{t('reports.sales_report_hint')}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi tone="blue" label={t('reports.invoices')} value={fmtInt(report.summary.invoice_count)} />
        <Kpi tone="green" label={t('reports.revenue')} value={fmt(report.summary.total_revenue)} />
        <Kpi tone="amber" label={t('sales.discount')} value={fmt(report.summary.total_discount || 0)} />
        <Kpi tone="blue" label={t('reports.items_qty')} value={fmtInt(report.summary.items_qty)} />
      </div>

      <SalesReportSection
        title={t('reports.by_sale_type')}
        filters={typeFilters}
        onFiltersChange={setTypeFilters}
        filterFields={{ saleType: true, payment: true }}
        saleTypes={saleTypes}
        paymentMethods={paymentMethods}
        sellers={report.by_seller}
        terminals={report.by_terminal}
        dateBounds={bounds}
        cols={salesTypeCols(t)}
        rows={typeRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/sales-report/export', `sales_by_type_${suffix}.xlsx`, salesExportParams(dateParams, 'by_sale_type', typeFilters))}
      />

      <SalesReportSection
        title={t('reports.by_salesperson')}
        filters={sellerFilters}
        onFiltersChange={setSellerFilters}
        filterFields={{ seller: true, saleType: true }}
        saleTypes={saleTypes}
        paymentMethods={paymentMethods}
        sellers={report.by_seller}
        terminals={report.by_terminal}
        dateBounds={bounds}
        cols={salesSellerCols(t)}
        rows={sellerRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/sales-report/export', `sales_by_seller_${suffix}.xlsx`, salesExportParams(dateParams, 'by_seller', sellerFilters))}
      />

      <SalesReportSection
        title={t('reports.by_terminal')}
        filters={terminalFilters}
        onFiltersChange={setTerminalFilters}
        filterFields={{ terminal: true }}
        saleTypes={saleTypes}
        paymentMethods={paymentMethods}
        sellers={report.by_seller}
        terminals={report.by_terminal}
        dateBounds={bounds}
        cols={salesTerminalCols(t)}
        rows={terminalRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/sales-report/export', `sales_by_terminal_${suffix}.xlsx`, salesExportParams(dateParams, 'by_terminal', terminalFilters))}
      />

      <SalesReportSection
        title={t('reports.invoice_detail')}
        filters={invoiceFilters}
        onFiltersChange={setInvoiceFilters}
        filterFields={{ saleType: true, payment: true, seller: true, terminal: true, date: true }}
        saleTypes={saleTypes}
        paymentMethods={paymentMethods}
        sellers={report.by_seller}
        terminals={report.by_terminal}
        dateBounds={bounds}
        cols={salesInvoiceCols(t)}
        rows={invoiceRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/sales-report/export', `sales_invoices_${suffix}.xlsx`, salesExportParams(dateParams, 'invoices', invoiceFilters))}
      />

      <SalesReportSection
        title={t('reports.line_items')}
        filters={lineFilters}
        onFiltersChange={setLineFilters}
        filterFields={{ saleType: true, payment: true, seller: true, terminal: true, date: true }}
        saleTypes={saleTypes}
        paymentMethods={paymentMethods}
        sellers={report.by_seller}
        terminals={report.by_terminal}
        dateBounds={bounds}
        cols={salesLineItemCols(t)}
        rows={lineRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/sales-report/export', `sales_line_items_${suffix}.xlsx`, salesExportParams(dateParams, 'line_items', lineFilters))}
      />
    </section>
  )
}

function salesTypeCols(t: (k: string) => string) {
  return [
    { key: 'sale_type', label: t('reports.sale_type'), render: (r: SalesTypeRow) => saleTypeLabel(t, r.sale_type), sortValue: (r: SalesTypeRow) => r.sale_type },
    { key: 'payment_method', label: t('reports.payment_method'), render: (r: SalesTypeRow) => paymentLabel(t, r.payment_method), sortValue: (r: SalesTypeRow) => r.payment_method },
    { key: 'invoice_count', label: t('reports.invoices'), align: 'end' as const, render: (r: SalesTypeRow) => fmtInt(r.invoice_count), sortValue: (r: SalesTypeRow) => r.invoice_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: SalesTypeRow) => fmt(r.revenue), sortValue: (r: SalesTypeRow) => r.revenue },
    { key: 'total_discount', label: t('sales.discount'), align: 'end' as const, render: (r: SalesTypeRow) => r.total_discount > 0 ? fmt(r.total_discount) : '—', sortValue: (r: SalesTypeRow) => r.total_discount },
    { key: 'items_qty', label: t('reports.items_qty'), align: 'end' as const, render: (r: SalesTypeRow) => fmtInt(r.items_qty), sortValue: (r: SalesTypeRow) => r.items_qty },
  ]
}

function salesSellerCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'seller', label: t('reports.seller'), render: (r: SalesSellerRow) => lang === 'ar' ? r.seller_name_ar : r.seller_name_en, sortValue: (r: SalesSellerRow) => lang === 'ar' ? r.seller_name_ar : r.seller_name_en },
    { key: 'invoice_count', label: t('reports.invoices'), align: 'end' as const, render: (r: SalesSellerRow) => fmtInt(r.invoice_count), sortValue: (r: SalesSellerRow) => r.invoice_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: SalesSellerRow) => fmt(r.revenue), sortValue: (r: SalesSellerRow) => r.revenue },
    { key: 'items_qty', label: t('reports.items_qty'), align: 'end' as const, render: (r: SalesSellerRow) => fmtInt(r.items_qty), sortValue: (r: SalesSellerRow) => r.items_qty },
    { key: 'cash_count', label: t('sales.cash'), align: 'end' as const, render: (r: SalesSellerRow) => fmtInt(r.cash_count), sortValue: (r: SalesSellerRow) => r.cash_count },
    { key: 'delivery_count', label: t('sales.delivery'), align: 'end' as const, render: (r: SalesSellerRow) => fmtInt(r.delivery_count), sortValue: (r: SalesSellerRow) => r.delivery_count },
    { key: 'digital_count', label: t('sales.digital'), align: 'end' as const, render: (r: SalesSellerRow) => fmtInt(r.digital_count), sortValue: (r: SalesSellerRow) => r.digital_count },
  ]
}

function salesTerminalCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'terminal', label: t('reports.terminal'), render: (r: SalesTerminalRow) => lang === 'ar' ? r.branch_name_ar : r.branch_name_en, sortValue: (r: SalesTerminalRow) => lang === 'ar' ? r.branch_name_ar : r.branch_name_en },
    { key: 'invoice_count', label: t('reports.invoices'), align: 'end' as const, render: (r: SalesTerminalRow) => fmtInt(r.invoice_count), sortValue: (r: SalesTerminalRow) => r.invoice_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: SalesTerminalRow) => fmt(r.revenue), sortValue: (r: SalesTerminalRow) => r.revenue },
    { key: 'items_qty', label: t('reports.items_qty'), align: 'end' as const, render: (r: SalesTerminalRow) => fmtInt(r.items_qty), sortValue: (r: SalesTerminalRow) => r.items_qty },
  ]
}

function salesInvoiceCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'invoice_number', label: t('reports.invoice_no'), sortValue: (r: SalesInvoiceRow) => r.invoice_number },
    { key: 'date', label: t('reports.sale_date'), render: (r: SalesInvoiceRow) => fmtDate(r.created_at), sortValue: (r: SalesInvoiceRow) => r.created_at },
    { key: 'time', label: t('reports.sale_time'), render: (r: SalesInvoiceRow) => fmtTime(r.created_at), sortValue: (r: SalesInvoiceRow) => r.created_at },
    { key: 'sale_type', label: t('reports.sale_type'), render: (r: SalesInvoiceRow) => saleTypeLabel(t, r.sale_type), sortValue: (r: SalesInvoiceRow) => r.sale_type },
    { key: 'payment_method', label: t('reports.payment_method'), render: (r: SalesInvoiceRow) => paymentLabel(t, r.payment_method), sortValue: (r: SalesInvoiceRow) => r.payment_method },
    { key: 'subtotal', label: t('sales.subtotal'), align: 'end' as const, render: (r: SalesInvoiceRow) => fmt(r.subtotal), sortValue: (r: SalesInvoiceRow) => r.subtotal },
    { key: 'discount', label: t('sales.discount'), align: 'end' as const, render: (r: SalesInvoiceRow) => r.discount > 0 ? <span className="text-amber-700">-{fmt(r.discount)}</span> : '—', sortValue: (r: SalesInvoiceRow) => r.discount },
    { key: 'net_total', label: t('reports.net_total'), align: 'end' as const, render: (r: SalesInvoiceRow) => <span className="font-semibold text-emerald-700">{fmt(r.net_total)}</span>, sortValue: (r: SalesInvoiceRow) => r.net_total },
    { key: 'seller', label: t('reports.seller'), render: (r: SalesInvoiceRow) => lang === 'ar' ? r.seller_name_ar || '—' : r.seller_name_en || '—', sortValue: (r: SalesInvoiceRow) => lang === 'ar' ? r.seller_name_ar || '' : r.seller_name_en || '' },
    { key: 'terminal', label: t('reports.terminal'), render: (r: SalesInvoiceRow) => lang === 'ar' ? r.branch_name_ar || '—' : r.branch_name_en || '—', sortValue: (r: SalesInvoiceRow) => lang === 'ar' ? r.branch_name_ar || '' : r.branch_name_en || '' },
    { key: 'customer_name', label: t('reports.customer'), render: (r: SalesInvoiceRow) => r.customer_name || '—' },
    { key: 'items_qty', label: t('reports.items_qty'), align: 'end' as const, render: (r: SalesInvoiceRow) => fmtInt(r.items_qty), sortValue: (r: SalesInvoiceRow) => r.items_qty },
  ]
}

function salesLineItemCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'invoice_number', label: t('reports.invoice_no'), sortValue: (r: SalesLineItemRow) => r.invoice_number },
    { key: 'date', label: t('reports.sale_date'), render: (r: SalesLineItemRow) => fmtDate(r.created_at), sortValue: (r: SalesLineItemRow) => r.created_at },
    { key: 'time', label: t('reports.sale_time'), render: (r: SalesLineItemRow) => fmtTime(r.created_at), sortValue: (r: SalesLineItemRow) => r.created_at },
    { key: 'sale_type', label: t('reports.sale_type'), render: (r: SalesLineItemRow) => saleTypeLabel(t, r.sale_type), sortValue: (r: SalesLineItemRow) => r.sale_type },
    { key: 'product_name', label: t('reports.product'), sortValue: (r: SalesLineItemRow) => r.product_name },
    { key: 'barcode', label: t('reports.barcode'), render: (r: SalesLineItemRow) => r.barcode || '—' },
    { key: 'qty', label: t('reports.qty'), align: 'end' as const, render: (r: SalesLineItemRow) => fmtInt(r.qty), sortValue: (r: SalesLineItemRow) => r.qty },
    { key: 'unit_price', label: t('reports.unit_price'), align: 'end' as const, render: (r: SalesLineItemRow) => fmt(r.unit_price), sortValue: (r: SalesLineItemRow) => r.unit_price },
    { key: 'line_discount', label: t('sales.discount'), align: 'end' as const, render: (r: SalesLineItemRow) => r.line_discount > 0 ? <span className="text-amber-700">-{fmt(r.line_discount)}</span> : '—', sortValue: (r: SalesLineItemRow) => r.line_discount },
    { key: 'line_total', label: t('reports.line_total'), align: 'end' as const, render: (r: SalesLineItemRow) => fmt(r.line_total), sortValue: (r: SalesLineItemRow) => r.line_total },
    { key: 'seller', label: t('reports.seller'), render: (r: SalesLineItemRow) => lang === 'ar' ? r.seller_name_ar || '—' : r.seller_name_en || '—' },
    { key: 'terminal', label: t('reports.terminal'), render: (r: SalesLineItemRow) => lang === 'ar' ? r.branch_name_ar || '—' : r.branch_name_en || '—' },
  ]
}

type DeliverySectionFilters = {
  branchId: string
  driverId: string
  status: string
  hourFrom: string
  hourTo: string
  dateFrom: string
  dateTo: string
  intervalHours: string
}

type DeliveryFilterFields = {
  branch?: boolean
  driver?: boolean
  status?: boolean
  hour?: boolean
  date?: boolean
  interval?: boolean
}

function defaultDeliveryFilters(from: string, to: string): DeliverySectionFilters {
  return {
    branchId: '', driverId: '', status: '', hourFrom: '', hourTo: '',
    dateFrom: from, dateTo: to, intervalHours: '1',
  }
}

function deliveryIntervalLabel(start: number, hours: number) {
  const end = (start + hours) % 24
  return `${String(start).padStart(2, '0')}:00–${String(end).padStart(2, '0')}:00`
}

function filterDeliveryOrders(orders: DeliveryOrderRow[], f: DeliverySectionFilters) {
  let out = orders
  if (f.branchId) out = out.filter((o) => String(o.branch_id) === f.branchId)
  if (f.driverId) out = out.filter((o) => String(o.delivery_person_id) === f.driverId)
  if (f.status) out = out.filter((o) => o.delivery_status === f.status)
  if (f.hourFrom !== '') out = out.filter((o) => o.hour >= Number(f.hourFrom))
  if (f.hourTo !== '') out = out.filter((o) => o.hour <= Number(f.hourTo))
  if (f.dateFrom || f.dateTo) {
    out = out.filter((o) => inSectionDateRange(o.created_at, f.dateFrom, f.dateTo))
  }
  return out
}

function aggregateDeliveryByTime(orders: DeliveryOrderRow[], intervalHours: number): DeliveryTimeRow[] {
  const ih = Math.max(1, Math.min(4, intervalHours || 1))
  const buckets = new Map<number, DeliveryTimeRow>()
  for (const o of orders) {
    const start = Math.floor(o.hour / ih) * ih
    let b = buckets.get(start)
    if (!b) {
      b = {
        hour_start: start,
        interval_hours: ih,
        interval_label: deliveryIntervalLabel(start, ih),
        order_count: 0,
        pending_count: 0,
        out_for_delivery_count: 0,
        delivered_count: 0,
        revenue: 0,
        delivery_fees: 0,
      }
      buckets.set(start, b)
    }
    b.order_count += 1
    if (o.delivery_status === 'pending') b.pending_count += 1
    else if (o.delivery_status === 'out_for_delivery') b.out_for_delivery_count += 1
    else if (o.delivery_status === 'delivered') b.delivered_count += 1
    b.revenue = Math.round((b.revenue + o.net_total) * 100) / 100
    b.delivery_fees = Math.round((b.delivery_fees + o.delivery_fee) * 100) / 100
  }
  return [...buckets.values()].sort((a, b) => a.hour_start - b.hour_start)
}

function aggregateDeliveryByDriver(orders: DeliveryOrderRow[]): DeliveryDriverRow[] {
  const buckets = new Map<string, DeliveryDriverRow>()
  for (const o of orders) {
    const key = `${o.delivery_person_id}|${o.branch_id}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        delivery_person_id: o.delivery_person_id,
        delivery_person_name: o.delivery_person_name,
        branch_id: o.branch_id,
        branch_name_en: o.branch_name_en,
        branch_name_ar: o.branch_name_ar,
        order_count: 0,
        pending_count: 0,
        out_for_delivery_count: 0,
        delivered_count: 0,
        revenue: 0,
        delivery_fees: 0,
      }
      buckets.set(key, b)
    }
    b.order_count += 1
    if (o.delivery_status === 'pending') b.pending_count += 1
    else if (o.delivery_status === 'out_for_delivery') b.out_for_delivery_count += 1
    else if (o.delivery_status === 'delivered') b.delivered_count += 1
    b.revenue = Math.round((b.revenue + o.net_total) * 100) / 100
    b.delivery_fees = Math.round((b.delivery_fees + o.delivery_fee) * 100) / 100
  }
  return [...buckets.values()].sort((a, b) => b.order_count - a.order_count)
}

function aggregateDeliveryByBranch(orders: DeliveryOrderRow[]) {
  const buckets = new Map<number, DeliveryReport['by_branch'][0]>()
  for (const o of orders) {
    let b = buckets.get(o.branch_id)
    if (!b) {
      b = {
        branch_id: o.branch_id,
        branch_name_en: o.branch_name_en,
        branch_name_ar: o.branch_name_ar,
        order_count: 0,
        pending_count: 0,
        out_for_delivery_count: 0,
        delivered_count: 0,
        revenue: 0,
      }
      buckets.set(o.branch_id, b)
    }
    b.order_count += 1
    if (o.delivery_status === 'pending') b.pending_count += 1
    else if (o.delivery_status === 'out_for_delivery') b.out_for_delivery_count += 1
    else if (o.delivery_status === 'delivered') b.delivered_count += 1
    b.revenue = Math.round((b.revenue + o.net_total) * 100) / 100
  }
  return [...buckets.values()].sort((a, b) => b.order_count - a.order_count)
}

function deliveryExportParams(
  dateParams: { date_from: string; date_to: string },
  section: string,
  filters: DeliverySectionFilters,
) {
  return {
    ...dateParams,
    section,
    branch_id: filters.branchId ? Number(filters.branchId) : undefined,
    delivery_person_id: filters.driverId ? Number(filters.driverId) : undefined,
    delivery_status: filters.status || undefined,
    hour_from: filters.hourFrom !== '' ? Number(filters.hourFrom) : undefined,
    hour_to: filters.hourTo !== '' ? Number(filters.hourTo) : undefined,
    section_date_from: filters.dateFrom || undefined,
    section_date_to: filters.dateTo || undefined,
    interval_hours: filters.intervalHours ? Number(filters.intervalHours) : 1,
  }
}

function deliveryTimeCols(t: (k: string) => string) {
  return [
    { key: 'interval_label', label: t('reports.time_interval'), sortValue: (r: DeliveryTimeRow) => r.hour_start },
    { key: 'order_count', label: t('reports.delivery_orders'), align: 'end' as const, render: (r: DeliveryTimeRow) => fmtInt(r.order_count), sortValue: (r: DeliveryTimeRow) => r.order_count },
    { key: 'pending_count', label: t('deliveries.pending'), align: 'end' as const, render: (r: DeliveryTimeRow) => fmtInt(r.pending_count), sortValue: (r: DeliveryTimeRow) => r.pending_count },
    { key: 'out_for_delivery_count', label: t('deliveries.out_for_delivery'), align: 'end' as const, render: (r: DeliveryTimeRow) => fmtInt(r.out_for_delivery_count), sortValue: (r: DeliveryTimeRow) => r.out_for_delivery_count },
    { key: 'delivered_count', label: t('deliveries.delivered'), align: 'end' as const, render: (r: DeliveryTimeRow) => fmtInt(r.delivered_count), sortValue: (r: DeliveryTimeRow) => r.delivered_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: DeliveryTimeRow) => fmt(r.revenue), sortValue: (r: DeliveryTimeRow) => r.revenue },
    { key: 'delivery_fees', label: t('deliveries.delivery_fee_col'), align: 'end' as const, render: (r: DeliveryTimeRow) => fmt(r.delivery_fees), sortValue: (r: DeliveryTimeRow) => r.delivery_fees },
  ]
}

function deliveryDriverCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'driver', label: t('deliveries.driver'), render: (r: DeliveryDriverRow) => r.delivery_person_name, sortValue: (r: DeliveryDriverRow) => r.delivery_person_name },
    { key: 'branch', label: t('reports.branch'), render: (r: DeliveryDriverRow) => lang === 'ar' ? r.branch_name_ar : r.branch_name_en },
    { key: 'order_count', label: t('reports.delivery_orders'), align: 'end' as const, render: (r: DeliveryDriverRow) => fmtInt(r.order_count), sortValue: (r: DeliveryDriverRow) => r.order_count },
    { key: 'pending_count', label: t('deliveries.pending'), align: 'end' as const, render: (r: DeliveryDriverRow) => fmtInt(r.pending_count), sortValue: (r: DeliveryDriverRow) => r.pending_count },
    { key: 'out_for_delivery_count', label: t('deliveries.out_for_delivery'), align: 'end' as const, render: (r: DeliveryDriverRow) => fmtInt(r.out_for_delivery_count), sortValue: (r: DeliveryDriverRow) => r.out_for_delivery_count },
    { key: 'delivered_count', label: t('deliveries.delivered'), align: 'end' as const, render: (r: DeliveryDriverRow) => fmtInt(r.delivered_count), sortValue: (r: DeliveryDriverRow) => r.delivered_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: DeliveryDriverRow) => fmt(r.revenue), sortValue: (r: DeliveryDriverRow) => r.revenue },
    { key: 'delivery_fees', label: t('deliveries.delivery_fee_col'), align: 'end' as const, render: (r: DeliveryDriverRow) => fmt(r.delivery_fees), sortValue: (r: DeliveryDriverRow) => r.delivery_fees },
  ]
}

function deliveryBranchCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'branch', label: t('reports.branch'), render: (r: DeliveryReport['by_branch'][0]) => lang === 'ar' ? r.branch_name_ar : r.branch_name_en },
    { key: 'order_count', label: t('reports.delivery_orders'), align: 'end' as const, render: (r: DeliveryReport['by_branch'][0]) => fmtInt(r.order_count), sortValue: (r: DeliveryReport['by_branch'][0]) => r.order_count },
    { key: 'pending_count', label: t('deliveries.pending'), align: 'end' as const, render: (r: DeliveryReport['by_branch'][0]) => fmtInt(r.pending_count), sortValue: (r: DeliveryReport['by_branch'][0]) => r.pending_count },
    { key: 'out_for_delivery_count', label: t('deliveries.out_for_delivery'), align: 'end' as const, render: (r: DeliveryReport['by_branch'][0]) => fmtInt(r.out_for_delivery_count), sortValue: (r: DeliveryReport['by_branch'][0]) => r.out_for_delivery_count },
    { key: 'delivered_count', label: t('deliveries.delivered'), align: 'end' as const, render: (r: DeliveryReport['by_branch'][0]) => fmtInt(r.delivered_count), sortValue: (r: DeliveryReport['by_branch'][0]) => r.delivered_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: DeliveryReport['by_branch'][0]) => fmt(r.revenue), sortValue: (r: DeliveryReport['by_branch'][0]) => r.revenue },
  ]
}

function DeliverySummarySection({
  title,
  filters,
  onFiltersChange,
  filterFields,
  onExport,
  cols,
  rows,
  empty,
  dateBounds,
  branches,
  drivers,
}: {
  title: string
  filters: DeliverySectionFilters
  onFiltersChange: (f: DeliverySectionFilters) => void
  filterFields: DeliveryFilterFields
  onExport: () => void
  cols: Parameters<typeof DataTable>[0]['cols']
  rows: any[]
  empty: string
  dateBounds: { from: string; to: string }
  branches: DeliveryReport['by_branch']
  drivers: DeliveryDriverRow[]
}) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const set = (patch: Partial<DeliverySectionFilters>) => onFiltersChange({ ...filters, ...patch })
  const hasFilters = filterFields.branch || filterFields.driver || filterFields.status
    || filterFields.hour || filterFields.date || filterFields.interval
  const uniqueDrivers = useMemo(() => {
    const seen = new Set<number>()
    return drivers.filter((d) => {
      if (seen.has(d.delivery_person_id)) return false
      seen.add(d.delivery_person_id)
      return true
    })
  }, [drivers])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <button
          type="button"
          onClick={() => void onExport()}
          className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 rounded-lg"
        >
          <FileSpreadsheet size={14} /> {t('reports.export_section')}
        </button>
      </div>
      {hasFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            {filterFields.interval && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.interval_hours')}</label>
                <select value={filters.intervalHours} onChange={(e) => set({ intervalHours: e.target.value })} className="input text-sm min-w-[7rem]">
                  <option value="1">{t('reports.interval_1h')}</option>
                  <option value="2">{t('reports.interval_2h')}</option>
                  <option value="4">{t('reports.interval_4h')}</option>
                </select>
              </div>
            )}
            {filterFields.branch && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.branch')}</label>
                <select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className="input text-sm min-w-[9rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {branches.map((b) => (
                    <option key={b.branch_id} value={String(b.branch_id)}>
                      {lang === 'ar' ? b.branch_name_ar : b.branch_name_en}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filterFields.driver && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('deliveries.driver')}</label>
                <select value={filters.driverId} onChange={(e) => set({ driverId: e.target.value })} className="input text-sm min-w-[9rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {uniqueDrivers.map((d) => (
                    <option key={d.delivery_person_id} value={String(d.delivery_person_id)}>{d.delivery_person_name}</option>
                  ))}
                </select>
              </div>
            )}
            {filterFields.status && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.delivery_status')}</label>
                <select value={filters.status} onChange={(e) => set({ status: e.target.value })} className="input text-sm min-w-[8rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  <option value="pending">{t('deliveries.pending')}</option>
                  <option value="out_for_delivery">{t('deliveries.out_for_delivery')}</option>
                  <option value="delivered">{t('deliveries.delivered')}</option>
                </select>
              </div>
            )}
            {filterFields.hour && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.hour_from')}</label>
                  <select value={filters.hourFrom} onChange={(e) => set({ hourFrom: e.target.value })} className="input text-sm min-w-[5rem]">
                    <option value="">{t('reports.filter_all')}</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.hour_to')}</label>
                  <select value={filters.hourTo} onChange={(e) => set({ hourTo: e.target.value })} className="input text-sm min-w-[5rem]">
                    <option value="">{t('reports.filter_all')}</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {filterFields.date && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.from')}</label>
                  <DateInput value={filters.dateFrom} min={dateBounds.from} max={filters.dateTo || dateBounds.to}
                    onChange={(v) => set({ dateFrom: v })} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.to')}</label>
                  <DateInput value={filters.dateTo} min={filters.dateFrom || dateBounds.from} max={dateBounds.to}
                    onChange={(v) => set({ dateTo: v })} />
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => onFiltersChange(defaultDeliveryFilters(dateBounds.from, dateBounds.to))}
              className="text-xs text-slate-600 hover:text-pharma-700 px-2 py-2"
            >
              {t('reports.reset_filters')}
            </button>
          </div>
        </div>
      )}
      <DataTable empty={empty} cols={cols} rows={rows} />
    </div>
  )
}

function DeliverySummaryPanel({
  report,
  reportFrom,
  reportTo,
  dateParams,
}: {
  report: DeliveryReport
  reportFrom: string
  reportTo: string
  dateParams: { date_from: string; date_to: string }
}) {
  const { t } = useTranslation()
  const bounds = { from: reportFrom, to: reportTo }
  const suffix = `${reportFrom}_${reportTo}`
  const orders = report.orders || []

  const [timeFilters, setTimeFilters] = useState(() => defaultDeliveryFilters(reportFrom, reportTo))
  const [driverFilters, setDriverFilters] = useState(() => defaultDeliveryFilters(reportFrom, reportTo))
  const [branchFilters, setBranchFilters] = useState(() => defaultDeliveryFilters(reportFrom, reportTo))

  useEffect(() => {
    const d = defaultDeliveryFilters(reportFrom, reportTo)
    setTimeFilters(d)
    setDriverFilters(d)
    setBranchFilters(d)
  }, [reportFrom, reportTo, report.date_from])

  const timeRows = useMemo(() => {
    const filtered = filterDeliveryOrders(orders, timeFilters)
    return aggregateDeliveryByTime(filtered, Number(timeFilters.intervalHours) || 1)
  }, [orders, timeFilters])

  const driverRows = useMemo(() => aggregateDeliveryByDriver(filterDeliveryOrders(orders, driverFilters)), [orders, driverFilters])
  const branchRows = useMemo(() => aggregateDeliveryByBranch(filterDeliveryOrders(orders, branchFilters)), [orders, branchFilters])

  const filteredTotals = useMemo(() => {
    const o = filterDeliveryOrders(orders, timeFilters)
    return {
      order_count: o.length,
      pending_count: o.filter((x) => x.delivery_status === 'pending').length,
      delivered_count: o.filter((x) => x.delivery_status === 'delivered').length,
    }
  }, [orders, timeFilters])

  return (
    <section className="space-y-4">
      <SectionHead icon={<Bike size={18} />} title={t('reports.delivery_summary')} subtitle={`${reportFrom} → ${reportTo}`} />
      <p className="text-xs text-slate-500">{t('reports.delivery_summary_hint')}</p>
      <div className="grid grid-cols-3 gap-3">
        <Kpi tone="blue" label={t('reports.delivery_orders')} value={fmtInt(filteredTotals.order_count)} />
        <Kpi tone="amber" label={t('deliveries.pending')} value={fmtInt(filteredTotals.pending_count)} />
        <Kpi tone="green" label={t('deliveries.delivered')} value={fmtInt(filteredTotals.delivered_count)} />
      </div>

      <DeliverySummarySection
        title={t('reports.by_time_interval')}
        filters={timeFilters}
        onFiltersChange={setTimeFilters}
        filterFields={{ interval: true, branch: true, driver: true, status: true, hour: true, date: true }}
        branches={report.by_branch}
        drivers={report.by_driver}
        dateBounds={bounds}
        cols={deliveryTimeCols(t)}
        rows={timeRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/delivery-summary/export', `delivery_by_time_${suffix}.xlsx`, deliveryExportParams(dateParams, 'by_time', timeFilters))}
      />

      <DeliverySummarySection
        title={t('reports.by_driver')}
        filters={driverFilters}
        onFiltersChange={setDriverFilters}
        filterFields={{ branch: true, driver: true, status: true, hour: true, date: true }}
        branches={report.by_branch}
        drivers={report.by_driver}
        dateBounds={bounds}
        cols={deliveryDriverCols(t)}
        rows={driverRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/delivery-summary/export', `delivery_by_driver_${suffix}.xlsx`, deliveryExportParams(dateParams, 'by_driver', driverFilters))}
      />

      <DeliverySummarySection
        title={t('reports.by_branch')}
        filters={branchFilters}
        onFiltersChange={setBranchFilters}
        filterFields={{ branch: true, status: true, hour: true, date: true }}
        branches={report.by_branch}
        drivers={report.by_driver}
        dateBounds={bounds}
        cols={deliveryBranchCols(t)}
        rows={branchRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/delivery-summary/export', `delivery_by_branch_${suffix}.xlsx`, deliveryExportParams(dateParams, 'by_branch', branchFilters))}
      />
    </section>
  )
}

type CustomerSectionFilters = {
  buyerTier: string
  region: string
  customerId: string
  dateFrom: string
  dateTo: string
  invoiceDateOn: 'last' | 'first'
}

type CustomerFilterFields = {
  tier?: boolean
  region?: boolean
  customer?: boolean
  date?: boolean
  invoiceDateOn?: boolean
}

function defaultCustomerFilters(from: string, to: string): CustomerSectionFilters {
  return { buyerTier: '', region: '', customerId: '', dateFrom: from, dateTo: to, invoiceDateOn: 'last' }
}

function filterCustomerRows(
  rows: CustomerRow[],
  filters: CustomerSectionFilters,
  tierLock?: CustomerRow['buyer_tier'],
) {
  let out = rows
  if (tierLock) out = out.filter((r) => r.buyer_tier === tierLock)
  else if (filters.buyerTier) out = out.filter((r) => r.buyer_tier === filters.buyerTier)
  if (filters.region) out = out.filter((r) => (r.region || '').toLowerCase() === filters.region.toLowerCase())
  if (filters.customerId) out = out.filter((r) => String(r.customer_id) === filters.customerId)
  const dateField = filters.invoiceDateOn === 'first' ? 'first_invoice_at' : 'last_invoice_at'
  if (filters.dateFrom || filters.dateTo) {
    out = out.filter((r) => inSectionDateRange(r[dateField] || '', filters.dateFrom, filters.dateTo))
  }
  return out
}

function filterCustomerItems(rows: CustomerItemRow[], filters: CustomerSectionFilters) {
  let out = rows
  if (filters.customerId) out = out.filter((r) => String(r.customer_id) === filters.customerId)
  if (filters.dateFrom || filters.dateTo) {
    out = out.filter((r) => inSectionDateRange(r.last_purchased_at || '', filters.dateFrom, filters.dateTo))
  }
  return out
}

function customerExportParams(
  dateParams: { date_from: string; date_to: string },
  section: string,
  filters: CustomerSectionFilters,
) {
  return {
    ...dateParams,
    section,
    buyer_tier: filters.buyerTier || undefined,
    region: filters.region || undefined,
    customer_id: filters.customerId ? Number(filters.customerId) : undefined,
    section_date_from: filters.dateFrom || undefined,
    section_date_to: filters.dateTo || undefined,
    invoice_date_on: filters.invoiceDateOn,
  }
}

function CustomerAnalysisSection({
  title,
  filters,
  onFiltersChange,
  filterFields,
  onExport,
  cols,
  rows,
  empty,
  dateBounds,
  regions,
  customers,
}: {
  title: string
  filters: CustomerSectionFilters
  onFiltersChange: (f: CustomerSectionFilters) => void
  filterFields: CustomerFilterFields
  onExport: () => void
  cols: Parameters<typeof DataTable>[0]['cols']
  rows: any[]
  empty: string
  dateBounds: { from: string; to: string }
  regions: string[]
  customers: CustomerRow[]
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<CustomerSectionFilters>) => onFiltersChange({ ...filters, ...patch })
  const hasFilters = filterFields.tier || filterFields.region || filterFields.customer
    || filterFields.date || filterFields.invoiceDateOn

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <button
          type="button"
          onClick={() => void onExport()}
          className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 rounded-lg"
        >
          <FileSpreadsheet size={14} /> {t('reports.export_section')}
        </button>
      </div>
      {hasFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            {filterFields.tier && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.buyer_tier')}</label>
                <select value={filters.buyerTier} onChange={(e) => set({ buyerTier: e.target.value })} className="input text-sm min-w-[7rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  <option value="high">{t('reports.buyer_tier_high')}</option>
                  <option value="medium">{t('reports.buyer_tier_medium')}</option>
                  <option value="low">{t('reports.buyer_tier_low')}</option>
                </select>
              </div>
            )}
            {filterFields.region && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.zone')}</label>
                <select value={filters.region} onChange={(e) => set({ region: e.target.value })} className="input text-sm min-w-[8rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {filterFields.customer && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.customer')}</label>
                <select value={filters.customerId} onChange={(e) => set({ customerId: e.target.value })} className="input text-sm min-w-[10rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  {customers.map((c) => (
                    <option key={c.customer_id} value={String(c.customer_id)}>{c.customer_name}</option>
                  ))}
                </select>
              </div>
            )}
            {filterFields.invoiceDateOn && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.date_filter_on')}</label>
                <select value={filters.invoiceDateOn} onChange={(e) => set({ invoiceDateOn: e.target.value as 'last' | 'first' })} className="input text-sm min-w-[8rem]">
                  <option value="last">{t('reports.last_invoice')}</option>
                  <option value="first">{t('reports.first_invoice')}</option>
                </select>
              </div>
            )}
            {filterFields.date && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.from')}</label>
                  <DateInput value={filters.dateFrom} min={dateBounds.from} max={filters.dateTo || dateBounds.to}
                    onChange={(v) => set({ dateFrom: v })} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.to')}</label>
                  <DateInput value={filters.dateTo} min={filters.dateFrom || dateBounds.from} max={dateBounds.to}
                    onChange={(v) => set({ dateTo: v })} />
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => onFiltersChange(defaultCustomerFilters(dateBounds.from, dateBounds.to))}
              className="text-xs text-slate-600 hover:text-pharma-700 px-2 py-2"
            >
              {t('reports.reset_filters')}
            </button>
          </div>
        </div>
      )}
      <DataTable empty={empty} cols={cols} rows={rows} />
    </div>
  )
}

function CustomerAnalysisPanel({
  report,
  reportFrom,
  reportTo,
  dateParams,
}: {
  report: CustomerAnalysisReport
  reportFrom: string
  reportTo: string
  dateParams: { date_from: string; date_to: string }
}) {
  const { t } = useTranslation()
  const bounds = { from: reportFrom, to: reportTo }
  const suffix = `${reportFrom}_${reportTo}`

  const [topFilters, setTopFilters] = useState(() => defaultCustomerFilters(reportFrom, reportTo))
  const [lowFilters, setLowFilters] = useState(() => defaultCustomerFilters(reportFrom, reportTo))
  const [allFilters, setAllFilters] = useState(() => defaultCustomerFilters(reportFrom, reportTo))
  const [itemFilters, setItemFilters] = useState(() => defaultCustomerFilters(reportFrom, reportTo))

  useEffect(() => {
    const d = defaultCustomerFilters(reportFrom, reportTo)
    setTopFilters(d)
    setLowFilters(d)
    setAllFilters(d)
    setItemFilters(d)
  }, [reportFrom, reportTo, report.date_from])

  const regions = useMemo(
    () => [...new Set(report.customers.map((c) => c.region).filter(Boolean) as string[])].sort(),
    [report.customers],
  )
  const customersSorted = useMemo(
    () => [...report.customers].sort((a, b) => a.customer_name.localeCompare(b.customer_name)),
    [report.customers],
  )

  const topRows = useMemo(
    () => filterCustomerRows(report.top_buyers, topFilters, 'high'),
    [report.top_buyers, topFilters],
  )
  const lowRows = useMemo(
    () => filterCustomerRows(report.low_buyers, lowFilters, 'low'),
    [report.low_buyers, lowFilters],
  )
  const allRows = useMemo(
    () => filterCustomerRows(report.customers, allFilters),
    [report.customers, allFilters],
  )
  const itemRows = useMemo(
    () => filterCustomerItems(report.items, itemFilters),
    [report.items, itemFilters],
  )

  return (
    <section className="space-y-4">
      <SectionHead icon={<Users size={18} />} title={t('reports.customer_analysis')} subtitle={`${reportFrom} → ${reportTo}`} />
      <p className="text-xs text-slate-500">{t('reports.customer_analysis_hint')}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi tone="blue" label={t('reports.customer_count')} value={fmtInt(report.summary.customer_count)} />
        <Kpi tone="green" label={t('reports.total_customer_revenue')} value={fmt(report.summary.total_revenue)} />
        <Kpi tone="green" label={t('reports.high_buyers')} value={fmtInt(report.summary.high_buyers)} sub={t('reports.buyer_tier_high')} />
        <Kpi tone="amber" label={t('reports.low_buyers')} value={fmtInt(report.summary.low_buyers)} sub={t('reports.buyer_tier_low')} />
      </div>

      <CustomerAnalysisSection
        title={t('reports.top_buyers')}
        filters={topFilters}
        onFiltersChange={setTopFilters}
        filterFields={{ region: true, customer: true, date: true, invoiceDateOn: true }}
        regions={regions}
        customers={customersSorted}
        dateBounds={bounds}
        cols={customerCols(t)}
        rows={topRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/customer-analysis/export', `customer_top_buyers_${suffix}.xlsx`, customerExportParams(dateParams, 'top_buyers', topFilters))}
      />

      <CustomerAnalysisSection
        title={t('reports.low_buyers')}
        filters={lowFilters}
        onFiltersChange={setLowFilters}
        filterFields={{ region: true, customer: true, date: true, invoiceDateOn: true }}
        regions={regions}
        customers={customersSorted}
        dateBounds={bounds}
        cols={customerCols(t)}
        rows={lowRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/customer-analysis/export', `customer_low_buyers_${suffix}.xlsx`, customerExportParams(dateParams, 'low_buyers', lowFilters))}
      />

      <CustomerAnalysisSection
        title={t('reports.all_customers')}
        filters={allFilters}
        onFiltersChange={setAllFilters}
        filterFields={{ tier: true, region: true, customer: true, date: true, invoiceDateOn: true }}
        regions={regions}
        customers={customersSorted}
        dateBounds={bounds}
        cols={customerCols(t)}
        rows={allRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/customer-analysis/export', `customer_all_${suffix}.xlsx`, customerExportParams(dateParams, 'all_customers', allFilters))}
      />

      <CustomerAnalysisSection
        title={t('reports.items_purchased')}
        filters={itemFilters}
        onFiltersChange={setItemFilters}
        filterFields={{ customer: true, date: true }}
        regions={regions}
        customers={customersSorted}
        dateBounds={bounds}
        cols={customerItemCols(t)}
        rows={itemRows}
        empty={t('reports.no_data')}
        onExport={() => downloadApiExcel('/reports/customer-analysis/export', `customer_items_${suffix}.xlsx`, customerExportParams(dateParams, 'items', itemFilters))}
      />
    </section>
  )
}

function BuyerTierBadge({ tier }: { tier: CustomerRow['buyer_tier'] }) {
  const { t } = useTranslation()
  const cls: Record<CustomerRow['buyer_tier'], string> = {
    high: 'bg-emerald-100 text-emerald-800',
    medium: 'bg-blue-100 text-blue-800',
    low: 'bg-amber-100 text-amber-800',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${cls[tier]}`}>
      {t(`reports.buyer_tier_${tier}`, tier)}
    </span>
  )
}

function customerCols(t: (k: string) => string) {
  return [
    { key: 'customer_code', label: t('customers.col_code'), render: (r: CustomerRow) => r.customer_code || '—', sortValue: (r: CustomerRow) => r.customer_code || '' },
    { key: 'customer_name', label: t('reports.customer'), sortValue: (r: CustomerRow) => r.customer_name },
    { key: 'phone', label: t('reports.phone'), render: (r: CustomerRow) => r.phone || '—' },
    { key: 'region', label: t('reports.zone'), render: (r: CustomerRow) => r.region || '—' },
    { key: 'buyer_tier', label: t('reports.buyer_tier'), render: (r: CustomerRow) => <BuyerTierBadge tier={r.buyer_tier} />, sortValue: (r: CustomerRow) => r.buyer_tier },
    { key: 'invoice_count', label: t('reports.invoices'), align: 'end' as const, render: (r: CustomerRow) => fmtInt(r.invoice_count), sortValue: (r: CustomerRow) => r.invoice_count },
    { key: 'total_spent', label: t('reports.total_spent'), align: 'end' as const, render: (r: CustomerRow) => fmt(r.total_spent), sortValue: (r: CustomerRow) => r.total_spent },
    { key: 'total_discount', label: t('sales.discount'), align: 'end' as const, render: (r: CustomerRow) => r.total_discount > 0 ? fmt(r.total_discount) : '—', sortValue: (r: CustomerRow) => r.total_discount },
    { key: 'avg_order_value', label: t('reports.avg_order'), align: 'end' as const, render: (r: CustomerRow) => fmt(r.avg_order_value), sortValue: (r: CustomerRow) => r.avg_order_value },
    { key: 'first_invoice_at', label: t('reports.first_invoice'), render: (r: CustomerRow) => fmtDate(r.first_invoice_at), sortValue: (r: CustomerRow) => r.first_invoice_at || '' },
    { key: 'last_invoice_at', label: t('reports.last_invoice'), render: (r: CustomerRow) => fmtDate(r.last_invoice_at), sortValue: (r: CustomerRow) => r.last_invoice_at || '' },
    { key: 'days_since_last_invoice', label: t('reports.days_since_last'), align: 'end' as const, render: (r: CustomerRow) => r.days_since_last_invoice != null ? fmtInt(r.days_since_last_invoice) : '—', sortValue: (r: CustomerRow) => r.days_since_last_invoice ?? -1 },
    { key: 'avg_days_between_invoices', label: t('reports.avg_days_between'), align: 'end' as const, render: (r: CustomerRow) => r.avg_days_between_invoices != null ? fmt(r.avg_days_between_invoices) : '—', sortValue: (r: CustomerRow) => r.avg_days_between_invoices ?? -1 },
    { key: 'total_items_qty', label: t('reports.items_qty'), align: 'end' as const, render: (r: CustomerRow) => fmtInt(r.total_items_qty), sortValue: (r: CustomerRow) => r.total_items_qty },
    { key: 'distinct_products', label: t('reports.distinct_products'), align: 'end' as const, render: (r: CustomerRow) => fmtInt(r.distinct_products), sortValue: (r: CustomerRow) => r.distinct_products },
  ]
}

function customerItemCols(t: (k: string) => string) {
  return [
    { key: 'customer_code', label: t('customers.col_code'), render: (r: CustomerItemRow) => r.customer_code || '—' },
    { key: 'customer_name', label: t('reports.customer'), sortValue: (r: CustomerItemRow) => r.customer_name },
    { key: 'product_name', label: t('reports.product'), sortValue: (r: CustomerItemRow) => r.product_name },
    { key: 'barcode', label: t('reports.barcode'), render: (r: CustomerItemRow) => r.barcode || '—' },
    { key: 'qty', label: t('reports.qty'), align: 'end' as const, render: (r: CustomerItemRow) => fmtInt(r.qty), sortValue: (r: CustomerItemRow) => r.qty },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: CustomerItemRow) => fmt(r.revenue), sortValue: (r: CustomerItemRow) => r.revenue },
    { key: 'line_discount', label: t('sales.discount'), align: 'end' as const, render: (r: CustomerItemRow) => r.line_discount > 0 ? fmt(r.line_discount) : '—', sortValue: (r: CustomerItemRow) => r.line_discount },
    { key: 'purchase_count', label: t('reports.purchase_count'), align: 'end' as const, render: (r: CustomerItemRow) => fmtInt(r.purchase_count), sortValue: (r: CustomerItemRow) => r.purchase_count },
    { key: 'last_purchased_at', label: t('reports.last_purchased'), render: (r: CustomerItemRow) => fmtDate(r.last_purchased_at), sortValue: (r: CustomerItemRow) => r.last_purchased_at || '' },
  ]
}

type ZoneSectionFilters = {
  group: string
  minOrders: string
  withSalesOnly: boolean
  priority: string
}

function defaultZoneFilters(): ZoneSectionFilters {
  return { group: '', minOrders: '', withSalesOnly: false, priority: '' }
}

function filterZoneRows(rows: ZoneRow[], f: ZoneSectionFilters) {
  let out = rows
  if (f.group) out = out.filter((z) => z.group === f.group)
  if (f.minOrders !== '') out = out.filter((z) => z.order_count >= Number(f.minOrders))
  if (f.withSalesOnly) out = out.filter((z) => z.order_count > 0)
  return out
}

function filterMarketingRows(rows: MarketingSuggestion[], f: ZoneSectionFilters) {
  if (!f.priority) return rows
  return rows.filter((r) => r.priority === f.priority)
}

function zoneExportParams(
  dateParams: { date_from: string; date_to: string },
  section: string,
  filters: ZoneSectionFilters,
) {
  return {
    ...dateParams,
    section,
    region_group: filters.group || undefined,
    min_orders: filters.minOrders !== '' ? Number(filters.minOrders) : undefined,
    with_sales_only: filters.withSalesOnly ? 1 : undefined,
    priority: filters.priority || undefined,
  }
}

function DeliveryZonesSection({
  title,
  filters,
  onFiltersChange,
  showZoneFilters,
  showPriorityFilter,
  onExport,
  children,
}: {
  title: string
  filters: ZoneSectionFilters
  onFiltersChange: (f: ZoneSectionFilters) => void
  showZoneFilters?: boolean
  showPriorityFilter?: boolean
  onExport: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<ZoneSectionFilters>) => onFiltersChange({ ...filters, ...patch })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <button
          type="button"
          onClick={() => void onExport()}
          className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 rounded-lg"
        >
          <FileSpreadsheet size={14} /> {t('reports.export_section')}
        </button>
      </div>
      {(showZoneFilters || showPriorityFilter) && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            {showPriorityFilter && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.priority')}</label>
                <select value={filters.priority} onChange={(e) => set({ priority: e.target.value })} className="input text-sm min-w-[7rem]">
                  <option value="">{t('reports.filter_all')}</option>
                  <option value="high">{t('reports.priority_high')}</option>
                  <option value="medium">{t('reports.priority_medium')}</option>
                  <option value="low">{t('reports.priority_low')}</option>
                </select>
              </div>
            )}
            {showZoneFilters && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.zone_group')}</label>
                  <select value={filters.group} onChange={(e) => set({ group: e.target.value })} className="input text-sm min-w-[7rem]">
                    <option value="">{t('reports.filter_all')}</option>
                    <option value="markaz">{t('reports.group_markaz')}</option>
                    <option value="village">{t('reports.group_village')}</option>
                    <option value="other">{t('reports.group_other')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('reports.min_orders')}</label>
                  <input type="number" min={0} value={filters.minOrders} onChange={(e) => set({ minOrders: e.target.value })}
                    className="input text-sm w-20" placeholder="0" />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600 pb-2 cursor-pointer">
                  <input type="checkbox" checked={filters.withSalesOnly} onChange={(e) => set({ withSalesOnly: e.target.checked })} />
                  {t('reports.with_sales_only')}
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => onFiltersChange(defaultZoneFilters())}
              className="text-xs text-slate-600 hover:text-pharma-700 px-2 py-2"
            >
              {t('reports.reset_filters')}
            </button>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

function DeliveryZonesPanel({
  report,
  reportFrom,
  reportTo,
  dateParams,
}: {
  report: DeliveryZonesReport
  reportFrom: string
  reportTo: string
  dateParams: { date_from: string; date_to: string }
}) {
  const { t } = useTranslation()
  const suffix = `${reportFrom}_${reportTo}`

  const [mktFilters, setMktFilters] = useState(defaultZoneFilters)
  const [topFilters, setTopFilters] = useState(defaultZoneFilters)
  const [bottomFilters, setBottomFilters] = useState(defaultZoneFilters)
  const [allFilters, setAllFilters] = useState(defaultZoneFilters)

  const mktRows = useMemo(
    () => filterMarketingRows(report.marketing_suggestions, mktFilters),
    [report.marketing_suggestions, mktFilters],
  )
  const topRows = useMemo(
    () => filterZoneRows(report.top_regions, topFilters),
    [report.top_regions, topFilters],
  )
  const bottomRows = useMemo(
    () => filterZoneRows(report.bottom_regions, bottomFilters),
    [report.bottom_regions, bottomFilters],
  )
  const allRows = useMemo(
    () => filterZoneRows(report.zones, allFilters),
    [report.zones, allFilters],
  )

  return (
    <section className="space-y-4">
      <SectionHead icon={<MapPin size={18} />} title={t('reports.delivery_zones')} subtitle={`${reportFrom} → ${reportTo}`} />
      <p className="text-xs text-slate-500">{t('reports.delivery_zones_hint')}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi tone="blue" label={t('reports.delivery_orders')} value={fmtInt(report.totals.order_count)} />
        <Kpi tone="green" label={t('reports.revenue')} value={fmt(report.totals.revenue)} />
        <Kpi tone="amber" label={t('reports.regions_with_sales')} value={String(report.totals.regions_with_sales)} />
        <Kpi tone="blue" label={t('reports.regions_total')} value={String(report.totals.regions_total)} />
      </div>

      <DeliveryZonesSection
        title={t('reports.marketing_suggestions')}
        filters={mktFilters}
        onFiltersChange={setMktFilters}
        showPriorityFilter
        onExport={() => downloadApiExcel('/reports/delivery-zones/export', `delivery_marketing_${suffix}.xlsx`, zoneExportParams(dateParams, 'marketing', mktFilters))}
      >
        <MarketingSuggestionsTable rows={mktRows} />
      </DeliveryZonesSection>

      <DeliveryZonesSection
        title={t('reports.top_regions')}
        filters={topFilters}
        onFiltersChange={setTopFilters}
        showZoneFilters
        onExport={() => downloadApiExcel('/reports/delivery-zones/export', `delivery_top_regions_${suffix}.xlsx`, zoneExportParams(dateParams, 'top_regions', topFilters))}
      >
        <DataTable empty={t('reports.no_data')} cols={zoneCols(t)} rows={topRows} />
      </DeliveryZonesSection>

      <DeliveryZonesSection
        title={t('reports.least_regions')}
        filters={bottomFilters}
        onFiltersChange={setBottomFilters}
        showZoneFilters
        onExport={() => downloadApiExcel('/reports/delivery-zones/export', `delivery_least_regions_${suffix}.xlsx`, zoneExportParams(dateParams, 'bottom_regions', bottomFilters))}
      >
        <DataTable empty={t('reports.no_data')} cols={zoneCols(t)} rows={bottomRows} />
      </DeliveryZonesSection>

      <DeliveryZonesSection
        title={t('reports.all_zones')}
        filters={allFilters}
        onFiltersChange={setAllFilters}
        showZoneFilters
        onExport={() => downloadApiExcel('/reports/delivery-zones/export', `delivery_all_zones_${suffix}.xlsx`, zoneExportParams(dateParams, 'all_zones', allFilters))}
      >
        <DataTable empty={t('reports.no_data')} cols={zoneCols(t)} rows={allRows} />
      </DeliveryZonesSection>
    </section>
  )
}

function zoneCols(t: (k: string) => string) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return [
    { key: 'rank', label: '#', align: 'end' as const, sortValue: (r: ZoneRow) => r.rank },
    {
      key: 'region',
      label: t('reports.zone'),
      render: (r: ZoneRow) => lang === 'ar' ? r.region_name_ar : r.region_name_en,
      sortValue: (r: ZoneRow) => lang === 'ar' ? r.region_name_ar : r.region_name_en,
    },
    { key: 'group', label: t('reports.zone_group'), render: (r: ZoneRow) => r.group || '—' },
    { key: 'order_count', label: t('reports.delivery_orders'), align: 'end' as const, render: (r: ZoneRow) => fmtInt(r.order_count), sortValue: (r: ZoneRow) => r.order_count },
    { key: 'revenue', label: t('reports.revenue'), align: 'end' as const, render: (r: ZoneRow) => fmt(r.revenue), sortValue: (r: ZoneRow) => r.revenue },
    { key: 'delivery_count', label: t('reports.qty_delivery'), align: 'end' as const, render: (r: ZoneRow) => fmtInt(r.delivery_count), sortValue: (r: ZoneRow) => r.delivery_count },
    { key: 'digital_count', label: t('reports.qty_digital'), align: 'end' as const, render: (r: ZoneRow) => fmtInt(r.digital_count), sortValue: (r: ZoneRow) => r.digital_count },
    { key: 'avg_order_value', label: t('reports.avg_order'), align: 'end' as const, render: (r: ZoneRow) => fmt(r.avg_order_value), sortValue: (r: ZoneRow) => r.avg_order_value },
  ]
}

function MarketingSuggestionsTable({ rows }: { rows: MarketingSuggestion[] }) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const accessors = useMemo(() => ({
    priority: (r: MarketingSuggestion) => r.priority,
    region: (r: MarketingSuggestion) => lang === 'ar' ? r.region_name_ar : r.region_name_en,
    reason: (r: MarketingSuggestion) => lang === 'ar' ? r.reason_ar : r.reason_en,
  }), [lang])
  const quick = useQuickFilter(rows, [
    (r) => r.region_name_en,
    (r) => r.region_name_ar,
    (r) => r.reason_en,
    (r) => r.reason_ar,
  ])
  const { sorted, sort, toggle } = useSort(quick.filtered, accessors)
  const PRI_CLS: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-slate-100 text-slate-600',
  }
  if (!rows.length) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-400">{t('reports.no_marketing_suggestions')}</div>
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
              <SortTh k="priority" sort={sort} onToggle={toggle}>{t('reports.priority')}</SortTh>
              <SortTh k="region" sort={sort} onToggle={toggle}>{t('reports.zone')}</SortTh>
              <SortTh k="reason" sort={sort} onToggle={toggle}>{t('reports.suggestion')}</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${PRI_CLS[r.priority] || PRI_CLS.low}`}>
                    {t(`reports.priority_${r.priority}`, r.priority)}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium">{lang === 'ar' ? r.region_name_ar : r.region_name_en}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{lang === 'ar' ? r.reason_ar : r.reason_en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
