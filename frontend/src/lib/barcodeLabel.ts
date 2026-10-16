/** Format expiry for shelf/barcode labels (YYYY-MM-DD). */
export function formatExpiryForLabel(expiry?: string | null): string | null {
  if (!expiry) return null
  const s = String(expiry).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}
