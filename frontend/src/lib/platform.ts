import axios from 'axios'

const platformApi = axios.create({
  baseURL: '/api/platform',
  headers: { 'Content-Type': 'application/json' },
})

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('platform_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

platformApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      const onPlatform = window.location.pathname.startsWith('/platform')
      if (onPlatform && window.location.pathname !== '/platform/login') {
        localStorage.removeItem('platform_token')
        localStorage.removeItem('platform_admin')
        window.location.href = '/platform/login'
      }
    }
    return Promise.reject(err)
  },
)

export interface Tenant {
  id: number
  slug: string
  name: string
  schema_name: string
  status: 'active' | 'suspended'
  plan: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  created_at: string
  suspended_at: string | null
  features: string[] | null
  subscription_start: string | null
  subscription_end: string | null
  max_users: number | null
  max_branches: number | null
  price_le: number | null
}

export interface PlanDef {
  key: string
  label: string
  max_users: number | null
  max_branches: number | null
  price_le: number
  notes: string | null
  features: string[]
  sort_order: number
}

export interface FeatureDef {
  key: string
  label: string
  default: boolean
}

export interface TenantStats {
  users: number
  branches: number
  products: number
  invoices: number
}

export interface PlatformAdmin {
  id: number
  username: string
  name: string | null
  last_login_at: string | null
}

export const platformAPI = {
  login: (username: string, password: string) =>
    platformApi.post<{ token: string; admin: PlatformAdmin }>('/auth/login', { username, password }),
  me: () => platformApi.get<PlatformAdmin>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    platformApi.post('/auth/change-password', { current_password, new_password }),

  listTenants: () => platformApi.get<Tenant[]>('/tenants'),
  getTenant: (id: number) => platformApi.get<Tenant>(`/tenants/${id}`),
  tenantStats: (id: number) => platformApi.get<TenantStats>(`/tenants/${id}/stats`),
  createTenant: (data: {
    slug: string
    name: string
    plan?: string
    contact_name?: string
    contact_email?: string
    contact_phone?: string
    notes?: string
    admin_username: string
    admin_password: string
    features?: string[]
    subscription_start?: string | null
    subscription_end?: string | null
  }) => platformApi.post<Tenant>('/tenants', data),
  updateTenant: (id: number, data: Partial<Tenant>) =>
    platformApi.patch<Tenant>(`/tenants/${id}`, data),
  deleteTenant: (id: number, confirm_slug: string) =>
    platformApi.delete(`/tenants/${id}`, { params: { confirm_slug } }),
  migrateAll: () => platformApi.post<{ ok: number; failed: { slug: string; error: string }[] }>('/migrate-all'),
  featuresCatalog: () => platformApi.get<{ features: FeatureDef[]; defaults: string[] }>('/features-catalog'),
  listPlans: () => platformApi.get<PlanDef[]>('/plans'),
  updatePlan: (key: string, data: Partial<PlanDef>) =>
    platformApi.patch<PlanDef>(`/plans/${key}`, data),
}

export default platformApi
