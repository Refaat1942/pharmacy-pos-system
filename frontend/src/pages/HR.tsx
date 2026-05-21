import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Edit2, Trash2, Calendar as CalIcon, DollarSign, Check, X, RotateCw, ShieldAlert, QrCode, Printer } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

type Employee = {
  id: number; name: string; role: string | null; branch_id: number | null
  base_salary: number; hire_date: string | null; phone: string | null
  national_id: string | null; active: boolean; notes: string | null
  clock_code: string | null
  branch_name_en?: string; branch_name_ar?: string
}
type Att = { id: number; employee_id: number; employee_name: string; work_date: string; check_in: string | null; check_out: string | null; hours: number | null; status: string; notes: string | null }
type Slip = { id: number; employee_id: number; employee_name: string; employee_role: string; period_month: string; base_salary: number; bonus: number; deductions: number; days_worked: number; net_amount: number; status: 'draft'|'paid'; paid_at: string | null; notes: string | null }
type Branch = { id: number; name_en: string; name_ar: string }

const fmt = (n: any) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)
const ym = () => today().slice(0, 7)

export default function HR() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'employees' | 'attendance' | 'payroll'>('employees')

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <ShieldAlert size={48} className="mb-3 text-red-400" />
          <p className="text-lg font-medium">{t('hr.admin_only')}</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('hr.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('hr.subtitle')}</p>
        </div>

        <div className="flex gap-1 border-b border-slate-200">
          {(['employees', 'attendance', 'payroll'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-pharma-600 text-pharma-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t(`hr.tab_${k}`)}
            </button>
          ))}
        </div>

        {tab === 'employees' && <EmployeesTab />}
        {tab === 'attendance' && <AttendanceTab />}
        {tab === 'payroll' && <PayrollTab />}
      </div>
    </Layout>
  )
}

function EmployeesTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Employee[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [editing, setEditing] = useState<Partial<Employee> | null>(null)

  const load = async () => {
    const [e, b] = await Promise.all([api.get('/hr/employees'), api.get('/settings/branches').catch(() => ({ data: [] }))])
    setRows(e.data); setBranches(b.data)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.name) return
    try {
      const body = {
        name: editing.name, role: editing.role || null, branch_id: editing.branch_id || null,
        base_salary: editing.base_salary || 0, hire_date: editing.hire_date || null,
        phone: editing.phone || null, national_id: editing.national_id || null,
        notes: editing.notes || null, active: editing.active !== false,
      }
      if (editing.id) await api.put(`/hr/employees/${editing.id}`, body)
      else await api.post('/hr/employees', body)
      setEditing(null); await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }

  const remove = async (id: number) => {
    if (!confirm(t('common.confirm_delete'))) return
    await api.delete(`/hr/employees/${id}`); await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <a href="/clock" target="_blank" rel="noopener" className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg text-sm">
          <QrCode size={14} /> {t('hr.open_clock')}
        </a>
        <a href="/hr/cards" target="_blank" rel="noopener" className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg text-sm">
          <Printer size={14} /> {t('hr.print_cards')}
        </a>
        <button onClick={() => setEditing({ active: true, base_salary: 0 })} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm">
          <UserPlus size={14} /> {t('hr.add_employee')}
        </button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('hr.name')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.role')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.branch')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.base_salary')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.hire_date')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.phone')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.clock_code')}</th>
              <th className="px-3 py-2.5 text-center">{t('hr.status')}</th>
              <th className="px-3 py-2.5 text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-slate-400">{t('hr.no_employees')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-medium">{r.name}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.role || '—'}</td>
                <td className="px-3 py-2.5 text-slate-600">{i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en || '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono">{fmt(r.base_salary)}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.hire_date || '—'}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.phone || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{r.clock_code || '—'}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {r.active ? t('hr.active') : t('hr.inactive')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button onClick={() => setEditing(r)} className="text-pharma-600 hover:text-pharma-800 mx-1"><Edit2 size={14} /></button>
                  <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700 mx-1"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? t('hr.edit_employee') : t('hr.add_employee')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('hr.name')}><input className="input w-full" value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label={t('hr.role')}>
              <select
                className="input w-full"
                value={editing.role || ''}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
              >
                <option value="">—</option>
                <option value="pharmacist">{t('settings.role_pharmacist')}</option>
                <option value="assistant">{t('settings.role_assistant')}</option>
                <option value="cashier">{t('settings.role_cashier')}</option>
                <option value="manager">{t('hr.role_manager')}</option>
                <option value="accountant">{t('hr.role_accountant')}</option>
                <option value="delivery">{t('hr.role_delivery')}</option>
                <option value="cleaner">{t('hr.role_cleaner')}</option>
                <option value="admin">{t('settings.role_admin')}</option>
              </select>
            </Field>
            <Field label={t('hr.branch')}>
              <select className="input w-full" value={editing.branch_id || ''} onChange={(e) => setEditing({ ...editing, branch_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{i18n.language === 'ar' ? b.name_ar : b.name_en}</option>)}
              </select>
            </Field>
            <Field label={t('hr.base_salary')}><input type="number" className="input w-full" value={editing.base_salary ?? 0} onChange={(e) => setEditing({ ...editing, base_salary: Number(e.target.value) })} /></Field>
            <Field label={t('hr.hire_date')}><input type="date" className="input w-full" value={editing.hire_date || ''} onChange={(e) => setEditing({ ...editing, hire_date: e.target.value })} /></Field>
            <Field label={t('hr.phone')}><input className="input w-full" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label={t('hr.national_id')}><input className="input w-full" value={editing.national_id || ''} onChange={(e) => setEditing({ ...editing, national_id: e.target.value })} /></Field>
            <Field label={t('hr.status')}>
              <select className="input w-full" value={editing.active === false ? '0' : '1'} onChange={(e) => setEditing({ ...editing, active: e.target.value === '1' })}>
                <option value="1">{t('hr.active')}</option>
                <option value="0">{t('hr.inactive')}</option>
              </select>
            </Field>
            <div className="col-span-2">
              <Field label={t('common.notes')}><textarea className="input w-full" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            </div>
          </div>
          <button onClick={save} className="mt-4 w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg">{t('common.save')}</button>
        </Modal>
      )}
    </div>
  )
}

