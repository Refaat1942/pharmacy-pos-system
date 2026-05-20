// Ismailia Governorate (محافظة الإسماعيلية) — markaz/cities and main areas
export interface Region {
  value: string
  en: string
  ar: string
  group?: 'markaz' | 'area'
}

export const ISMAILIA_REGIONS: Region[] = [
  // Markaz / Cities
  { value: 'ismailia_city', en: 'Ismailia City', ar: 'مدينة الإسماعيلية', group: 'markaz' },
  { value: 'fayed', en: 'Fayed', ar: 'فايد', group: 'markaz' },
  { value: 'qantara_sharq', en: 'Qantara Sharq', ar: 'القنطرة شرق', group: 'markaz' },
  { value: 'qantara_gharb', en: 'Qantara Gharb', ar: 'القنطرة غرب', group: 'markaz' },
  { value: 'tell_el_kebir', en: 'Tell El Kebir', ar: 'التل الكبير', group: 'markaz' },
  { value: 'abu_sweir', en: 'Abu Sweir', ar: 'أبو صوير', group: 'markaz' },
  { value: 'kasaseen', en: 'Kasaseen El Gedida', ar: 'القصاصين الجديدة', group: 'markaz' },
  // Ismailia City neighborhoods / areas
  { value: 'sheikh_zayed', en: 'Sheikh Zayed District', ar: 'حي الشيخ زايد', group: 'area' },
  { value: 'numra_sitta', en: 'Numra Sitta (No. 6)', ar: 'نمرة ستة', group: 'area' },
  { value: 'el_hekr', en: 'El Hekr', ar: 'الحكر', group: 'area' },
  { value: 'el_mahatta', en: 'El Mahatta', ar: 'المحطة', group: 'area' },
  { value: 'el_salam', en: 'El Salam District', ar: 'حي السلام', group: 'area' },
  { value: 'el_manakh', en: 'El Manakh', ar: 'المناخ', group: 'area' },
  { value: 'el_forsan', en: 'El Forsan', ar: 'الفرسان', group: 'area' },
  { value: 'el_arashiya', en: 'El Arashiya', ar: 'العرايشية', group: 'area' },
  { value: 'first_district', en: '1st District', ar: 'الحي الأول', group: 'area' },
  { value: 'second_district', en: '2nd District', ar: 'الحي الثاني', group: 'area' },
  { value: 'third_district', en: '3rd District', ar: 'الحي الثالث', group: 'area' },
  { value: 'abtal', en: 'Abtal El Tahrir', ar: 'أبطال التحرير', group: 'area' },
  { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
]

export function regionLabel(value: string | null | undefined, lang: 'en' | 'ar' = 'en'): string {
  if (!value) return ''
  const r = ISMAILIA_REGIONS.find((x) => x.value === value)
  if (!r) return value
  return lang === 'ar' ? r.ar : r.en
}
