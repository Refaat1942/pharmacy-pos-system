/** Format expiry for shelf/barcode labels (YYYY-MM-DD). */
export function formatExpiryForLabel(expiry?: string | null): string | null {
  if (!expiry) return null
  const s = String(expiry).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function appendLabelMeta(
  wrap: HTMLElement,
  doc: Document,
  opts: {
    productName?: string
    expiryDate?: string | null
    expiryPrefix: string
    nameClass?: string
    expiryClass?: string
  },
) {
  if (opts.productName) {
    const n = doc.createElement('div')
    n.className = opts.nameClass || 'name'
    n.textContent = opts.productName
    wrap.appendChild(n)
  }
  const exp = formatExpiryForLabel(opts.expiryDate)
  if (exp) {
    const e = doc.createElement('div')
    e.className = opts.expiryClass || 'expiry'
    e.textContent = `${opts.expiryPrefix} ${exp}`
    wrap.appendChild(e)
  }
}