function AttendanceTab() {
  const { t } = useTranslation()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<Att[]>([])
  const [date, setDate] = useState(today())
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<{ employee_id: number | ''; work_date: string; check_in: string; check_out: string; status: string }>({ employee_id: '', work_date: today(), check_in: '09:00', check_out: '17:00', status: 'present' })

  const load = async () => {
    const [e, a] = await Promise.all([
      api.get('/hr/employees', { params: { active_only: true } }),
      api.get('/hr/attendance', { params: { date_from: date, date_to: date } }),
    ])
    setEmployees(e.data); setRows(a.data)
  }
  useEffect(() => { load() }, [date])

  const save = async () => {
    if (!form.employee_id) return
    try {
      await api.post('/hr/attendance', form)
      setShowAdd(false); await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }
  const remove = async (id: number) => {
    if (!confirm(t('common.confirm_delete'))) return
    await api.delete(`/hr/attendance/${id}`); await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('hr.date')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input text-sm" />
        </div>
        <button onClick={() => { setForm({ ...form, work_date: date }); setShowAdd(true) }} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm">
          <CalIcon size={14} /> {t('hr.record_attendance')}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('hr.employee')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.date')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.check_in')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.check_out')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.hours')}</th>
              <th className="px-3 py-2.5 text-center">{t('hr.status')}</th>
              <th className="px-3 py-2.5 text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t('hr.no_attendance')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.work_date}</td>
                <td className="px-3 py-2.5 font-mono text-slate-700">{r.check_in || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-slate-700">{r.check_out || '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono">{r.hours ?? '—'}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === 'present' ? 'bg-emerald-100 text-emerald-700' : r.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{t(`hr.status_${r.status}`)}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title={t('hr.record_attendance')}>
          <div className="space-y-3">
            <Field label={t('hr.employee')}>
              <select className="input w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}>
                <option value="">—</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label={t('hr.date')}><input type="date" className="input w-full" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('hr.check_in')}><input type="time" className="input w-full" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></Field>
              <Field label={t('hr.check_out')}><input type="time" className="input w-full" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></Field>
            </div>
            <Field label={t('hr.status')}>
              <select className="input w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="present">{t('hr.status_present')}</option>
                <option value="absent">{t('hr.status_absent')}</option>
                <option value="leave">{t('hr.status_leave')}</option>
              </select>
            </Field>
            <button onClick={save} className="w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg">{t('common.save')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PayrollTab() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState(ym())
  const [rows, setRows] = useState<Slip[]>([])
  const [editing, setEditing] = useState<Slip | null>(null)

  const load = async () => {
    const r = await api.get('/hr/payroll', { params: { period_month: period } })
    setRows(r.data)
  }
  useEffect(() => { load() }, [period])

  const generate = async () => {
    try {
      const r = await api.post(`/hr/payroll/generate?period_month=${period}`)
      alert(`${r.data.created} slips created (${r.data.total_employees} employees)`)
      await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }
  const saveEdit = async () => {
    if (!editing) return
    try {
      await api.put(`/hr/payroll/${editing.id}`, { bonus: Number(editing.bonus) || 0, deductions: Number(editing.deductions) || 0, notes: editing.notes || null })
      setEditing(null); await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }
  const markPaid = async (id: number) => {
    if (!confirm(t('hr.confirm_pay'))) return
    try {
      await api.post(`/hr/payroll/${id}/mark-paid`); await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }
  const remove = async (id: number) => {
    if (!confirm(t('common.confirm_delete'))) return
    try { await api.delete(`/hr/payroll/${id}`); await load() }
    catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }

  const total = rows.reduce((s, r) => s + Number(r.net_amount || 0), 0)
  const unpaid = rows.filter((r) => r.status === 'draft').reduce((s, r) => s + Number(r.net_amount || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('hr.period_month')}</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="input text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
            <div className="text-slate-500">{t('hr.total_payroll')}</div>
            <div className="font-bold text-blue-700 font-mono">{fmt(total)}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
            <div className="text-slate-500">{t('hr.unpaid')}</div>
            <div className="font-bold text-amber-700 font-mono">{fmt(unpaid)}</div>
          </div>
          <button onClick={generate} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-3 py-2 rounded-lg text-sm">
            <RotateCw size={14} /> {t('hr.generate_slips')}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('hr.employee')}</th>
              <th className="px-3 py-2.5 text-start">{t('hr.role')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.days_worked')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.base_salary')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.bonus')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.deductions')}</th>
              <th className="px-3 py-2.5 text-end">{t('hr.net_amount')}</th>
              <th className="px-3 py-2.5 text-center">{t('hr.status')}</th>
              <th className="px-3 py-2.5 text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-slate-400">{t('hr.no_slips')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.employee_role || '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono">{r.days_worked}</td>
                <td className="px-3 py-2.5 text-end font-mono">{fmt(r.base_salary)}</td>
                <td className="px-3 py-2.5 text-end font-mono text-emerald-700">{fmt(r.bonus)}</td>
                <td className="px-3 py-2.5 text-end font-mono text-red-600">{fmt(r.deductions)}</td>
                <td className="px-3 py-2.5 text-end font-mono font-bold">{fmt(r.net_amount)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{t(`hr.slip_${r.status}`)}</span>
                </td>
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  {r.status === 'draft' && (
                    <>
                      <button onClick={() => setEditing(r)} className="text-pharma-600 hover:text-pharma-800 mx-1"><Edit2 size={14} /></button>
                      <button onClick={() => markPaid(r.id)} className="text-emerald-600 hover:text-emerald-800 mx-1" title={t('hr.mark_paid')}><Check size={14} /></button>
                      <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700 mx-1"><Trash2 size={14} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={`${t('hr.edit_slip')} — ${editing.employee_name}`}>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">{t('hr.base_salary')}: <span className="font-mono font-semibold">{fmt(editing.base_salary)}</span></div>
            <Field label={t('hr.bonus')}><input type="number" className="input w-full" value={editing.bonus} onChange={(e) => setEditing({ ...editing, bonus: Number(e.target.value) })} /></Field>
            <Field label={t('hr.deductions')}><input type="number" className="input w-full" value={editing.deductions} onChange={(e) => setEditing({ ...editing, deductions: Number(e.target.value) })} /></Field>
            <Field label={t('common.notes')}><textarea className="input w-full" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <div className="bg-slate-50 rounded-lg p-2 text-sm flex justify-between">
              <span>{t('hr.net_amount')}</span>
              <span className="font-mono font-bold">{fmt(Number(editing.base_salary) + Number(editing.bonus || 0) - Number(editing.deductions || 0))}</span>
            </div>
            <button onClick={saveEdit} className="w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg">{t('common.save')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600 block mb-1">{label}</label>
      {children}
    </div>
  )
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
