import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from '../components/DataTable'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Users as UsersIcon, Building2, Plus, KeyRound, Pencil, X, ShieldAlert, Receipt, Upload, Trash2, RotateCcw, Printer, BookOpen, Download } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import PhoneField from '../components/PhoneField'
import { isValidPhone } from '../lib/phone'
import CopyrightNotice from '../components/CopyrightNotice'
import PosQuickItemsSettings from '../components/PosQuickItemsSettings'

interface UserRow {
  id: number
  username: string
  name_ar: string
  name_en: string
  role: string
  branch_id: number | null
  salary: number | null
  status: string
  permissions: string[] | null
  branch_name_en: string | null
  branch_name_ar: string | null
  is_delivery?: boolean
}

const ALL_FEATURES = [
  'dashboard', 'pos', 'sales', 'returns', 'inventory', 'transfers', 'branches_stock',
  'expiry', 'purchases', 'customers', 'suppliers', 'reports', 'shifts', 'hr',
  'hr_employees', 'hr_attendance', 'hr_payroll', 'hr_performance',
] as const

const HR_SUB_FEATURES = ['hr_employees', 'hr_attendance', 'hr_payroll', 'hr_performance'] as const
const CORE_FEATURES = ALL_FEATURES.filter((f) => f !== 'hr' && !HR_SUB_FEATURES.includes(f as typeof HR_SUB_FEATURES[number]))

const BRANCH_ROLE_FEATURES = new Set(['pos', 'sales', 'returns', 'expiry', 'shifts', 'hr', 'transfers', 'branches_stock'])

interface BranchRow {
  id: number
  name_ar: string
  name_en: string
  address: string | null
  phone: string | null
  user_count: number
  product_count: number
}

const ROLES = ['admin', 'pharmacist', 'assistant', 'cashier', 'delivery', 'branch']

