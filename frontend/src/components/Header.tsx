import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, History, LogOut, Globe, Clock, Package, ArrowRightLeft } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useEffect, useState } from 'react'
import i18n from '../lib/i18n'
import BranchSwitcher from './BranchSwitcher'

export default function Header() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
    <header className="bg-slate-900 text-white h-14 flex items-center px-4 gap-3 shadow-xl flex-shrink-0 z-10">
      <div className="flex items-center gap-2.5 me-2">
        <div className="bg-pharma-600 rounded-lg p-1.5 shadow-lg">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1h-3v3c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-3H7c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1h3V7c0-.55.45-1 1-1h2z"/>
          </svg>
        </div>
        <span className="font-bold text-base tracking-tight hidden sm:block">{t('app_name')}</span>
      </div>

      <nav className="flex items-center gap-1">
        <Link
          to="/"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            location.pathname === '/'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <ShoppingCart size={15} />
          <span className="hidden md:block">{t('nav.pos')}</span>
        </Link>
        <Link
          to="/sales"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            location.pathname === '/sales'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <History size={15} />
          <span className="hidden md:block">{t('nav.sales')}</span>
        </Link>
        <Link
          to="/inventory"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            location.pathname === '/inventory'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Package size={15} />
          <span className="hidden md:block">{t('nav.inventory')}</span>
        </Link>
        <Link
          to="/transfers"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            location.pathname === '/transfers'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowRightLeft size={15} />
          <span className="hidden md:block">{t('nav.transfers')}</span>
        </Link>
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 text-white/50 text-xs font-mono tabular-nums">
        <Clock size={13} />
        {time.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>

      <BranchSwitcher />

      <button
        onClick={toggleLang}
        className="flex items-center gap-1.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
      >
        <Globe size={14} />
        {i18n.language === 'ar' ? 'EN' : 'عر'}
      </button>

      <div className="flex items-center gap-2 ps-3 border-s border-white/20">
        <div className="w-7 h-7 rounded-full bg-pharma-600 flex items-center justify-center text-xs font-bold shadow">
          {initial}
        </div>
        <span className="text-sm text-white/80 hidden lg:block">{userName}</span>
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-white/50 hover:text-red-400 hover:bg-red-900/30 p-2 rounded-lg transition-all"
        title={t('nav.logout')}
      >
        <LogOut size={16} />
      </button>
    </header>
  )
}
