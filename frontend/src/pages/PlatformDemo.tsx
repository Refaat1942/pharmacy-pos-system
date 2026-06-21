import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, LogOut, KeyRound, Plus, Copy, Check, ExternalLink,
  Link2, Ban, Loader2, Sparkles,
} from 'lucide-react'
import { platformAPI, DemoPack, DemoPackSummary } from '../lib/platform'
import { formatDateTime } from '../lib/formatDate'

function fullShareUrl(path: string) {
  if (path.startsWith('http')) return path
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text)
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        copyText(text)
        setOk(true)
        window.setTimeout(() => setOk(false), 2000)
      }}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
    >
      {ok ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      {ok ? 'Copied' : label}
    </button>
  )
}

export default function PlatformDemo() {
  const [packs, setPacks] = useState<DemoPackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<DemoPack | null>(null)
  const [form, setForm] = useState({
    label: 'POS demo — all features enabled',
    count: 3,
    expiry_days: 14,
    slug_prefix: 'demo',
  })
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await platformAPI.listDemoPacks()
      setPacks(r.data)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Failed to load demo packs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setCreated(null)
    try {
      const r = await platformAPI.createDemoPack(form)
      setCreated(r.data)
      await load()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Failed to create demo pack')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: number) => {
    if (!confirm('Revoke this demo link and suspend its demo pharmacies?')) return
    setRevoking(id)
    try {
      await platformAPI.revokeDemoPack(id)
      if (created?.id === id) setCreated(null)
      await load()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Revoke failed')
    } finally {
      setRevoking(null)
    }
  }

  const createdShareUrl = useMemo(
    () => (created ? fullShareUrl(created.share_url || created.share_path) : ''),
    [created],
  )

  const logout = () => {
    localStorage.removeItem('platform_token')
    localStorage.removeItem('platform_admin')
    window.location.href = '/platform/login'
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold">Demo test links</h1>
              <p className="text-xs text-white/60">Share full-feature POS trials with prospects</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/platform" className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm">
              ← Control Platform
            </Link>
            <button onClick={logout} className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Plus size={18} className="text-indigo-600" /> Generate demo pack
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Creates separate demo pharmacies with <strong>every module and sub-option enabled</strong>,
              sample products, an open cash shift, and role logins (admin, pharmacist, cashier, assistant).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Pack label</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Demo accounts</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: parseInt(e.target.value, 10) || 1 })}
                />
                <p className="text-[10px] text-slate-400 mt-1">One isolated pharmacy per prospect (max 25)</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Valid for (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  value={form.expiry_days}
                  onChange={(e) => setForm({ ...form, expiry_days: parseInt(e.target.value, 10) || 14 })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Pharmacy code prefix</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono lowercase"
                value={form.slug_prefix}
                onChange={(e) => setForm({ ...form, slug_prefix: e.target.value.toLowerCase() })}
                placeholder="demo"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
              {busy ? 'Provisioning demo pharmacies…' : 'Create shareable test link'}
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">How it works</h2>
            <ol className="text-sm text-slate-600 space-y-2 list-decimal ps-5">
              <li>Generate a pack with one or more demo pharmacies.</li>
              <li>Copy the public link and send it to your prospect.</li>
              <li>They open the link, pick their demo pharmacy, and sign in with the listed credentials.</li>
              <li>Revoke the link anytime — demo pharmacies are suspended automatically.</li>
            </ol>
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-900">
              <ShieldCheck size={16} className="inline me-1.5 -mt-0.5" />
              Each demo is a fully isolated tenant. Passwords are random and only shown on the share page.
            </div>
          </div>
        </div>

        {created && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-emerald-900 text-lg">Demo link ready</h3>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 text-sm bg-white border border-emerald-200 rounded-xl px-3 py-2 break-all">
                {createdShareUrl}
              </code>
              <CopyBtn text={createdShareUrl} label="Copy link" />
              <a
                href={createdShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <ExternalLink size={12} /> Open
              </a>
            </div>
            <p className="text-xs text-emerald-800">
              Expires {created.expires_at || '—'} · {created.accounts?.length ?? 0} demo pharmacies
            </p>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Previous demo packs</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading…</div>
          ) : packs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No demo packs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">Label</th>
                  <th className="px-4 py-3 text-center">Accounts</th>
                  <th className="px-4 py-3 text-start">Expires</th>
                  <th className="px-4 py-3 text-start">Created</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => {
                  const share = fullShareUrl(p.share_path)
                  const revoked = !!p.revoked_at
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{p.label}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{p.account_count}</td>
                      <td className="px-4 py-3 text-slate-600">{p.expires_at || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(p.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {revoked ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Revoked</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {!revoked && <CopyBtn text={share} />}
                          {!revoked && (
                            <a href={share} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-slate-100 rounded" title="Open">
                              <ExternalLink size={14} />
                            </a>
                          )}
                          {!revoked && (
                            <button
                              type="button"
                              disabled={revoking === p.id}
                              onClick={() => void revoke(p.id)}
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                              title="Revoke"
                            >
                              {revoking === p.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                            </button>
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
      </div>
    </div>
  )
}
