import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Ban, X } from 'lucide-react'
import api, { formatApiError } from '../lib/api'
import DateInput from './DateInput'
import i18n from '../lib/i18n'

const fmt = (n: unknown) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-slate-600">{text}</span><div className="mt-1">{children}</div></label>
}

// ─── Leaves ────────────────────────────────────────────────────────────────
type Balance = { id: number; name: string; entitlement: number; used: number; casual: number; sick: number; unpaid: number; remaining: number }
type Leave = { id: number; employee_id: number; employee_name: string; leave_type: string; start_date: string; end_date: string; days: number; status: string; notes: string | null }

export function LeavesTab() {
  const { t } = useTranslation()
  const [year, setYear] = useState(new Date().getFullYear())
  const [balances, setBalances] = useState<Balance[]>([])
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [form, setForm] = useState<{ employee_id: number | ''; leave_type: string; start_date: string; end_date: string; notes: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    const [b, l] = await Promise.all([
      api.get('/hr/leaves/balances', { params: { year } }),
      api.get('/hr/leaves', { params: { year } }),
    ])
    setBalances(b.data.rows); setLeaves(l.data)
  }
  useEffect(() => { void load().catch(() => undefined) }, [year])

  const days = form && form.start_date && form.end_date
    ? Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1 : 0

  const save = async () => {
    if (!form || !form.employee_id) return
    setError('')
    try {
      const { data } = await api.post('/hr/leaves', { ...form, notes: form.notes || null })
      setNotice(data.skipped_worked_days?.length ? t('hr_leaves.skipped', { days: data.skipped_worked_days.join('، ') }) : '')
      setForm(null); await load()
    } catch (e) { setError(formatApiError(e, 'Failed')) }
  }

  const cancel = async (l: Leave) => {
    if (!window.confirm(t('hr_leaves.cancel_confirm') as string)) return
    try { await api.post(`/hr/leaves/${l.id}/cancel`); await load() } catch (e) { alert(formatApiError(e, 'Failed')) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">{t('hr_leaves.year')}</span>
          <input type="number" className="input w-24" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} />
        </div>
        <button onClick={() => { setError(''); setForm({ employee_id: '', leave_type: 'annual', start_date: localISO(new Date()), end_date: localISO(new Date()), notes: '' }) }}
          className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus size={16} />{t('hr_leaves.new')}
        </button>
      </div>
      {notice && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{notice}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="px-3 py-2 text-start">{t('hr.employee')}</th>
              <th className="px-3 py-2 text-center">{t('hr_leaves.entitlement')}</th>
              <th className="px-3 py-2 text-center">{t('hr_leaves.used')}</th>
              <th className="px-3 py-2 text-center">{t('hr_leaves.remaining')}</th>
              <th className="px-3 py-2 text-center">{t('hr_leaves.type_sick')}</th>
              <th className="px-3 py-2 text-center">{t('hr_leaves.type_unpaid')}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{b.name}</td>
                <td className="px-3 py-2 text-center font-mono">{b.entitlement}</td>
                <td className="px-3 py-2 text-center font-mono">{b.used}{b.casual ? <span className="text-[10px] text-slate-400"> ({t('hr_leaves.type_casual')} {b.casual})</span> : null}</td>
                <td className={`px-3 py-2 text-center font-mono font-bold ${b.remaining <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>{b.remaining}</td>
                <td className="px-3 py-2 text-center font-mono">{b.sick}</td>
                <td className="px-3 py-2 text-center font-mono">{b.unpaid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="px-3 py-2 text-start">{t('hr.employee')}</th>
              <th className="px-3 py-2 text-start">{t('hr_leaves.type')}</th>
              <th className="px-3 py-2 text-start">{t('hr_leaves.from')}</th>
              <th className="px-3 py-2 text-start">{t('hr_leaves.to')}</th>
              <th className="px-3 py-2 text-center">{t('hr_leaves.days')}</th>
              <th className="px-3 py-2 text-start">{t('common.notes')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leaves.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-6">{t('hr_leaves.empty')}</td></tr>}
            {leaves.map((l) => (
              <tr key={l.id} className={`border-t border-slate-100 ${l.status !== 'approved' ? 'opacity-40 line-through' : ''}`}>
                <td className="px-3 py-2 font-medium">{l.employee_name}</td>
                <td className="px-3 py-2">{t(`hr_leaves.type_${l.leave_type}`)}</td>
                <td className="px-3 py-2 font-mono">{l.start_date}</td>
                <td className="px-3 py-2 font-mono">{l.end_date}</td>
                <td className="px-3 py-2 text-center font-mono">{l.days}</td>
                <td className="px-3 py-2 text-slate-500">{l.notes || ''}</td>
                <td className="px-2">
                  {l.status === 'approved' && (
                    <button onClick={() => void cancel(l)} title={t('hr_leaves.cancel') as string} className="p-1 text-slate-400 hover:text-red-600"><Ban size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Dialog title={t('hr_leaves.new')} onClose={() => setForm(null)}>
          <Label text={t('hr.employee')}>
            <select className="input w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">—</option>
              {balances.map((b) => <option key={b.id} value={b.id}>{b.name} — {t('hr_leaves.remaining')}: {b.remaining}</option>)}
            </select>
          </Label>
          <Label text={t('hr_leaves.type')}>
            <select className="input w-full" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
              {['annual', 'casual', 'sick', 'unpaid'].map((k) => <option key={k} value={k}>{t(`hr_leaves.type_${k}`)}</option>)}
            </select>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Label text={t('hr_leaves.from')}><DateInput className="input w-full" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v, end_date: form.end_date < v ? v : form.end_date })} /></Label>
            <Label text={t('hr_leaves.to')}><DateInput className="input w-full" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} /></Label>
          </div>
          <p className="text-xs text-slate-500">{t('hr_leaves.days')}: <b>{days > 0 ? days : '—'}</b> · {t(form.leave_type === 'unpaid' ? 'hr_leaves.unpaid_hint' : 'hr_leaves.paid_hint')}</p>
          <Label text={t('common.notes')}><input className="input w-full" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Label>
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
          <button onClick={() => void save()} disabled={!form.employee_id || days <= 0}
            className="w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg disabled:opacity-50">{t('common.save')}</button>
        </Dialog>
      )}
    </div>
  )
}

// ─── Advances ──────────────────────────────────────────────────────────────
type Advance = {
  id: number; employee_id: number; employee_name: string; amount: number; installments: number
  installment: number; repaid: number; remaining: number; given_on: string; status: string; notes: string | null
}

export function AdvancesTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Advance[]>([])
  const [emps, setEmps] = useState<{ id: number; name: string; base_salary: number }[]>([])
  const [form, setForm] = useState<{ employee_id: number | ''; amount: number | ''; installments: number; given_on: string; notes: string } | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    const [a, e] = await Promise.all([api.get('/hr/advances'), api.get('/hr/advances/employees')])
    setRows(a.data); setEmps(e.data)
  }
  useEffect(() => { void load().catch(() => undefined) }, [])

  const open = rows.filter((r) => r.status === 'active' && r.remaining > 0.009)
  const outstanding = open.reduce((s, r) => s + Number(r.remaining), 0)

  const save = async () => {
    if (!form || !form.employee_id || !(Number(form.amount) > 0)) return
    setError('')
    try {
      await api.post('/hr/advances', { ...form, amount: Number(form.amount), notes: form.notes || null })
      setForm(null); await load()
    } catch (e) { setError(formatApiError(e, 'Failed')) }
  }

  const cancel = async (a: Advance) => {
    if (!window.confirm(t('hr_advances.cancel_confirm') as string)) return
    try { await api.post(`/hr/advances/${a.id}/cancel`); await load() } catch (e) { alert(formatApiError(e, 'Failed')) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="text-sm">
          <span className="text-slate-500">{t('hr_advances.outstanding')}:</span>{' '}
          <span className="font-mono font-bold text-rose-700">{fmt(outstanding)}</span>
          <span className="text-slate-400 text-xs"> · {t('hr_advances.open_count', { n: open.length })}</span>
        </div>
        <button onClick={() => { setError(''); setForm({ employee_id: '', amount: '', installments: 1, given_on: localISO(new Date()), notes: '' }) }}
          className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus size={16} />{t('hr_advances.new')}
        </button>
      </div>
      <p className="text-xs text-slate-500">{t('hr_advances.hint')}</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="px-3 py-2 text-start">{t('hr.employee')}</th>
              <th className="px-3 py-2 text-start">{t('hr_advances.date')}</th>
              <th className="px-3 py-2 text-end">{t('hr_advances.amount')}</th>
              <th className="px-3 py-2 text-center">{t('hr_advances.installments')}</th>
              <th className="px-3 py-2 text-end">{t('hr_advances.installment')}</th>
              <th className="px-3 py-2 text-end">{t('hr_advances.repaid')}</th>
              <th className="px-3 py-2 text-end">{t('hr_advances.remaining')}</th>
              <th className="px-3 py-2 text-start">{t('common.notes')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-6">{t('hr_advances.empty')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.status !== 'active' ? 'opacity-40 line-through' : ''}`}>
                <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2 font-mono">{r.given_on}</td>
                <td className="px-3 py-2 text-end font-mono">{fmt(r.amount)}</td>
                <td className="px-3 py-2 text-center font-mono">{r.installments}</td>
                <td className="px-3 py-2 text-end font-mono">{fmt(r.installment)}</td>
                <td className="px-3 py-2 text-end font-mono text-emerald-700">{fmt(r.repaid)}</td>
                <td className={`px-3 py-2 text-end font-mono font-bold ${r.remaining > 0.009 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {r.remaining > 0.009 ? fmt(r.remaining) : t('hr_advances.settled')}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.notes || ''}</td>
                <td className="px-2">
                  {r.status === 'active' && (
                    <button onClick={() => void cancel(r)} title={t('hr_advances.cancel') as string} className="p-1 text-slate-400 hover:text-red-600"><Ban size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Dialog title={t('hr_advances.new')} onClose={() => setForm(null)}>
          <Label text={t('hr.employee')}>
            <select className="input w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">—</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Label text={t('hr_advances.amount')}><input type="number" min={0} step="0.01" className="input w-full" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value === '' ? '' : Number(e.target.value) })} /></Label>
            <Label text={t('hr_advances.installments')}><input type="number" min={1} max={36} className="input w-full" value={form.installments} onChange={(e) => setForm({ ...form, installments: Math.max(1, Number(e.target.value) || 1) })} /></Label>
          </div>
          <p className="text-xs text-slate-500">{t('hr_advances.installment')}: <b className="font-mono">{fmt((Number(form.amount) || 0) / form.installments)}</b> {t('hr_advances.per_month')}</p>
          <Label text={t('hr_advances.date')}><DateInput className="input w-full" value={form.given_on} onChange={(v) => setForm({ ...form, given_on: v })} /></Label>
          <Label text={t('common.notes')}><input className="input w-full" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Label>
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
          <button onClick={() => void save()} disabled={!form.employee_id || !(Number(form.amount) > 0)}
            className="w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg disabled:opacity-50">{t('common.save')}</button>
        </Dialog>
      )}
    </div>
  )
}
