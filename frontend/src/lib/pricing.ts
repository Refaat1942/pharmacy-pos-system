/** Egypt gross-price model — profit & VAT are % of customer sales price. */

export const DEFAULT_PROFIT_RATIO = 0.2
export const DEFAULT_VAT_RATIO = 0.14
export const DEFAULT_COST_RATIO = 1 - DEFAULT_PROFIT_RATIO

export type PricingDriver =
  | 'price'
  | 'cost'
  | 'profit'
  | 'margin_pct'
  | 'cost_pct'
  | 'vat_amt'
  | 'net_ex_vat'
  | 'vat_rate_pct'

export interface PricingFields {
  price: string
  cost: string
  profit: string
  vat_amt: string
  net_ex_vat: string
  margin_pct: string
  cost_pct: string
  vat_rate_pct: string
}

export const EMPTY_PRICING: PricingFields = {
  price: '',
  cost: '',
  profit: '',
  vat_amt: '',
  net_ex_vat: '',
  margin_pct: '',
  cost_pct: '',
  vat_rate_pct: '14',
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function str(n: number): string {
  return Number.isFinite(n) ? String(round2(n)) : ''
}

function vatRateFromFields(vatRatePct: string): number {
  const p = parseFloat(vatRatePct)
  return Number.isFinite(p) && p >= 0 ? p / 100 : DEFAULT_VAT_RATIO
}

function vatFromPrice(price: number, vatRate: number): { vat_amt: number; net_ex_vat: number } {
  const vat_amt = round2(price * vatRate)
  return { vat_amt, net_ex_vat: round2(price - vat_amt) }
}

function marginFromPriceCost(price: number, cost: number): { profit: number; margin_pct: number; cost_pct: number } {
  const profit = round2(price - cost)
  const margin_pct = price > 0 ? round2((profit / price) * 100) : 0
  const cost_pct = price > 0 ? round2((cost / price) * 100) : 0
  return { profit, margin_pct, cost_pct }
}

export function pricingFieldsFromProduct(item?: {
  price?: number | null
  cost?: number | null
  vat_rate?: number | null
}): PricingFields {
  if (!item?.price || item.price <= 0) return { ...EMPTY_PRICING }
  const price = Number(item.price)
  const vatRate = item.vat_rate != null && Number(item.vat_rate) > 0
    ? Number(item.vat_rate)
    : DEFAULT_VAT_RATIO
  const cost = item.cost != null && Number(item.cost) > 0
    ? Number(item.cost)
    : round2(price * DEFAULT_COST_RATIO)
  const { profit, margin_pct, cost_pct } = marginFromPriceCost(price, cost)
  const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
  return {
    price: str(price),
    cost: str(cost),
    profit: str(profit),
    vat_amt: str(vat_amt),
    net_ex_vat: str(net_ex_vat),
    margin_pct: str(margin_pct),
    cost_pct: str(cost_pct),
    vat_rate_pct: str(round2(vatRate * 100)),
  }
}

/** Recalculate linked pricing fields when the user edits one of them. */
export function applyPricingChange(
  current: PricingFields,
  driver: PricingDriver,
  raw: string,
): PricingFields {
  const next: PricingFields = { ...current }

  switch (driver) {
    case 'price':
      next.price = raw
      break
    case 'cost':
      next.cost = raw
      break
    case 'profit':
      next.profit = raw
      break
    case 'margin_pct':
      next.margin_pct = raw
      break
    case 'cost_pct':
      next.cost_pct = raw
      break
    case 'vat_amt':
      next.vat_amt = raw
      break
    case 'net_ex_vat':
      next.net_ex_vat = raw
      break
    case 'vat_rate_pct':
      next.vat_rate_pct = raw
      break
    default:
      return next
  }

  const price = parseFloat(next.price) || 0
  if (price <= 0) {
    if (driver === 'price') {
      return { ...EMPTY_PRICING, price: raw, vat_rate_pct: next.vat_rate_pct || '14' }
    }
    return next
  }

  const vatRate = vatRateFromFields(next.vat_rate_pct)

  if (driver === 'price') {
    const cost = round2(price * DEFAULT_COST_RATIO)
    const profit = round2(price * DEFAULT_PROFIT_RATIO)
    const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
    return {
      ...next,
      cost: str(cost),
      profit: str(profit),
      margin_pct: str(DEFAULT_PROFIT_RATIO * 100),
      cost_pct: str(DEFAULT_COST_RATIO * 100),
      vat_amt: str(vat_amt),
      net_ex_vat: str(net_ex_vat),
    }
  }

  if (driver === 'cost') {
    const cost = parseFloat(next.cost) || 0
    const { profit, margin_pct, cost_pct } = marginFromPriceCost(price, cost)
    const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
    return { ...next, profit: str(profit), margin_pct: str(margin_pct), cost_pct: str(cost_pct), vat_amt: str(vat_amt), net_ex_vat: str(net_ex_vat) }
  }

  if (driver === 'profit') {
    const profit = parseFloat(next.profit) || 0
    const cost = round2(price - profit)
    const { margin_pct, cost_pct } = marginFromPriceCost(price, cost)
    const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
    return { ...next, cost: str(cost), margin_pct: str(margin_pct), cost_pct: str(cost_pct), vat_amt: str(vat_amt), net_ex_vat: str(net_ex_vat) }
  }

  if (driver === 'margin_pct') {
    const margin = parseFloat(next.margin_pct) || 0
    const cost = round2(price * (1 - margin / 100))
    const profit = round2(price - cost)
    const cost_pct = round2(100 - margin)
    const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
    return { ...next, cost: str(cost), profit: str(profit), cost_pct: str(cost_pct), vat_amt: str(vat_amt), net_ex_vat: str(net_ex_vat) }
  }

  if (driver === 'cost_pct') {
    const costPct = parseFloat(next.cost_pct) || 0
    const cost = round2(price * (costPct / 100))
    const profit = round2(price - cost)
    const margin_pct = round2(100 - costPct)
    const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
    return { ...next, cost: str(cost), profit: str(profit), margin_pct: str(margin_pct), vat_amt: str(vat_amt), net_ex_vat: str(net_ex_vat) }
  }

  if (driver === 'vat_rate_pct') {
    const { vat_amt, net_ex_vat } = vatFromPrice(price, vatRate)
    return { ...next, vat_amt: str(vat_amt), net_ex_vat: str(net_ex_vat) }
  }

  if (driver === 'vat_amt') {
    const vatAmt = parseFloat(next.vat_amt) || 0
    const net = round2(price - vatAmt)
    const ratePct = price > 0 ? round2((vatAmt / price) * 100) : 0
    return { ...next, net_ex_vat: str(net), vat_rate_pct: str(ratePct) }
  }

  if (driver === 'net_ex_vat') {
    const net = parseFloat(next.net_ex_vat) || 0
    const vatAmt = round2(price - net)
    const ratePct = price > 0 ? round2((vatAmt / price) * 100) : 0
    return { ...next, vat_amt: str(vatAmt), vat_rate_pct: str(ratePct) }
  }

  return next
}

export function vatRateForSave(vatRatePct: string): number {
  return vatRateFromFields(vatRatePct)
}
