/** Parse comma / semicolon / pipe / newline separated search terms (matches backend). */
export function parseSearchTerms(q: string): string[] {
  return q
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, ',')
    .replace(/;/g, ',')
    .replace(/\|/g, ',')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function isMultiTermSearch(q: string): boolean {
  if (!q.trim()) return false
  if (/[,;\n\r|]/.test(q)) return true
  return parseSearchTerms(q).length > 1
}

export function looksLikeMultiInput(q: string): boolean {
  return /[,;\n\r|]/.test(q) || parseSearchTerms(q).length > 1
}

export type BranchStockPickRow = {
  key: string
  barcode?: string | null
  international_barcode?: string | null
  name_en: string
  name_ar: string
}

/** Pick rows matching each search term by code (exact/prefix) or name. */
export function autoPickKeys<T extends BranchStockPickRow>(items: T[], terms: string[]): Set<string> {
  const picked = new Set<string>()
  for (const term of terms) {
    const t = term.trim().toLowerCase()
    if (!t) continue

    const byExactCode = items.filter(
      (row) =>
        (row.barcode || '').toLowerCase() === t ||
        (row.international_barcode || '').toLowerCase() === t,
    )
    if (byExactCode.length) {
      byExactCode.forEach((r) => picked.add(r.key))
      continue
    }

    const byPrefixCode = items.filter(
      (row) =>
        (row.barcode || '').toLowerCase().startsWith(t) ||
        (row.international_barcode || '').toLowerCase().startsWith(t),
    )
    if (byPrefixCode.length >= 1 && byPrefixCode.length <= 5) {
      byPrefixCode.forEach((r) => picked.add(r.key))
      continue
    }

    const byName = items.filter((row) => {
      const ne = (row.name_en || '').toLowerCase()
      const na = (row.name_ar || '').toLowerCase()
      return ne.includes(t) || na.includes(t)
    })
    if (byName.length === 1) picked.add(byName[0].key)
    else if (byName.length > 0 && byName.length <= 10) byName.forEach((r) => picked.add(r.key))
  }
  return picked
}

/** One best match per search term (exact code preferred). */
export function autoPickKeysPerTerm<T extends BranchStockPickRow>(
  items: T[],
  terms: string[],
): Set<string> {
  const picked = new Set<string>()
  for (const term of terms) {
    const forTerm = autoPickKeys(items, [term])
    forTerm.forEach((k) => picked.add(k))
  }
  return picked
}
