import { canAccessHr } from './hrAccess'

type UserLike = { role?: string; permissions?: string[] | null } | null | undefined

const BRANCH_ALLOWED = new Set([
  'pos', 'sales', 'expiry', 'shifts', 'hr', 'transfers', 'branches_stock',
])

/** First landing route after login or when redirecting away from a forbidden page. */
export const FEATURE_HOME_ORDER: { path: string; feature?: string }[] = [
  { path: '/', feature: 'pos' },
  { path: '/dashboard', feature: 'dashboard' },
  { path: '/sales', feature: 'sales' },
  { path: '/deliveries', feature: 'sales' },
  { path: '/inventory', feature: 'inventory' },
  { path: '/transfers', feature: 'transfers' },
  { path: '/expiry', feature: 'expiry' },
  { path: '/purchases', feature: 'purchases' },
  { path: '/offers', feature: 'offers' },
  { path: '/customers', feature: 'customers' },
  { path: '/loyalty', feature: 'loyalty' },
  { path: '/suppliers', feature: 'suppliers' },
  { path: '/reports', feature: 'reports' },
  { path: '/fraud', feature: 'fraud_surveillance' },
  { path: '/stock-reallocation', feature: 'stock_reallocation' },
  { path: '/shifts', feature: 'shifts' },
  { path: '/hr', feature: 'hr' },
]

/** Mirrors Sidebar nav visibility so deep links match the menu. */
export function canAccessFeature(
  user: UserLike,
  feature: string | undefined,
  tenantHasFeature: (key: string) => boolean,
): boolean {
  if (!feature) return true
  if (!user) return false

  if (user.role === 'admin') return tenantHasFeature(feature)

  if (feature === 'settings' || feature === 'clinics') return false

  if (user.role === 'branch' && !BRANCH_ALLOWED.has(feature)) return false

  if (!tenantHasFeature(feature)) return false

  const userPerms =
    user.role !== 'admin' && Array.isArray(user.permissions)
      ? new Set(user.permissions)
      : null

  if (feature === 'reports' && !['admin', 'pharmacist', 'branch_manager'].includes(user.role || '')) {
    if (!userPerms?.has('reports')) return false
  }

  if (feature === 'hr' && !['admin', 'branch'].includes(user.role || '')) {
    if (!canAccessHr(user)) return false
  }

  if (userPerms) {
    if (feature === 'hr') {
      if (!canAccessHr(user)) return false
    } else if (!userPerms.has(feature)) {
      return false
    }
  }

  return true
}

export function getDefaultHomePath(
  user: UserLike,
  tenantHasFeature: (key: string) => boolean,
): string {
  const home = FEATURE_HOME_ORDER.find((r) => canAccessFeature(user, r.feature, tenantHasFeature))
  return home?.path ?? '/'
}
