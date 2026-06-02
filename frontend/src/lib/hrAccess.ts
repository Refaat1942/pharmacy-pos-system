/** HR sub-module permissions (stored in user.permissions alongside nav features). */

export const HR_SUB_FEATURES = [
  'hr_employees',
  'hr_attendance',
  'hr_payroll',
  'hr_performance',
] as const

export type HrTab = 'employees' | 'attendance' | 'payroll' | 'performance'

const TAB_PERM: Record<HrTab, (typeof HR_SUB_FEATURES)[number]> = {
  employees: 'hr_employees',
  attendance: 'hr_attendance',
  payroll: 'hr_payroll',
  performance: 'hr_performance',
}

type UserLike = { role?: string; permissions?: string[] | null } | null | undefined

function permSet(user: UserLike): Set<string> | null {
  if (!user || user.role === 'admin') return null
  if (!Array.isArray(user.permissions)) return new Set()
  return new Set(user.permissions)
}

/** Any HR page access (sidebar link). */
export function canAccessHr(user: UserLike): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'branch') return true
  const s = permSet(user)
  if (!s) return true
  if (s.has('hr')) return true
  return HR_SUB_FEATURES.some((f) => s!.has(f))
}

/** A specific HR tab (employees, attendance, payroll, performance). */
export function hasHrTab(user: UserLike, tab: HrTab): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'branch') return tab === 'attendance'
  const s = permSet(user)
  if (!s) return false
  if (s.has(TAB_PERM[tab])) return true
  // Legacy: bare "hr" permission meant attendance only.
  if (tab === 'attendance' && s.has('hr')) return true
  return false
}

export function allowedHrTabs(user: UserLike): HrTab[] {
  const all: HrTab[] = ['employees', 'attendance', 'payroll', 'performance']
  return all.filter((tab) => hasHrTab(user, tab))
}

/** Add/edit/delete employees and print QR clock cards (admin only). */
export function canManageEmployees(user: UserLike): boolean {
  return user?.role === 'admin'
}

/** Manually record or edit attendance rows (not the public clock screen). */
export function canRecordAttendance(user: UserLike): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'branch') return true
  return false
}
