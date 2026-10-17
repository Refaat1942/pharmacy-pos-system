import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, LogOut } from 'lucide-react'
import api, { formatApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

/** Blocks the app until an admin still on a default / weak password picks a new one. */
export default function ForcePasswordChange() {
  const { t } = useTranslation()
  const { token, user, tenant, login, logout } = useAuth()
  const [curr, setCurr] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next !== again) { setError(t('force_pwd.mismatch') as string); return }
    setBusy(true); setError('')
    try {
      await api.post('/auth/change-password', { current_password: curr, new_password: next })
      if (token && user) login(token, { ...user, must_change_password: false }, tenant ?? undefined)
    } catch (err) {
      setError(formatApiError(err, t('force_pwd.failed') as string))
    } finally { setBusy(false) }
  }

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-pharma-500'
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><KeyRound size={22} /></div>
          <div>
            <h2 className="font-bold text-lg">{t('force_pwd.title')}</h2>
            <p className="text-xs text-slate-500">{t('force_pwd.subtitle')}</p>
          </div>
        </div>
        <label className="block text-sm"><span className="text-slate-600">{t('force_pwd.current')}</span>
          <input type="password" required autoFocus className={input} value={curr} onChange={(e) => setCurr(e.target.value)} /></label>
        <label className="block text-sm"><span className="text-slate-600">{t('force_pwd.new')}</span>
          <input type="password" required minLength={6} className={input} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="block text-sm"><span className="text-slate-600">{t('force_pwd.again')}</span>
          <input type="password" required minLength={6} className={input} value={again} onChange={(e) => setAgain(e.target.value)} /></label>
        <p className="text-[11px] text-slate-500">{t('force_pwd.rules')}</p>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={logout} className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><LogOut size={15} />{t('force_pwd.logout')}</button>
          <button type="submit" disabled={busy} className="flex-1 bg-pharma-600 hover:bg-pharma-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-60">{t('force_pwd.save')}</button>
        </div>
      </form>
    </div>
  )
}
