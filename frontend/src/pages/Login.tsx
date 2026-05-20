import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Loader2, Globe, Pill } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { authAPI } from '../lib/api'
import i18n from '../lib/i18n'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await authAPI.login(username, password)
      login(data.token, data.user)
      navigate('/')
    } catch {
      setError(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  const toggleLang = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(next)
    localStorage.setItem('pharma_lang', next)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <button
        onClick={toggleLang}
        className="fixed top-4 end-4 flex items-center gap-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full text-sm transition-all"
      >
        <Globe size={14} />
        {i18n.language === 'ar' ? 'English' : 'عربي'}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-pharma-600 rounded-2xl shadow-2xl mb-4 mx-auto">
            <Pill className="w-12 h-12 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white">{t('app_name')}</h1>
          <p className="text-white/60 mt-1 text-sm">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('login.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pharma-500 focus:border-transparent transition-all bg-gray-50"
              placeholder="admin"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('login.password')}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pe-12 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pharma-500 focus:border-transparent transition-all bg-gray-50"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute inset-y-0 end-0 flex items-center px-4 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pharma-600 hover:bg-pharma-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-pharma-200"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t('login.signing_in')}
              </>
            ) : (
              t('login.sign_in')
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            Fratelanza ERP Management System v1.0
          </p>
        </form>
      </div>
    </div>
  )
}
