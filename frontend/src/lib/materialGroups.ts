/** Material group codes for insurance / discount classification (RMS-style). */
export const MATERIAL_GROUP_CODES = [
  'DL',
  'DI',
  'DII',
  'CL',
  'CI',
  'DNDISC',
  'ML',
  'MI',
  'DLAB',
  'SERV',
] as const

export type MaterialGroupCode = (typeof MATERIAL_GROUP_CODES)[number]

export const MATERIAL_GROUP_META: Record<
  MaterialGroupCode,
  { label_en: string; label_ar: string; origin: 'local' | 'imported' }
> = {
  DL: { label_en: 'Drug Local', label_ar: 'دواء محلي', origin: 'local' },
  DI: { label_en: 'Drug Imported', label_ar: 'دواء مستورد', origin: 'imported' },
  DII: { label_en: 'Drug Illegal Imported', label_ar: 'دواء مستورد غير قانوني', origin: 'imported' },
  CL: { label_en: 'Cosmetics Local', label_ar: 'مستحضرات محلية', origin: 'local' },
  CI: { label_en: 'Cosmetics Imported', label_ar: 'مستحضرات مستوردة', origin: 'imported' },
  DNDISC: { label_en: 'Drug Non Discountable', label_ar: 'دواء غير قابل للخصم', origin: 'local' },
  ML: { label_en: 'Medical Accessories Local', label_ar: 'مستلزمات طبية محلية', origin: 'local' },
  MI: { label_en: 'Medical Accessories Imported', label_ar: 'مستلزمات طبية مستوردة', origin: 'imported' },
  DLAB: { label_en: 'Lab', label_ar: 'تحاليل', origin: 'local' },
  SERV: { label_en: 'Services', label_ar: 'خدمات', origin: 'local' },
}

export function materialGroupLabel(code: string, t: (k: string) => string, lang: 'ar' | 'en'): string {
  const meta = MATERIAL_GROUP_META[code as MaterialGroupCode]
  if (!meta) return code
  const k = `inventory.material_groups.${code}`
  const v = t(k)
  if (v !== k) return v
  return lang === 'ar' ? meta.label_ar : meta.label_en
}

export function originFromMaterialGroup(code: string): 'local' | 'imported' {
  return MATERIAL_GROUP_META[code as MaterialGroupCode]?.origin ?? 'local'
}

export const DEFAULT_MATERIAL_GROUP: MaterialGroupCode = 'DL'

/** Bulk upload / paste aliases accepted in spreadsheets. */
export const MATERIAL_GROUP_UPLOAD_HINT =
  'DL, DI, DII, CL, CI, DNDISC, ML, MI, DLAB, SERV — or names like "Drug Local", "Drug Imported"'
