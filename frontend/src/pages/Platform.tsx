import { useEffect, useMemo, useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Edit2, Trash2, Pause, Play, LogOut, ShieldCheck, KeyRound,
  X, ExternalLink, Building2, RefreshCw, AlertTriangle,
  CalendarClock, Sparkles,
} from 'lucide-react'
import { platformAPI, Tenant, TenantStats, PlatformAdmin, FeatureDef } from '../lib/platform'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'

const PLAN_PRESETS: Record<string, string[]> = {
  basic:      ['dashboard','pos','sales','returns','inventory','customers','shifts','settings'],
  pro:        ['dashboard','pos','sales','returns','inventory','transfers','expiry','purchases','suppliers','customers','shifts','settings'],
  enterprise: ['dashboard','pos','sales','returns','inventory','transfers','expiry','purchases','suppliers','customers','reports','shifts','hr','settings'],
  trial:      ['dashboard','pos','sales','returns','inventory','transfers','expiry','purchases','suppliers','customers','reports','shifts','hr','settings'],
  pilot:      ['dashboard','pos','sales','returns','inventory','transfers','expiry','purchases','suppliers','customers','reports','shifts','hr','settings'],
}

function daysLeft(end: string | null): number | null {
  if (!end) return null
  const d = new Date(end + 'T23:59:59')
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function ExpiryBadge({ end }: { end: string | null }) {
  if (!end) return <span className="text-slate-400 text-xs">No expiry</span>
  const dl = daysLeft(end)!
  const cls =
    dl < 0     ? 'bg-red-100 text-red-700 border-red-200'
    : dl <= 7  ? 'bg-orange-100 text-orange-700 border-orange-200'
    : dl <= 30 ? 'bg-amber-100 text-amber-700 border-amber-200'
    :            'bg-emerald-100 text-emerald-700 border-emerald-200'
  const txt = dl < 0 ? `Expired ${-dl}d ago` : dl === 0 ? 'Expires today' : `${dl}d left`
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${cls}`}>
      {txt}
    </span>
  )
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString() : '—'

export default function Platform() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [stats, setStats] = useState<Record<number, TenantStats>>({})
  const [featuresCatalog, setFeaturesCatalog] = useState<FeatureDef[]>([])
  const [featureDefaults, setFeatureDefaults] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [deleting, setDeleting] = useState<Tenant | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [migrating, setMigrating] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const meRes = await platformAPI.me()
      setAdmin(meRes.data)
      const [r, fc] = await Promise.all([
        platformAPI.listTenants(),
        platformAPI.featuresCatalog(),
      ])
      setTenants(r.data)
      setFeaturesCatalog(fc.data.features)
      setFeatureDefaults(fc.data.defaults)
      // Fetch stats in parallel
      const statResults = await Promise.allSettled(
        r.data.map((t) => platformAPI.tenantStats(t.id).then((res) => [t.id, res.data] as const))
      )
      const s: Record<number, TenantStats> = {}
      statResults.forEach((res) => {
        if (res.status === 'fulfilled') s[res.value[0]] = res.value[1]
      })
      setStats(s)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filter = useQuickFilter(tenants, [
    (tn) => tn.name,
    (tn) => tn.slug,
    (tn) => tn.plan,
    (tn) => tn.contact_name,
    (tn) => tn.contact_email,
    (tn) => tn.status,
  ])
  const accessors = useMemo(() => ({
    name: (tn: Tenant) => tn.name,
    slug: (tn: Tenant) => tn.slug,
    plan: (tn: Tenant) => tn.plan,
    subscription: (tn: Tenant) => tn.subscription_end,
    features: (tn: Tenant) => (tn.features?.length ?? featureDefaults.length),
    contact: (tn: Tenant) => tn.contact_name,
    users: (tn: Tenant) => stats[tn.id]?.users,
    products: (tn: Tenant) => stats[tn.id]?.products,
    invoices: (tn: Tenant) => stats[tn.id]?.invoices,
    status: (tn: Tenant) => tn.status,
  }), [stats, featureDefaults])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  const logout = () => {
    localStorage.removeItem('platform_token')
    localStorage.removeItem('platform_admin')
    navigate('/platform/login')
  }

  const toggleStatus = async (t: Tenant) => {
    const newStatus = t.status === 'active' ? 'suspended' : 'active'
    if (!confirm(`${newStatus === 'suspended' ? 'Suspend' : 'Activate'} "${t.name}"?`)) return
    try {
      await platformAPI.updateTenant(t.id, { status: newStatus } as any)
      await load()
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
  }

  const runMigration = async () => {
    if (!confirm('Apply latest schema to ALL tenants? (safe / idempotent)')) return
    setMigrating(true)
    try {
      const r = await platformAPI.migrateAll()
      alert(`Migration done: ${r.data.ok} succeeded, ${r.data.failed.length} failed.`)
    } catch (e: any) { alert(e?.response?.data?.detail || 'Failed') }
    finally { setMigrating(false) }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold">Control Platform</h1>
              <p className="text-xs text-white/60">Manage pharmacy customers</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-end text-sm">
              <div>{admin?.name || admin?.username}</div>
              <div className="text-xs text-white/50">{admin?.username}</div>
            </div>
            <button onClick={() => setShowPwd(true)}
              className="bg-white/10 hover:bg-white/20 p-2 rounded-lg" title="Change password">
              <KeyRound size={16} />
            </button>
            <button onClick={logout}
              className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto p-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">{error}</div>}

        {/* Stats overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard label="Total Pharmacies" value={tenants.length} icon={<Building2 size={18} />} color="indigo" />
          <StatCard label="Active" value={tenants.filter(t => t.status === 'active').length} color="emerald" />
          <StatCard label="Suspended" value={tenants.filter(t => t.status === 'suspended').length} color="amber" />
          <StatCard label="Total Invoices" value={Object.values(stats).reduce((s, x) => s + x.invoices, 0)} color="blue" />
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-800">Pharmacy Customers</h2>
          <div className="flex items-center gap-2">
            <TableFilter value={filter.query} onChange={filter.setQuery}
              placeholder="Filter results…" className="w-64" />
            <button onClick={runMigration} disabled={migrating}
              className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-sm px-3 py-2 rounded-lg">
              <RefreshCw size={14} className={migrating ? 'animate-spin' : ''} />
              Apply Schema to All
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow">
              <Plus size={14} /> New Pharmacy
            </button>
          </div>
        </div>

        {/* Tenants table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <SortTh k="name" sort={sort} onToggle={toggle} align="start" className="px-4 py-3">Pharmacy</SortTh>
                  <SortTh k="slug" sort={sort} onToggle={toggle} align="start" className="px-4 py-3">Code</SortTh>
                  <SortTh k="plan" sort={sort} onToggle={toggle} align="start" className="px-4 py-3">Plan</SortTh>
                  <SortTh k="subscription" sort={sort} onToggle={toggle} align="start" className="px-4 py-3">Subscription</SortTh>
                  <SortTh k="features" sort={sort} onToggle={toggle} align="center" className="px-4 py-3">Features</SortTh>
                  <SortTh k="contact" sort={sort} onToggle={toggle} align="start" className="px-4 py-3">Contact</SortTh>
                  <SortTh k="users" sort={sort} onToggle={toggle} align="center" className="px-4 py-3">Users</SortTh>
                  <SortTh k="products" sort={sort} onToggle={toggle} align="center" className="px-4 py-3">Products</SortTh>
                  <SortTh k="invoices" sort={sort} onToggle={toggle} align="center" className="px-4 py-3">Invoices</SortTh>
                  <SortTh k="status" sort={sort} onToggle={toggle} align="center" className="px-4 py-3">Status</SortTh>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-10 text-slate-400">No pharmacies yet. Click "New Pharmacy" to add your first customer.</td></tr>
                )}
                {sorted.map((t) => {
                  const s = stats[t.id]
                  const featCount = (t.features?.length ?? featureDefaults.length)
                  return (
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium">
                        {t.name}
                        {t.schema_name === 'public' && (
                          <span className="ms-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">default</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700">{t.slug}</td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{t.plan || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-600">
                          {t.subscription_start && <div>{t.subscription_start} → {t.subscription_end || '∞'}</div>}
                          {!t.subscription_start && t.subscription_end && <div>until {t.subscription_end}</div>}
                          {!t.subscription_start && !t.subscription_end && <div className="text-slate-400">unlimited</div>}
                          <div className="mt-1"><ExpiryBadge end={t.subscription_end} /></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-mono">
                          {featCount}/{featuresCatalog.length || 14}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {t.contact_name || t.contact_email || t.contact_phone ? (
                          <div className="text-xs">
                            <div>{t.contact_name}</div>
                            <div className="text-slate-400">{t.contact_email || t.contact_phone}</div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">{s?.users ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-mono">{s?.products ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-mono">{s?.invoices ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          t.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button onClick={() => setEditing(t)} className="text-slate-500 hover:text-indigo-700 mx-1" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => toggleStatus(t)}
                          className={`mx-1 ${t.status === 'active' ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800'}`}
                          title={t.status === 'active' ? 'Suspend' : 'Activate'}>
                          {t.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <a
                          href={`/login?slug=${t.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-indigo-700 mx-1 inline-block"
                          title="Open tenant login"
                        >
                          <ExternalLink size={14} />
                        </a>
                        {t.schema_name !== 'public' && (
                          <button onClick={() => setDeleting(t)} className="text-red-500 hover:text-red-700 mx-1" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && <CreateModal catalog={featuresCatalog} defaults={featureDefaults} onClose={() => setShowCreate(false)} onDone={load} />}
      {editing && <EditModal tenant={editing} catalog={featuresCatalog} onClose={() => setEditing(null)} onDone={load} />}
      {deleting && <DeleteModal tenant={deleting} onClose={() => setDeleting(null)} onDone={load} />}
      {showPwd && <ChangePwdModal onClose={() => setShowPwd(false)} />}
    </div>
  )
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  const colors: Record<string, string> = {
    indigo: 'from-indigo-50 to-indigo-100 text-indigo-700 border-indigo-200',
    emerald: 'from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'from-amber-50 to-amber-100 text-amber-700 border-amber-200',
    blue: 'from-blue-50 to-blue-100 text-blue-700 border-blue-200',
  }
  return (
    <div className={`bg-gradient-to-br border rounded-2xl p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
        {icon}
      </div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  )
}

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none"

function todayPlus(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function FeaturesPicker({ catalog, value, onChange }: {
  catalog: FeatureDef[]; value: string[]; onChange: (v: string[]) => void
}) {
  const toggle = (k: string) => {
    onChange(value.includes(k) ? value.filter(x => x !== k) : [...value, k])
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {catalog.map(f => {
        const on = value.includes(f.key)
        return (
          <button type="button" key={f.key} onClick={() => toggle(f.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-start transition ${
              on
                ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}>
            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
              on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
            }`}>{on ? '✓' : ''}</span>
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

function CreateModal({ catalog, defaults, onClose, onDone }: {
  catalog: FeatureDef[]; defaults: string[]; onClose: () => void; onDone: () => void
}) {
  const [form, setForm] = useState({
    slug: '', name: '', plan: 'basic',
    contact_name: '', contact_email: '', contact_phone: '', notes: '',
    admin_username: 'admin', admin_password: '',
    subscription_start: new Date().toISOString().slice(0, 10),
    subscription_end: todayPlus(12),
  })
  const [features, setFeatures] = useState<string[]>(defaults)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onPlanChange = (plan: string) => {
    setForm({ ...form, plan })
    if (PLAN_PRESETS[plan]) {
      // Only override features if user hasn't customized them; simplest = always set on plan change.
      setFeatures(PLAN_PRESETS[plan].filter(k => catalog.some(c => c.key === k)))
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await platformAPI.createTenant({
        slug: form.slug.toLowerCase().trim(),
        name: form.name,
        plan: form.plan,
        contact_name: form.contact_name || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
        notes: form.notes || undefined,
        admin_username: form.admin_username,
        admin_password: form.admin_password,
        features,
        subscription_start: form.subscription_start || null,
        subscription_end: form.subscription_end || null,
      })
      onDone()
      onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to create')
    } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title="New Pharmacy Customer" wide>
      <form onSubmit={submit} className="space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-sm">{err}</div>}

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800">
          A fresh isolated database (Postgres schema) will be created and seeded with one admin user and one default branch.
          The pharmacy will use the <strong>code</strong> below to log in.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pharmacy Code (login)" hint="lowercase letters, digits, _ or - (e.g. nilepharma)">
            <input className={inputCls + ' font-mono lowercase'} required minLength={3} maxLength={30}
              value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme-pharma" />
          </Field>
          <Field label="Pharmacy Name">
            <input className={inputCls} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Pharmacy" />
          </Field>
          <Field label="Plan" hint="Choosing a plan auto-selects its default features (you can still tweak)">
            <select className={inputCls} value={form.plan} onChange={(e) => onPlanChange(e.target.value)}>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
              <option value="trial">Trial</option>
            </select>
          </Field>
          <Field label="Contact Name"><input className={inputCls} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
          <Field label="Contact Email"><input type="email" className={inputCls} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
          <Field label="Contact Phone"><input className={inputCls} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold mb-2 text-slate-700 flex items-center gap-2">
            <CalendarClock size={16} className="text-indigo-600" /> Subscription period
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" className={inputCls}
                value={form.subscription_start}
                onChange={(e) => setForm({ ...form, subscription_start: e.target.value })} />
            </Field>
            <Field label="End date" hint="Leave empty for unlimited. Login is blocked after this date.">
              <input type="date" className={inputCls}
                value={form.subscription_end}
                onChange={(e) => setForm({ ...form, subscription_end: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 mt-2 text-xs">
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(1) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+1 month</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(3) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+3 months</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(6) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+6 months</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(12) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+1 year</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: '' })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Unlimited</button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold mb-2 text-slate-700 flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" /> Features
            <span className="text-xs font-normal text-slate-400 ms-auto">{features.length} enabled</span>
          </h3>
          <FeaturesPicker catalog={catalog} value={features} onChange={setFeatures} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold mb-3 text-slate-700">Initial admin user</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Admin Username"><input className={inputCls} required value={form.admin_username} onChange={(e) => setForm({ ...form, admin_username: e.target.value })} /></Field>
            <Field label="Admin Password" hint="Min 6 chars; share securely with the pharmacy">
              <input type="text" className={inputCls + ' font-mono'} required minLength={6}
                value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="e.g. Pharma@2026" />
            </Field>
          </div>
        </div>

        <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

        <button type="submit" disabled={busy}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg">
          {busy ? 'Provisioning…' : 'Create Pharmacy'}
        </button>
      </form>
    </Modal>
  )
}

function EditModal({ tenant, catalog, onClose, onDone }: {
  tenant: Tenant; catalog: FeatureDef[]; onClose: () => void; onDone: () => void
}) {
  const [form, setForm] = useState({
    name: tenant.name,
    plan: tenant.plan || 'basic',
    contact_name: tenant.contact_name || '',
    contact_email: tenant.contact_email || '',
    contact_phone: tenant.contact_phone || '',
    notes: tenant.notes || '',
    subscription_start: tenant.subscription_start || '',
    subscription_end: tenant.subscription_end || '',
  })
  const [features, setFeatures] = useState<string[]>(
    tenant.features ?? catalog.filter(c => c.default).map(c => c.key)
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onPlanChange = (plan: string) => {
    setForm({ ...form, plan })
    if (PLAN_PRESETS[plan]) {
      setFeatures(PLAN_PRESETS[plan].filter(k => catalog.some(c => c.key === k)))
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await platformAPI.updateTenant(tenant.id, {
        ...form,
        features,
        subscription_start: form.subscription_start || null,
        subscription_end: form.subscription_end || null,
      } as any)
      onDone(); onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed')
    } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title={`Edit — ${tenant.slug}`} wide>
      <form onSubmit={submit} className="space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-sm">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className={inputCls} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Plan" hint="Selecting a plan resets features to that plan's defaults">
            <select className={inputCls} value={form.plan} onChange={(e) => onPlanChange(e.target.value)}>
              <option value="basic">Basic</option><option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option><option value="trial">Trial</option>
              <option value="pilot">Pilot</option>
            </select>
          </Field>
          <Field label="Contact Name"><input className={inputCls} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
          <Field label="Contact Email"><input type="email" className={inputCls} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
          <Field label="Contact Phone"><input className={inputCls} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <h3 className="text-sm font-semibold mb-2 text-slate-700 flex items-center gap-2">
            <CalendarClock size={16} className="text-indigo-600" /> Subscription
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" className={inputCls}
                value={form.subscription_start}
                onChange={(e) => setForm({ ...form, subscription_start: e.target.value })} />
            </Field>
            <Field label="End date" hint="Empty = unlimited. Login is blocked after this date.">
              <input type="date" className={inputCls}
                value={form.subscription_end}
                onChange={(e) => setForm({ ...form, subscription_end: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 mt-2 text-xs flex-wrap">
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(1) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Renew +1 month</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(3) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+3 months</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(6) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+6 months</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: todayPlus(12) })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">+1 year</button>
            <button type="button" onClick={() => setForm({ ...form, subscription_end: '' })} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Unlimited</button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <h3 className="text-sm font-semibold mb-2 text-slate-700 flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" /> Features
            <span className="text-xs font-normal text-slate-400 ms-auto">{features.length} enabled</span>
          </h3>
          <FeaturesPicker catalog={catalog} value={features} onChange={setFeatures} />
        </div>

        <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg">
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </Modal>
  )
}

function DeleteModal({ tenant, onClose, onDone }: { tenant: Tenant; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await platformAPI.deleteTenant(tenant.id, confirm)
      onDone(); onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed')
    } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title="Delete Pharmacy — DANGER">
      <div className="space-y-3">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <strong>This permanently destroys all data for {tenant.name}.</strong>
            <br />Schema <code className="font-mono">{tenant.schema_name}</code> and every product, invoice, customer, user and report inside it will be dropped. This cannot be undone.
          </div>
        </div>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-sm">{err}</div>}
        <div>
          <label className="text-xs text-slate-600 block mb-1">Type <code className="font-mono text-indigo-700">{tenant.slug}</code> to confirm:</label>
          <input className={inputCls + ' font-mono'} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button onClick={submit} disabled={busy || confirm !== tenant.slug}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg">
          {busy ? 'Deleting…' : 'Permanently delete'}
        </button>
      </div>
    </Modal>
  )
}

function ChangePwdModal({ onClose }: { onClose: () => void }) {
  const [curr, setCurr] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      await platformAPI.changePassword(curr, next)
      setMsg('Password updated.')
      setCurr(''); setNext('')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Failed')
    } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title="Change Password">
      <form onSubmit={submit} className="space-y-3">
        {msg && <div className="bg-slate-50 border border-slate-200 text-slate-700 p-2 rounded text-sm">{msg}</div>}
        <Field label="Current password">
          <input type="password" className={inputCls} required value={curr} onChange={(e) => setCurr(e.target.value)} />
        </Field>
        <Field label="New password" hint="Min 6 chars">
          <input type="password" className={inputCls} required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg">
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </Modal>
  )
}