const roleClass: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  pharmacist: 'bg-blue-100 text-blue-700 border-blue-200',
  assistant: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cashier: 'bg-amber-100 text-amber-700 border-amber-200',
  delivery: 'bg-teal-100 text-teal-700 border-teal-200',
  branch: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function Settings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<'users' | 'branches' | 'pharmacy' | 'manual'>('users')

  if (user?.role !== 'admin') {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <ShieldAlert size={48} className="mb-3 text-red-400" />
          <p className="text-lg font-medium">{t('settings.admin_only')}</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-xl mx-auto w-full">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-800">{t('settings.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('settings.subtitle')}</p>
        </div>

        <div className="flex border-b border-slate-200 mb-5">
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<UsersIcon size={15} />} label={t('settings.users')} />
          <TabButton active={tab === 'branches'} onClick={() => setTab('branches')} icon={<Building2 size={15} />} label={t('settings.branches')} />
          <TabButton active={tab === 'pharmacy'} onClick={() => setTab('pharmacy')} icon={<Receipt size={15} />} label={t('settings.pharmacy')} />
          <TabButton active={tab === 'manual'} onClick={() => setTab('manual')} icon={<BookOpen size={15} />} label={t('settings.manual_tab')} />
        </div>

        {tab === 'users' && <UsersTab />}
        {tab === 'branches' && <BranchesTab />}
        {tab === 'pharmacy' && <PharmacyTab />}
        {tab === 'manual' && <ManualTab />}
      </div>
    </Layout>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-pharma-600 text-pharma-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ---------------- Users Tab ----------------

function UsersTab() {
  const { t } = useTranslation()
  const { user: me, tenant } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [pwUser, setPwUser] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [u, b] = await Promise.all([
        api.get('/settings/users'),
        api.get('/settings/branches'),
      ])
      setUsers(u.data)
      setBranches(b.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const userAccessors = useMemo(() => ({
    username: (u: UserRow) => u.username || '',
    name: (u: UserRow) => (i18n.language === 'ar' ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.username,
    role: (u: UserRow) => u.role || '',
    branch: (u: UserRow) => (i18n.language === 'ar' ? u.branch_name_ar : u.branch_name_en) || '',
    salary: (u: UserRow) => u.salary == null ? null : Number(u.salary),
    status: (u: UserRow) => u.status || '',
  }), [])
  const { sorted: sortedUsers, sort: userSort, toggle: userToggle } = useSort(users, userAccessors)

  const activeUsers = users.filter((u) => u.status === 'active').length
  const maxUsers = tenant?.limits?.max_users
  const atUserCap = maxUsers != null && activeUsers >= maxUsers

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{t('settings.user_list')} ({activeUsers}{maxUsers != null ? ` / ${maxUsers}` : ''})</h2>
          {maxUsers != null && (
            <p className="text-xs text-slate-500 mt-0.5">
              {atUserCap ? t('settings.user_limit_reached', 'User limit reached for your plan.') : t('settings.user_limit_hint', 'Plan allows up to {{max}} users.', { max: maxUsers })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/settings/login-cards', '_blank')}
            className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            <Printer size={15} /> {t('settings.login_cards')}
          </button>
          <button
            onClick={() => setCreating(true)}
            disabled={atUserCap}
            title={atUserCap ? t('settings.user_limit_reached', 'User limit reached for your plan.') as string : undefined}
            className="flex items-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm"
          >
            <Plus size={15} /> {t('settings.add_user')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="username" sort={userSort} onToggle={userToggle} align="start" className="px-4 py-2.5">{t('settings.username')}</SortTh>
                <SortTh k="name" sort={userSort} onToggle={userToggle} align="start" className="px-4 py-2.5">{t('settings.name')}</SortTh>
                <SortTh k="role" sort={userSort} onToggle={userToggle} align="start" className="px-4 py-2.5">{t('settings.role')}</SortTh>
                <SortTh k="branch" sort={userSort} onToggle={userToggle} align="start" className="px-4 py-2.5">{t('settings.branch')}</SortTh>
                <SortTh k="salary" sort={userSort} onToggle={userToggle} align="end" className="px-4 py-2.5">{t('settings.salary')}</SortTh>
                <SortTh k="status" sort={userSort} onToggle={userToggle} align="start" className="px-4 py-2.5">{t('settings.status')}</SortTh>
                <th className="px-4 py-2.5 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((u) => {
                const name = (i18n.language === 'ar' ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.username
                const branch = i18n.language === 'ar' ? u.branch_name_ar : u.branch_name_en
                return (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{u.username}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold border ${roleClass[u.role] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {t(`settings.role_${u.role}`, u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{branch || '—'}</td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums">{u.salary != null ? Number(u.salary).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${
                        u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t(`settings.status_${u.status}`, u.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap">
                      <button onClick={() => setPwUser(u)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md" title={t('settings.reset_password')}>
                        <KeyRound size={14} />
                      </button>
                      <button onClick={() => setEditing(u)} className="p-1.5 text-pharma-600 hover:bg-pharma-50 rounded-md ms-1" title={t('common.edit')}>
                        <Pencil size={14} />
                      </button>
                      {me?.id !== u.id && (
                        <button onClick={() => setDeleting(u)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md ms-1" title={t('common.delete')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <UserModal branches={branches} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
      )}
      {editing && (
        <UserModal user={editing} branches={branches} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
      {pwUser && (
        <PasswordModal user={pwUser} onClose={() => setPwUser(null)} onSaved={() => setPwUser(null)} />
      )}
      {deleting && (
        <DangerDeleteModal
          title={t('settings.delete_user_title')}
          warningLines={[
            t('settings.delete_user_warn1', { username: deleting.username }),
            t('settings.delete_user_warn2'),
          ]}
          confirmWord={deleting.username}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const r = await api.delete(`/settings/users/${deleting.id}`)
            setDeleting(null); load()
            if (r?.data?.deactivated) alert(r.data.message)
          }}
        />
      )}
    </div>
  )
}

function SettingsModal({ children, onBackdropClick }: { children: React.ReactNode; onBackdropClick?: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center p-4 sm:items-center overflow-y-auto overscroll-contain"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdropClick?.()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

function UserModal({ user, branches, onClose, onSaved }: {
  user?: UserRow; branches: BranchRow[]; onClose: () => void; onSaved: () => void
}) {
  const { t } = useTranslation()
  const isEdit = !!user

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  const [form, setForm] = useState({
    username: user?.username || '',
    name_en: user?.name_en || '',
    name_ar: user?.name_ar || '',
    role: user?.role || 'cashier',
    branch_id: user?.branch_id || null as number | null,
    salary: user?.salary?.toString() || '',
    status: user?.status || 'active',
    password: '',
    is_delivery: user?.is_delivery ?? user?.role === 'delivery',
  })
  const [customPerms, setCustomPerms] = useState<boolean>(Array.isArray(user?.permissions))
  const [perms, setPerms] = useState<Set<string>>(
    new Set(Array.isArray(user?.permissions) ? (user!.permissions as string[]) : [])
  )
  const togglePerm = (f: string) => {
    setPerms((prev) => {
      const n = new Set(prev)
      if (n.has(f)) {
        n.delete(f)
        if (f === 'hr') HR_SUB_FEATURES.forEach((s) => n.delete(s))
        if ((HR_SUB_FEATURES as readonly string[]).includes(f) && !HR_SUB_FEATURES.some((s) => n.has(s))) {
          n.delete('hr')
        }
      } else {
        n.add(f)
        if (f === 'hr' || (HR_SUB_FEATURES as readonly string[]).includes(f)) {
          n.add('hr')
        }
      }
      return n
    })
  }
  const showPerms = form.role !== 'admin'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const payload: any = {
        name_en: form.name_en,
        name_ar: form.name_ar,
        role: form.role,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        salary: form.salary ? Number(form.salary) : null,
        is_delivery: form.is_delivery || form.role === 'delivery',
      }
      if (form.role !== 'admin') {
        payload.permissions = customPerms ? Array.from(perms) : null
      } else {
        payload.permissions = null
      }
      if (isEdit) {
        payload.status = form.status
        await api.put(`/settings/users/${user!.id}`, payload)
      } else {
        payload.username = form.username
        payload.password = form.password
        await api.post('/settings/users', payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsModal onBackdropClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[min(90vh,calc(100dvh-2rem))] shrink-0 my-2 sm:my-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-800">{isEdit ? t('settings.edit_user') : t('settings.add_user')}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {!isEdit && (
            <Field label={t('settings.username')}>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input w-full" autoFocus />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.name_en')}>
              <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="input w-full" />
            </Field>
            <Field label={t('settings.name_ar')}>
              <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input w-full" dir="rtl" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.role')}>
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value
                  setForm({
                    ...form,
                    role,
                    is_delivery: role === 'delivery' ? true : form.is_delivery,
                  })
                }}
                className="input w-full"
              >
                {ROLES.map((r) => <option key={r} value={r}>{t(`settings.role_${r}`, r)}</option>)}
              </select>
            </Field>
            <Field label={t('settings.branch')}>
              <select
                value={form.branch_id ?? ''}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value ? Number(e.target.value) : null })}
                className="input w-full"
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{i18n.language === 'ar' ? b.name_ar : b.name_en}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.salary')}>
              <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="input w-full" />
            </Field>
            {isEdit && (
              <Field label={t('settings.status')}>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input w-full">
                  <option value="active">{t('settings.status_active')}</option>
                  <option value="inactive">{t('settings.status_inactive')}</option>
                </select>
              </Field>
            )}
          </div>
          {!isEdit && (
            <Field label={t('settings.password')}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input w-full" autoComplete="new-password" />
            </Field>
          )}
          {form.role !== 'admin' && (
            <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-teal-200 bg-teal-50/80 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_delivery || form.role === 'delivery'}
                disabled={form.role === 'delivery'}
                onChange={(e) => setForm({ ...form, is_delivery: e.target.checked })}
                className="mt-1 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
              />
              <span>
                <span className="block text-sm font-semibold text-teal-900">
                  {t('settings.is_delivery')}
                </span>
                <span className="block text-xs text-teal-700 mt-0.5">
                  {t('settings.is_delivery_hint')}
                </span>
              </span>
            </label>
          )}
          {showPerms && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customPerms}
                  onChange={(e) => setCustomPerms(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-slate-700">{t('settings.custom_permissions')}</span>
              </label>
              <p className="text-xs text-slate-500 mt-1 mb-2">
                {customPerms ? t('settings.custom_permissions_on_hint') : t('settings.custom_permissions_off_hint')}
              </p>
              {customPerms && (
                <div className="space-y-3 mt-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {CORE_FEATURES.map((f) => {
                      const isBranchRole = form.role === 'branch'
                      const blocked = isBranchRole && !BRANCH_ROLE_FEATURES.has(f)
                      return (
                        <label key={f} className={`flex items-center gap-2 px-2 py-1 rounded ${blocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={perms.has(f) && !blocked}
                            disabled={blocked}
                            onChange={() => togglePerm(f)}
                            className="rounded"
                          />
                          <span className="text-sm text-slate-700">{t(`nav.${f}`)}</span>
                        </label>
                      )
                    })}
                  </div>
                  <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-3">
                    <label className={`flex items-center gap-2 px-1 py-1 rounded cursor-pointer ${form.role === 'branch' && !BRANCH_ROLE_FEATURES.has('hr') ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/60'}`}>
                      <input
                        type="checkbox"
                        checked={perms.has('hr')}
                        disabled={form.role === 'branch' && !BRANCH_ROLE_FEATURES.has('hr')}
                        onChange={() => togglePerm('hr')}
                        className="rounded"
                      />
                      <span className="text-sm font-semibold text-violet-900">{t('nav.hr')}</span>
                    </label>
                    <p className="text-[11px] text-violet-700 mt-1 mb-2 ps-6">{t('settings.hr_tabs_hint')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ps-4 border-s border-violet-200">
                      {HR_SUB_FEATURES.map((f) => (
                        <label key={f} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={perms.has(f)}
                            disabled={form.role === 'branch' && !BRANCH_ROLE_FEATURES.has('hr')}
                            onChange={() => togglePerm(f)}
                            className="rounded"
                          />
                          <span className="text-sm text-violet-900">{t(`nav.${f}`)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2 shrink-0 bg-white rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </SettingsModal>
  )
}

function PasswordModal({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (pw.length < 4) { setError(t('settings.password_too_short')); return }
    setSaving(true); setError(null)
    try {
      await api.put(`/settings/users/${user.id}/password`, { password: pw })
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{t('settings.reset_password')} — {user.username}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label={t('settings.new_password')}>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="input w-full" autoFocus autoComplete="new-password" />
          </Field>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('settings.reset_password')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Branches Tab ----------------

function BranchesTab() {
  const { t } = useTranslation()
  const { tenant } = useAuth()
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BranchRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<BranchRow | null>(null)
  const [resetting, setResetting] = useState<BranchRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/settings/branches')
      setBranches(r.data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const maxBranches = tenant?.limits?.max_branches
  const atBranchCap = maxBranches != null && branches.length >= maxBranches

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{t('settings.branch_list')} ({branches.length}{maxBranches != null ? ` / ${maxBranches}` : ''})</h2>
          {maxBranches != null && (
            <p className="text-xs text-slate-500 mt-0.5">
              {atBranchCap ? t('settings.branch_limit_reached', 'Branch limit reached for your plan.') : t('settings.branch_limit_hint', 'Plan allows up to {{max}} branches.', { max: maxBranches })}
            </p>
          )}
        </div>
        <button
          onClick={() => setCreating(true)}
          disabled={atBranchCap}
          title={atBranchCap ? t('settings.branch_limit_reached', 'Branch limit reached for your plan.') as string : undefined}
          className="flex items-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm"
        >
          <Plus size={15} /> {t('settings.add_branch')}
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
          {branches.map((b) => {
            const name = i18n.language === 'ar' ? b.name_ar : b.name_en
            return (
              <div key={b.id} className="border border-slate-200 rounded-xl p-4 hover:border-pharma-300 hover:shadow-md transition-all bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-pharma-100 p-2 rounded-lg">
                      <Building2 size={18} className="text-pharma-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 leading-tight">{name}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">ID #{b.id}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(b)} className="p-1.5 text-pharma-600 hover:bg-pharma-50 rounded-md">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setResetting(b)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md" title={t('settings.reset_branch') as string}>
                      <RotateCcw size={14} />
                    </button>
                    <button onClick={() => setDeleting(b)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {b.address && <p className="text-xs text-slate-500 mt-1">{b.address}</p>}
                {b.phone && <p className="text-xs text-slate-500 font-mono">{b.phone}</p>}
                <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
                  <span><b className="text-slate-800">{b.user_count}</b> {t('settings.users_count')}</span>
                  <span><b className="text-slate-800">{b.product_count}</b> {t('settings.products_count')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && <BranchModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {editing && <BranchModal branch={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {resetting && (
        <ResetBranchModal
          branch={resetting}
          onClose={() => setResetting(null)}
          onDone={() => { setResetting(null); load() }}
        />
      )}
      {deleting && (
        <DangerDeleteModal
          title={t('settings.delete_branch_title')}
          warningLines={[
            t('settings.delete_branch_warn1', { name: i18n.language === 'ar' ? deleting.name_ar : deleting.name_en }),
            t('settings.delete_branch_warn2'),
          ]}
          confirmWord={(i18n.language === 'ar' ? deleting.name_ar : deleting.name_en) || deleting.name_en}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.delete(`/settings/branches/${deleting.id}`)
            setDeleting(null); load()
          }}
        />
      )}
    </div>
  )
}

function DangerDeleteModal({ title, warningLines, confirmWord, onClose, onConfirm }: {
  title: string
  warningLines: string[]
  confirmWord: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = typed.trim() === confirmWord.trim()
  const run = async () => {
    if (!ok) return
    setBusy(true); setError(null)
    try { await onConfirm() }
    catch (e: any) { setError(e?.response?.data?.detail || 'Error'); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border-2 border-red-300">
        <div className="px-5 py-3 border-b border-red-200 flex items-center justify-between bg-red-50">
          <h3 className="font-bold text-red-700 flex items-center gap-2"><ShieldAlert size={18} /> {title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-red-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
            {warningLines.map((l, i) => (
              <p key={i} className="text-sm text-red-800 leading-relaxed">{l}</p>
            ))}
          </div>
          <Field label={t('settings.type_to_confirm', { word: confirmWord })}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input w-full font-mono" autoFocus placeholder={confirmWord} />
          </Field>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-300 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={run} disabled={!ok || busy} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? t('common.saving') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetBranchModal({ branch, onClose, onDone }: { branch: BranchRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const lang = i18n.language
  const branchName = lang === 'ar' ? (branch.name_ar || branch.name_en) : (branch.name_en || branch.name_ar)
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const confirmWord = branchName
  const ok = typed.trim() === confirmWord.trim() && password.length > 0
  const run = async () => {
    if (!ok) return
    setBusy(true); setError(null)
    try {
      const { data } = await api.post('/inventory/clear-branch-history', { branch_id: branch.id, password })
      setResult(data)
      setTimeout(() => { onDone() }, 1800)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border-2 border-amber-300">
        <div className="px-5 py-3 border-b border-amber-200 flex items-center justify-between bg-amber-50">
          <h3 className="font-bold text-amber-700 flex items-center gap-2"><RotateCcw size={18} /> {t('settings.reset_branch_title')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-amber-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {!result ? (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                <p className="text-sm text-amber-900 font-semibold">{t('settings.reset_branch_warn1', { name: branchName })}</p>
                <p className="text-xs text-amber-800">{t('settings.reset_branch_warn2')}</p>
                <ul className="text-xs text-amber-800 list-disc list-inside ms-1 space-y-0.5">
                  <li>{t('settings.reset_branch_li_invoices')}</li>
                  <li>{t('settings.reset_branch_li_movements')}</li>
                  <li>{t('settings.reset_branch_li_returns')}</li>
                  <li>{t('settings.reset_branch_li_transfers')}</li>
                  <li>{t('settings.reset_branch_li_stock')}</li>
                </ul>
                <p className="text-xs text-amber-900 font-semibold mt-1">{t('settings.reset_branch_warn3')}</p>
              </div>
              <Field label={t('settings.type_to_confirm', { word: confirmWord })}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input w-full font-mono" autoFocus placeholder={confirmWord} />
              </Field>
              <Field label={t('settings.reset_branch_password')}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input w-full" placeholder="••••••••" />
              </Field>
              {error && <div className="text-sm text-red-700 bg-red-50 border border-red-300 rounded-lg p-2">{error}</div>}
            </>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 space-y-1">
              <p className="font-semibold">{t('settings.reset_branch_done')}</p>
              <p className="text-xs">{t('settings.reset_branch_summary', { i: result.deleted_invoices, m: result.deleted_movements, t: result.deleted_transfers ?? 0, p: result.reset_products })}</p>
            </div>
          )}
        </div>
        {!result && (
          <div className="px-5 py-3 border-t flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
            <button onClick={run} disabled={!ok || busy} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? t('common.saving') : t('settings.reset_branch_confirm')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function BranchModal({ branch, onClose, onSaved }: { branch?: BranchRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const isEdit = !!branch
  const [form, setForm] = useState({
    name_en: branch?.name_en || '',
    name_ar: branch?.name_ar || '',
    address: branch?.address || '',
    phone: branch?.phone || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!isValidPhone(form.phone)) { setError(t('validation.phone_invalid')); return }
    setSaving(true); setError(null)
    try {
      const payload = { ...form, address: form.address || null, phone: form.phone || null }
      if (isEdit) await api.put(`/settings/branches/${branch!.id}`, payload)
      else await api.post('/settings/branches', payload)
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{isEdit ? t('settings.edit_branch') : t('settings.add_branch')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label={t('settings.name_en')}>
            <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="input w-full" autoFocus />
          </Field>
          <Field label={t('settings.name_ar')}>
            <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input w-full" dir="rtl" />
          </Field>
          <Field label={t('settings.address')}>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input w-full" />
          </Field>
          <Field label={t('settings.phone')}>
            <PhoneField value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} className="input w-full" />
          </Field>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
      {children}
    </div>
  )
}

async function downloadUserManual(lang: 'en' | 'ar') {
  const res = await api.get(`/settings/user-manual/${lang}`, { responseType: 'blob' })
  const filename = lang === 'ar' ? 'PharmaPOS_User_Manual_AR.md' : 'PharmaPOS_User_Manual_EN.md'
  const blob = new Blob([res.data], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ManualTab() {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState<'en' | 'ar' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (lang: 'en' | 'ar') => {
    setDownloading(lang)
    setError(null)
    try {
      await downloadUserManual(lang)
    } catch {
      setError(t('settings.manual_download_failed'))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-pharma-100 p-3 rounded-xl shrink-0">
          <BookOpen size={28} className="text-pharma-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('settings.manual_title')}</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{t('settings.manual_hint')}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => run('en')}
          disabled={downloading !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-pharma-200 bg-pharma-50 hover:bg-pharma-100 text-pharma-800 font-medium text-sm disabled:opacity-50"
        >
          <Download size={16} />
          {downloading === 'en' ? t('common.loading') : t('settings.manual_download_en')}
        </button>
        <button
          type="button"
          onClick={() => run('ar')}
          disabled={downloading !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-pharma-200 bg-pharma-50 hover:bg-pharma-100 text-pharma-800 font-medium text-sm disabled:opacity-50"
        >
          <Download size={16} />
          {downloading === 'ar' ? t('common.loading') : t('settings.manual_download_ar')}
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-4 leading-relaxed">{t('settings.manual_pdf_tip')}</p>

      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}
    </div>
  )
}


// ---------------- Pharmacy / Receipt Tab ----------------

interface PharmacyProfile {
  name_ar: string
  name_en: string
  address_ar: string
  address_en: string
  phone: string
  tax_id: string
  logo_data_url: string
  receipt_header_ar: string
  receipt_header_en: string
  receipt_footer_ar: string
  receipt_footer_en: string
  receipt_language: 'auto' | 'ar' | 'en'
  receipt_paper: '58mm' | '80mm' | 'A4'
  receipt_accent: string
  show_logo: boolean
  show_pharmacy_name: boolean
  show_pharmacy_name_on_labels: boolean
  show_tax_id: boolean
  show_seller: boolean
  show_customer: boolean
  show_sale_type: boolean
  show_branch: boolean
  show_date: boolean
  show_time: boolean
  show_barcode: boolean
  shift_morning_start: string
  shift_evening_start: string
  shift_night_start: string
  pos_quick_items: number[]
}

const EMPTY_PROFILE: PharmacyProfile = {
  name_ar: '', name_en: '', address_ar: '', address_en: '',
  phone: '', tax_id: '', logo_data_url: '',
  receipt_header_ar: '', receipt_header_en: '',
  receipt_footer_ar: 'شكراً لزيارتكم', receipt_footer_en: 'Thank you for your visit',
  receipt_language: 'auto', receipt_paper: '80mm', receipt_accent: '#0EA5E9',
  show_logo: true, show_pharmacy_name: true, show_pharmacy_name_on_labels: true, show_tax_id: true, show_seller: true, show_customer: true,
  show_sale_type: true, show_branch: true, show_date: true, show_time: true, show_barcode: true,
  shift_morning_start: '06:00', shift_evening_start: '14:00', shift_night_start: '22:00',
  pos_quick_items: [],
}

function PharmacyTab() {
  const { t } = useTranslation()
  const [p, setP] = useState<PharmacyProfile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    api.get<Partial<PharmacyProfile>>('/settings/profile')
      .then((r) => {
        // Backend returns times as "HH:MM:SS" — trim to "HH:MM" for the time inputs
        const d: any = { ...r.data }
        for (const k of ['shift_morning_start', 'shift_evening_start', 'shift_night_start']) {
          if (d[k] && typeof d[k] === 'string' && d[k].length >= 5) d[k] = d[k].slice(0, 5)
        }
        if (!Array.isArray(d.pos_quick_items)) d.pos_quick_items = []
        setP({ ...EMPTY_PROFILE, ...d })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof PharmacyProfile>(k: K, v: PharmacyProfile[K]) =>
    setP((prev) => ({ ...prev, [k]: v }))

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      alert(t('settings.pharma.logo_too_big'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('logo_data_url', String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!isValidPhone(p.phone)) { alert(t('validation.phone_invalid')); return }
    setSaving(true); setSavedMsg('')
    try {
      await api.put('/settings/profile', p)
      setSavedMsg(t('settings.pharma.saved'))
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-slate-500 text-sm">{t('common.loading')}</div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Form (2 cols) */}
      <div className="lg:col-span-2 space-y-5">
        {/* Branding */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Receipt size={16} /> {t('settings.pharma.branding')}
          </h3>

          {/* Logo */}
          <div className="flex items-start gap-4 mb-5">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
              {p.logo_data_url ? (
                <img src={p.logo_data_url} alt="logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400 text-center px-2">{t('settings.pharma.no_logo')}</span>
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-pharma-50 text-pharma-700 border border-pharma-200 rounded-lg text-sm font-medium cursor-pointer hover:bg-pharma-100">
                <Upload size={14} />
                {t('settings.pharma.upload_logo')}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogoChange} />
              </label>
              {p.logo_data_url && (
                <button onClick={() => set('logo_data_url', '')} className="ms-2 inline-flex items-center gap-1 px-3 py-2 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-50">
                  <Trash2 size={14} /> {t('settings.pharma.remove_logo')}
                </button>
              )}
              <p className="text-xs text-slate-400 mt-2">{t('settings.pharma.logo_hint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t('settings.pharma.name_ar')}>
              <input dir="rtl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.name_ar} onChange={(e) => set('name_ar', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.name_en')}>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.name_en} onChange={(e) => set('name_en', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.address_ar')}>
              <input dir="rtl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.address_ar} onChange={(e) => set('address_ar', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.address_en')}>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.address_en} onChange={(e) => set('address_en', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.phone')}>
              <PhoneField value={p.phone} onChange={(v) => set('phone', v)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label={t('settings.pharma.tax_id')}>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.tax_id} onChange={(e) => set('tax_id', e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Receipt design */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">{t('settings.pharma.receipt_design')}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Field label={t('settings.pharma.language')}>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.receipt_language} onChange={(e) => set('receipt_language', e.target.value as any)}>
                <option value="auto">{t('settings.pharma.lang_auto')}</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label={t('settings.pharma.paper')}>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.receipt_paper} onChange={(e) => set('receipt_paper', e.target.value as any)}>
                <option value="58mm">58 mm</option>
                <option value="80mm">80 mm</option>
                <option value="A4">A4</option>
              </select>
            </Field>
            <Field label={t('settings.pharma.accent')}>
              <div className="flex gap-2 items-center">
                <input type="color" value={p.receipt_accent} onChange={(e) => set('receipt_accent', e.target.value)} className="w-12 h-9 border border-slate-300 rounded-lg cursor-pointer" />
                <input value={p.receipt_accent} onChange={(e) => set('receipt_accent', e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Field label={t('settings.pharma.header_ar')}>
              <textarea dir="rtl" rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.receipt_header_ar} onChange={(e) => set('receipt_header_ar', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.header_en')}>
              <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.receipt_header_en} onChange={(e) => set('receipt_header_en', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.footer_ar')}>
              <textarea dir="rtl" rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.receipt_footer_ar} onChange={(e) => set('receipt_footer_ar', e.target.value)} />
            </Field>
            <Field label={t('settings.pharma.footer_en')}>
              <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.receipt_footer_en} onChange={(e) => set('receipt_footer_en', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Toggle label={t('settings.pharma.show_logo')} value={p.show_logo} onChange={(v) => set('show_logo', v)} />
            <Toggle label={t('settings.pharma.show_pharmacy_name')} value={p.show_pharmacy_name} onChange={(v) => set('show_pharmacy_name', v)} />
            <Toggle label={t('settings.pharma.show_pharmacy_name_on_labels')} value={p.show_pharmacy_name_on_labels} onChange={(v) => set('show_pharmacy_name_on_labels', v)} />
            <Toggle label={t('settings.pharma.show_tax_id')} value={p.show_tax_id} onChange={(v) => set('show_tax_id', v)} />
            <Toggle label={t('settings.pharma.show_seller')} value={p.show_seller} onChange={(v) => set('show_seller', v)} />
            <Toggle label={t('settings.pharma.show_customer')} value={p.show_customer} onChange={(v) => set('show_customer', v)} />
            <Toggle label={t('settings.pharma.show_sale_type')} value={p.show_sale_type} onChange={(v) => set('show_sale_type', v)} />
            <Toggle label={t('settings.pharma.show_branch')} value={p.show_branch} onChange={(v) => set('show_branch', v)} />
            <Toggle label={t('settings.pharma.show_date')} value={p.show_date} onChange={(v) => set('show_date', v)} />
            <Toggle label={t('settings.pharma.show_time')} value={p.show_time} onChange={(v) => set('show_time', v)} />
            <Toggle label={t('settings.pharma.show_barcode')} value={p.show_barcode} onChange={(v) => set('show_barcode', v)} />
          </div>
        </div>

        {/* Shift schedule (auto-detected on shift open) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-800 mb-1">{t('settings.pharma.shift_schedule')}</h3>
          <p className="text-xs text-slate-500 mb-3">{t('settings.pharma.shift_schedule_hint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label={t('settings.pharma.shift_morning_start')}>
              <input type="time" value={p.shift_morning_start} onChange={(e) => set('shift_morning_start', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label={t('settings.pharma.shift_evening_start')}>
              <input type="time" value={p.shift_evening_start} onChange={(e) => set('shift_evening_start', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label={t('settings.pharma.shift_night_start')}>
              <input type="time" value={p.shift_night_start} onChange={(e) => set('shift_night_start', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>
        </div>

        <PosQuickItemsSettings
          productIds={p.pos_quick_items}
          onChange={(ids) => set('pos_quick_items', ids)}
        />

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="px-5 py-2.5 bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow">
            {saving ? t('common.saving') : t('settings.pharma.save')}
          </button>
          {savedMsg && <span className="text-sm text-emerald-600 font-medium">✓ {savedMsg}</span>}
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-1">
        <div className="sticky top-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">{t('settings.pharma.preview')}</h3>
          <ReceiptPreview profile={p} />
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer p-2 border border-slate-200 rounded-lg hover:bg-slate-50">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span className="text-xs text-slate-700">{label}</span>
    </label>
  )
}

function ReceiptPreview({ profile: p }: { profile: PharmacyProfile }) {
  const lang: 'ar' | 'en' = p.receipt_language === 'auto'
    ? (i18n.language === 'ar' ? 'ar' : 'en')
    : p.receipt_language
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const name = lang === 'ar' ? (p.name_ar || p.name_en || '—') : (p.name_en || p.name_ar || '—')
  const address = lang === 'ar' ? (p.address_ar || p.address_en) : (p.address_en || p.address_ar)
  const header = lang === 'ar' ? p.receipt_header_ar : p.receipt_header_en
  const footer = lang === 'ar' ? p.receipt_footer_ar : p.receipt_footer_en
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <div dir={dir} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs" style={{ fontFamily: 'monospace' }}>
      <div className="text-center mb-3">
        {p.show_logo && p.logo_data_url && (
          <img src={p.logo_data_url} alt="" className="mx-auto mb-2 max-h-14 max-w-[120px] object-contain" />
        )}
        <div className="font-bold text-sm">{name}</div>
        {address && <div className="text-[10px] text-slate-500">{address}</div>}
        {p.phone && <div className="text-[10px] text-slate-500">{p.phone}</div>}
        {p.show_tax_id && p.tax_id && <div className="text-[10px] text-slate-500">{t('الرقم الضريبي', 'Tax ID')}: {p.tax_id}</div>}
        {header && <div className="text-[10px] text-slate-600 mt-1 whitespace-pre-line">{header}</div>}
      </div>
      <div className="border-t border-dashed border-slate-300 my-2"></div>
      <div className="flex justify-between"><span>{t('فاتورة رقم', 'Invoice #')}</span><span style={{ color: p.receipt_accent }}>INV-001</span></div>
      {p.show_seller && <div className="flex justify-between"><span>{t('البائع', 'Seller')}</span><span>Demo</span></div>}
      {p.show_customer && <div className="flex justify-between"><span>{t('العميل', 'Customer')}</span><span>—</span></div>}
      <div className="border-t border-dashed border-slate-300 my-2"></div>
      <div className="flex justify-between"><span>{t('باراسيتامول', 'Paracetamol')} × 2</span><span>50.00</span></div>
      <div className="flex justify-between"><span>{t('فيتامين سي', 'Vitamin C')} × 1</span><span>30.00</span></div>
      <div className="border-t border-dashed border-slate-300 my-2"></div>
      <div className="flex justify-between font-bold"><span>{t('الصافي', 'Net Total')}</span><span style={{ color: p.receipt_accent }}>{t('ج.م', 'EGP')} 80.00</span></div>
      <div className="text-center text-[10px] text-slate-500 mt-3 whitespace-pre-line">{footer}</div>
      <CopyrightNotice variant="short" className="text-center text-[9px] text-slate-400 mt-1" />
    </div>
  )
}
