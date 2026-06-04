import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Edit2, Trash2, Calendar as CalIcon, DollarSign, Check, X, RotateCw, ShieldAlert, QrCode, Printer, Download } from 'lucide-react'
import Layout from '../components/Layout'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { allowedHrTabs, canAccessHr, canManageEmployees, canRecordAttendance, hasHrTab } from '../lib/hrAccess'
import HrUnauthorized from '../components/HrUnauthorized'
import i18n from '../lib/i18n'
import PhoneField from '../components/PhoneField'
import { isValidPhone } from '../lib/phone'

type Employee = {
  id: number; name: string; role: string | null; branch_id: number | null
  base_salary: number; hire_date: string | null; phone: string | null
  national_id: string | null; active: boolean; notes: string | null
  clock_code: string | null; hours_allowance: number | null
  branch_name_en?: string; branch_name_ar?: string
}
type Att = { id: number; employee_id: number; employee_name: string; work_date: string; check_in: string | null; check_out: string | null; hours: number | null; status: string; notes: string | null; allowed: boolean }
type Slip = {
  id: number; employee_id: number; employee_name: string; employee_role: string
  period_month: string; base_salary: number; bonus: number; penalties: number
  deductions: number; prorated_base: number | null
  days_worked: number; hours_worked: number | null
  absent_days: number; leave_days: number
  standard_days: number | null; standard_hours: number | null
  net_amount: number; status: 'draft'|'paid'; paid_at: string | null; notes: string | null
  employee_phone?: string | null; employee_national_id?: string | null
  employee_hire_date?: string | null; branch_name_en?: string | null; branch_name_ar?: string | null
}

type PayslipDetail = {
  slip_id: number; period_month: string; period_start: string; period_end: string
  status: string; paid_at: string | null; notes: string | null
  employee: {
    id: number; name: string; role: string | null; phone: string | null
    national_id: string | null; hire_date: string | null
    branch_name_en: string | null; branch_name_ar: string | null
  }
  attendance: {
    standard_days: number; standard_hours: number
    days_worked: number; hours_worked: number
    absent_days: number; leave_days: number
  }
  earnings: { base_salary: number; prorated_base: number; bonus: number }
  deductions_detail: { penalties: number; other_deductions: number; total_deductions: number }
  net_amount: number
}
type Branch = { id: number; name_en: string; name_ar: string }

const STANDARD_MONTH_HOURS = 26 * 8
const fmt = (n: any) => Number(n || 0).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPeriod = (pm: string) => {
  const [y, m] = pm.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })
}
const slipProrated = (s: Slip) => {
  if (s.prorated_base != null && Number(s.prorated_base) > 0) return Number(s.prorated_base)
  const hrs = s.hours_worked != null ? Number(s.hours_worked) : Number(s.days_worked || 0) * 8
  return Math.round(Number(s.base_salary || 0) * hrs / STANDARD_MONTH_HOURS * 100) / 100
}
const slipNetPreview = (s: Slip) => slipProrated(s) + Number(s.bonus || 0) - Number(s.penalties || 0) - Number(s.deductions || 0)
const today = () => new Date().toISOString().slice(0, 10)
const ym = () => today().slice(0, 7)

export default function HR() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const allowedTabs = useMemo(() => allowedHrTabs(user), [user])
  const [tab, setTab] = useState<'employees' | 'attendance' | 'payroll' | 'performance'>(
    () => allowedTabs[0] ?? 'attendance',
  )

  useEffect(() => {
    if (!allowedTabs.includes(tab)) {
      setTab(allowedTabs[0] ?? 'attendance')
    }
  }, [allowedTabs, tab])

  if (!canAccessHr(user)) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <ShieldAlert size={48} className="mb-3 text-red-400" />
          <p className="text-lg font-medium">{t('hr.admin_only')}</p>
        </div>
      </Layout>
    )
  }

  if (allowedTabs.length === 0) {
    return (
      <Layout>
        <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full">
          <HrUnauthorized />
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
          {allowedTabs.map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-pharma-600 text-pharma-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t(`hr.tab_${k}`)}
            </button>
          ))}
        </div>

        {tab === 'employees' && (
          hasHrTab(user, 'employees') ? <EmployeesTab /> : <HrUnauthorized />
        )}
        {tab === 'attendance' && (
          hasHrTab(user, 'attendance') ? <AttendanceTab /> : <HrUnauthorized />
        )}
        {tab === 'payroll' && (
          hasHrTab(user, 'payroll') ? <PayrollTab /> : <HrUnauthorized />
        )}
        {tab === 'performance' && (
          hasHrTab(user, 'performance') ? <PerformanceTab /> : <HrUnauthorized />
        )}
      </div>
    </Layout>
  )
}

