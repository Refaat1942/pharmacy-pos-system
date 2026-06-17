import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Eye, RotateCcw, X, Loader2, TrendingUp, Filter, Search, Download } from 'lucide-react'
import Layout from '../components/Layout'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import { salesAPI, employeesAPI, clinicsAPI, returnsAPI } from '../lib/api'
import type { Invoice, SaleResponse, Employee, Clinic, ReturnRow } from '../lib/api'
import i18n from '../lib/i18n'
import type { TFunction } from 'i18next'
import { platformBadgeClass, platformDisplayLabel } from '../lib/digitalPlatforms'
import { useDigitalPlatforms } from '../lib/useDigitalPlatforms'
import { formatDateTime } from '../lib/formatDate'
import DateInput from '../components/DateInput'

type SalesRow = Invoice & { isReturn?: boolean }

function branchLabel(inv: Invoice, lang: string) {
  return (lang === 'ar' ? inv.branch_name_ar : inv.branch_name_en) || ''
}

function customerDisplay(inv: Invoice) {
  return inv.delivery_customer_name || inv.customer_name || ''
}

function phoneDisplay(inv: Invoice) {
  return inv.delivery_customer_phone || ''
}

function paymentBreakdown(inv: Invoice, t: TFunction, labels: Record<string, string>): string {
  if (!inv.payment_method) return '—'
  const parts: string[] = [labels[inv.payment_method] || inv.payment_method]
  if ((inv.cash_amount || 0) > 0) {
    parts.push(`${t('sales.cash_paid')}: ${inv.cash_amount.toFixed(2)}`)
  }
  if ((inv.visa_amount || 0) > 0) {
    parts.push(`${t('sales.card_paid')}: ${inv.visa_amount.toFixed(2)}`)
  }
  if ((inv.change_amount || 0) > 0) {
    parts.push(`${t('sales.change')}: ${inv.change_amount.toFixed(2)}`)
  }
  if (inv.digital_type) {
    parts.push(`${t('sales.digital_platform')}: ${labels[inv.digital_type] || inv.digital_type}`)
  }
  return parts.join(' · ')
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null
  return (
    <div className="flex justify-between gap-4 text-sm py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-end font-medium">{value}</span>
    </div>
  )
}

