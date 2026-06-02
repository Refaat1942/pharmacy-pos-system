import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, ScanLine, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth'

const API_BASE = (import.meta as any).env?.VITE_API_URL || ''

type LockBranding = {
  name_en?: string | null
  name_ar?: string | null
  logo_data_url?: string | null
  show_logo?: boolean
}

export default function LockScreen() {
  const { t, i18n } = useTranslation()
  const { user, token, unlock, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [scan, setScan] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [branding, setBranding] = useState<LockBranding | null>(null)
  const pwRef = useRef<HTMLInputElement>(null)

  const name = (i18n.language === 'ar' ? user?.name_ar : user?.name_en) || user?.name_en || user?.name_ar || user?.username || ''
  const pharmacyName = (i18n.language === 'ar'
    ? (branding?.name_ar || branding?.name_en)
    : (branding?.name_en || branding?.name_ar)) || ''
  const showLogo = branding?.show_logo !== false && !!branding?.logo_data_url

  useEffect(() => { pwRef.current?.focus() }, [])

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/settings/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive && data) setBranding(data) })
      .catch(() => {})
    return () => { alive = false }
  }, [token])

  // Use a raw fetch (not the shared api client) so a wrong password — which the
  // server answers with 401 — does NOT trigger the global logout-redirect.
  const attempt = async (payload: { password?: string; card_code?: string }) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/auth/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setPassword(''); setScan('')
        unlock()
        return
      }
      let detail = ''
      try { detail = (await res.json())?.detail || '' } catch { /* ignore */ }
      // Only a wrong password/card should keep us on the lock screen. Any other
      // auth failure (expired/invalid token, inactive account, suspended
      // tenant) means the session is gone — drop to the login page.
      if (res.status === 401 && /incorrect/i.test(detail)) {
        setError(detail || t('lock.error'))
        setScan('')
        return
      }
      if (res.status === 401 || res.status === 403) {
        logout()
        return
      }
      setError(detail || t('lock.error'))
      setScan('')
    } catch {
      setError(t('lock.error'))
      setScan('')
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim() || busy) return
    attempt({ password: password.trim() })
  }

  const submitScan = (e: React.FormEvent) => {
    e.preventDefault()
    if (!scan.trim() || busy) return
    attempt({ card_code: scan.trim() })
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 text-center">
        {showLogo ? (
          <img src={branding!.logo_data_url as string} alt={pharmacyName || ''} className="mx-auto h-14 object-contain mb-2" />
        ) : null}
        {pharmacyName && (
          <p className="text-sm font-semibold text-slate-700 mb-3">{pharmacyName}</p>
        )}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-pharma-100 flex items-center justify-center mb-4">
          <Lock className="text-pharma-700" size={28} />
        </div>
        <h1 className="text-lg font-bold text-slate-800">{t('lock.title')}</h1>
        {name && (
          <p className="text-sm text-slate-500 mt-1">
            {t('lock.signed_in_as')} <span className="font-semibold text-slate-700">{name}</span>
          </p>
        )}

        <form onSubmit={submitPassword} className="mt-5 space-y-3 text-start">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t('lock.password')}</label>
            <input
              ref={pwRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              autoComplete="current-password"
              placeholder={t('lock.password') as string}
            />
          </div>
          <button
            type="submit"
            disabled={busy || !password.trim()}
            className="w-full bg-pharma-600 hover:bg-pharma-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm"
          >
            {busy ? t('common.loading') : t('lock.unlock')}
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] uppercase tracking-wider text-slate-400">{t('lock.or')}</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <form onSubmit={submitScan} className="text-start">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
            <ScanLine size={14} /> {t('lock.scan_card')}
          </label>
          <input
            type="text"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            className="input w-full font-mono"
            placeholder={t('lock.scan_placeholder') as string}
            autoComplete="off"
          />
        </form>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}

        <button
          onClick={logout}
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
        >
          <LogOut size={13} /> {t('lock.different_user')}
        </button>
      </div>
    </div>
  )
}
