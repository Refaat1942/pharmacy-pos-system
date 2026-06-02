/** Parse comma / semicolon / pipe separated search terms (matches backend). */
export function parseSearchTerms(q: string): string[] {
  return q
    .replace(/;/g, ',')
    .replace(/\|/g, ',')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export type BranchStockPickRow = {
  key: string
  barcode?: string | null
  international_barcode?: string | null
  name_en: string
  name_ar: string
}

/** Auto-select when a term matches exactly one row by local or international barcode. */
export function autoPickKeys<T extends BranchStockPickRow>(items: T[], terms: string[]): Set<string> {
  const picked = new Set<string>()
  for (const term of terms) {
    const t = term.toLowerCase()
    const exact = items.filter(
      (row) =>
        (row.barcode || '').toLowerCase() === t ||
        (row.international_barcode || '').toLowerCase() === t
    )
    if (exact.length === 1) picked.add(exact[0].key)
  }
  return picked
}
