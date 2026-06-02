import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ShoppingCart, History, Package, ArrowRightLeft, Calendar, Truck,
  FileText, Users, BarChart3, RotateCcw, Pill, Settings as SettingsIcon,
  LineChart, DollarSign, UsersRound, Layers, Stethoscope, Bike,
} from 'lucide-react'
import { useAuth } from '../lib/auth'

interface NavItem {
  to: string
  labelKey: string
  Icon: typeof ShoppingCart
  adminOnly?: boolean
  roles?: string[]
  feature?: string
}

const NAV: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', Icon: BarChart3,    feature: 'dashboard' },
  { to: '/',          labelKey: 'nav.pos',        Icon: ShoppingCart, feature: 'pos' },
  { to: '/sales',     labelKey: 'nav.sales',      Icon: History,      feature: 'sales' },
  { to: '/deliveries', labelKey: 'nav.deliveries', Icon: Bike,        feature: 'sales' },
  { to: '/returns',   labelKey: 'nav.returns',    Icon: RotateCcw,    feature: 'returns' },
  { to: '/inventory', labelKey: 'nav.inventory',  Icon: Package,      feature: 'inventory' },
  { to: '/transfers', labelKey: 'nav.transfers',  Icon: ArrowRightLeft, feature: 'transfers' },
  { to: '/branches-stock', labelKey: 'nav.branches_stock', Icon: Layers, feature: 'branches_stock' },
  { to: '/expiry',    labelKey: 'nav.expiry',     Icon: Calendar,     feature: 'expiry' },
  { to: '/purchases', labelKey: 'nav.purchases',  Icon: FileText,     feature: 'purchases' },
  { to: '/customers', labelKey: 'nav.customers',  Icon: Users,        feature: 'customers' },
  { to: '/clinics',   labelKey: 'nav.clinics',    Icon: Stethoscope,  feature: 'clinics', adminOnly: true },
  { to: '/suppliers', labelKey: 'nav.suppliers',  Icon: Truck,        feature: 'suppliers' },
  { to: '/reports',   labelKey: 'nav.reports',    Icon: LineChart,    feature: 'reports', roles: ['admin', 'pharmacist'] },
  { to: '/shifts',    labelKey: 'nav.shifts',     Icon: DollarSign,   feature: 'shifts' },
  { to: '/hr',        labelKey: 'nav.hr',         Icon: UsersRound,   feature: 'hr',       roles: ['admin', 'branch'] },
  { to: '/settings',  labelKey: 'nav.settings',   Icon: SettingsIcon, feature: 'settings', adminOnly: true },
]

const BRANCH_ALLOWED = new Set(['pos', 'sales', 'returns', 'expiry', 'shifts', 'hr', 'transfers', 'branches_stock'])

export default function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { user, hasFeature } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isBranch = user?.role === 'branch'
  const userPerms = !isAdmin && Array.isArray(user?.permissions) ? new Set(user!.permissions as string[]) : null

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 text-white flex flex-col h-screen shadow-2xl z-20">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
        <div className="bg-pharma-600 rounded-xl p-2 shadow-lg shadow-pharma-900/40">
          <Pill size={20} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight truncate">{t('app_name')}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('app_subtitle')}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV.filter((n) => {
          if (n.adminOnly && !isAdmin) return false
          if (n.roles && !n.roles.includes(user?.role || '')) {
            const permittedByUser = !!(userPerms && n.feature && userPerms.has(n.feature))
            if (!(n.feature === 'hr' && permittedByUser)) return false
          }
          if (isBranch && (!n.feature || !BRANCH_ALLOWED.has(n.feature))) return false
          if (n.feature && !hasFeature(n.feature)) return false
          if (userPerms && n.feature && !userPerms.has(n.feature)) return false
          return true
        }).map(({ to, labelKey, Icon }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                active
                  ? 'bg-pharma-600 text-white shadow-lg shadow-pharma-900/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon
                size={17}
                strokeWidth={active ? 2.5 : 2}
                className={active ? '' : 'group-hover:scale-110 transition-transform'}
              />
              <span className="truncate">{t(labelKey)}</span>
              {active && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-white/80" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10 text-[10px] text-white/30 text-center">
        v1.0 · Fratelanza ERP
      </div>
    </aside>
  )
}
