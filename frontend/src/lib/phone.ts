export function normalizePhone(input: string): string {
  return (input || '').replace(/\D+/g, '').slice(0, 11)
}

export function isValidPhone(input: string | null | undefined): boolean {
  const v = (input || '').trim()
  if (!v) return true
  const digits = v.replace(/\D+/g, '')
  return digits.length === 11 && digits.startsWith('01')
}

export function phoneError(input: string | null | undefined, t: (k: string) => string): string {
  if (!input || !input.trim()) return ''
  return isValidPhone(input) ? '' : t('validation.phone_invalid')
}
