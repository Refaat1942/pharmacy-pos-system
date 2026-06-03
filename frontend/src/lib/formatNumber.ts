import i18n from './i18n'

function locale() {
  return i18n.language === 'ar' ? 'ar-EG' : 'en-US'
}

/** Thousands separators; optional fixed decimals. */
export function formatNumber(
  n: number | string | null | undefined,
  opts?: { minDecimals?: number; maxDecimals?: number },
): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  const min = opts?.minDecimals ?? 0
  const max = opts?.maxDecimals ?? min
  return v.toLocaleString(locale(), { minimumFractionDigits: min, maximumFractionDigits: max })
}

export function formatInt(n: number | string | null | undefined): string {
  return formatNumber(n, { maxDecimals: 0 })
}

export function formatMoney(n: number | string | null | undefined): string {
  return formatNumber(n, { minDecimals: 2, maxDecimals: 2 })
}
