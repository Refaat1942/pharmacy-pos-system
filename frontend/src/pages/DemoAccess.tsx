import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { Building2, Copy, Check, ExternalLink, Loader2, Pill, Sparkles } from 'lucide-react'

interface DemoUser {
  role: string
  username: string
  password: string
  name_en?: string
}

interface DemoAccount {
  name: string
  slug: string
  login_path: string
  subscription_end?: string
  users: DemoUser[]
}

interface DemoPublic {
  label: string
  expires_at: string | null
  account_count: number
  accounts: DemoAccount[]
  all_features: boolean
}

function fullUrl(path: string) {
  if (path.startsWith('http')) return path
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setOk(true)
        window.setTimeout(() => setOk(false), 2000)
      }}
      className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
    >
      {ok ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      {ok ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function DemoAccess() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<DemoPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid demo link')
      setLoading(false)
      return
    }
    axios.get<DemoPublic>(`/api/demo/${encodeURIComponent(token)}`)
      .then((r) => setData(r.data))
      .catch(() => setError('This demo link is invalid, expired, or has been revoked.'))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-pharma-600 rounded-2xl shadow-xl mb-4">
            <Pill size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Fratelanza POS — Demo Access</h1>
          <p className="text-white/60 mt-2 text-sm">Try the full pharmacy system with sample data</p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="animate-spin text-white/70" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/20 border border-red-400/40 rounded-2xl p-6 text-center text-red-100">
            {error}
          </div>
        )}

        {!loading && data && (
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur border border-white/15 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="text-amber-300 shrink-0 mt-0.5" size={20} />
                <div>
                  <h2 className="font-bold text-lg">{data.label}</h2>
                  <p className="text-sm text-white/70 mt-1">
                    {data.all_features
                      ? 'All modules and options are enabled on these demo pharmacies.'
                      : 'Demo pharmacies with full access.'}
                  </p>
                  {data.expires_at && (
                    <p className="text-xs text-amber-200/90 mt-2">Access valid until {data.expires_at}</p>
                  )}
                </div>
              </div>
            </div>

            {data.accounts.map((acc, idx) => (
              <div key={acc.slug} className="bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 size={18} className="text-pharma-600 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{acc.name}</h3>
                      <p className="text-xs text-slate-500 font-mono">Pharmacy code: {acc.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyBtn text={acc.slug} />
                    <Link
                      to={acc.login_path}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-pharma-600 text-white hover:bg-pharma-700"
                    >
                      <ExternalLink size={13} /> Open POS login
                    </Link>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Login credentials {data.accounts.length > 1 ? `(demo ${idx + 1})` : ''}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-100">
                          <th className="text-start py-2 pe-3">Role</th>
                          <th className="text-start py-2 pe-3">Username</th>
                          <th className="text-start py-2 pe-3">Password</th>
                          <th className="text-end py-2"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {acc.users.map((u) => {
                          const loginPath = `${acc.login_path}${acc.login_path.includes('?') ? '&' : '?'}user=${encodeURIComponent(u.username)}`
                          return (
                            <tr key={u.username} className="border-b border-slate-50 last:border-0">
                              <td className="py-2.5 pe-3 capitalize text-slate-700">{u.role}</td>
                              <td className="py-2.5 pe-3 font-mono text-xs">{u.username}</td>
                              <td className="py-2.5 pe-3 font-mono text-xs font-semibold">{u.password}</td>
                              <td className="py-2.5 text-end whitespace-nowrap">
                                <CopyBtn text={`${u.username} / ${u.password}`} />
                                <Link
                                  to={loginPath}
                                  className="ms-2 text-xs text-pharma-700 hover:underline font-medium"
                                >
                                  Sign in
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                    Tip: use <strong>admin</strong> or <strong>cashier</strong> for POS — a cash shift is already open.
                    Login URL: <code className="text-slate-600">{fullUrl(acc.login_path)}</code>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
