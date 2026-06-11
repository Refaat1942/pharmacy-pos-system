import type { CartItem } from './api'

export type OfferType =
  | 'second_half'
  | 'bogo'
  | 'buy2get1'
  | 'direct_percent'
  | 'direct_amount'

export interface PromoOffer {
  id: number
  name_en: string
  name_ar: string
  offer_type: OfferType
  discount_percent?: number | null
  discount_amount?: number | null
  priority: number
  active: boolean
  valid_from?: string | null
  valid_to?: string | null
  branch_ids?: number[] | null
  product_ids: number[]
  products?: { id: number; name_en: string; name_ar: string; barcode: string; price: number }[]
}

export function offerTypeLabel(type: OfferType, lang: 'ar' | 'en'): string {
  const en: Record<OfferType, string> = {
    second_half: '1 + 50% on 2nd',
    bogo: 'Buy 1 Get 1 Free',
    buy2get1: 'Buy 2 Get 1 Free',
    direct_percent: 'Direct % discount',
    direct_amount: 'Direct amount off',
  }
  const ar: Record<OfferType, string> = {
    second_half: '١ + ٥٠٪ على الثاني',
    bogo: 'اشتري واحد واحصل على الثاني مجاناً',
    buy2get1: 'اشتري ٢ واحصل على الثالث مجاناً',
    direct_percent: 'خصم نسبة مباشر',
    direct_amount: 'خصم مبلغ مباشر',
  }
  return (lang === 'ar' ? ar : en)[type] || type
}

const calcManualDiscount = (
  gross: number,
  mode: 'amount' | 'percent' | undefined,
  value: number | undefined,
): number => {
  const v = Math.max(0, value || 0)
  const d = mode === 'percent' ? (gross * v) / 100 : v
  return Math.min(gross, Math.max(0, +d.toFixed(2)))
}

/** Product IDs that belong to any active promo offer group. */
export function offerProductIds(offers: PromoOffer[]): Set<number> {
  const ids = new Set<number>()
  for (const o of offers) {
    if (!o.active) continue
    for (const pid of o.product_ids || []) ids.add(pid)
  }
  return ids
}

export function isOfferProduct(productId: number, offers: PromoOffer[]): boolean {
  return offerProductIds(offers).has(productId)
}

type UnitLine = { lineIdx: number; unitPrice: number; productId: number }

function flattenUnits(lines: { product_id: number; quantity: number; unit_price: number }[], productIds: Set<number>): UnitLine[] {
  const units: UnitLine[] = []
  lines.forEach((line, lineIdx) => {
    if (!productIds.has(line.product_id)) return
    for (let q = 0; q < line.quantity; q++) {
      units.push({ lineIdx, unitPrice: line.unit_price, productId: line.product_id })
    }
  })
  return units
}

function computeOfferLineDiscounts(
  offer: PromoOffer,
  cartLines: { product_id: number; quantity: number; unit_price: number }[],
): { byLine: Map<number, number>; total: number } {
  const productIds = new Set(offer.product_ids || [])
  const units = flattenUnits(cartLines, productIds)
  if (!units.length) return { byLine: new Map(), total: 0 }

  const perUnit = new Array(units.length).fill(0)
  const pct = Number(offer.discount_percent ?? 50)
  const amt = Number(offer.discount_amount ?? 0)

  if (offer.offer_type === 'direct_percent') {
    const rate = Math.max(0, Math.min(100, pct)) / 100
    units.forEach((u, i) => { perUnit[i] = +(u.unitPrice * rate).toFixed(2) })
  } else if (offer.offer_type === 'direct_amount') {
    units.forEach((u, i) => { perUnit[i] = +Math.min(amt, u.unitPrice).toFixed(2) })
  } else if (offer.offer_type === 'second_half') {
    const rate = Math.max(0, Math.min(100, pct)) / 100
    for (let i = 0; i + 1 < units.length; i += 2) {
      perUnit[i + 1] = +(units[i + 1].unitPrice * rate).toFixed(2)
    }
  } else if (offer.offer_type === 'bogo') {
    for (let i = 0; i + 1 < units.length; i += 2) {
      const cheaper = units[i].unitPrice <= units[i + 1].unitPrice ? i : i + 1
      perUnit[cheaper] = +units[cheaper].unitPrice.toFixed(2)
    }
  } else if (offer.offer_type === 'buy2get1') {
    for (let i = 0; i + 2 < units.length; i += 3) {
      const trio = [units[i], units[i + 1], units[i + 2]]
      const cheapest = trio.reduce((best, u, j) => (u.unitPrice < trio[best].unitPrice ? j : best), 0)
      perUnit[i + cheapest] = +trio[cheapest].unitPrice.toFixed(2)
    }
  }

  const byLine = new Map<number, number>()
  units.forEach((u, i) => {
    if (perUnit[i] > 0) {
      byLine.set(u.lineIdx, (byLine.get(u.lineIdx) || 0) + perUnit[i])
    }
  })
  const total = +perUnit.reduce((s, d) => s + d, 0).toFixed(2)
  return { byLine, total }
}

export function applyOffersToCart(items: CartItem[], offers: PromoOffer[]): {
  items: CartItem[]
  offerIds: number[]
  offerSavings: number
  offerNames: string
} {
  if (!offers.length || !items.length) {
    return {
      items: items.map((i) => ({ ...i, offer_id: undefined, offer_discount: 0 })),
      offerIds: [],
      offerSavings: 0,
      offerNames: '',
    }
  }

  const lines = items.map((i) => ({
    product_id: i.product.id,
    quantity: i.quantity,
    unit_price: i.unit_price,
  }))

  const sorted = [...offers].sort((a, b) => (a.priority - b.priority) || (a.id - b.id))
  const inOfferGroup = offerProductIds(sorted)
  const lineOfferDiscount = new Map<number, number>()
  const lineOfferId = new Map<number, number>()
  const usedIds: number[] = []
  const usedNames: string[] = []

  for (const offer of sorted) {
    if (!offer.active) continue
    const { byLine, total } = computeOfferLineDiscounts(offer, lines)
    if (total <= 0) continue
    if (!usedIds.includes(offer.id)) {
      usedIds.push(offer.id)
      usedNames.push(offer.name_en)
    }
    byLine.forEach((disc, idx) => {
      lineOfferDiscount.set(idx, (lineOfferDiscount.get(idx) || 0) + disc)
      lineOfferId.set(idx, offer.id)
    })
  }

  const enriched = items.map((item, idx) => {
    const gross = item.quantity * item.unit_price
    const offerDiscount = +(lineOfferDiscount.get(idx) || 0).toFixed(2)
    const blockedManual = inOfferGroup.has(item.product.id)
    const manual = blockedManual
      ? 0
      : calcManualDiscount(gross, item.discount_mode, item.discount_value)
    const totalDiscount = Math.min(gross, +(manual + offerDiscount).toFixed(2))
    return {
      ...item,
      offer_id: lineOfferId.get(idx),
      offer_discount: offerDiscount,
      discount: totalDiscount,
    }
  })

  const offerSavings = +[...lineOfferDiscount.values()].reduce((s, d) => s + d, 0).toFixed(2)
  return { items: enriched, offerIds: usedIds, offerSavings, offerNames: usedNames.join(', ') }
}
