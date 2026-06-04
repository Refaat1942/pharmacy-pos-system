import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Truck, PackageCheck, RotateCcw, Wallet } from 'lucide-react'
import Layout from '../components/Layout'
import { useSort, SortTh } from '../components/DataTable'
import { employeesAPI, salesAPI } from '../lib/api'
import type { Invoice } from '../lib/api'
import i18n from '../lib/i18n'
import { formatDateTime } from '../lib/formatDate'

const STATUSES = ['pending', 'out_for_delivery', 'delivered'] as const

function statusClasses(s: string | null | undefined) {
  switch (s) {
    case 'delivered':
      return 'bg-emerald-100 text-emerald-700'
    case 'out_for_delivery':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function cashCollectedOnDelivery(inv: Invoice): number {
  if (inv.payment_method !== 'cash') return 0
  const cash = Number(inv.cash_amount) || 0
  if (cash > 0) return cash
  return Number(inv.net_total) || 0
}

export default function Deliveries() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [rows, setRows] = useState<Invoice[]>([])
  const [drivers, setDrivers] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [driverFilter, setDriverFilter] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const fmt = (n: number | null | undefined) =>
    `${(Number(n) || 0).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDT = (s: string) => formatDateTime(s)

  const driverIdParam = driverFilter === '' ? undefined : Number(driverFilter)

  const load = () => {
    setLoading(true)
    salesAPI
      .list({
        delivery_queue: true,
        delivery_status: statusFilter || undefined,
        delivery_person_id: driverIdParam,
        limit: 500,
      })
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    employeesAPI.deliveryRoster().then((r) => setDrivers(r.data)).catch(() => setDrivers([]))
  }, [])

  useEffect(() => {
    load()
  }, [statusFilter, driverFilter])

  const deliveryAccessors = useMemo(() => ({
    invoice: (r: Invoice) => r.invoice_number || '',
    type: (r: Invoice) => r.type || '',
    payment: (r: Invoice) => r.payment_method || '',
    customer: (r: Invoice) => r.delivery_customer_name || r.customer_name || '',
    phone: (r: Invoice) => r.delivery_customer_phone || '',
    address: (r: Invoice) => r.delivery_address || '',
    driver: (r: Invoice) => r.delivery_person_name || '',
    delivery_fee: (r: Invoice) => Number(r.delivery_fee) || 0,
    total: (r: Invoice) => Number(r.net_total) || 0,
    created_at: (r: Invoice) => r.created_at || '',
    status: (r: Invoice) => r.delivery_status || 'pending',
  }), [])
  const { sorted: sortedRows, sort: deliverySort, toggle: deliveryToggle } = useSort(rows, deliveryAccessors)

  const summary = useMemo(() => {
    if (driverFilter === '') return null
    let deliveryFees = 0
    let cashCollected = 0
    let salesTotal = 0
    for (const r of rows) {
      deliveryFees += Number(r.delivery_fee) || 0
      cashCollected += cashCollectedOnDelivery(r)
      salesTotal += Number(r.net_total) || 0
    }
    return {
      orders: rows.length,
      deliveryFees,
      cashCollected,
      salesTotal,
      driverName:
        driverFilter === '0'
          ? t('deliveries.unassigned_driver')
          : drivers.find((d) => String(d.id) === driverFilter)?.name || '—',
    }
  }, [rows, driverFilter, drivers, t])

  const setStatus = async (id: number, status: string) => {
    setBusyId(id)
    try {
      await salesAPI.setDeliveryStatus(id, status)
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 w-full min-w-0 space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('deliveries.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('deliveries.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{t('deliveries.filter_driver')}</span>
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white min-w-[10rem]"
              >
                <option value="">{t('deliveries.all_drivers')}</option>
                <option value="0">{t('deliveries.unassigned_driver')}</option>
                {drivers.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{t('deliveries.filter_status')}</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="">{t('deliveries.all')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`deliveries.${s}`)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {driverFilter === '' ? (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            {t('deliveries.select_driver_for_summary')}
          </p>
        ) : summary && !loading && (
          <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="text-teal-700" size={20} />
              <h2 className="font-semibold text-teal-900">
                {t('deliveries.driver_summary_title')} — {summary.driverName}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/80 rounded-xl px-3 py-2.5 border border-teal-100">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide">{t('deliveries.driver_summary_orders')}</p>
                <p className="text-xl font-bold text-slate-800 tabular-nums">{summary.orders}</p>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2.5 border border-teal-200">
                <p className="text-[11px] text-teal-700 uppercase tracking-wide font-medium">{t('deliveries.driver_summary_delivery_fees')}</p>
                <p className="text-xl font-bold text-teal-800 tabular-nums">{fmt(summary.deliveryFees)}</p>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2.5 border border-amber-200">
                <p className="text-[11px] text-amber-800 uppercase tracking-wide font-medium">{t('deliveries.driver_summary_cash_collected')}</p>
                <p className="text-xl font-bold text-amber-900 tabular-nums">{fmt(summary.cashCollected)}</p>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2.5 border border-slate-200">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide">{t('deliveries.driver_summary_sales_total')}</p>
                <p className="text-xl font-bold text-slate-800 tabular-nums">{fmt(summary.salesTotal)}</p>
              </div>
            </div>
            <p className="text-xs text-teal-800/80 mt-3">{t('deliveries.driver_summary_hint')}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">{t('deliveries.none')}</div>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain max-w-full">
            <table className="text-sm min-w-[80rem] w-max">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <SortTh k="invoice" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.invoice')}</SortTh>
                  <SortTh k="type" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.sale_type')}</SortTh>
                  <SortTh k="payment" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.payment')}</SortTh>
                  <SortTh k="customer" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.customer')}</SortTh>
                  <SortTh k="phone" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.phone')}</SortTh>
                  <SortTh k="address" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.address')}</SortTh>
                  <SortTh k="driver" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.driver')}</SortTh>
                  <SortTh k="delivery_fee" sort={deliverySort} onToggle={deliveryToggle} align="end" className="px-4 py-3">{t('deliveries.delivery_fee_col')}</SortTh>
                  <SortTh k="total" sort={deliverySort} onToggle={deliveryToggle} align="end" className="px-4 py-3">{t('deliveries.total')}</SortTh>
                  <SortTh k="created_at" sort={deliverySort} onToggle={deliveryToggle} align="start" className="px-4 py-3">{t('deliveries.created')}</SortTh>
                  <SortTh k="status" sort={deliverySort} onToggle={deliveryToggle} align="center" className="px-4 py-3">{t('deliveries.status')}</SortTh>
                  <th className="px-4 py-3 text-end whitespace-nowrap">{t('deliveries.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((r) => {
                  const st = r.delivery_status || 'pending'
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{r.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-600 capitalize whitespace-nowrap">{r.type}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.payment_method === 'account'
                          ? t('deliveries.payment_on_account')
                          : t(`payment.${r.payment_method}`, r.payment_method)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.delivery_customer_name || r.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.delivery_customer_phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 min-w-[12rem] max-w-[24rem]">{r.delivery_address || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.delivery_person_name || '—'}</td>
                      <td className="px-4 py-3 text-end font-mono text-teal-700">{fmt(r.delivery_fee)}</td>
                      <td className="px-4 py-3 text-end font-mono text-slate-700">{fmt(r.net_total)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDT(r.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses(st)}`}>
                          {t(`deliveries.${st}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          {busyId === r.id ? (
                            <Loader2 className="animate-spin text-slate-400" size={16} />
                          ) : (
                            <>
                              {st !== 'out_for_delivery' && st !== 'delivered' && (
                                <button
                                  onClick={() => setStatus(r.id, 'out_for_delivery')}
                                  className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg"
                                >
                                  <Truck size={14} /> {t('deliveries.mark_out')}
                                </button>
                              )}
                              {st !== 'delivered' && (
                                <button
                                  onClick={() => setStatus(r.id, 'delivered')}
                                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg"
                                >
                                  <PackageCheck size={14} /> {t('deliveries.mark_delivered')}
                                </button>
                              )}
                              {st === 'delivered' && (
                                <button
                                  onClick={() => setStatus(r.id, 'pending')}
                                  className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg"
                                >
                                  <RotateCcw size={14} /> {t('deliveries.mark_pending')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        {!loading && rows.length > 0 && (
          <p className="text-xs text-slate-400 text-end">{rows.length} {t('deliveries.count')}</p>
        )}
      </div>
    </Layout>
  )
}
