/** Digital delivery platforms (matches backend customers.PLATFORM_PARTNER_NAMES). */
export const DIGITAL_PLATFORMS = [
  { id: 'talabat', labelKey: 'sales.talabat' },
  { id: 'vezeeta', labelKey: 'sales.vezeeta' },
  { id: 'other_digital', labelKey: 'sales.other_digital' },
] as const

export type DigitalPlatformId = (typeof DIGITAL_PLATFORMS)[number]['id']

export function platformBadgeClass(platformId: string | null | undefined): string {
  switch (platformId) {
    case 'talabat':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'vezeeta':
      return 'bg-violet-100 text-violet-800 border-violet-200'
    case 'other_digital':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}
