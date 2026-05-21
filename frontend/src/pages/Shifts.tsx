import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Unlock, FileText, X, AlertCircle } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

type Shift = {
  id: number; user_id: number; branch_id: number
  opened_at: string; opening_cash: number
  closed_at: string | null; closing_cash: number | null
  expected_cash: number | null; variance: number | null
  counted_visa: number | null; variance_visa: number | null
  status: 'open' | 'closed'; notes: string | null
  user_name?: string; user_name_en?: string; user_name_ar?: string
  branch_name_en?: string; branch_name_ar?: string
}
type Breakdown = {
  cash_sales: number; visa_sales: number; other_sales: number
  total_sales: number; invoice_count: number
  cash_collected: number; cash_change: number
  returns_value: number; returns_count: number
  expected_cash: number
}

const fmt = (n: any) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDT = (s: string | null) => s ? new Date(s).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US') : '—'

export default function Shifts() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [current, setCurrent] = useState<Shift | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [reportShift, setReportShift] = useState<{ shift: Shift; breakdown: Breakdown; report_type: string } | null>(null)
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [closePreview, setClosePreview] = useState<Breakdown | null>(null)
  const [openingCash, setOpeningCash] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [countedVisa, setCountedVisa] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [c, l] = await Promise.all([
        api.get('/shifts/current'),
        api.get('/shifts'),
      ])
      setCurrent(c.data)
      setShifts(l.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load shifts')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openShift = async () => {
    try {
      await api.post('/shifts/open', { opening_cash: parseFloat(openingCash) || 0, notes: notes || null })
      setShowOpen(false); setOpeningCash(''); setNotes(''); await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }

  const openCloseModal = async () => {
    if (!current) return
    setClosePreview(null)
    setShowClose(true)
    try {
      const r = await api.get(`/shifts/${current.id}/report`)
      setClosePreview(r.data.breakdown)
    } catch { /* preview is optional */ }
  }

  const closeShift = async () => {
    if (!current) return
    try {
      const r = await api.post(`/shifts/${current.id}/close`, {
        counted_cash: parseFloat(countedCash) || 0,
        counted_visa: parseFloat(countedVisa) || 0,
        notes: notes || null,
      })
      setShowClose(false); setCountedCash(''); setCountedVisa(''); setNotes(''); setClosePreview(null)
      setReportShift({ shift: r.data, breakdown: r.data.breakdown, report_type: 'Z' })
      await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }

  const viewReport = async (id: number) => {
    try {
      const r = await api.get(`/shifts/${id}/report`)
      setReportShift(r.data)
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }

  const printReport = () => window.print()

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-xl mx-auto w-full space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('shifts.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('shifts.subtitle')}</p>
          </div>
          {!current ? (
            <button onClick={() => setShowOpen(true)} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-4 py-2 rounded-xl">
              <Unlock size={16} /> {t('shifts.open_shift')}
            </button>
          ) : (
            <button onClick={openCloseModal} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl">
              <Lock size={16} /> {t('shifts.close_shift')}
            </button>
          )}
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        {current && (
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm uppercase tracking-wider">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> {t('shifts.current_open')}
                </div>
                <p className="text-2xl font-bold text-slate-800 mt-2">{fmt(current.opening_cash)} <span className="text-sm font-normal text-slate-500">{t('shifts.opening_cash')}</span></p>
                <p className="text-sm text-slate-500 mt-1">{t('shifts.opened_at')}: {fmtDT(current.opened_at)}</p>
              </div>
              <div className="text-xs text-emerald-700/70 italic max-w-[180px] text-end">
                {t('shifts.report_after_close_hint')}
              </div>
            </div>
          </div>
        )}

        {/* Shift history */}
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-2">{t('shifts.history')}</h2>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start">#</th>
                  {isAdmin && <th className="px-4 py-2.5 text-start">{t('shifts.user')}</th>}
                  <th className="px-4 py-2.5 text-start">{t('shifts.branch')}</th>
                  <th className="px-4 py-2.5 text-start">{t('shifts.opened_at')}</th>
                  <th className="px-4 py-2.5 text-start">{t('shifts.closed_at')}</th>
                  <th className="px-4 py-2.5 text-end">{t('shifts.opening_cash')}</th>
                  <th className="px-4 py-2.5 text-end">{t('shifts.closing_cash')}</th>
                  <th className="px-4 py-2.5 text-end">{t('shifts.variance')}</th>
                  <th className="px-4 py-2.5 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 && (
                  <tr><td colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-slate-400">{t('shifts.no_history')}</td></tr>
                )}
                {shifts.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-slate-500">#{s.id}</td>
                    {isAdmin && <td className="px-4 py-2.5">{i18n.language === 'ar' ? s.user_name_ar : s.user_name_en}</td>}
                    <td className="px-4 py-2.5">{i18n.language === 'ar' ? s.branch_name_ar : s.branch_name_en}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDT(s.opened_at)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDT(s.closed_at)}</td>
                    <td className="px-4 py-2.5 text-end font-mono">{fmt(s.opening_cash)}</td>
                    <td className="px-4 py-2.5 text-end font-mono">{s.closing_cash != null ? fmt(s.closing_cash) : '—'}</td>
                    <td className={`px-4 py-2.5 text-end font-mono font-semibold ${s.variance == null ? '' : Number(s.variance) === 0 ? 'text-emerald-700' : Number(s.variance) > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {s.variance != null ? fmt(s.variance) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {s.status === 'closed' ? (
                        <button onClick={() => viewReport(s.id)} className="text-pharma-700 hover:text-pharma-800 text-xs font-medium">
                          {t('shifts.z_report')}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">{t('shifts.report_after_close')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Open shift modal */}
        {showOpen && (
          <Modal onClose={() => setShowOpen(false)} title={t('shifts.open_shift')}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600">{t('shifts.opening_cash')}</label>
                <input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="input w-full" autoFocus />
              </div>
              <div>
                <label className="text-xs text-slate-600">{t('common.notes')}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" rows={2} />
              </div>
              <button onClick={openShift} className="w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg">{t('shifts.open_shift')}</button>
            </div>
          </Modal>
        )}

        {/* Close shift modal */}
        {showClose && current && (
          <Modal onClose={() => { setShowClose(false); setClosePreview(null) }} title={t('shifts.close_shift')}>
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {t('shifts.close_warning')}
              </div>
              {closePreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>{t('shifts.expected_cash')}</span>
                    <span className="font-mono font-semibold text-slate-800">{fmt(closePreview.expected_cash)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{t('shifts.expected_visa')}</span>
                    <span className="font-mono font-semibold text-slate-800">{fmt(closePreview.visa_sales)}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-600">{t('shifts.counted_cash')}</label>
                <input type="number" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className="input w-full" autoFocus />
              </div>
              <div>
                <label className="text-xs text-slate-600">{t('shifts.counted_visa')}</label>
                <input type="number" value={countedVisa} onChange={(e) => setCountedVisa(e.target.value)} className="input w-full" placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs text-slate-600">{t('common.notes')}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" rows={2} />
              </div>
              <button onClick={closeShift} className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg">{t('shifts.close_shift')}</button>
            </div>
          </Modal>
        )}

        {/* Report modal */}
        {reportShift && (
          <Modal onClose={() => setReportShift(null)} title={`${reportShift.report_type} ${t('shifts.report')} — #${reportShift.shift.id}`} wide>
            <div className="space-y-3" id="shift-report-printable">
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div><span className="text-slate-400">{t('shifts.user')}:</span> {reportShift.shift.user_name}</div>
                <div><span className="text-slate-400">{t('shifts.branch')}:</span> {i18n.language === 'ar' ? reportShift.shift.branch_name_ar : reportShift.shift.branch_name_en}</div>
                <div><span className="text-slate-400">{t('shifts.opened_at')}:</span> {fmtDT(reportShift.shift.opened_at)}</div>
                <div><span className="text-slate-400">{t('shifts.closed_at')}:</span> {fmtDT(reportShift.shift.closed_at)}</div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h3 className="text-sm font-semibold mb-2 text-slate-700">{t('shifts.sales_summary')}</h3>
                <Line label={t('shifts.invoices')} value={String(reportShift.breakdown.invoice_count)} />
                <Line label={t('shifts.cash_sales')} value={fmt(reportShift.breakdown.cash_sales)} />
                <Line label={t('shifts.visa_sales')} value={fmt(reportShift.breakdown.visa_sales)} />
                <Line label={t('shifts.other_sales')} value={fmt(reportShift.breakdown.other_sales)} />
                <Line label={t('shifts.total_sales')} value={fmt(reportShift.breakdown.total_sales)} bold />
                <Line label={t('shifts.returns')} value={fmt(reportShift.breakdown.returns_value)} negative />
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h3 className="text-sm font-semibold mb-2 text-slate-700">{t('shifts.cash_reconciliation')}</h3>
                <Line label={t('shifts.opening_cash')} value={fmt(reportShift.shift.opening_cash)} />
                <Line label={t('shifts.cash_in')} value={fmt(reportShift.breakdown.cash_collected - reportShift.breakdown.cash_change)} />
                <Line label={t('shifts.returns')} value={fmt(reportShift.breakdown.returns_value)} negative />
                <Line label={t('shifts.expected_cash')} value={fmt(reportShift.breakdown.expected_cash)} bold />
                {reportShift.shift.status === 'closed' && (
                  <>
                    <Line label={t('shifts.counted_cash')} value={fmt(reportShift.shift.closing_cash)} />
                    <Line label={t('shifts.variance')} value={fmt(reportShift.shift.variance)} variance={Number(reportShift.shift.variance)} />
                  </>
                )}
              </div>

              {reportShift.shift.status === 'closed' && (
                <div className="border-t border-slate-200 pt-3">
                  <h3 className="text-sm font-semibold mb-2 text-slate-700">{t('shifts.visa_reconciliation')}</h3>
                  <Line label={t('shifts.expected_visa')} value={fmt(reportShift.breakdown.visa_sales)} bold />
                  <Line label={t('shifts.counted_visa')} value={fmt(reportShift.shift.counted_visa)} />
                  <Line label={t('shifts.variance')} value={fmt(reportShift.shift.variance_visa)} variance={Number(reportShift.shift.variance_visa)} />
                </div>
              )}

              <button onClick={printReport} className="no-print w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2">
                <FileText size={14} /> {t('common.print')}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  )
}

function Line({ label, value, bold, negative, variance }: { label: string; value: any; bold?: boolean; negative?: boolean; variance?: number }) {
  const color = variance != null ? (variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-blue-700' : 'text-red-600') : negative ? 'text-red-600' : 'text-slate-800'
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-mono tabular-nums ${color} ${bold ? 'font-bold' : ''}`}>{negative && Number(value) > 0 ? '−' : ''}{value}</span>
    </div>
  )
}

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl ${wide ? 'max-w-lg' : 'max-w-sm'} w-full p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 no-print"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
