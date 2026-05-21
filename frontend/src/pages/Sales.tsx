import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Eye, RotateCcw, X, Loader2, TrendingUp, Filter, Search } from 'lucide-react'
import Layout from '../components/Layout'
import { salesAPI, employeesAPI } from '../lib/api'
import type { Invoice, SaleResponse, Employee } from '../lib/api'
import i18n from '../lib/i18n'

export default function Sales() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [invoices, setInvoices] = useState<Invoice[]>([])
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
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const refundMode = searchParams.get('refund') === '1'
  const refundFocusRef = useRef<HTMLInputElement>(null)

  const loadInvoices = () => {
    setLoading(true)
    salesAPI
      .list({
        limit: 200,
        offset: 0,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        type: typeFilter || undefined,
        seller_id: sellerFilter ? parseInt(sellerFilter) : undefined,
      })
      .then((r) => {
        setInvoices(r.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadInvoices()
    employeesAPI.list().then((r) => setEmployees(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (refundMode) {
      setTimeout(() => refundFocusRef.current?.focus(), 50)
    }
  }, [refundMode])

  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setTypeFilter(''); setSellerFilter('')
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
      .map(([id, qty]) => ({ invoice_item_id: parseInt(id), quantity: qty }))
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
  }

  const paymentLabel: Record<string, string> = {
    cash: t('sales.cash'),
    visa: t('sales.visa'),
    hybrid: t('sales.hybrid'),
    digital: t('sales.digital'),
  }

  const typeLabel: Record<string, string> = {
    cash: t('sales.cash_sale'),
    delivery: t('sales.delivery'),
    digital: t('sales.digital'),
  }

  const completed = invoices.filter((i) => i.status === 'completed')
  const totalRevenue = completed.reduce((sum, i) => sum + i.net_total, 0)
  const totalDiscount = completed.reduce((sum, i) => sum + (i.discount || 0), 0)
  const totalGross = completed.reduce((sum, i) => sum + (i.subtotal || 0), 0)

  const visibleInvoices = invoiceSearch.trim()
    ? invoices.filter((i) => (i.invoice_number || '').toLowerCase().includes(invoiceSearch.trim().toLowerCase()))
    : invoices

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
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
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.date_to')}</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t('sales.type')}</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">{t('common.all')}</option>
                <option value="cash">{t('sales.cash_sale')}</option>
                <option value="delivery">{t('sales.delivery')}</option>
                <option value="digital">{t('sales.digital')}</option>
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
            <button onClick={loadInvoices}
              className="bg-pharma-600 hover:bg-pharma-700 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">
              {t('sales.apply')}
            </button>
            <button onClick={resetFilters}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium">
              {t('sales.reset')}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 size={24} className="animate-spin me-2" />
              {t('common.loading')}
            </div>
          ) : visibleInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
              <TrendingUp size={48} className="opacity-20" />
              <p>{invoiceSearch ? t('sales.no_search_match') : t('sales.no_sales')}</p>
              {invoiceSearch && (
                <button onClick={() => setInvoiceSearch('')} className="text-xs text-pharma-700 hover:underline">
                  {t('sales.clear_search')}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {[
                        t('sales.invoice_no'),
                        t('sales.date'),
                        t('sales.type'),
                        t('sales.payment'),
                        t('sales.seller'),
                        t('sales.customer'),
                        t('sales.total'),
                        t('sales.status'),
                        '',
                      ].map((h, i) => (
                        <th
                          key={i}
                          className={`px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider ${
                            i === 6 ? 'text-end' : i === 7 ? 'text-center' : 'text-start'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-gray-50/80 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">
                          {inv.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(inv.created_at).toLocaleString(
                            lang === 'ar' ? 'ar-EG' : 'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs font-medium">
                          {typeLabel[inv.type] || inv.type}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              paymentColor[inv.payment_method] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {paymentLabel[inv.payment_method] || inv.payment_method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">
                          {lang === 'ar'
                            ? inv.seller_name_ar || '—'
                            : inv.seller_name_en || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {inv.customer_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-end font-bold text-pharma-700 tabular-nums">
                          {t('sales.egp')} {inv.net_total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
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
                        <td className="px-4 py-3">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── View Detail Modal ── */}
      {showDetail && selectedSale && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowDetail(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">{selectedSale.invoice.invoice_number}</h3>
                <p className="text-xs text-gray-500">
                  {new Date(selectedSale.invoice.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <table className="w-full text-sm mb-4">
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
              <div className="bg-pharma-50 rounded-xl p-3 flex justify-between font-bold text-pharma-800">
                <span>{t('receipt.net_total')}</span>
                <span className="tabular-nums">
                  {t('receipt.egp')} {selectedSale.invoice.net_total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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
                      {selectedSale.items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50">
                          <td className="py-2.5 text-gray-800 font-medium text-xs">
                            {lang === 'ar' ? item.product_name_ar : item.product_name_en}
                          </td>
                          <td className="py-2.5 text-center text-gray-500">{item.quantity}</td>
                          <td className="py-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={returnItems[item.id] || 0}
                              onChange={(e) =>
                                setReturnItems((prev) => ({
                                  ...prev,
                                  [item.id]: Math.min(
                                    item.quantity,
                                    Math.max(0, parseInt(e.target.value) || 0)
                                  ),
                                }))
                              }
                              className="w-16 text-center border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pharma-400"
                            />
                          </td>
                        </tr>
                      ))}
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
