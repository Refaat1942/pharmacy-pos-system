import type { Product } from './api'

/** True when the scan looks like an EAN/GTIN (all digits, 8+ chars). */
function isGtinLike(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  return compact.length >= 8 && /^\d+$/.test(compact)
}

/** Build lookup keys from a raw scanner value (handles local CODE-SUFFIX labels). */
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

  add(raw)
  const dash = raw.indexOf('-')
  if (dash > 0) {
    const base = raw.slice(0, dash).trim()
    const suffix = raw.slice(dash + 1).trim()
    if (base && suffix && !isGtinLike(raw)) add(base)
  }
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