function EmployeesTab() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const manage = canManageEmployees(user)
  const [rows, setRows] = useState<Employee[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [editing, setEditing] = useState<Partial<Employee> | null>(null)

  const load = async () => {
    if (!manage) return
    const [e, b] = await Promise.all([api.get('/hr/employees'), api.get('/settings/branches').catch(() => ({ data: [] }))])
    setRows(e.data); setBranches(b.data)
  }
  useEffect(() => { if (manage) load() }, [manage])

  const save = async () => {
    if (!editing?.name) return
    if (!isValidPhone(editing.phone)) { alert(t('validation.phone_invalid')); return }
    try {
      const body = {
        name: editing.name, role: editing.role || null, branch_id: editing.branch_id || null,
        base_salary: editing.base_salary || 0, hire_date: editing.hire_date || null,
        phone: editing.phone || null, national_id: editing.national_id || null,
        notes: editing.notes || null, active: editing.active !== false,
        hours_allowance: editing.hours_allowance || 0,
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

  const filter = useQuickFilter(rows, [
    (r) => r.name, (r) => r.role, (r) => i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en,
    (r) => r.phone, (r) => r.clock_code, (r) => r.national_id,
  ])
  const accessors = useMemo(() => ({
    name: (r: Employee) => r.name,
    role: (r: Employee) => r.role,
    branch: (r: Employee) => i18n.language === 'ar' ? r.branch_name_ar : r.branch_name_en,
    base_salary: (r: Employee) => Number(r.base_salary || 0),
    hire_date: (r: Employee) => r.hire_date,
    phone: (r: Employee) => r.phone,
    clock_code: (r: Employee) => r.clock_code,
    status: (r: Employee) => r.active,
  }), [])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  if (!manage) {
    return (
      <div className="space-y-4">
        <HrUnauthorized />
        <div className="flex justify-center sm:justify-end">
          <a href="/clock" target="_blank" rel="noopener" className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm">
            <QrCode size={16} /> {t('hr.open_clock')}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2 flex-wrap">
        <a href="/clock" target="_blank" rel="noopener" className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg text-sm">
          <QrCode size={14} /> {t('hr.open_clock')}
        </a>
        <a href="/hr/cards" target="_blank" rel="noopener" className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg text-sm">
          <Printer size={14} /> {t('hr.print_cards')}
        </a>
        <button type="button" onClick={() => setEditing({ active: true, base_salary: 0 })} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm">
          <UserPlus size={14} /> {t('hr.add_employee')}
        </button>
      </div>
      <TableFilter value={filter.query} onChange={filter.setQuery} placeholder={t('common.filter_placeholder') as string} className="max-w-xs" />
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortTh k="name" sort={sort} onToggle={toggle} align="start">{t('hr.name')}</SortTh>
              <SortTh k="role" sort={sort} onToggle={toggle} align="start">{t('hr.role')}</SortTh>
              <SortTh k="branch" sort={sort} onToggle={toggle} align="start">{t('hr.branch')}</SortTh>
              <SortTh k="base_salary" sort={sort} onToggle={toggle} align="end">{t('hr.base_salary')}</SortTh>
              <SortTh k="hire_date" sort={sort} onToggle={toggle} align="start">{t('hr.hire_date')}</SortTh>
              <SortTh k="phone" sort={sort} onToggle={toggle} align="start">{t('hr.phone')}</SortTh>
              <SortTh k="clock_code" sort={sort} onToggle={toggle} align="start">{t('hr.clock_code')}</SortTh>
              <SortTh k="status" sort={sort} onToggle={toggle} align="center">{t('hr.status')}</SortTh>
              <th className="px-3 py-2.5 text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-slate-400">{t('hr.no_employees')}</td></tr>}
            {sorted.map((r) => (
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
                  <button type="button" onClick={() => setEditing(r)} className="text-pharma-600 hover:text-pharma-800 mx-1"><Edit2 size={14} /></button>
                  <button type="button" onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700 mx-1"><Trash2 size={14} /></button>
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
            <Field label={t('hr.hours_allowance')}><input type="number" step="0.25" min="0" className="input w-full" value={editing.hours_allowance ?? 0} onChange={(e) => setEditing({ ...editing, hours_allowance: Number(e.target.value) })} /><div className="text-[11px] text-slate-400 mt-1">{t('hr.hours_allowance_hint')}</div></Field>
            <Field label={t('hr.hire_date')}><input type="date" className="input w-full" value={editing.hire_date || ''} onChange={(e) => setEditing({ ...editing, hire_date: e.target.value })} /></Field>
            <Field label={t('hr.phone')}><PhoneField className="input w-full" value={editing.phone || ''} onChange={(v) => setEditing({ ...editing, phone: v })} /></Field>
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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const mayRecord = canRecordAttendance(user)
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  const [rows, setRows] = useState<Att[]>([])
  const [date, setDate] = useState(today())
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<{ employee_id: number | ''; work_date: string; check_in: string; check_out: string; status: string; allowed: boolean }>({ employee_id: '', work_date: today(), check_in: '09:00', check_out: '17:00', status: 'present', allowed: false })

  const load = async () => {
    const [e, a] = await Promise.all([
      api.get('/hr/attendance-roster'),
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
  const togglePass = async (r: Att) => {
    try {
      await api.post('/hr/attendance', {
        employee_id: r.employee_id, work_date: r.work_date,
        check_in: r.check_in || null, check_out: r.check_out || null,
        status: r.status, notes: r.notes || null, allowed: !r.allowed,
      })
      await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }
  const remove = async (id: number) => {
    if (!confirm(t('common.confirm_delete'))) return
    await api.delete(`/hr/attendance/${id}`); await load()
  }

  const filter = useQuickFilter(rows, [
    (r) => r.employee_name, (r) => r.work_date, (r) => t(`hr.status_${r.status}`),
  ])
  const accessors = useMemo(() => ({
    employee: (r: Att) => r.employee_name,
    date: (r: Att) => r.work_date,
    check_in: (r: Att) => r.check_in,
    check_out: (r: Att) => r.check_out,
    hours: (r: Att) => r.hours == null ? null : Number(r.hours),
    status: (r: Att) => r.status,
  }), [t])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('hr.date')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input text-sm" />
        </div>
        {mayRecord ? (
          <button onClick={() => { setForm({ ...form, work_date: date }); setShowAdd(true) }} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm">
            <CalIcon size={14} /> {t('hr.record_attendance')}
          </button>
        ) : null}
      </div>

      {!mayRecord && <HrUnauthorized />}

      <TableFilter value={filter.query} onChange={filter.setQuery} placeholder={t('common.filter_placeholder') as string} className="max-w-xs" />
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortTh k="employee" sort={sort} onToggle={toggle} align="start">{t('hr.employee')}</SortTh>
              <SortTh k="date" sort={sort} onToggle={toggle} align="start">{t('hr.date')}</SortTh>
              <SortTh k="check_in" sort={sort} onToggle={toggle} align="start">{t('hr.check_in')}</SortTh>
              <SortTh k="check_out" sort={sort} onToggle={toggle} align="start">{t('hr.check_out')}</SortTh>
              <SortTh k="hours" sort={sort} onToggle={toggle} align="end">{t('hr.hours')}</SortTh>
              <SortTh k="status" sort={sort} onToggle={toggle} align="center">{t('hr.status')}</SortTh>
              <th className="px-3 py-2.5 text-center">{t('hr.pass_day')}</th>
              <th className="px-3 py-2.5 text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('hr.no_attendance')}</td></tr>}
            {sorted.map((r) => (
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
                  {isAdmin && r.status === 'present' ? (
                    <button onClick={() => togglePass(r)} title={t('hr.pass_day_hint') as string} className={`text-[10px] px-2 py-0.5 rounded-full border ${r.allowed ? 'bg-pharma-100 text-pharma-700 border-pharma-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
                      {r.allowed ? t('hr.passed') : t('hr.pass_day')}
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {isAdmin ? (
                    <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                  ) : (
                    <span className="text-[10px] text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mayRecord && showAdd && (
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
            {isAdmin && form.status === 'present' && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.allowed} onChange={(e) => setForm({ ...form, allowed: e.target.checked })} />
                {t('hr.pass_day')} <span className="text-[11px] text-slate-400">— {t('hr.pass_day_hint')}</span>
              </label>
            )}
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
  const [printing, setPrinting] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [allMonths, setAllMonths] = useState(false)

  const load = async () => {
    const params: any = {}
    if (!allMonths) params.period_month = period
    if (search.trim()) params.q = search.trim()
    const r = await api.get('/hr/payroll', { params })
    setRows(r.data)
  }
  useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id) }, [period, allMonths, search])

  const exportSheet = () => {
    const headers = [t('hr.period_month'), t('hr.employee'), t('hr.role'), t('hr.days_worked'), t('hr.hours'), t('hr.absent_days'), t('hr.leave_days'), t('hr.base_salary'), t('hr.prorated_base'), t('hr.bonus'), t('hr.penalties'), t('hr.deductions'), t('hr.net_amount'), t('hr.status')]
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map((r) => [
      r.period_month, r.employee_name, r.employee_role || '', r.days_worked, r.hours_worked ?? '',
      r.absent_days ?? 0, r.leave_days ?? 0,
      Number(r.base_salary || 0).toFixed(2), slipProrated(r).toFixed(2),
      Number(r.bonus || 0).toFixed(2), Number(r.penalties || 0).toFixed(2),
      Number(r.deductions || 0).toFixed(2), Number(r.net_amount || 0).toFixed(2), t(`hr.slip_${r.status}`),
    ].map(esc).join(','))
    const csv = '\uFEFF' + [headers.map(esc).join(','), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `salaries_${allMonths ? 'all' : period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
      await api.put(`/hr/payroll/${editing.id}`, {
        bonus: Number(editing.bonus) || 0,
        penalties: Number(editing.penalties) || 0,
        deductions: Number(editing.deductions) || 0,
        notes: editing.notes || null,
      })
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

  const filter = useQuickFilter(rows, [
    (r) => r.period_month, (r) => r.employee_name, (r) => r.employee_role, (r) => t(`hr.slip_${r.status}`),
  ])
  const accessors = useMemo(() => ({
    period_month: (r: Slip) => r.period_month,
    employee: (r: Slip) => r.employee_name,
    role: (r: Slip) => r.employee_role,
    days_worked: (r: Slip) => Number(r.days_worked || 0),
    hours: (r: Slip) => r.hours_worked == null ? null : Number(r.hours_worked),
    base_salary: (r: Slip) => Number(r.base_salary || 0),
    bonus: (r: Slip) => Number(r.bonus || 0),
    penalties: (r: Slip) => Number(r.penalties || 0),
    deductions: (r: Slip) => Number(r.deductions || 0),
    net_amount: (r: Slip) => Number(r.net_amount || 0),
    status: (r: Slip) => r.status,
  }), [t])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('hr.period_month')}</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={allMonths} className="input text-sm disabled:bg-slate-100" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('hr.search_employee')}</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('hr.search_employee') as string} className="input text-sm" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2 cursor-pointer">
            <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
            {t('hr.all_months')}
          </label>
          <div className="pb-0.5">
            <TableFilter value={filter.query} onChange={filter.setQuery} placeholder={t('common.filter_placeholder') as string} className="w-48" />
          </div>
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
          <button onClick={exportSheet} disabled={rows.length === 0} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-lg text-sm disabled:opacity-50">
            <Download size={14} /> {t('hr.export_sheet')}
          </button>
          <button onClick={generate} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-3 py-2 rounded-lg text-sm">
            <RotateCw size={14} /> {t('hr.generate_slips')}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortTh k="period_month" sort={sort} onToggle={toggle} align="start">{t('hr.period_month')}</SortTh>
              <SortTh k="employee" sort={sort} onToggle={toggle} align="start">{t('hr.employee')}</SortTh>
              <SortTh k="role" sort={sort} onToggle={toggle} align="start">{t('hr.role')}</SortTh>
              <SortTh k="days_worked" sort={sort} onToggle={toggle} align="end">{t('hr.days_worked')}</SortTh>
              <SortTh k="hours" sort={sort} onToggle={toggle} align="end">{t('hr.hours')}</SortTh>
              <SortTh k="base_salary" sort={sort} onToggle={toggle} align="end">{t('hr.base_salary')}</SortTh>
              <SortTh k="bonus" sort={sort} onToggle={toggle} align="end">{t('hr.bonus')}</SortTh>
              <SortTh k="penalties" sort={sort} onToggle={toggle} align="end">{t('hr.penalties')}</SortTh>
              <SortTh k="deductions" sort={sort} onToggle={toggle} align="end">{t('hr.deductions')}</SortTh>
              <SortTh k="net_amount" sort={sort} onToggle={toggle} align="end">{t('hr.net_amount')}</SortTh>
              <SortTh k="status" sort={sort} onToggle={toggle} align="center">{t('hr.status')}</SortTh>
              <th className="px-3 py-2.5 text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={12} className="text-center py-8 text-slate-400">{t('hr.no_slips')}</td></tr>}
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-mono text-slate-500">{r.period_month}</td>
                <td className="px-3 py-2.5 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.employee_role || '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono">{r.days_worked}</td>
                <td className="px-3 py-2.5 text-end font-mono">{r.hours_worked ?? '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono">{fmt(r.base_salary)}</td>
                <td className="px-3 py-2.5 text-end font-mono text-emerald-700">{fmt(r.bonus)}</td>
                <td className="px-3 py-2.5 text-end font-mono text-orange-600">{fmt(r.penalties ?? 0)}</td>
                <td className="px-3 py-2.5 text-end font-mono text-red-600">{fmt(r.deductions)}</td>
                <td className="px-3 py-2.5 text-end font-mono font-bold">{fmt(r.net_amount)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{t(`hr.slip_${r.status}`)}</span>
                </td>
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  <button onClick={() => setPrinting(r.id)} className="text-slate-600 hover:text-pharma-700 mx-1" title={t('hr.print_payslip') as string}><Printer size={14} /></button>
                  {r.status === 'draft' && (
                    <>
                      <button onClick={() => setEditing({ ...r, penalties: r.penalties ?? 0 })} className="text-pharma-600 hover:text-pharma-800 mx-1"><Edit2 size={14} /></button>
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
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
              <div><span className="text-slate-500">{t('hr.period_month')}:</span> <span className="font-semibold">{fmtPeriod(editing.period_month)}</span></div>
              <div><span className="text-slate-500">{t('hr.days_worked')}:</span> <span className="font-mono font-semibold">{editing.days_worked}</span></div>
              <div><span className="text-slate-500">{t('hr.hours')}:</span> <span className="font-mono font-semibold">{editing.hours_worked ?? '—'}</span></div>
              <div><span className="text-slate-500">{t('hr.absent_days')}:</span> <span className="font-mono font-semibold">{editing.absent_days ?? 0}</span></div>
              <div><span className="text-slate-500">{t('hr.leave_days')}:</span> <span className="font-mono font-semibold">{editing.leave_days ?? 0}</span></div>
              <div><span className="text-slate-500">{t('hr.base_salary')}:</span> <span className="font-mono font-semibold">{fmt(editing.base_salary)}</span></div>
            </div>
            <div className="text-xs text-slate-500">{t('hr.prorated_base')}: <span className="font-mono font-semibold">{fmt(slipProrated(editing))}</span></div>
            <Field label={t('hr.bonus')}><input type="number" min={0} step="0.01" className="input w-full" value={editing.bonus} onChange={(e) => setEditing({ ...editing, bonus: Number(e.target.value) })} /></Field>
            <Field label={t('hr.penalties')}><input type="number" min={0} step="0.01" className="input w-full" value={editing.penalties ?? 0} onChange={(e) => setEditing({ ...editing, penalties: Number(e.target.value) })} /></Field>
            <Field label={t('hr.deductions')}><input type="number" min={0} step="0.01" className="input w-full" value={editing.deductions} onChange={(e) => setEditing({ ...editing, deductions: Number(e.target.value) })} /></Field>
            <Field label={t('common.notes')}><textarea className="input w-full" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <div className="bg-slate-50 rounded-lg p-2 text-sm flex justify-between">
              <span>{t('hr.net_amount')}</span>
              <span className="font-mono font-bold">{fmt(slipNetPreview(editing))}</span>
            </div>
            <button onClick={saveEdit} className="w-full bg-pharma-600 hover:bg-pharma-700 text-white font-medium py-2 rounded-lg">{t('common.save')}</button>
          </div>
        </Modal>
      )}

      {printing != null && <PayslipPrintModal slipId={printing} onClose={() => setPrinting(null)} />}
    </div>
  )
}

type SellerRow = {
  seller_id: number
  username: string | null
  seller_name_en: string | null
  seller_name_ar: string | null
  seller_role: string | null
  invoices: number
  revenue: number
  avg_ticket: number
  items_sold: number
  by_type: Record<string, number>
}

function PerformanceTab() {
  const { t } = useTranslation()
  const start = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })()
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<SellerRow[]>([])
  const [totals, setTotals] = useState<{ invoices: number; revenue: number; items_sold: number; sellers: number; by_type: Record<string, number> }>({ invoices: 0, revenue: 0, items_sold: 0, sellers: 0, by_type: {} })
  const typeLabel = (k: string) => t(`payment.${k}_sale`, k.charAt(0).toUpperCase() + k.slice(1))
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/hr/performance', { params: { date_from: from, date_to: to } })
      setRows(data.rows); setTotals(data.totals)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [from, to])

  const max = Math.max(1, ...rows.map(r => r.revenue))

  const filter = useQuickFilter(rows, [
    (r) => i18n.language === 'ar' ? r.seller_name_ar : r.seller_name_en, (r) => r.seller_name_en,
    (r) => r.seller_name_ar, (r) => r.username, (r) => r.seller_role,
  ])
  const accessors = useMemo(() => ({
    seller: (r: SellerRow) => (i18n.language === 'ar' ? r.seller_name_ar : r.seller_name_en) || r.username || `#${r.seller_id}`,
    invoices: (r: SellerRow) => Number(r.invoices || 0),
    items: (r: SellerRow) => Number(r.items_sold || 0),
    avg_ticket: (r: SellerRow) => Number(r.avg_ticket || 0),
    revenue: (r: SellerRow) => Number(r.revenue || 0),
  }), [])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <Field label={t('hr.date_from')}>
          <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        </Field>
        <Field label={t('hr.date_to')}>
          <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        </Field>
        <div className="ms-auto grid grid-cols-3 gap-3">
          <PerfStat label={t('hr.perf_invoices')} value={totals.invoices.toLocaleString()} />
          <PerfStat label={t('hr.perf_items')} value={totals.items_sold.toLocaleString()} />
          <PerfStat label={t('hr.perf_revenue')} value={fmt(totals.revenue)} />
        </div>
        {Object.keys(totals.by_type || {}).length > 0 && (
          <div className="w-full flex flex-wrap gap-2 pt-1">
            {Object.entries(totals.by_type).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <span key={k} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                {typeLabel(k)}: <span className="font-mono font-semibold text-slate-800">{fmt(v)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <TableFilter value={filter.query} onChange={filter.setQuery} placeholder={t('common.filter_placeholder') as string} className="max-w-xs" />
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-center w-12">#</th>
              <SortTh k="seller" sort={sort} onToggle={toggle} align="start">{t('hr.perf_seller')}</SortTh>
              <SortTh k="invoices" sort={sort} onToggle={toggle} align="end">{t('hr.perf_invoices')}</SortTh>
              <SortTh k="items" sort={sort} onToggle={toggle} align="end">{t('hr.perf_items')}</SortTh>
              <SortTh k="avg_ticket" sort={sort} onToggle={toggle} align="end">{t('hr.perf_avg_ticket')}</SortTh>
              <SortTh k="revenue" sort={sort} onToggle={toggle} align="end">{t('hr.perf_revenue')}</SortTh>
              <th className="px-3 py-2.5 text-start">{t('hr.perf_by_type')}</th>
              <th className="px-3 py-2.5 text-start w-1/5">{t('hr.perf_share')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400">…</td></tr>}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('hr.no_sales_in_range')}</td></tr>
            )}
            {sorted.map((r, idx) => {
              const name = (i18n.language === 'ar' ? r.seller_name_ar : r.seller_name_en) || r.username || `#${r.seller_id}`
              const pct = (r.revenue / max) * 100
              return (
                <tr key={r.seller_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 text-center">
                    {idx === 0 ? <span title={t('hr.perf_top') as string}>👑</span> : <span className="text-slate-400">{idx + 1}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{name}</div>
                    {r.seller_role && <div className="text-[11px] text-slate-400 capitalize">{r.seller_role}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-end font-mono">{r.invoices.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-end font-mono">{r.items_sold.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-end font-mono">{fmt(r.avg_ticket)}</td>
                  <td className="px-3 py-2.5 text-end font-mono font-semibold">{fmt(r.revenue)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.by_type || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                        <span key={k} className="text-[10px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">
                          {typeLabel(k)} <span className="font-mono text-slate-700">{fmt(v)}</span>
                        </span>
                      ))}
                      {Object.keys(r.by_type || {}).length === 0 && <span className="text-[10px] text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-pharma-500 to-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PerfStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 text-end">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-bold text-slate-800 text-base">{value}</div>
    </div>
  )
}

function PayslipPrintModal({ slipId, onClose }: { slipId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [data, setData] = useState<PayslipDetail | null>(null)
  const [profile, setProfile] = useState<{ name_en?: string; name_ar?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [slipRes, profRes] = await Promise.all([
          api.get(`/hr/payroll/${slipId}/payslip`),
          api.get('/settings/profile').catch(() => ({ data: null })),
        ])
        setData(slipRes.data)
        setProfile(profRes.data)
      } finally {
        setLoading(false)
      }
    })()
  }, [slipId])

  const pharmaName = (lang === 'ar' ? profile?.name_ar : profile?.name_en) || t('app_name')
  const branchName = data?.employee
    ? (lang === 'ar' ? data.employee.branch_name_ar : data.employee.branch_name_en) || '—'
    : '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .payslip-print, .payslip-print * { visibility: visible !important; }
          .payslip-print {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 12mm; background: white;
          }
          .no-print-payslip { display: none !important; }
        }
      `}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="no-print-payslip flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-bold text-lg">{t('hr.payslip_title')}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!data}
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              <Printer size={14} /> {t('hr.print_payslip')}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
          </div>
        </div>
        <div className="p-5">
          {loading && <div className="text-center py-10 text-slate-500">{t('common.loading')}</div>}
          {!loading && data && (
            <div className="payslip-print text-sm text-slate-800 space-y-4">
              <div className="text-center border-b border-slate-200 pb-3">
                <h1 className="text-xl font-bold text-pharma-800">{pharmaName}</h1>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{t('hr.payslip_title')}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span className="text-slate-500">{t('hr.employee')}:</span> <span className="font-semibold">{data.employee.name}</span></div>
                <div><span className="text-slate-500">{t('hr.role')}:</span> <span>{data.employee.role || '—'}</span></div>
                <div><span className="text-slate-500">{t('hr.branch')}:</span> <span>{branchName}</span></div>
                <div><span className="text-slate-500">{t('hr.national_id')}:</span> <span className="font-mono">{data.employee.national_id || '—'}</span></div>
                <div><span className="text-slate-500">{t('hr.phone')}:</span> <span className="font-mono">{data.employee.phone || '—'}</span></div>
                <div><span className="text-slate-500">{t('hr.hire_date')}:</span> <span>{data.employee.hire_date || '—'}</span></div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="font-semibold text-slate-700 mb-2">{t('hr.payslip_period')}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">{t('hr.period_month')}:</span> <span className="font-semibold">{fmtPeriod(data.period_month)}</span></div>
                  <div><span className="text-slate-500">{t('hr.payslip_period_range')}:</span> <span className="font-mono">{data.period_start} → {data.period_end}</span></div>
                  <div><span className="text-slate-500">{t('hr.status')}:</span> <span>{t(`hr.slip_${data.status}`)}</span></div>
                  {data.paid_at && (
                    <div><span className="text-slate-500">{t('hr.paid_at')}:</span> <span className="font-mono">{String(data.paid_at).slice(0, 16).replace('T', ' ')}</span></div>
                  )}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700 mb-2">{t('hr.payslip_attendance')}</div>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('hr.payslip_metric')}</th>
                      <th className="px-3 py-2 text-end">{t('hr.payslip_value')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.standard_working_days')}</td><td className="px-3 py-2 text-end font-mono">{data.attendance.standard_days}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.standard_hours')}</td><td className="px-3 py-2 text-end font-mono">{data.attendance.standard_hours}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.days_worked')}</td><td className="px-3 py-2 text-end font-mono font-semibold">{data.attendance.days_worked}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.hours')}</td><td className="px-3 py-2 text-end font-mono font-semibold">{data.attendance.hours_worked}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.absent_days')}</td><td className="px-3 py-2 text-end font-mono text-red-600">{data.attendance.absent_days}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.leave_days')}</td><td className="px-3 py-2 text-end font-mono text-amber-700">{data.attendance.leave_days}</td></tr>
                  </tbody>
                </table>
              </div>

              <div>
                <div className="font-semibold text-slate-700 mb-2">{t('hr.payslip_earnings_deductions')}</div>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('hr.payslip_item')}</th>
                      <th className="px-3 py-2 text-end">{t('hr.payslip_amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.base_salary')}</td><td className="px-3 py-2 text-end font-mono">{fmt(data.earnings.base_salary)}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">{t('hr.prorated_base')}</td><td className="px-3 py-2 text-end font-mono font-semibold">{fmt(data.earnings.prorated_base)}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2 text-emerald-700">{t('hr.bonus')}</td><td className="px-3 py-2 text-end font-mono text-emerald-700">+ {fmt(data.earnings.bonus)}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2 text-orange-700">{t('hr.penalties')}</td><td className="px-3 py-2 text-end font-mono text-orange-700">− {fmt(data.deductions_detail.penalties)}</td></tr>
                    <tr className="border-t"><td className="px-3 py-2 text-red-700">{t('hr.deductions')}</td><td className="px-3 py-2 text-end font-mono text-red-700">− {fmt(data.deductions_detail.other_deductions)}</td></tr>
                    <tr className="border-t bg-pharma-50"><td className="px-3 py-2 font-bold">{t('hr.net_amount')}</td><td className="px-3 py-2 text-end font-mono font-bold text-pharma-800 text-base">{fmt(data.net_amount)}</td></tr>
                  </tbody>
                </table>
              </div>

              {data.notes && (
                <div className="text-xs border-t pt-2">
                  <span className="text-slate-500">{t('common.notes')}:</span> {data.notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
