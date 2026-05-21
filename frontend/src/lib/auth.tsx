import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

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
  refreshTenant: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_BASE = (import.meta as any).env?.VITE_API_URL || ''

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
    localStorage.removeItem('pharma_tenant')
    setToken(null)
    setUser(null)
    setTenant(null)
  }, [])

  const refreshTenant = useCallback(async () => {
    const t = localStorage.getItem('pharma_token')
    if (!t) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.status === 401 || res.status === 403) {
        // Token expired or tenant suspended — force re-login.
        localStorage.removeItem('pharma_token')
        localStorage.removeItem('pharma_user')
        localStorage.removeItem('pharma_tenant')
        setToken(null); setUser(null); setTenant(null)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (data?.tenant) {
        const next: TenantInfo = {
          slug: data.tenant.slug,
          name: data.tenant.name,
          plan: data.tenant.plan,
          features: data.tenant.features || [],
          subscription_start: data.tenant.subscription_start,
          subscription_end: data.tenant.subscription_end,
        }
        // If tenant was deactivated server-side, log the user out.
        if (data.tenant.active === false) {
          localStorage.removeItem('pharma_token')
          localStorage.removeItem('pharma_user')
          localStorage.removeItem('pharma_tenant')
          setToken(null); setUser(null); setTenant(null)
          return
        }
        localStorage.setItem('pharma_tenant', JSON.stringify(next))
        setTenant(next)
      }
    } catch {
      /* network blip — keep cached features */
    }
  }, [])

  // Refresh on mount, every 60s, and whenever the window regains focus.
  useEffect(() => {
    if (!token) return
    refreshTenant()
    const id = setInterval(refreshTenant, 60_000)
    const onFocus = () => refreshTenant()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [token, refreshTenant])

  const hasFeature = useCallback((key: string) => {
    // No tenant yet (legacy session) → allow; backend gate is the source of truth.
    if (!tenant) return true
    // Tenant present but features unset (older login response) → allow all.
    if (!tenant.features) return true
    // Empty list explicitly means everything is disabled.
    return tenant.features.includes(key)
  }, [tenant])

  return (
    <AuthContext.Provider value={{ user, token, tenant, login, logout, isAuthenticated: !!token, hasFeature, refreshTenant }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
