import type { Product } from './api'

const CONTROL_CHARS = /[\x00-\x1f\x7f]/g
const AIM_PREFIX = /^\][A-Za-z]\d/
const LOCAL_WITH_SUFFIX = /\d{4,}-\d{1,4}/g
const GTIN = /\d{8,14}/g

/** True when the scan looks like an EAN/GTIN (all digits, 8+ chars). */
function isGtinLike(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  return compact.length >= 8 && /^\d+$/.test(compact)
}

/** Strip control chars and common USB-scanner prefix/suffix wrappers. */
export function sanitizeScannedBarcode(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(CONTROL_CHARS, '')
  if (AIM_PREFIX.test(s) && s.length > 3) s = s.slice(3)
  s = s.replace(/^\*+|\*+$/g, '')
  if (
    s.length >= 3
    && /[A-Za-z]/.test(s[0])
    && s[s.length - 1] === s[0]
    && (/\d/.test(s[1]) || s[1] === '-')
  ) {
    s = s.slice(1, -1)
  }
  if (s.length >= 2 && /[A-Za-z]/.test(s[0]) && /\d/.test(s[1])) s = s.slice(1)
  if (s.length >= 2 && /[A-Za-z]/.test(s[s.length - 1]) && /\d/.test(s[s.length - 2])) {
    s = s.slice(0, -1)
  }
  s = s.replace(/^[^0-9A-Za-z]+/, '').replace(/[^0-9A-Za-z-]+$/, '')
  return s.trim()
}

function embeddedTokens(raw: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (v: string) => {
    const key = v.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push(v)
  }
  for (const m of raw.matchAll(LOCAL_WITH_SUFFIX)) add(m[0])
  for (const m of raw.matchAll(GTIN)) add(m[0])
  return found
}

/** Build lookup keys from a raw scanner value. */
export function barcodeLookupCandidates(scanned: string): string[] {
  const raw = scanned.trim()
  if (!raw) return []
  const result: string[] = []
  const seen = new Set<string>()

  const add = (value: string) => {
    const v = value.trim()
    if (!v) return
    const key = v.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(v)
  }

  const expand = (value: string) => {
    add(value)
    const cleaned = sanitizeScannedBarcode(value)
    if (cleaned && cleaned !== value) add(cleaned)
    const source = cleaned || value
    const dash = source.indexOf('-')
    if (dash > 0) {
      const base = source.slice(0, dash).trim()
      const suffix = source.slice(dash + 1).trim()
      if (base && suffix && !isGtinLike(source)) add(base)
    }
  }

  expand(raw)
  const cleaned = sanitizeScannedBarcode(raw)
  for (const token of embeddedTokens(cleaned || raw)) expand(token)
  return result
}

/** Pick the best product match for a scanned barcode (intl barcode preferred). */
export function matchProductByBarcode(products: Product[], scanned: string): Product | undefined {
  const candidates = barcodeLookupCandidates(scanned).map((c) => c.toUpperCase())
  if (!candidates.length) return undefined

  for (const p of products) {
    const intl = (p.international_barcode || '').trim().toUpperCase()
    if (!intl) continue
    if (candidates.some((c) => intl === c)) return p
  }
  for (const p of products) {
    const bc = (p.barcode || '').trim().toUpperCase()
    if (!bc) continue
    if (candidates.some((c) => bc === c)) return p
  }
  return undefined
}
