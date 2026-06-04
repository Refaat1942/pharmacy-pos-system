/**
 * When pack_size > 1, stock is stored in sub-units (strips, ampoules, etc.).
 *
 * Primary entry/display: **decimal boxes** = total sub-units ÷ pack_size.
 * - pack 2: "2.5" → 2½ boxes → 5 strips
 * - pack 3: "1.667" → 1 box + 2 strips → 5 strips (5÷3 ≈ 1.667)
 *
 * Shorthand (optional): **box.sub** when digits after "." are the loose sub-unit count
 * and that count is less than pack_size — e.g. "2.4" @ pack 7 → 2 boxes + 4 strips.
 */

function trimDecimals(n: number, maxPlaces = 3): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  const s = n.toFixed(maxPlaces).replace(/\.?0+$/, '')
  return s || '0'
}

/** Decimal box count for display (e.g. 5 strips ÷ 3 → "1.667"). */
export function formatDecimalBoxes(stockSubUnits: number, packSize: number): string {
  const n = Math.max(0, Math.round(stockSubUnits))
  if (packSize <= 1) return String(n)
  return trimDecimals(n / packSize)
}

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
    const wholeBoxes = wholePart === '' ? 0 : parseInt(wholePart, 10)
    if (Number.isNaN(wholeBoxes) || wholeBoxes < 0) return null

    if (fracPart === '') {
      return wholeBoxes * packSize
    }

    const looseSubs = parseInt(fracPart, 10)
    if (Number.isNaN(looseSubs) || looseSubs < 0) return null

    const asDecimal = parseFloat(s)
    const useDecimalBoxes =
      fracPart.length >= 3 ||
      looseSubs >= packSize ||
      !Number.isFinite(asDecimal)

    if (!useDecimalBoxes && looseSubs < packSize) {
      return wholeBoxes * packSize + looseSubs
    }
    if (Number.isFinite(asDecimal) && asDecimal >= 0) {
      return Math.round(asDecimal * packSize)
    }
    return null
  }

  const boxes = parseInt(s, 10)
  if (Number.isNaN(boxes) || boxes < 0) return null
  return boxes * packSize
}

/** Value for stock input fields — decimal boxes (e.g. 5 strips @ pack 3 → "1.667"). */
export function formatPackStockInput(stockSubUnits: number, packSize: number): string {
  return formatDecimalBoxes(stockSubUnits, packSize)
}

export function formatPackStockLabel(
  stockSubUnits: number,
  packSize: number,
  unit: string,
  subUnit: string,
): string {
  const n = Math.max(0, Math.round(stockSubUnits))
  if (packSize <= 1) return String(n)
  const dec = formatDecimalBoxes(n, packSize)
  const fullBoxes = Math.floor(n / packSize)
  const loose = n % packSize
  if (loose === 0) return `${dec} ${unit}`
  if (fullBoxes === 0) return `${dec} ${unit} (${loose} ${subUnit})`
  return `${dec} ${unit} (${fullBoxes} ${unit} + ${loose} ${subUnit})`
}

export function packSizeOf(item: { pack_size?: number | null } | null | undefined): number {
  const p = item?.pack_size
  return p && p > 1 ? p : 1
}

/** Sub-units from a decimal box string (for live preview in forms). */
export function subUnitsFromBoxInput(raw: string, packSize: number): number | null {
  return parsePackStockInput(raw, packSize)
}

/** Stock variance in major units (boxes) — e.g. counted 2 vs system 3.5 → -1.5 */
export function stockVarianceMajorUnits(
  countedSubUnits: number,
  systemSubUnits: number,
  packSize: number,
): number {
  if (packSize <= 1) return countedSubUnits - systemSubUnits
  return countedSubUnits / packSize - systemSubUnits / packSize
}

export function formatVarianceMajorUnits(variance: number): string {
  if (variance === 0) return '0'
  const abs = trimDecimals(Math.abs(variance))
  return variance > 0 ? `+${abs}` : `-${abs}`
}
