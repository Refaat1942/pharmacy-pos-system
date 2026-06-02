import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Truck, PackageCheck, RotateCcw } from 'lucide-react'
import Layout from '../components/Layout'
import { salesAPI } from '../lib/api'
import type { Invoice } from '../lib/api'
import i18n from '../lib/i18n'

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

export default function Deliveries() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [busyId, setBusyId] = useState<number | null>(null)

  const fmt = (n: number | null | undefined) =>
    `${(Number(n) || 0).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDT = (s: string) =>
    new Date(s).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })

  const load = () => {
    setLoading(true)
    salesAPI
      .list({ type: 'delivery', delivery_status: statusFilter || undefined, limit: 200 })
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [statusFilter])

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
      <div className="flex-1 overflow-auto p-6 max-w-screen-xl mx-auto w-full space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('deliveries.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('deliveries.subtitle')}</p>
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

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">{t('deliveries.none')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-start">{t('deliveries.invoice')}</th>
                  <th className="px-4 py-3 text-start">{t('deliveries.customer')}</th>
                  <th className="px-4 py-3 text-start">{t('deliveries.phone')}</th>
                  <th className="px-4 py-3 text-start">{t('deliveries.address')}</th>
                  <th className="px-4 py-3 text-start">{t('deliveries.driver')}</th>
                  <th className="px-4 py-3 text-end">{t('deliveries.total')}</th>
                  <th className="px-4 py-3 text-start">{t('deliveries.created')}</th>
                  <th className="px-4 py-3 text-center">{t('deliveries.status')}</th>
                  <th className="px-4 py-3 text-end">{t('deliveries.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const st = r.delivery_status || 'pending'
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-700">{r.delivery_customer_name || r.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.delivery_customer_phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[16rem] truncate" title={r.delivery_address || ''}>{r.delivery_address || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.delivery_person_name || '—'}</td>
                      <td className="px-4 py-3 text-end font-mono text-slate-700">{fmt(r.net_total)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDT(r.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses(st)}`}>
                          {t(`deliveries.${st}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
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
          )}
        </div>
        {!loading && rows.length > 0 && (
          <p className="text-xs text-slate-400 text-end">{rows.length} {t('deliveries.count')}</p>
        )}
      </div>
    </Layout>
  )
}