export default function Sales() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [invoices, setInvoices] = useState<SalesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSale, setSelectedSale] = useState<SaleResponse | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [returnItems, setReturnItems] = useState<Record<number, number>>({})
  const [returnReason, setReturnReason] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnSuccess, setReturnSuccess] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [clinicFilter, setClinicFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [digitalPlatformFilter, setDigitalPlatformFilter] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SalesRow[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const refundMode = searchParams.get('refund') === '1'
  const refundFocusRef = useRef<HTMLInputElement>(null)

  // Server-side search: by receipt/invoice number OR by item barcode/name, so a
  // scanned receipt barcode recalls the invoice and (no receipt) any item finds
  // all transactions containing it — not limited to the loaded page.
  useEffect(() => {
    const q = invoiceSearch.trim()
    if (!q) { setSearchResults(null); return }
    const id = setTimeout(() => {
      salesAPI.search(q, 100)
        .then((r) => setSearchResults(r.data as unknown as SalesRow[]))
        .catch(() => setSearchResults(null))
    }, 300)
    return () => clearTimeout(id)
  }, [invoiceSearch])

  const returnToRow = (r: ReturnRow): SalesRow => ({
    id: r.id,
    invoice_number: r.return_invoice_number,
    type: r.sale_type || 'return',
    payment_method: 'return',
    net_total: -Math.abs(r.total_returned),
    seller_id: r.seller_id || 0,
    seller_name_en: r.seller_name_en || '',
    seller_name_ar: r.seller_name_ar || '',
    customer_name: '',
    clinic_name: null,
    status: 'returned',
    created_at: r.created_at,
    isReturn: true,
  } as SalesRow)

  const loadInvoices = () => {
    setLoading(true)
    const includeReturns = !clinicFilter && (!typeFilter || typeFilter === 'return')
    const invReq =
      typeFilter === 'return'
        ? Promise.resolve({ data: [] as Invoice[] })
        : salesAPI.list({
            limit: 500,
            offset: 0,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            type: typeFilter || undefined,
            seller_id: sellerFilter ? parseInt(sellerFilter) : undefined,
            clinic_id: clinicFilter ? parseInt(clinicFilter) : undefined,
            payment_method: paymentFilter || undefined,
            digital_type: digitalPlatformFilter || undefined,
          })
    const retReq = includeReturns
      ? returnsAPI.list({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit: 200,
        })
      : Promise.resolve({ data: [] as ReturnRow[] })
    Promise.all([invReq, retReq])
      .then(([invRes, retRes]) => {
        const rets = retRes.data
          .filter((r) => !sellerFilter || r.seller_id === parseInt(sellerFilter))
          .map(returnToRow)
        const merged: SalesRow[] = [...invRes.data, ...rets].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setInvoices(merged)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadInvoices()
    employeesAPI.list().then((r) => setEmployees(r.data)).catch(() => {})
    clinicsAPI.list()
      .then((r) => setClinics(r.data))
      .catch(() => {
        salesAPI.byClinic()
          .then((r) => setClinics(r.data.map((c) => ({ id: c.clinic_id, name: c.clinic_name } as Clinic))))
          .catch(() => {})
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (refundMode) {
      setTimeout(() => refundFocusRef.current?.focus(), 50)
    }
  }, [refundMode])

  const resetFilters = () => {
    setDateFrom('')
    setDateTo('')
    setTypeFilter('')
    setSellerFilter('')
    setClinicFilter('')
    setPaymentFilter('')
    setDigitalPlatformFilter('')
    setTimeout(loadInvoices, 0)
  }

  const handleView = async (id: number) => {
    const { data } = await salesAPI.get(id)
    setSelectedSale(data)
    setShowDetail(true)
  }

  const handleReturnOpen = async (id: number) => {
    const { data } = await salesAPI.get(id)
    setSelectedSale(data)
    const defaults: Record<number, number> = {}
    data.items.forEach((item) => {
      defaults[item.id] = 0
    })
    setReturnItems(defaults)
    setReturnReason('')
    setReturnSuccess(false)
    setShowReturn(true)
  }

  const handleReturnSubmit = async () => {
    if (!selectedSale) return
    const toReturn = Object.entries(returnItems)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ invoice_item_id: parseInt(id), sub_quantity: qty }))
    if (toReturn.length === 0) return

    setReturnLoading(true)
    try {
      await salesAPI.processReturn(
        selectedSale.invoice.id,
        toReturn,
        returnReason || undefined
      )
      setReturnSuccess(true)
      setTimeout(() => {
        setShowReturn(false)
        setSelectedSale(null)
        loadInvoices()
      }, 1500)
    } catch (e) {
      console.error(e)
    } finally {
      setReturnLoading(false)
    }
  }

  const paymentColor: Record<string, string> = {
    cash: 'bg-emerald-100 text-emerald-700',
    visa: 'bg-blue-100 text-blue-700',
    hybrid: 'bg-purple-100 text-purple-700',
    digital: 'bg-orange-100 text-orange-700',
    account: 'bg-amber-100 text-amber-700',
    return: 'bg-red-100 text-red-600',
  }

  const paymentLabel: Record<string, string> = {
    cash: t('sales.cash'),
    visa: t('sales.visa'),
    hybrid: t('sales.hybrid'),
    digital: t('sales.digital'),
    instapay: t('payment.instapay'),
    vodafone_cash: t('payment.vodafone_cash'),
    account: t('payment.account'),
  }

  const { platforms, byKey } = useDigitalPlatforms()
  const langCode = i18n.language === 'ar' ? 'ar' : 'en'

  const platformLabel: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {
      talabat: t('sales.talabat'),
      vezeeta: t('sales.vezeeta'),
      other_digital: t('sales.other_digital'),
    }
    platforms.forEach((p) => {
      map[p.platform_key] = platformDisplayLabel(p, p.platform_key, langCode)
    })
    return map
  }, [platforms, t, langCode])

  const paymentLabelsWithPlatform = useMemo(
    () => ({ ...paymentLabel, ...platformLabel }),
    [paymentLabel, platformLabel],
  )

  const typeLabel: Record<string, string> = {
    cash: t('sales.cash_sale'),
    delivery: t('sales.delivery'),
    digital: t('sales.digital'),
    return: t('sales.return_type'),
  }

  const exportCSV = () => {
    const columns: { label: string; value: (r: SalesRow) => string | number }[] = [
      { label: t('sales.invoice_no'), value: (r) => r.invoice_number },
      { label: t('sales.date'), value: (r) => formatDateTime(r.created_at) },
      { label: t('sales.sale_type'), value: (r) => typeLabel[r.type] || r.type },
      {
        label: t('sales.payment_method'),
        value: (r) =>
          r.isReturn ? t('sales.return_type') : paymentLabel[r.payment_method] || r.payment_method,
      },
      {
        label: t('sales.payment_detail'),
        value: (r) => (r.isReturn ? '' : paymentBreakdown(r, t, paymentLabel)),
      },
      {
        label: t('sales.digital_platform'),
        value: (r) => (r.digital_type ? platformLabel[r.digital_type] || r.digital_type : ''),
      },
      { label: t('sales.seller'), value: (r) => (lang === 'ar' ? r.seller_name_ar : r.seller_name_en) || '' },
      { label: t('sales.customer'), value: (r) => customerDisplay(r) },
      { label: t('sales.customer_phone'), value: (r) => phoneDisplay(r) },
      { label: t('sales.branch'), value: (r) => branchLabel(r, lang) },
      { label: t('sales.clinic'), value: (r) => r.clinic_name || '' },
      { label: t('sales.subtotal'), value: (r) => (r.subtotal ?? 0).toFixed(2) },
      { label: t('sales.discount'), value: (r) => (r.discount ?? 0).toFixed(2) },
      { label: t('sales.delivery_fee'), value: (r) => (r.delivery_fee ?? 0).toFixed(2) },
      { label: t('sales.total'), value: (r) => r.net_total.toFixed(2) },
      { label: t('sales.cash_paid'), value: (r) => (r.cash_amount ?? 0).toFixed(2) },
      { label: t('sales.card_paid'), value: (r) => (r.visa_amount ?? 0).toFixed(2) },
      { label: t('sales.change'), value: (r) => (r.change_amount ?? 0).toFixed(2) },
      { label: t('sales.driver'), value: (r) => r.delivery_person_name || '' },
      { label: t('sales.delivery_address'), value: (r) => r.delivery_address || '' },
      {
        label: t('sales.delivery_status'),
        value: (r) => (r.delivery_status ? t(`deliveries.${r.delivery_status}`) : ''),
      },
      { label: t('sales.notes'), value: (r) => r.notes || '' },
      { label: t('sales.status'), value: (r) => (r.status === 'completed' ? t('sales.completed') : t('sales.returned')) },
    ]
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const head = columns.map((c) => esc(c.label)).join(',')
    const body = visibleInvoices.map((r) => columns.map((c) => esc(c.value(r))).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const completed = invoices.filter((i) => i.status === 'completed')
  const totalRevenue = completed.reduce((sum, i) => sum + i.net_total, 0)
  const totalDiscount = completed.reduce((sum, i) => sum + (i.discount || 0), 0)
  const totalGross = completed.reduce((sum, i) => sum + (i.subtotal || 0), 0)

  const visibleInvoices = invoiceSearch.trim()
    ? (searchResults ?? invoices.filter((i) => (i.invoice_number || '').toLowerCase().includes(invoiceSearch.trim().toLowerCase())))
    : invoices

  const quick = useQuickFilter(visibleInvoices, [
    (r) => r.invoice_number,
    (r) => typeLabel[r.type] || r.type,
    (r) => (r.isReturn ? t('sales.return_type') : paymentLabel[r.payment_method] || r.payment_method),
    (r) => (r.isReturn ? '' : paymentBreakdown(r, t, paymentLabel)),
    (r) => (lang === 'ar' ? r.seller_name_ar : r.seller_name_en),
    (r) => customerDisplay(r),
    (r) => phoneDisplay(r),
    (r) => branchLabel(r, lang),
    (r) => r.clinic_name,
    (r) => r.delivery_person_name,
    (r) => r.digital_type,
    (r) => r.notes,
  ])
  const sortAccessors = useMemo(() => ({
    invoice_number: (r: SalesRow) => r.invoice_number,
    created_at: (r: SalesRow) => r.created_at,
    type: (r: SalesRow) => typeLabel[r.type] || r.type,
    digital_type: (r: SalesRow) => (r.digital_type ? platformLabel[r.digital_type] || r.digital_type : ''),
    payment: (r: SalesRow) => (r.isReturn ? t('sales.return_type') : paymentLabel[r.payment_method] || r.payment_method),
    seller: (r: SalesRow) => (lang === 'ar' ? r.seller_name_ar : r.seller_name_en) || '',
    customer: (r: SalesRow) => customerDisplay(r),
    branch: (r: SalesRow) => branchLabel(r, lang),
    clinic: (r: SalesRow) => r.clinic_name || '',
    subtotal: (r: SalesRow) => Number(r.subtotal || 0),
    discount: (r: SalesRow) => Number(r.discount || 0),
    net_total: (r: SalesRow) => Number(r.net_total || 0),
    status: (r: SalesRow) => r.status,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lang, t, typeLabel, paymentLabel])
  const { sorted, sort, toggle } = useSort(quick.filtered, sortAccessors)

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[100rem] mx-auto p-6 min-w-0">
          {/* Page header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('sales.title')}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {invoices.length} {t('payment.items')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-gray-500 font-medium uppercase">{t('sales.kpi_gross')}</p>
                <p className="text-sm font-bold text-gray-700 tabular-nums">{t('sales.egp')} {totalGross.toFixed(2)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-gray-500 font-medium uppercase">{t('sales.kpi_discount')}</p>
                <p className="text-sm font-bold text-amber-600 tabular-nums">{t('sales.egp')} {totalDiscount.toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2 bg-pharma-50 border border-pharma-200 rounded-xl px-4 py-2.5">
                <TrendingUp size={16} className="text-pharma-600" />
                <div>
                  <p className="text-xs text-pharma-600 font-medium">{t('sales.kpi_net')}</p>
                  <p className="text-sm font-bold text-pharma-800 tabular-nums">
                    {t('sales.egp')} {totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Refund mode banner */}
          {refundMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
              <RotateCcw size={18} className="text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">{t('sales.refund_banner_title')}</p>
                <p className="text-xs text-amber-700/80 mt-0.5">{t('sales.refund_banner_hint')}</p>
              </div>
              <button
                onClick={() => setSearchParams({})}
                className="text-amber-700 hover:text-amber-900 p-1 rounded-lg hover:bg-amber-100"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Receipt # quick search */}
          <div className="bg-white border border-gray-100 rounded-2xl p-3 mb-3 flex items-center gap-3">
            <Search size={16} className="text-slate-400 ms-1" />
            <input
              ref={refundFocusRef}
              type="text"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              placeholder={t('sales.search_invoice_placeholder')}
              className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400"
            />
            {invoiceSearch && (
              <button onClick={() => setInvoiceSearch('')} className="text-slate-400 hover:text-slate-700 p-1">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 flex flex-wrap items-end gap-3">
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
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.type')}</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">{t('common.all')}</option>
                <option value="cash">{t('sales.cash_sale')}</option>
                <option value="delivery">{t('sales.delivery')}</option>
                <option value="digital">{t('sales.digital')}</option>
                <option value="return">{t('sales.return_type')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.seller')}</label>
              <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">{t('common.all')}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{lang === 'ar' ? e.name_ar : e.name_en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.clinic')}</label>
              <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">{t('common.all')}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.filter_payment')}</label>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">{t('common.all')}</option>
                <option value="cash">{t('sales.cash')}</option>
                <option value="visa">{t('sales.visa')}</option>
                <option value="hybrid">{t('sales.hybrid')}</option>
                <option value="digital">{t('sales.digital')}</option>
                <option value="account">{t('payment.account')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.filter_platform')}</label>
              <select
                value={digitalPlatformFilter}
                onChange={(e) => setDigitalPlatformFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm min-w-[8rem]"
              >
                <option value="">{t('common.all')}</option>
                {platforms.map((p) => (
                  <option key={p.platform_key} value={p.platform_key}>
                    {platformDisplayLabel(p, p.platform_key, langCode)}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={loadInvoices}
              className="bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">
              {t('sales.apply')}
            </button>
            <button onClick={resetFilters}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium">
              {t('sales.reset')}
            </button>
            <button onClick={exportCSV} disabled={visibleInvoices.length === 0}
              className="ms-auto inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:text-pharma-700 hover:border-pharma-300 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40">
              <Download size={14} /> {t('sales.export')}
            </button>
          </div>

          <div className="mb-3 max-w-xs">
            <TableFilter value={quick.query} onChange={quick.setQuery} placeholder={t('common.filter_placeholder')} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 size={24} className="animate-spin me-2" />
              {t('common.loading')}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
              <TrendingUp size={48} className="opacity-20" />
              <p>{invoiceSearch || quick.query ? t('sales.no_search_match') : t('sales.no_sales')}</p>
              {invoiceSearch && (
                <button onClick={() => setInvoiceSearch('')} className="text-xs text-pharma-700 hover:underline">
                  {t('sales.clear_search')}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[88rem]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      <SortTh k="invoice_number" sort={sort} onToggle={toggle} align="start">{t('sales.invoice_no')}</SortTh>
                      <SortTh k="created_at" sort={sort} onToggle={toggle} align="start">{t('sales.date')}</SortTh>
                      <SortTh k="type" sort={sort} onToggle={toggle} align="start">{t('sales.sale_type')}</SortTh>
                      <SortTh k="digital_type" sort={sort} onToggle={toggle} align="start">{t('sales.digital_platform')}</SortTh>
                      <SortTh k="payment" sort={sort} onToggle={toggle} align="start">{t('sales.payment_method')}</SortTh>
                      <th className="px-3 py-3 text-start whitespace-nowrap">{t('sales.payment_detail')}</th>
                      <SortTh k="seller" sort={sort} onToggle={toggle} align="start">{t('sales.seller')}</SortTh>
                      <SortTh k="customer" sort={sort} onToggle={toggle} align="start">{t('sales.customer')}</SortTh>
                      <th className="px-3 py-3 text-start whitespace-nowrap">{t('sales.customer_phone')}</th>
                      <SortTh k="branch" sort={sort} onToggle={toggle} align="start">{t('sales.branch')}</SortTh>
                      <SortTh k="clinic" sort={sort} onToggle={toggle} align="start">{t('sales.clinic')}</SortTh>
                      <SortTh k="subtotal" sort={sort} onToggle={toggle} align="end">{t('sales.subtotal')}</SortTh>
                      <SortTh k="discount" sort={sort} onToggle={toggle} align="end">{t('sales.discount')}</SortTh>
                      <th className="px-3 py-3 text-end whitespace-nowrap">{t('sales.delivery_fee')}</th>
                      <SortTh k="net_total" sort={sort} onToggle={toggle} align="end">{t('sales.total')}</SortTh>
                      <th className="px-3 py-3 text-start whitespace-nowrap">{t('sales.driver')}</th>
                      <th className="px-3 py-3 text-center whitespace-nowrap">{t('sales.delivery_status')}</th>
                      <SortTh k="status" sort={sort} onToggle={toggle} align="center">{t('sales.status')}</SortTh>
                      <th className="px-4 py-3 text-center sticky end-0 bg-gray-50" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.map((inv) => {
                      const st = inv.delivery_status || ''
                      return (
                      <tr
                        key={`${inv.isReturn ? 'ret' : 'inv'}-${inv.id}`}
                        className="hover:bg-gray-50/80 transition-colors"
                      >
                        <td className="px-3 py-3 font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            {inv.invoice_number}
                            {!inv.isReturn && (inv.offer_savings || 0) > 0 && (
                              <span className="inline-flex w-fit text-[9px] font-bold uppercase tracking-wide bg-pharma-100 text-pharma-800 px-1.5 py-0.5 rounded-full">
                                {t('sales.promo_badge')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {formatDateTime(inv.created_at)}
                        </td>
                        <td className={`px-3 py-3 text-xs font-medium whitespace-nowrap ${inv.isReturn ? 'text-red-600' : 'text-gray-700'}`}>
                          {typeLabel[inv.type] || inv.type}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {inv.digital_type ? (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${platformBadgeClass(inv.digital_type, byKey(inv.digital_type)?.badge_color)}`}
                            >
                              {platformLabel[inv.digital_type] || inv.digital_type}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              inv.isReturn
                                ? 'bg-red-100 text-red-600'
                                : paymentColor[inv.payment_method] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {inv.isReturn ? t('sales.return_type') : paymentLabel[inv.payment_method] || inv.payment_method}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-gray-600 max-w-[14rem]">
                          {inv.isReturn ? '—' : (
                            <span className="line-clamp-2" title={paymentBreakdown(inv, t, paymentLabelsWithPlatform)}>
                              {paymentBreakdown(inv, t, paymentLabelsWithPlatform)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-xs whitespace-nowrap">
                          {lang === 'ar' ? inv.seller_name_ar || '—' : inv.seller_name_en || '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs max-w-[10rem] truncate" title={customerDisplay(inv)}>
                          {customerDisplay(inv) || '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap font-mono">
                          {phoneDisplay(inv) || '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {branchLabel(inv, lang) || '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {inv.clinic_name || '—'}
                        </td>
                        <td className="px-3 py-3 text-end text-xs text-gray-600 tabular-nums whitespace-nowrap">
                          {!inv.isReturn && inv.subtotal != null ? `${t('sales.egp')} ${inv.subtotal.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-end text-xs text-amber-600 tabular-nums whitespace-nowrap">
                          {!inv.isReturn && (inv.discount || 0) > 0 ? `-${inv.discount.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-end text-xs text-teal-700 tabular-nums whitespace-nowrap">
                          {(inv.delivery_fee || 0) > 0 ? inv.delivery_fee!.toFixed(2) : '—'}
                        </td>
                        <td className={`px-3 py-3 text-end font-bold tabular-nums whitespace-nowrap ${inv.net_total < 0 ? 'text-red-600' : 'text-pharma-700'}`}>
                          {t('sales.egp')} {inv.net_total.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {inv.delivery_person_name || '—'}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {st ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {t(`deliveries.${st}`)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              inv.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {inv.status === 'completed'
                              ? t('sales.completed')
                              : t('sales.returned')}
                          </span>
                        </td>
                        <td className="px-3 py-3 sticky end-0 bg-white">
                          {!inv.isReturn && (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => handleView(inv.id)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title={t('sales.view')}
                              >
                                <Eye size={14} />
                              </button>
                              {inv.status === 'completed' && (
                                <button
                                  onClick={() => handleReturnOpen(inv.id)}
                                  className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                  title={t('sales.return')}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── View Detail Modal ── */}
      {showDetail && selectedSale && (() => {
        const inv = selectedSale.invoice
        const payMethod = paymentLabel[inv.payment_method] || inv.payment_method
        const deliverySt = inv.delivery_status || ''
        return (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowDetail(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-gray-900">{t('sales.detail_title')}</h3>
                <p className="font-mono text-sm text-pharma-700">{inv.invoice_number}</p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(inv.created_at)}
                </p>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">{t('sales.sale_type')}</p>
                  <DetailRow label={t('sales.sale_type')} value={typeLabel[inv.type] || inv.type} />
                  <DetailRow label={t('sales.payment_method')} value={payMethod} />
                  <DetailRow
                    label={t('sales.payment_detail')}
                    value={paymentBreakdown(inv, t, paymentLabel)}
                  />
                  <DetailRow
                    label={t('sales.digital_platform')}
                    value={
                      inv.digital_type ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${platformBadgeClass(inv.digital_type)}`}
                        >
                          {platformLabel[inv.digital_type] || inv.digital_type}
                        </span>
                      ) : null
                    }
                  />
                  <DetailRow label={t('sales.status')} value={inv.status === 'completed' ? t('sales.completed') : t('sales.returned')} />
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">{t('sales.seller')}</p>
                  <DetailRow
                    label={t('sales.seller')}
                    value={lang === 'ar' ? inv.seller_name_ar : inv.seller_name_en}
                  />
                  <DetailRow label={t('sales.branch')} value={branchLabel(inv, lang)} />
                  <DetailRow label={t('sales.customer')} value={customerDisplay(inv)} />
                  <DetailRow label={t('sales.customer_phone')} value={phoneDisplay(inv)} />
                  <DetailRow label={t('sales.clinic')} value={inv.clinic_name} />
                  {(inv.offer_savings || 0) > 0 && (
                    <DetailRow
                      label={t('sales.promo_offer')}
                      value={`${inv.offer_names || t('sales.promo_offer')} (−${Number(inv.offer_savings).toFixed(2)})`}
                    />
                  )}
                </div>
              </div>
              {(inv.type === 'delivery' || inv.delivery_address || inv.delivery_person_name) && (
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-teal-700 uppercase mb-2">{t('sales.delivery')}</p>
                  <DetailRow label={t('sales.driver')} value={inv.delivery_person_name} />
                  <DetailRow label={t('sales.delivery_address')} value={inv.delivery_address} />
                  <DetailRow
                    label={t('sales.delivery_fee')}
                    value={(inv.delivery_fee || 0) > 0 ? `${t('sales.egp')} ${inv.delivery_fee!.toFixed(2)}` : null}
                  />
                  <DetailRow
                    label={t('sales.delivery_status')}
                    value={deliverySt ? t(`deliveries.${deliverySt}`) : null}
                  />
                </div>
              )}
              {inv.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-900">
                  <span className="font-semibold">{t('sales.notes')}: </span>
                  {inv.notes}
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                  {t('sales.items_count')} ({selectedSale.items.length})
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-start text-xs text-gray-500 font-semibold">
                        {t('receipt.item')}
                      </th>
                      <th className="pb-2 text-center text-xs text-gray-500 font-semibold w-10">
                        {t('receipt.qty')}
                      </th>
                      <th className="pb-2 text-end text-xs text-gray-500 font-semibold">
                        {t('receipt.total')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2.5 text-gray-800 font-medium">
                          {lang === 'ar' ? item.product_name_ar : item.product_name_en}
                          <p className="text-[11px] text-gray-400 tabular-nums">
                            {t('receipt.egp')} {item.unit_price.toFixed(2)} × {item.quantity}
                            {item.discount > 0 && ` (−${item.discount.toFixed(2)})`}
                          </p>
                        </td>
                        <td className="py-2.5 text-center text-gray-600">{item.quantity}</td>
                        <td className="py-2.5 text-end font-bold text-gray-900 tabular-nums">
                          {item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{t('sales.subtotal')}</span>
                  <span className="tabular-nums">{t('sales.egp')} {inv.subtotal.toFixed(2)}</span>
                </div>
                {inv.discount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>{t('sales.discount')}</span>
                    <span className="tabular-nums">− {inv.discount.toFixed(2)}</span>
                  </div>
                )}
                {(inv.delivery_fee || 0) > 0 && (
                  <div className="flex justify-between text-teal-700">
                    <span>{t('sales.delivery_fee')}</span>
                    <span className="tabular-nums">{inv.delivery_fee!.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-pharma-800 pt-2 border-t border-gray-200">
                  <span>{t('receipt.net_total')}</span>
                  <span className="tabular-nums">
                    {t('receipt.egp')} {inv.net_total.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between font-semibold text-blue-800">
                  <span>{t('sales.payment_method')}</span>
                  <span>{payMethod}</span>
                </div>
                {(inv.cash_amount || 0) > 0 && (
                  <div className="flex justify-between text-blue-700">
                    <span>{t('sales.cash_paid')}</span>
                    <span className="tabular-nums">{t('sales.egp')} {inv.cash_amount.toFixed(2)}</span>
                  </div>
                )}
                {(inv.visa_amount || 0) > 0 && (
                  <div className="flex justify-between text-blue-700">
                    <span>{t('sales.card_paid')}</span>
                    <span className="tabular-nums">{t('sales.egp')} {inv.visa_amount.toFixed(2)}</span>
                  </div>
                )}
                {(inv.change_amount || 0) > 0 && (
                  <div className="flex justify-between text-blue-700 font-medium">
                    <span>{t('sales.change')}</span>
                    <span className="tabular-nums">{t('sales.egp')} {inv.change_amount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── Return Modal ── */}
      {showReturn && selectedSale && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowReturn(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900">{t('sales.return_modal_title')}</h3>
              <button
                onClick={() => setShowReturn(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {returnSuccess ? (
                <div className="text-center py-8 text-pharma-600">
                  <div className="text-4xl mb-2">✓</div>
                  <p className="font-bold">Return processed successfully!</p>
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-2 text-start text-xs text-gray-500">{t('receipt.item')}</th>
                        <th className="pb-2 text-center text-xs text-gray-500 w-16">
                          {t('sales.original_qty')}
                        </th>
                        <th className="pb-2 text-center text-xs text-gray-500 w-24">
                          {t('sales.return_qty')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items.map((item) => {
                        const linePack = item.pack_size && item.pack_size > 1 ? item.pack_size : 1
                        const totalSub = item.quantity * linePack
                        const maxSub = totalSub - (item.returned_sub || 0)
                        const subLabel = linePack > 1 ? (item.prod_sub_unit || '') : (item.unit_label || '')
                        return (
                        <tr key={item.id} className="border-b border-gray-50">
                          <td className="py-2.5 text-gray-800 font-medium text-xs">
                            {lang === 'ar' ? item.product_name_ar : item.product_name_en}
                          </td>
                          <td className="py-2.5 text-center text-gray-500">
                            {item.quantity}{item.unit_label ? ` ${item.unit_label}` : ''}
                            {linePack > 1 && (
                              <span className="block text-[10px] text-gray-400">
                                = {totalSub} {item.prod_sub_unit}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={maxSub}
                                value={returnItems[item.id] || 0}
                                onChange={(e) =>
                                  setReturnItems((prev) => ({
                                    ...prev,
                                    [item.id]: Math.min(
                                      maxSub,
                                      Math.max(0, parseInt(e.target.value) || 0)
                                    ),
                                  }))
                                }
                                className="w-16 text-center border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pharma-400"
                              />
                              {subLabel && (
                                <span className="text-[10px] text-gray-400">{subLabel}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      {t('sales.return_reason')}
                    </label>
                    <input
                      type="text"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pharma-400"
                      placeholder="Optional..."
                    />
                  </div>
                  {(() => {
                    const refundTotal = (selectedSale?.items || []).reduce((s, item) => {
                      const linePack = item.pack_size && item.pack_size > 1 ? item.pack_size : 1
                      const pricePerSub = (item.unit_price || 0) / linePack
                      return s + (returnItems[item.id] || 0) * pricePerSub
                    }, 0)
                    return (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <span className="text-sm font-semibold text-amber-800">{t('sales.refund_amount')}</span>
                        <span className="text-lg font-extrabold text-amber-700 tabular-nums">{t('sales.egp')} {refundTotal.toFixed(2)}</span>
                      </div>
                    )
                  })()}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowReturn(false)}
                      className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleReturnSubmit}
                      disabled={returnLoading || Object.values(returnItems).every((v) => v === 0)}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      {returnLoading && <Loader2 size={14} className="animate-spin" />}
                      {t('sales.return_confirm')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
