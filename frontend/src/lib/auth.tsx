import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AuthUser {
  id: number
  username: string
  name_ar: string
  name_en: string
  role: string
  branch_id: number
}

export interface TenantInfo {
  slug: string
  name: string
  plan: string | null
  features: string[]
  subscription_start: string | null
  subscription_end: string | null
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  tenant: TenantInfo | null
  login: (token: string, user: AuthUser, tenant?: TenantInfo) => void
  logout: () => void
  isAuthenticated: boolean
  hasFeature: (key: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('pharma_token')
  )
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('pharma_user')
    return stored ? JSON.parse(stored) : null
  })
  const [tenant, setTenant] = useState<TenantInfo | null>(() => {
    const stored = localStorage.getItem('pharma_tenant')
    return stored ? JSON.parse(stored) : null
  })

  const login = useCallback((newToken: string, newUser: AuthUser, newTenant?: TenantInfo) => {
    localStorage.setItem('pharma_token', newToken)
    localStorage.setItem('pharma_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    if (newTenant) {
      localStorage.setItem('pharma_tenant', JSON.stringify(newTenant))
      setTenant(newTenant)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('pharma_token')
    localStorage.removeItem('pharma_user')
    setToken(null)
    setUser(null)
  }, [])

  const hasFeature = useCallback((key: string) => {
    // No tenant yet (legacy session) → allow; backend gate is the source of truth.
    if (!tenant) return true
    // Tenant present but features unset (older login response) → allow all.
    if (!tenant.features) return true
    // Empty list explicitly means everything is disabled.
    return tenant.features.includes(key)
  }, [tenant])

  return (
    <AuthContext.Provider value={{ user, token, tenant, login, logout, isAuthenticated: !!token, hasFeature }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
