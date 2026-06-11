/** Digital delivery platforms — loaded from API; helpers for badges and labels. */

export interface DigitalPlatform {
  id: number
  platform_key: string
  name_en: string
  name_ar: string
  customer_id: number | null
  badge_color: string
  active: boolean
  sort_order: number
}

const BADGE_BY_COLOR: Record<string, string> = {
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
}

/** @deprecated use API list — kept for fallback labels */
export const LEGACY_PLATFORM_KEYS = ['talabat', 'vezeeta', 'other_digital'] as const

export function platformBadgeClass(
  platformId: string | null | undefined,
  badgeColor?: string | null,
): string {
  if (badgeColor && BADGE_BY_COLOR[badgeColor]) {
    return BADGE_BY_COLOR[badgeColor]
  }
  switch (platformId) {
    case 'talabat':
      return BADGE_BY_COLOR.orange
    case 'vezeeta':
      return BADGE_BY_COLOR.violet
    case 'other_digital':
      return BADGE_BY_COLOR.slate
    default:
      return BADGE_BY_COLOR.slate
  }
}

export function platformDisplayLabel(
  platform: DigitalPlatform | undefined,
  platformKey: string,
  lang: 'ar' | 'en',
  fallback?: string,
): string {
  if (platform) {
    return lang === 'ar'
      ? (platform.name_ar || platform.name_en)
      : (platform.name_en || platform.name_ar)
  }
  return fallback || platformKey.replace(/_/g, ' ')
}

export const BADGE_COLOR_OPTIONS = [
  'orange', 'violet', 'teal', 'blue', 'emerald', 'amber', 'rose', 'slate',
] as const
