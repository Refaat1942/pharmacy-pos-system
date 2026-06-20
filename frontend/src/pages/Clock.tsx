import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock as ClockIcon, CheckCircle2, LogOut, AlertCircle } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { Navigate } from 'react-router-dom'

type Result = {
  kind: 'in' | 'out' | 'error'
  name?: string
  role?: string | null
  time?: string
  message?: string
}

export default function Clock() {
  const { t, i18n } = useTranslation()
  const { isAuthenticated, logout } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [now, setNow] = useState(new Date())
  const inputRef = useRef<HTMLInputElement>(null)
  const clearTimer = useRef<number | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [result])

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const submit = async (raw: string) => {
    const value = raw.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const { data } = await api.post('/hr/clock', { code: value })
      const kind: Result['kind'] = data.action === 'check_in' ? 'in' : 'out'
      setResult({ kind, name: data.employee?.name, role: data.employee?.role, time: data.time })
    } catch (e: any) {
      setResult({ kind: 'error', message: e?.response?.data?.detail || t('clock.unknown_code') })
    } finally {
      setBusy(false)
      setCode('')
      if (clearTimer.current) window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => setResult(null), 4500)
    }
  }

  const dateStr = now.toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const timeStr = now.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour12: false })

  const bg =
    result?.kind === 'in' ? 'from-emerald-500 to-emerald-700'
    : result?.kind === 'out' ? 'from-sky-500 to-sky-700'
    : result?.kind === 'error' ? 'from-rose-500 to-rose-700'
    : 'from-slate-700 to-slate-900'

  return (
    <div className={`min-h-screen w-full bg-gradient-to-br ${bg} text-white flex flex-col items-center justify-center px-6 transition-colors duration-500`}>
      <button onClick={logout}
        className="absolute top-5 end-5 inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition-colors">
        <LogOut size={16} /> {t('nav.logout')}
      </button>
      <div className="absolute top-6 inset-x-0 text-center opacity-90">
        <div className="text-lg font-medium">{dateStr}</div>
        <div className="text-5xl font-mono tabular-nums tracking-wider mt-1">{timeStr}</div>
      </div>

      <div className="w-full max-w-xl bg-white/10 backdrop-blur rounded-3xl p-8 shadow-2xl mt-24">
        <div className="flex items-center justify-center gap-2 mb-4 text-white/80">
          <ClockIcon size={20} />
          <h1 className="text-xl font-semibold">{t('clock.title')}</h1>
        </div>
        <p className="text-center text-white/70 text-sm mb-6">{t('clock.prompt')}</p>

        <form onSubmit={(e) => { e.preventDefault(); submit(code) }}>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('clock.placeholder')}
            autoFocus
            autoComplete="off"
            disabled={busy}
            className="w-full text-center text-2xl font-mono tracking-wider px-5 py-4 rounded-xl bg-white text-slate-900 placeholder-slate-400 shadow-inner focus:outline-none focus:ring-4 focus:ring-white/40"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="mt-4 w-full text-lg font-semibold px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('clock.submit')}
          </button>
        </form>

        <div className="mt-6 min-h-[120px] flex items-center justify-center">
          {!result && <p className="text-white/60 text-sm">{t('clock.waiting')}</p>}
          {result?.kind === 'in' && (
            <div className="text-center">
              <CheckCircle2 size={48} className="mx-auto mb-2" />
              <div className="text-2xl font-bold">{result.name}</div>
              <div className="text-white/80 mt-1">{t('clock.checked_in_at', { time: result.time })}</div>
            </div>
          )}
          {result?.kind === 'out' && (
            <div className="text-center">
              <LogOut size={48} className="mx-auto mb-2" />
              <div className="text-2xl font-bold">{result.name}</div>
              <div className="text-white/80 mt-1">{t('clock.checked_out_at', { time: result.time })}</div>
            </div>
          )}
          {result?.kind === 'error' && (
            <div className="text-center">
              <AlertCircle size={48} className="mx-auto mb-2" />
              <div className="text-xl font-semibold">{result.message}</div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-white/60 text-xs">{t('clock.hint')}</p>
    </div>
  )
}
