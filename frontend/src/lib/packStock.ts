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

function roundStockSubUnits(stockSubUnits: number): number {
  if (!Number.isFinite(stockSubUnits)) return 0
  return Math.round(stockSubUnits)
}

/** Decimal box count for display (e.g. 5 strips ÷ 3 → "1.667"; -1 → "-1" or "-0.042"). */
export function formatDecimalBoxes(stockSubUnits: number, packSize: number): string {
  const n = roundStockSubUnits(stockSubUnits)
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
  const n = roundStockSubUnits(stockSubUnits)
  if (packSize <= 1) return unit ? `${n} ${unit}` : String(n)
  if (n < 0) return `${formatDecimalBoxes(n, packSize)} ${unit} (${n} ${subUnit})`
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

/**
 * Major + sub breakdown ONLY (no leading decimal), e.g. "9 Box + 1 Strip".
 * Meant to be shown in small font under the decimal value.
 * Returns '' when pack_size <= 1 (nothing useful to add).
 */
export function formatMajorSubLabel(
  stockSubUnits: number,
  packSize?: number | null,
  unit?: string | null,
  subUnit?: string | null,
): string {
  const pack = packSize && packSize > 1 ? packSize : 1
  if (pack <= 1) return ''
  const n = roundStockSubUnits(stockSubUnits)
  const u = unit || 'box'
  const su = subUnit || 'unit'
  if (n < 0) return `${n} ${su}`
  const fullBoxes = Math.floor(n / pack)
  const loose = n % pack
  if (fullBoxes > 0 && loose > 0) return `${fullBoxes} ${u} + ${loose} ${su}`
  if (fullBoxes > 0) return `${fullBoxes} ${u}`
  return `${loose} ${su}`
}

/**
 * Inline one-line stock label: decimal value + major/sub breakdown in parentheses,
 * e.g. "9.5 (9 Box + 1 Strip)". Used where a two-line layout doesn't fit (POS rows).
 */
export function formatStockInline(
  stockSubUnits: number,
  packSize?: number | null,
  unit?: string | null,
  subUnit?: string | null,
): string {
  const pack = packSize && packSize > 1 ? packSize : 1
  const n = roundStockSubUnits(stockSubUnits)
  if (pack <= 1) return String(n)
  const breakdown = formatMajorSubLabel(n, pack, unit, subUnit)
  return breakdown ? `${formatDecimalBoxes(n, pack)} (${breakdown})` : formatDecimalBoxes(n, pack)
}

/**
 * Compact stock label used across Inventory, Expiry, Branch Stock and POS so every
 * surface shows the SAME quantity. Primary value is decimal boxes; when there is a
 * loose remainder it is appended in sub-units, e.g. "9.5 Box (9 Box + 1 Strip)".
 * When pack_size <= 1 it just returns the integer count (optionally with the unit).
 */
export function formatStockDisplay(
  stockSubUnits: number,
  packSize?: number | null,
  unit?: string | null,
  subUnit?: string | null,
): string {
  const pack = packSize && packSize > 1 ? packSize : 1
  const n = roundStockSubUnits(stockSubUnits)
  if (pack <= 1) return unit ? `${n} ${unit}` : String(n)
  if (unit && subUnit) return formatPackStockLabel(n, pack, unit, subUnit)
  return formatDecimalBoxes(n, pack)
}

/** Tooltip with the full breakdown (boxes + loose sub-units + raw sub-unit total). */
export function stockBreakdownTitle(
  stockSubUnits: number,
  packSize?: number | null,
  unit?: string | null,
  subUnit?: string | null,
): string {
  const pack = packSize && packSize > 1 ? packSize : 1
  const n = roundStockSubUnits(stockSubUnits)
  if (pack <= 1) return unit ? `${n} ${unit}` : String(n)
  const label = unit && subUnit ? formatPackStockLabel(n, pack, unit, subUnit) : formatDecimalBoxes(n, pack)
  const sub = subUnit || 'sub-units'
  return `${label} — ${n} ${sub} total`
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

/** Split variance into whole boxes + fractional box remainder (shown as sub-units). */
export function stockVarianceSplit(
  countedSubUnits: number,
  systemSubUnits: number,
  packSize: number,
): { major: number; subFraction: number } {
  if (packSize <= 1) {
    return { major: countedSubUnits - systemSubUnits, subFraction: 0 }
  }
  const totalBoxes = stockVarianceMajorUnits(countedSubUnits, systemSubUnits, packSize)
  if (totalBoxes === 0) return { major: 0, subFraction: 0 }
  const sign = totalBoxes > 0 ? 1 : -1
  const abs = Math.abs(totalBoxes)
  const whole = Math.floor(abs) * sign
  const frac = (abs - Math.floor(abs)) * sign
  return { major: whole, subFraction: frac }
}

export function formatVarianceMajorUnits(variance: number): string {
  if (variance === 0) return '0'
  const abs = trimDecimals(Math.abs(variance))
  return variance > 0 ? `+${abs}` : `-${abs}`
}

export function formatVarianceSubFraction(fraction: number): string {
  if (fraction === 0) return '0'
  const abs = trimDecimals(Math.abs(fraction))
  return fraction > 0 ? `+${abs}` : `-${abs}`
}
