/** Build wa.me links for Egyptian mobile numbers (01xxxxxxxxx → 20…). */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('01') && digits.length === 11) {
    return `20${digits.slice(1)}`
  }
  if (digits.startsWith('20') && digits.length >= 12) return digits
  if (digits.length >= 10) return digits
  return null
}

export function buildWhatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!normalized) return null
  const base = `https://wa.me/${normalized}`
  const text = (message || '').trim()
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

export function whatsAppGreeting(name: string, lang: 'ar' | 'en'): string {
  const n = (name || '').trim() || (lang === 'ar' ? 'عميلنا' : 'there')
  return lang === 'ar' ? `السلام عليكم ${n}،` : `Hello ${n},`
}

export function openWhatsApp(phone: string | null | undefined, message?: string): void {
  const url = buildWhatsAppLink(phone, message)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

export function canOpenWhatsApp(phone: string | null | undefined): boolean {
  return normalizeWhatsAppPhone(phone) !== null
}
