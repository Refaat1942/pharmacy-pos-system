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
import Dashboard from './pages/Dashboard'
import Returns from './pages/Returns'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import Shifts from './pages/Shifts'
import HR from './pages/HR'
import Clock from './pages/Clock'
import EmployeeCards from './pages/EmployeeCards'
import PlatformLogin from './pages/PlatformLogin'
import Platform from './pages/Platform'

function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('platform_token')
  return token ? <>{children}</> : <Navigate to="/platform/login" replace />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dir = dir
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><POS /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute><Transfers /></ProtectedRoute>} />
      <Route path="/branches-stock" element={<ProtectedRoute><BranchesStock /></ProtectedRoute>} />
      <Route path="/expiry" element={<ProtectedRoute><Expiry /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute><Shifts /></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute><HR /></ProtectedRoute>} />
      <Route path="/hr/cards" element={<ProtectedRoute><EmployeeCards /></ProtectedRoute>} />
      <Route path="/clock" element={<ProtectedRoute><Clock /></ProtectedRoute>} />
      <Route path="/platform/login" element={<PlatformLogin />} />
      <Route path="/platform" element={<PlatformProtectedRoute><Platform /></PlatformProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
