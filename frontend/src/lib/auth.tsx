import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

interface AuthUser {
  id: number
  username: string
  name_ar: string
  name_en: string
  role: string
  branch_id: number
  permissions?: string[] | null
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
  isLocked: boolean
  lock: () => void
  unlock: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_BASE = (import.meta as any).env?.VITE_API_URL || ''

const IDLE_LOCK_MS = 10 * 60 * 1000

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
  const [isLocked, setLocked] = useState<boolean>(() => localStorage.getItem('pharma_locked') === '1')

  const login = useCallback((newToken: string, newUser: AuthUser, newTenant?: TenantInfo) => {
    localStorage.setItem('pharma_token', newToken)
    localStorage.setItem('pharma_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    localStorage.removeItem('pharma_locked')
    setLocked(false)
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
    localStorage.removeItem('pharma_locked')
    setLocked(false)
  }, [])

  const lock = useCallback(() => {
    localStorage.setItem('pharma_locked', '1')
    setLocked(true)
  }, [])
  const unlock = useCallback(() => {
    localStorage.removeItem('pharma_locked')
    setLocked(false)
  }, [])

  // Keep the lock state in sync across all tabs/windows of the same terminal.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pharma_locked') setLocked(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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
      if (data?.user) {
        const nextUser: AuthUser = {
          id: data.user.id,
          username: data.user.username,
          name_ar: data.user.name_ar,
          name_en: data.user.name_en,
          role: data.user.role,
          branch_id: data.user.branch_id,
          permissions: data.user.permissions ?? null,
        }
        localStorage.setItem('pharma_user', JSON.stringify(nextUser))
        setUser(nextUser)
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

  // Auto-lock the terminal after a period of inactivity. Any user activity
  // resets the countdown. Locking keeps the session alive (token stays valid);
  // the user just re-confirms via password or personal card.
  useEffect(() => {
    if (!token || isLocked) return
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(lock, IDLE_LOCK_MS)
    }
    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel',
    ]
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [token, isLocked, lock])

  const hasFeature = useCallback((key: string) => {
    // No tenant yet (legacy session) → allow; backend gate is the source of truth.
    if (!tenant) return true
    // Tenant present but features unset (older login response) → allow all.
    if (!tenant.features) return true
    // Empty list explicitly means everything is disabled.
    return tenant.features.includes(key)
  }, [tenant])

  return (
    <AuthContext.Provider value={{ user, token, tenant, login, logout, isAuthenticated: !!token, hasFeature, refreshTenant, isLocked, lock, unlock }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
