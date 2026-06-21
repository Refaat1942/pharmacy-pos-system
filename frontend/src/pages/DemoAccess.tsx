import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Loader2, Pill, Sparkles, Play } from 'lucide-react'
import { useAuth, type TenantInfo } from '../lib/auth'
import { getDefaultHomePath } from '../lib/routeAccess'

interface DemoAccountPublic {
  index: number
  name: string
  access_path: string
  role: string
}

interface DemoPublic {
  label: string
  expires_at: string | null
  account_count: number
  accounts: DemoAccountPublic[]
  auto_login: boolean
}

interface LoginResponse {
  token: string
  user: {
    id: number
    username: string
    name_ar: string
    name_en: string
    role: string
    branch_id: number
    permissions?: string[] | null
  }
  tenant: {
    slug: string
    name: string
    plan: string | null
    is_demo?: boolean
    features: string[]
    feature_options?: Record<string, Record<string, boolean>>
    subscription_start: string | null
    subscription_end: string | null
    limits?: Record<string, unknown>
  }
}

export default function DemoAccess() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const loginFn = useRef(login)
  loginFn.current = login
  const [data, setData] = useState<DemoPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const startDemo = useCallback(async (accountIndex: number) => {
    if (!token) return
    setStarting(true)
    setError('')
    try {
      const { data: session } = await axios.post<LoginResponse>(
        `/api/demo/${encodeURIComponent(token)}/start`,
        { account_index: accountIndex },
      )
      localStorage.setItem('pharma_tenant_slug', session.tenant.slug)
      loginFn.current(session.token, session.user, {
        ...session.tenant,
        is_demo: true,
      } as TenantInfo)
      const tenantHas = (key: string) => session.tenant.features?.includes(key) ?? true
      navigate(getDefaultHomePath(session.user, tenantHas), { replace: true })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not start demo session')
      setStarting(false)
      setLoading(false)
    }
  }, [token, navigate])

  useEffect(() => {
    if (!token) {
      setError('Invalid demo link')
      setLoading(false)
      return
    }
    const forced = searchParams.get('a')
    axios.get<DemoPublic>(`/api/demo/${encodeURIComponent(token)}`)
      .then((r) => {
        setData(r.data)
        const idx = forced != null ? parseInt(forced, 10) : 0
        const accountIndex = Number.isFinite(idx) ? idx : 0
        if (r.data.account_count === 1 && forced == null) {
          void startDemo(0)
        } else if (forced != null && accountIndex >= 0 && accountIndex < r.data.account_count) {
          void startDemo(accountIndex)
        } else {
          setLoading(false)
        }
      })
      .catch(() => {
        setError('This demo link is invalid, expired, or has been revoked.')
        setLoading(false)
      })
  }, [token, searchParams, startDemo])

  const showPicker = !loading && !starting && data && data.account_count > 1 && !error

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-pharma-600 rounded-2xl shadow-xl mb-5">
          <Pill size={32} strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Fratelanza POS Demo</h1>
        <p className="text-white/60 mt-2 text-sm">Opening your trial — no login required</p>

        {(loading || starting) && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Loader2 size={36} className="animate-spin text-pharma-300" />
            <p className="text-sm text-white/70">
              {starting ? 'Signing you in as admin…' : 'Loading demo…'}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-8 bg-red-500/20 border border-red-400/40 rounded-2xl p-5 text-red-100 text-sm">
            {error}
          </div>
        )}

        {showPicker && (
          <div className="mt-8 space-y-4 text-start">
            <div className="bg-white/10 border border-white/15 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Sparkles size={18} className="text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{data.label}</p>
                  {data.expires_at && (
                    <p className="text-xs text-white/60 mt-1">Valid until {data.expires_at}</p>
                  )}
                </div>
              </div>
            </div>
            {data.accounts.map((acc) => (
              <button
                key={acc.index}
                type="button"
                onClick={() => void startDemo(acc.index)}
                className="w-full flex items-center justify-between gap-3 bg-white text-slate-900 rounded-xl px-4 py-3.5 font-semibold hover:bg-pharma-50 transition-colors"
              >
                <span>{acc.name}</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-pharma-700">
                  <Play size={14} /> Start
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
