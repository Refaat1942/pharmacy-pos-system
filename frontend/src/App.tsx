import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Inventory from './pages/Inventory'
import Transfers from './pages/Transfers'
import BranchesStock from './pages/BranchesStock'
import Expiry from './pages/Expiry'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import Customers from './pages/Customers'
import Clinics from './pages/Clinics'
import ClinicPortal from './pages/ClinicPortal'
import Dashboard from './pages/Dashboard'
import Returns from './pages/Returns'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import Shifts from './pages/Shifts'
import HR from './pages/HR'
import Clock from './pages/Clock'
import EmployeeCards from './pages/EmployeeCards'
import UserCards from './pages/UserCards'
import PlatformLogin from './pages/PlatformLogin'
import Platform from './pages/Platform'
import LockScreen from './components/LockScreen'

function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('platform_token')
  return token ? <>{children}</> : <Navigate to="/platform/login" replace />
}

const FEATURE_HOME_ORDER: { path: string; feature?: string }[] = [
  { path: '/', feature: 'pos' },
  { path: '/dashboard', feature: 'dashboard' },
  { path: '/sales', feature: 'sales' },
  { path: '/inventory', feature: 'inventory' },
  { path: '/shifts', feature: 'shifts' },
  { path: '/customers', feature: 'customers' },
  { path: '/reports', feature: 'reports' },
  { path: '/clock' },
]

function ProtectedRoute({ children, feature }: { children: React.ReactNode; feature?: string }) {
  const { isAuthenticated, hasFeature } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (feature && !hasFeature(feature)) {
    const home = FEATURE_HOME_ORDER.find((r) => !r.feature || hasFeature(r.feature))
    return <Navigate to={home ? home.path : '/clock'} replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { i18n } = useTranslation()
  const { isAuthenticated, isLocked } = useAuth()

  useEffect(() => {
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dir = dir
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <>
      {isAuthenticated && isLocked && <LockScreen />}
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute feature="pos"><POS /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute feature="sales"><Sales /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute feature="inventory"><Inventory /></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute feature="transfers"><Transfers /></ProtectedRoute>} />
      <Route path="/branches-stock" element={<ProtectedRoute feature="branches_stock"><BranchesStock /></ProtectedRoute>} />
      <Route path="/expiry" element={<ProtectedRoute feature="expiry"><Expiry /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute feature="suppliers"><Suppliers /></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute feature="purchases"><Purchases /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute feature="customers"><Customers /></ProtectedRoute>} />
      <Route path="/clinics" element={<ProtectedRoute feature="clinics"><Clinics /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute feature="dashboard"><Dashboard /></ProtectedRoute>} />
      <Route path="/returns" element={<ProtectedRoute feature="returns"><Returns /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute feature="settings"><Settings /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute feature="reports"><Reports /></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute feature="shifts"><Shifts /></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute feature="hr"><HR /></ProtectedRoute>} />
      <Route path="/hr/cards" element={<ProtectedRoute feature="hr"><EmployeeCards /></ProtectedRoute>} />
      <Route path="/settings/login-cards" element={<ProtectedRoute feature="settings"><UserCards /></ProtectedRoute>} />
      <Route path="/clock" element={<ProtectedRoute><Clock /></ProtectedRoute>} />
      <Route path="/rx/:slug/:token" element={<ClinicPortal />} />
      <Route path="/platform/login" element={<PlatformLogin />} />
      <Route path="/platform" element={<PlatformProtectedRoute><Platform /></PlatformProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
