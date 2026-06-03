/**
 * When pack_size > 1, stock is stored in sub-units (e.g. strips).
 * Entry formats:
 * - Box.sub: "2.1" with pack_size 2 → 2 boxes + 1 strip → 5 sub-units.
 * - Decimal boxes: "2.5" with pack_size 2 → 2½ boxes → 5 sub-units.
 * - Whole boxes: "3" → 3 boxes → 3 * pack_size sub-units.
 */

export function parsePackStockInput(raw: string, packSize: number): number | null {
  const s = raw.trim().replace(',', '.')
  if (!s) return null

  if (packSize <= 1) {
    const f = parseFloat(s)
    if (!Number.isFinite(f) || f < 0) return null
    return Math.round(f)
  }

  if (s.includes('.')) {
    const [wholePart, fracPart = ''] = s.split('.', 2)
    const boxes = wholePart === '' ? 0 : parseInt(wholePart, 10)
    if (Number.isNaN(boxes) || boxes < 0) return null

    if (fracPart === '') {
      return boxes * packSize
    }

    const subs = parseInt(fracPart, 10)
    if (Number.isNaN(subs) || subs < 0) return null

    // e.g. 2.1 @ pack 2 → 2 boxes + 1 strip (not 2.1 decimal boxes)
    if (subs < packSize) {
      return boxes * packSize + subs
    }

    // e.g. 2.5 @ pack 2 → 2.5 boxes
    const asDecimal = parseFloat(s)
    if (!Number.isFinite(asDecimal) || asDecimal < 0) return null
    return Math.round(asDecimal * packSize)
  }

  const boxes = parseInt(s, 10)
  if (Number.isNaN(boxes) || boxes < 0) return null
  return boxes * packSize
}

/** Display value for pack-aware stock inputs (e.g. 5 strips @ pack 2 → "2.5" or "2.1"). */
export function formatPackStockInput(stockSubUnits: number, packSize: number): string {
  const n = Math.max(0, Math.round(stockSubUnits))
  if (packSize <= 1) return String(n)
  const whole = Math.floor(n / packSize)
  const subs = n % packSize
  if (subs === 0) return String(whole)
  // Prefer box.strip notation when unambiguous (e.g. 5 strips → "2.1" not "2.5")
  if (subs < packSize) return `${whole}.${subs}`
  const boxesExact = n / packSize
  const dec = Math.round(boxesExact * 100) / 100
  if (Math.abs(dec * packSize - n) < 0.001) return String(dec)
  return `${whole}.${subs}`
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
  const dec = Math.round((n / packSize) * 10) / 10
  if (Math.abs(dec * packSize - n) < 0.001 && !Number.isInteger(dec)) {
    return `${dec} ${unit}`
  }
  return `${boxes} ${unit} + ${subs} ${subUnit}`
}

export function packSizeOf(item: { pack_size?: number | null } | null | undefined): number {
  const p = item?.pack_size
  return p && p > 1 ? p : 1
}
