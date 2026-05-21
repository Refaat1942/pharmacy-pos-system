import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LogOut, Globe, Clock } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useEffect, useState } from 'react'
import i18n from '../lib/i18n'
import BranchSwitcher from './BranchSwitcher'

export default function Topbar() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const toggleLang = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(next)
    localStorage.setItem('pharma_lang', next)
  }

  const userName = i18n.language === 'ar' ? user?.name_ar : user?.name_en
  const initial = (user?.name_en || user?.name_ar || 'U').charAt(0).toUpperCase()

  return (
    <header className="bg-white border-b border-slate-200 h-14 flex items-center px-5 gap-3 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono tabular-nums">
        <Clock size={13} />
        {time.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}
      </div>

      <div className="flex-1" />

      <BranchSwitcher />

      <button
        onClick={toggleLang}
        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
      >
        <Globe size={14} />
        {i18n.language === 'ar' ? 'EN' : 'عربي'}
      </button>

      <div className="flex items-center gap-2 ps-3 border-s border-slate-200">
        <div className="w-8 h-8 rounded-full bg-pharma-600 text-white flex items-center justify-center text-sm font-bold shadow">
          {initial}
        </div>
        <div className="hidden lg:block text-end leading-tight">
          <p className="text-xs font-semibold text-slate-800">{userName}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{user?.role}</p>
        </div>
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
        title={t('nav.logout')}
      >
        <LogOut size={16} />
      </button>
    </header>
  )
}
