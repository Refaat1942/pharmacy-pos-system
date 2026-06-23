/** Egypt governorates → regions (stored as `governorate_key:region_key`). */

export interface RegionOption {
  value: string
  en: string
  ar: string
  group?: 'markaz' | 'area' | 'city'
}

export interface GovernorateOption {
  key: string
  en: string
  ar: string
  regions: RegionOption[]
}

export const EGYPT_GOVERNORATES: GovernorateOption[] = [
  {
    key: 'ismailia',
    en: 'Ismailia',
    ar: 'الإسماعيلية',
    regions: [
      { value: 'ismailia_city', en: 'Ismailia City', ar: 'مدينة الإسماعيلية', group: 'markaz' },
      { value: 'fayed', en: 'Fayed', ar: 'فايد', group: 'markaz' },
      { value: 'qantara_sharq', en: 'Qantara Sharq', ar: 'القنطرة شرق', group: 'markaz' },
      { value: 'qantara_gharb', en: 'Qantara Gharb', ar: 'القنطرة غرب', group: 'markaz' },
      { value: 'tell_el_kebir', en: 'Tell El Kebir', ar: 'التل الكبير', group: 'markaz' },
      { value: 'abu_sweir', en: 'Abu Sweir', ar: 'أبو صوير', group: 'markaz' },
      { value: 'kasaseen', en: 'Kasaseen El Gedida', ar: 'القصاصين الجديدة', group: 'markaz' },
      { value: 'sheikh_zayed', en: 'Sheikh Zayed District', ar: 'حي الشيخ زايد', group: 'area' },
      { value: 'numra_sitta', en: 'Numra Sitta (No. 6)', ar: 'نمرة ستة', group: 'area' },
      { value: 'el_hekr', en: 'El Hekr', ar: 'الحكر', group: 'area' },
      { value: 'el_mahatta', en: 'El Mahatta', ar: 'المحطة', group: 'area' },
      { value: 'el_salam', en: 'El Salam District', ar: 'حي السلام', group: 'area' },
      { value: 'first_district', en: '1st District', ar: 'الحي الأول', group: 'area' },
      { value: 'second_district', en: '2nd District', ar: 'الحي الثاني', group: 'area' },
      { value: 'third_district', en: '3rd District', ar: 'الحي الثالث', group: 'area' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'cairo',
    en: 'Cairo',
    ar: 'القاهرة',
    regions: [
      { value: 'nasr_city', en: 'Nasr City', ar: 'مدينة نصر', group: 'area' },
      { value: 'maadi', en: 'Maadi', ar: 'المعادي', group: 'area' },
      { value: 'heliopolis', en: 'Heliopolis', ar: 'مصر الجديدة', group: 'area' },
      { value: 'downtown', en: 'Downtown', ar: 'وسط البلد', group: 'area' },
      { value: 'shubra', en: 'Shubra', ar: 'شبرا', group: 'area' },
      { value: 'ain_shams', en: 'Ain Shams', ar: 'عين شمس', group: 'area' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'giza',
    en: 'Giza',
    ar: 'الجيزة',
    regions: [
      { value: 'giza_city', en: 'Giza City', ar: 'مدينة الجيزة', group: 'markaz' },
      { value: '6_october', en: '6th of October', ar: '6 أكتوبر', group: 'city' },
      { value: 'sheikh_zayed_giza', en: 'Sheikh Zayed', ar: 'الشيخ زايد', group: 'city' },
      { value: 'haram', en: 'Al Haram', ar: 'الهرم', group: 'area' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'alexandria',
    en: 'Alexandria',
    ar: 'الإسكندرية',
    regions: [
      { value: 'alex_center', en: 'City Center', ar: 'وسط المدينة', group: 'area' },
      { value: 'montaza', en: 'Montaza', ar: 'المنتزه', group: 'area' },
      { value: 'agami', en: 'Agami', ar: 'العجمي', group: 'area' },
      { value: 'borg_arab', en: 'Borg El Arab', ar: 'برج العرب', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'sharqia',
    en: 'Sharqia',
    ar: 'الشرقية',
    regions: [
      { value: 'zagazig', en: 'Zagazig', ar: 'الزقازيق', group: 'markaz' },
      { value: '10th_ramadan', en: '10th of Ramadan', ar: '10 رمضان', group: 'city' },
      { value: 'belbeis', en: 'Belbeis', ar: 'بلبيس', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'dakahlia',
    en: 'Dakahlia',
    ar: 'الدقهلية',
    regions: [
      { value: 'mansoura', en: 'Mansoura', ar: 'المنصورة', group: 'markaz' },
      { value: 'talkha', en: 'Talkha', ar: 'طلخا', group: 'markaz' },
      { value: 'mit_ghamr', en: 'Mit Ghamr', ar: 'ميت غمر', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'qalyubia',
    en: 'Qalyubia',
    ar: 'القليوبية',
    regions: [
      { value: 'banha', en: 'Banha', ar: 'بنها', group: 'markaz' },
      { value: 'qalyub', en: 'Qalyub', ar: 'قليوب', group: 'markaz' },
      { value: 'shubra_el_kheima', en: 'Shubra El Kheima', ar: 'شبرا الخيمة', group: 'city' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'port_said',
    en: 'Port Said',
    ar: 'بورسعيد',
    regions: [
      { value: 'port_said_city', en: 'Port Said City', ar: 'مدينة بورسعيد', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'suez',
    en: 'Suez',
    ar: 'السويس',
    regions: [
      { value: 'suez_city', en: 'Suez City', ar: 'مدينة السويس', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'beheira',
    en: 'Beheira',
    ar: 'البحيرة',
    regions: [
      { value: 'damanhour', en: 'Damanhour', ar: 'دمنهور', group: 'markaz' },
      { value: 'kafr_el_dawwar', en: 'Kafr El Dawwar', ar: 'كفر الدوار', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'gharbia',
    en: 'Gharbia',
    ar: 'الغربية',
    regions: [
      { value: 'tanta', en: 'Tanta', ar: 'طنطا', group: 'markaz' },
      { value: 'mahalla', en: 'El Mahalla El Kubra', ar: 'المحلة الكبرى', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'monufia',
    en: 'Monufia',
    ar: 'المنوفية',
    regions: [
      { value: 'shibin_el_kom', en: 'Shibin El Kom', ar: 'شبين الكوم', group: 'markaz' },
      { value: 'sadat_city', en: 'Sadat City', ar: 'مدينة السادات', group: 'city' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'kafr_el_sheikh',
    en: 'Kafr El Sheikh',
    ar: 'كفر الشيخ',
    regions: [
      { value: 'kafr_el_sheikh_city', en: 'Kafr El Sheikh City', ar: 'مدينة كفر الشيخ', group: 'markaz' },
      { value: 'desouk', en: 'Desouk', ar: 'دسوق', group: 'markaz' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'damietta',
    en: 'Damietta',
    ar: 'دمياط',
    regions: [
      { value: 'damietta_city', en: 'Damietta City', ar: 'مدينة دمياط', group: 'markaz' },
      { value: 'new_damietta', en: 'New Damietta', ar: 'دمياط الجديدة', group: 'city' },
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
  {
    key: 'other',
    en: 'Other Governorate',
    ar: 'محافظة أخرى',
    regions: [
      { value: 'other', en: 'Other', ar: 'أخرى', group: 'area' },
    ],
  },
]

/** @deprecated use EGYPT_GOVERNORATES — kept for imports that expect flat Ismailia list */
export const ISMAILIA_REGIONS = EGYPT_GOVERNORATES.find((g) => g.key === 'ismailia')!.regions

export function encodeRegion(governorate: string, region: string, customLabel?: string): string {
  if (!governorate || !region) return region || governorate || ''
  if (region === 'other' && customLabel?.trim()) {
    return `${governorate}:other:${customLabel.trim()}`
  }
  return `${governorate}:${region}`
}

export function parseRegionValue(value: string | null | undefined): {
  governorate: string
  region: string
  custom?: string
} {
  if (!value) return { governorate: '', region: '' }
  if (value.includes(':')) {
    const parts = value.split(':')
    const governorate = parts[0] || ''
    const region = parts[1] || ''
    const custom = parts.length > 2 ? parts.slice(2).join(':').trim() : undefined
    return { governorate, region, custom: custom || undefined }
  }
  const legacy = ISMAILIA_REGIONS.find((r) => r.value === value)
  if (legacy) return { governorate: 'ismailia', region: value }
  return { governorate: '', region: value }
}

export function regionLabel(value: string | null | undefined, lang: 'en' | 'ar' = 'en'): string {
  if (!value) return ''
  const { governorate, region, custom } = parseRegionValue(value)
  const gov = EGYPT_GOVERNORATES.find((g) => g.key === governorate)
  const reg = gov?.regions.find((r) => r.value === region)
    ?? ISMAILIA_REGIONS.find((r) => r.value === region || r.value === value)
  if (gov && reg) {
    const gName = lang === 'ar' ? gov.ar : gov.en
    if (region === 'other' && custom) return `${gName} — ${custom}`
    const rName = lang === 'ar' ? reg.ar : reg.en
    return `${gName} — ${rName}`
  }
  if (reg) return lang === 'ar' ? reg.ar : reg.en
  if (gov && custom) {
    const gName = lang === 'ar' ? gov.ar : gov.en
    return `${gName} — ${custom}`
  }
  return value
}

export function governorateLabel(key: string | null | undefined, lang: 'en' | 'ar' = 'en'): string {
  if (!key) return ''
  const g = EGYPT_GOVERNORATES.find((x) => x.key === key)
  if (!g) return key
  return lang === 'ar' ? g.ar : g.en
}
