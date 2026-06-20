/** ibn sina / distributor PO line math (matches supplier statement). */

export function pharmacyUnit(
  publicPrice: number,
  salesTax: number,
  discountPct: number,
): number {
  const pub = Number(publicPrice) || 0
  const tax = Number(salesTax) || 0
  const base = tax > 0 ? pub - tax : pub
  return base * (1 - (Number(discountPct) || 0) / 100)
}

export function lineExTax(
  qty: number,
  publicPrice: number | null | undefined,
  salesTax: number,
  discountPct: number,
  unitCost?: number,
): number {
  const pub = publicPrice != null ? Number(publicPrice) : Number(unitCost) || 0
  return Number(qty) * pharmacyUnit(pub, salesTax, discountPct)
}

export function lineSalesTax(qty: number, salesTax: number): number {
  return Number(qty) * (Number(salesTax) || 0)
}

export function lineGross(
  qty: number,
  publicPrice: number | null | undefined,
  salesTax: number,
  discountPct: number,
  unitCost?: number,
): number {
  return lineExTax(qty, publicPrice, salesTax, discountPct, unitCost) + lineSalesTax(qty, salesTax)
}
