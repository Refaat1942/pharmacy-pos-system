/** Built-in dose / direction presets for label printing. */

export type DosePreset = {
  id: string
  text_en: string
  text_ar: string
}

export type DosePresetCustom = {
  id: string
  text_en: string
  text_ar: string
}

export const BUILTIN_DOSE_PRESETS: DosePreset[] = [
  { id: 'once-daily', text_en: 'Once daily', text_ar: 'مرة واحدة يومياً' },
  { id: 'twice-daily', text_en: 'Twice daily', text_ar: 'مرتين يومياً' },
  { id: 'three-times-daily', text_en: 'Three times daily', text_ar: 'ثلاث مرات يومياً' },
  { id: 'four-times-daily', text_en: 'Four times daily', text_ar: 'أربع مرات يومياً' },
  { id: 'every-8h', text_en: 'Every 8 hours', text_ar: 'كل 8 ساعات' },
  { id: 'every-12h', text_en: 'Every 12 hours', text_ar: 'كل 12 ساعة' },
  { id: 'before-meals', text_en: 'Before meals', text_ar: 'قبل الأكل' },
  { id: 'after-meals', text_en: 'After meals', text_ar: 'بعد الأكل' },
  { id: 'with-meals', text_en: 'With meals', text_ar: 'مع الأكل' },
  { id: 'before-breakfast', text_en: 'Before breakfast', text_ar: 'قبل الإفطار' },
  { id: 'after-breakfast', text_en: 'After breakfast', text_ar: 'بعد الإفطار' },
  { id: 'before-bed', text_en: 'At bedtime', text_ar: 'قبل النوم' },
  { id: 'empty-stomach', text_en: 'On empty stomach', text_ar: 'على معدة فارغة' },
  { id: 'as-needed', text_en: 'As needed', text_ar: 'عند اللزوم' },
  { id: 'morning', text_en: 'In the morning', text_ar: 'صباحاً' },
  { id: 'evening', text_en: 'In the evening', text_ar: 'مساءً' },
]

export function doseTextForPreset(
  preset: { text_en: string; text_ar: string },
  lang: 'ar' | 'en',
): string {
  return lang === 'ar' ? (preset.text_ar || preset.text_en) : (preset.text_en || preset.text_ar)
}

export function mergeDosePresets(custom: DosePresetCustom[] | null | undefined): DosePreset[] {
  const builtins = BUILTIN_DOSE_PRESETS
  const extra = (custom || []).filter((c) => c.text_en?.trim() || c.text_ar?.trim())
  return [...builtins, ...extra.map((c) => ({
    id: c.id || `custom-${c.text_en}`,
    text_en: c.text_en?.trim() || c.text_ar?.trim() || '',
    text_ar: c.text_ar?.trim() || c.text_en?.trim() || '',
  }))]
}

export function newCustomPresetId(): string {
  return `custom-${Date.now().toString(36)}`
}
