import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AuthUser {
  id: number
  username: string
  name_ar: string
  name_en: string
  role: string
  branch_id: number
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
  isAuthenticated: boolean
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

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem('pharma_token', newToken)
    localStorage.setItem('pharma_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('pharma_token')
    localStorage.removeItem('pharma_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
