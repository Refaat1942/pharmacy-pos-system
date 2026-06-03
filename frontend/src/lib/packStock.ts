/**
 * When pack_size > 1, stock is stored in sub-units (e.g. strips).
 * Entry "2.4" with pack_size 7 means 2 boxes + 4 strips → 2*7+4 = 18 sub-units.
 */

export function parsePackStockInput(raw: string, packSize: number): number | null {
  const s = raw.trim().replace(',', '.')
  if (!s) return null

  if (packSize <= 1) {
    const n = parseInt(s, 10)
    if (Number.isNaN(n) || n < 0) return null
    return n
  }

  if (s.includes('.')) {
    const [whole, frac = ''] = s.split('.', 2)
    const boxes = whole === '' ? 0 : parseInt(whole, 10)
    const subs = frac === '' ? 0 : parseInt(frac, 10)
    if (Number.isNaN(boxes) || boxes < 0 || Number.isNaN(subs) || subs < 0) return null
    if (subs >= packSize) return null
    return boxes * packSize + subs
  }

  const boxes = parseInt(s, 10)
  if (Number.isNaN(boxes) || boxes < 0) return null
  return boxes * packSize
}

/** Display value for pack-aware stock inputs (e.g. 18 → "2.4" when pack is 7). */
export function formatPackStockInput(stockSubUnits: number, packSize: number): string {
  const n = Math.max(0, Math.round(stockSubUnits))
  if (packSize <= 1) return String(n)
  const boxes = Math.floor(n / packSize)
  const subs = n % packSize
  return subs > 0 ? `${boxes}.${subs}` : String(boxes)
}

export function formatPackStockLabel(
  stockSubUnits: number,
  packSize: number,
  unit: string,
  subUnit: string,
): string {
  const n = Math.max(0, Math.round(stockSubUnits))
  if (packSize <= 1) return String(n)
  const boxes = Math.floor(n / packSize)
  const subs = n % packSize
  if (subs === 0) return `${boxes} ${unit}`
  if (boxes === 0) return `${subs} ${subUnit}`
  return `${boxes} ${unit} + ${subs} ${subUnit}`
}

export function packSizeOf(item: { pack_size?: number | null } | null | undefined): number {
  const p = item?.pack_size
  return p && p > 1 ? p : 1
}
