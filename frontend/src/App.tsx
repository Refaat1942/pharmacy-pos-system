import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Deliveries from './pages/Deliveries'
import Inventory from './pages/Inventory'
import Transfers from './pages/Transfers'
import BranchesStock from './pages/BranchesStock'
import Expiry from './pages/Expiry'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import Customers from './pages/Customers'
import Loyalty from './pages/Loyalty'
import Clinics from './pages/Clinics'
import ClinicPortal from './pages/ClinicPortal'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import FraudSurveillance from './pages/FraudSurveillance'
import StockReallocation from './pages/StockReallocation'
import Offers from './pages/Offers'
import Shifts from './pages/Shifts'
import HR from './pages/HR'
import Clock from './pages/Clock'
import EmployeeCards from './pages/EmployeeCards'
import UserCards from './pages/UserCards'
import PlatformLogin from './pages/PlatformLogin'
import Platform from './pages/Platform'
import PlatformBlueprint from './pages/PlatformBlueprint'
import LockScreen from './components/LockScreen'
import { canAccessFeature, getDefaultHomePath } from './lib/routeAccess'

function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('platform_token')
  return token ? <>{children}</> : <Navigate to="/platform/login" replace />
}

function ProtectedRoute({
  children,
  feature,
  featureOption,
}: {
  children: React.ReactNode
  feature?: string
  featureOption?: string
}) {
  const { isAuthenticated, hasFeature, hasFeatureOption, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!user) return <Navigate to="/login" replace />
  if (feature && !canAccessFeature(user, feature, hasFeature)) {
    return <Navigate to={getDefaultHomePath(user, hasFeature)} replace />
  }
  if (feature && featureOption && !hasFeatureOption(feature, featureOption)) {
    return <Navigate to={getDefaultHomePath(user, hasFeature)} replace />
  }
  return <>{children}</>
}

/**
 * The Clock screen is a shared kiosk: any authenticated employee must be able
 * to punch in/out regardless of whether they can manage HR. We still respect
 * the tenant-level feature toggle (hr + clock option), but skip the per-user
 * HR-management permission check that ProtectedRoute applies.
 */
function ClockRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, hasFeature, hasFeatureOption } = useAuth()
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />
  if (!hasFeature('hr') || !hasFeatureOption('hr', 'clock')) {
    return <Navigate to={getDefaultHomePath(user, hasFeature)} replace />
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
      <Route path="/deliveries" element={<ProtectedRoute feature="sales" featureOption="deliveries"><Deliveries /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute feature="inventory"><Inventory /></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute feature="transfers"><Transfers /></ProtectedRoute>} />
      <Route path="/branches-stock" element={<ProtectedRoute feature="branches_stock"><BranchesStock /></ProtectedRoute>} />
      <Route path="/expiry" element={<ProtectedRoute feature="expiry"><Expiry /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute feature="suppliers"><Suppliers /></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute feature="purchases"><Purchases /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute feature="customers"><Customers /></ProtectedRoute>} />
      <Route path="/loyalty" element={<ProtectedRoute feature="loyalty"><Loyalty /></ProtectedRoute>} />
      <Route path="/clinics" element={<ProtectedRoute feature="clinics"><Clinics /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute feature="dashboard"><Dashboard /></ProtectedRoute>} />
      <Route path="/returns" element={<Navigate to="/sales" replace />} />
      <Route path="/settings" element={<ProtectedRoute feature="settings"><Settings /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute feature="reports"><Reports /></ProtectedRoute>} />
      <Route path="/fraud" element={<ProtectedRoute feature="fraud_surveillance"><FraudSurveillance /></ProtectedRoute>} />
      <Route path="/stock-reallocation" element={<ProtectedRoute feature="stock_reallocation"><StockReallocation /></ProtectedRoute>} />
      <Route path="/offers" element={<ProtectedRoute feature="offers"><Offers /></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute feature="shifts"><Shifts /></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute feature="hr"><HR /></ProtectedRoute>} />
      <Route path="/hr/cards" element={<ProtectedRoute feature="hr" featureOption="employee_cards"><EmployeeCards /></ProtectedRoute>} />
      <Route path="/settings/login-cards" element={<ProtectedRoute feature="settings" featureOption="login_cards"><UserCards /></ProtectedRoute>} />
      <Route path="/clock" element={<ClockRoute><Clock /></ClockRoute>} />
      <Route path="/rx/:slug/:token" element={<ClinicPortal />} />
      <Route path="/platform/login" element={<PlatformLogin />} />
      <Route path="/platform" element={<PlatformProtectedRoute><Platform /></PlatformProtectedRoute>} />
      <Route path="/platform/blueprint" element={<PlatformProtectedRoute><PlatformBlueprint /></PlatformProtectedRoute>} />
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
