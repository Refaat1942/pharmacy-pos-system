import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users as UsersIcon, Building2, Plus, KeyRound, Pencil, X, ShieldAlert, Receipt, Upload, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

interface UserRow {
  id: number
  username: string
  name_ar: string
  name_en: string
  role: string
  branch_id: number | null
  salary: number | null
  status: string
  branch_name_en: string | null
  branch_name_ar: string | null
}

interface BranchRow {
  id: number
  name_ar: string
  name_en: string
  address: string | null
  phone: string | null
  user_count: number
  product_count: number
}

const ROLES = ['admin', 'pharmacist', 'assistant', 'cashier']

const roleClass: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  pharmacist: 'bg-blue-100 text-blue-700 border-blue-200',
  assistant: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cashier: 'bg-amber-100 text-amber-700 border-amber-200',
}

export default function Settings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<'users' | 'branches' | 'pharmacy'>('users')

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
        </div>

        {tab === 'users' && <UsersTab />}
        {tab === 'branches' && <BranchesTab />}
        {tab === 'pharmacy' && <PharmacyTab />}
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
  const [users, setUsers] = useState<UserRow[]>([])
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [pwUser, setPwUser] = useState<UserRow | null>(null)

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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">{t('settings.user_list')} ({users.length})</h2>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm"
        >
          <Plus size={15} /> {t('settings.add_user')}
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start">{t('settings.username')}</th>
                <th className="px-4 py-2.5 text-start">{t('settings.name')}</th>
                <th className="px-4 py-2.5 text-start">{t('settings.role')}</th>
                <th className="px-4 py-2.5 text-start">{t('settings.branch')}</th>
                <th className="px-4 py-2.5 text-end">{t('settings.salary')}</th>
                <th className="px-4 py-2.5 text-start">{t('settings.status')}</th>
                <th className="px-4 py-2.5 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
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
    </div>
  )
}

function UserModal({ user, branches, onClose, onSaved }: {
  user?: UserRow; branches: BranchRow[]; onClose: () => void; onSaved: () => void
}) {
  const { t } = useTranslation()
  const isEdit = !!user
  const [form, setForm] = useState({
    username: user?.username || '',
    name_en: user?.name_en || '',
    name_ar: user?.name_ar || '',
    role: user?.role || 'cashier',
    branch_id: user?.branch_id || null as number | null,
    salary: user?.salary?.toString() || '',
    status: user?.status || 'active',
    password: '',
  })
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{isEdit ? t('settings.edit_user') : t('settings.add_user')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
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
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input w-full">
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
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BranchRow | null>(null)
  const [creating, setCreating] = useState(false)

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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">{t('settings.branch_list')} ({branches.length})</h2>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm"
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
                  <button onClick={() => setEditing(b)} className="p-1.5 text-pharma-600 hover:bg-pharma-50 rounded-md">
                    <Pencil size={14} />
                  </button>
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
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input w-full" />
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
}

const EMPTY_PROFILE: PharmacyProfile = {
  name_ar: '', name_en: '', address_ar: '', address_en: '',
  phone: '', tax_id: '', logo_data_url: '',
  receipt_header_ar: '', receipt_header_en: '',
  receipt_footer_ar: 'شكراً لزيارتكم', receipt_footer_en: 'Thank you for your visit',
  receipt_language: 'auto', receipt_paper: '80mm', receipt_accent: '#0EA5E9',
  show_logo: true, show_tax_id: true, show_seller: true, show_customer: true,
  show_sale_type: true, show_branch: true, show_date: true, show_time: true, show_barcode: true,
  shift_morning_start: '06:00', shift_evening_start: '14:00', shift_night_start: '22:00',
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
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={p.phone} onChange={(e) => set('phone', e.target.value)} />
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
    </div>
  )
}
