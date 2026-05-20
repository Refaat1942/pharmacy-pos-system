import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, History, LogOut, Globe, Clock, Package, ArrowRightLeft, Calendar, Truck, FileText, Users, BarChart3, RotateCcw, Pill } from 'lucide-react'
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
    <header className="bg-slate-900 text-white min-h-14 flex flex-wrap items-center px-3 py-1.5 gap-x-2 gap-y-1 shadow-xl flex-shrink-0 z-10">
      <div className="flex items-center gap-2 me-1 shrink-0">
        <div className="bg-pharma-600 rounded-lg p-1.5 shadow-lg">
          <Pill size={18} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-sm tracking-tight hidden sm:block">{t('app_name')}</span>
      </div>

      <nav className="flex items-center flex-wrap gap-0.5 min-w-0">
        <Link
          to="/dashboard"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/dashboard'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <BarChart3 size={15} />
          <span className="hidden md:block">{t('nav.dashboard')}</span>
        </Link>
        <Link
          to="/"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
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
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/sales'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <History size={15} />
          <span className="hidden md:block">{t('nav.sales')}</span>
        </Link>
        <Link
          to="/returns"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/returns'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <RotateCcw size={15} />
          <span className="hidden md:block">{t('nav.returns')}</span>
        </Link>
        <Link
          to="/inventory"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
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
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/transfers'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowRightLeft size={15} />
          <span className="hidden md:block">{t('nav.transfers')}</span>
        </Link>
        <Link
          to="/expiry"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/expiry'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Calendar size={15} />
          <span className="hidden md:block">{t('nav.expiry')}</span>
        </Link>
        <Link
          to="/purchases"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/purchases'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <FileText size={15} />
          <span className="hidden md:block">{t('nav.purchases')}</span>
        </Link>
        <Link
          to="/customers"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/customers'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Users size={15} />
          <span className="hidden md:block">{t('nav.customers')}</span>
        </Link>
        <Link
          to="/suppliers"
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            location.pathname === '/suppliers'
              ? 'bg-pharma-600 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Truck size={15} />
          <span className="hidden md:block">{t('nav.suppliers')}</span>
        </Link>
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-1 text-white/50 text-xs font-mono tabular-nums">
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
        className="flex items-center gap-1 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap"
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
        className="flex items-center gap-1 text-white/50 hover:text-red-400 hover:bg-red-900/30 p-2 rounded-lg transition-all"
        title={t('nav.logout')}
      >
        <LogOut size={16} />
      </button>
    </header>
  )
}
