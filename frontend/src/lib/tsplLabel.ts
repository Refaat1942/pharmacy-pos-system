/**
 * Direct label printing through the local "FPS Print Bridge" (tools/fps-print-bridge).
 *
 * The label is drawn on a canvas at the printer's real resolution (203 dpi = 8 dots
 * per mm) and sent as TSPL commands — SIZE / GAP tell the printer the exact label
 * and gap, so it lines every label up itself. No Windows paper size, offsets or
 * scaling are involved. Works offline: the bridge runs on 127.0.0.1.
 *
 * Kept free of app imports so the bridge's offline page can bundle the same code.
 */
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

export const BRIDGE_URL = 'http://127.0.0.1:17777'
const DOTS_PER_MM = 8

export interface DirectLabel {
  barcode: string
  name?: string
  price?: number | null
  expiryDate?: string | null
  qty: number
}

export interface DirectOptions {
  wMm: number
  hMm: number
  /** Gap between labels on the roll (mm) — printers re-sync on the real gap anyway. */
  gapMm: number
  code: 'barcode' | 'qr'
  barSize: 'small' | 'medium' | 'large'
  showName: boolean
  showPrice: boolean
  showExpiry: boolean
  showPharmacy: boolean
  pharmacyName: string
  /** Fine position in mm (usually 0). */
  shiftXmm: number
  shiftYmm: number
  /** Turn the print 180° if labels come out upside down. */
  rotate180: boolean
  /** Print darkness 1–15. */
  density: number
}

const BAR = { small: { w: 55, h: 34 }, medium: { w: 72, h: 44 }, large: { w: 92, h: 58 } }

function formatExpiry(raw?: string | null): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.valueOf())) return String(raw)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
}

function detectFormat(v: string): 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' {
  const s = v.trim()
  if (/^\d{13}$/.test(s)) return 'EAN13'
  if (/^\d{8}$/.test(s)) return 'EAN8'
  if (/^\d{12}$/.test(s)) return 'UPC'
  return 'CODE128'
}

/** Bar pattern as [x, width] runs in modules, plus the total module count. */
function barcodeModules(value: string): { runs: [number, number][]; total: number } {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const opts = { displayValue: false, margin: 0, width: 1, height: 10 }
  try {
    JsBarcode(svg, value, { ...opts, format: detectFormat(value) })
  } catch {
    JsBarcode(svg, value, { ...opts, format: 'CODE128' })
  }
  const total = parseFloat(svg.getAttribute('width') || '0')
  const runs: [number, number][] = []
  // JsBarcode emits one <g> per encoded segment, each translated along x.
  svg.querySelectorAll('rect').forEach((r) => {
    if (r.getAttribute('style')?.includes('fill:#ffffff') || r.getAttribute('fill') === '#ffffff') return
    const g = r.parentElement
    const tr = g?.getAttribute('transform') || ''
    const m = /translate\(\s*([\d.]+)/.exec(tr)
    const gx = m ? parseFloat(m[1]) : 0
    const x = gx + parseFloat(r.getAttribute('x') || '0')
    const w = parseFloat(r.getAttribute('width') || '0')
    if (w > 0 && x < total) runs.push([x, w])
  })
  return { runs, total }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** Draw one label at printer resolution. Returns the canvas (black on white). */
export function renderLabelCanvas(it: DirectLabel, o: DirectOptions): HTMLCanvasElement {
  const W = Math.round((o.wMm * DOTS_PER_MM) / 8) * 8 // TSPL bitmaps are byte-aligned
  const H = Math.round(o.hMm * DOTS_PER_MM)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'
  ctx.translate(Math.round(o.shiftXmm * DOTS_PER_MM), Math.round(o.shiftYmm * DOTS_PER_MM))

  const tiny = o.hMm < 9
  const compact = o.hMm < 12
  const padX = tiny ? 6 : 10
  const padY = tiny ? 2 : 4
  const innerW = W - padX * 2
  const fontPx = Math.max(11, Math.round(Math.min(3.2, Math.max(1.5, o.hMm * 0.15)) * DOTS_PER_MM))
  const font = (px: number) => `bold ${px}px Arial, Helvetica, sans-serif`

  const price = o.showPrice && it.price != null ? Number(it.price).toFixed(2) : ''
  const exp = o.showExpiry ? formatExpiry(it.expiryDate) : ''
  const name = o.showName ? it.name || '' : ''

  if (o.code === 'qr') {
    const qr = QRCode.create(it.barcode, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const avail = H - padY * 2
    const scale = Math.max(1, Math.floor(avail / n))
    const size = n * scale
    const qy = Math.round((H - size) / 2)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) ctx.fillRect(padX + x * scale, qy + y * scale, scale, scale)
      }
    }
    const tx = padX + size + 6
    const tw = W - tx - padX
    const lines = tiny
      ? [it.barcode]
      : [name, [price, exp && `EXP ${exp}`].filter(Boolean).join('  '), it.barcode].filter(Boolean)
    const lh = Math.min(fontPx + 2, Math.floor(avail / Math.max(1, lines.length)))
    ctx.font = font(lh - 2)
    let ty = Math.round((H - lh * lines.length) / 2)
    for (const l of lines) {
      ctx.fillText(fitText(ctx, l, tw), tx, ty)
      ty += lh
    }
    return cv
  }

  const right = compact ? [price, exp].filter(Boolean).join(' · ') : price
  const hasTop = !tiny && !!(name || right)
  const topH = hasTop ? fontPx + 2 : 0

  // Bars: whole dots per module, at least 2 (0.25 mm) so the printer draws them cleanly.
  const { runs, total } = barcodeModules(it.barcode)
  const maxW = tiny ? innerW : (innerW * BAR[o.barSize].w) / 100
  let k = Math.floor(maxW / total)
  if (k < 2) k = Math.max(1, Math.min(2, Math.floor(innerW / total)))
  const bw = total * k
  const digitsPx = Math.max(10, fontPx - 2)
  const bottomReserve = tiny ? 0 : digitsPx + 2 + (!compact && (exp || (o.showPharmacy && o.pharmacyName)) ? fontPx + 2 : 0)
  const barH = tiny
    ? H - padY * 2
    : Math.max(12, Math.min(Math.round((H * (compact ? Math.min(BAR[o.barSize].h, 40) : BAR[o.barSize].h)) / 100), H - topH - bottomReserve - padY * 2))
  // Centre the whole block vertically on the label.
  let y = Math.max(padY, Math.round((H - (topH + barH + 1 + bottomReserve)) / 2))

  if (hasTop) {
    ctx.font = font(fontPx)
    const rw = right ? ctx.measureText(right).width : 0
    if (right) ctx.fillText(right, W - padX - rw, y)
    if (name) ctx.fillText(fitText(ctx, name, innerW - rw - 8), padX, y)
    y += topH
  }
  const bx = Math.round((W - bw) / 2)
  for (const [x, w] of runs) ctx.fillRect(bx + x * k, y, w * k, barH)
  y += barH + 1

  if (!tiny) {
    ctx.font = font(digitsPx)
    const dw = ctx.measureText(it.barcode).width
    ctx.fillText(it.barcode, Math.round((W - dw) / 2), y)
    y += digitsPx + 2
    const pharm = o.showPharmacy && o.pharmacyName ? o.pharmacyName : ''
    if (!compact && (exp || pharm)) {
      ctx.font = font(fontPx)
      if (exp) ctx.fillText(`EXP ${exp}`, padX, y)
      if (pharm) {
        const t = fitText(ctx, pharm, innerW / 2)
        ctx.fillText(t, W - padX - ctx.measureText(t).width, y)
      }
    }
  }
  return cv
}

/** Canvas → TSPL BITMAP bytes (1 bit per dot; 0 = print/black, 1 = white). */
function canvasToBits(cv: HTMLCanvasElement): { widthBytes: number; height: number; bits: Uint8Array } {
  const { width, height } = cv
  const px = cv.getContext('2d')!.getImageData(0, 0, width, height).data
  const widthBytes = width / 8
  const bits = new Uint8Array(widthBytes * height).fill(0xff)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (lum < 128) bits[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7))
    }
  }
  return { widthBytes, height, bits }
}

/** Full TSPL job: size + gap once, then one bitmap per distinct label × its quantity. */
export function buildTsplJob(labels: DirectLabel[], o: DirectOptions): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const cmd = (s: string) => parts.push(enc.encode(s + '\r\n'))
  cmd(`SIZE ${o.wMm} mm,${o.hMm} mm`)
  cmd(`GAP ${o.gapMm} mm,0 mm`)
  cmd(`DIRECTION ${o.rotate180 ? 0 : 1},0`)
  cmd('REFERENCE 0,0')
  cmd('OFFSET 0 mm')
  cmd('SET TEAR ON')
  cmd(`DENSITY ${Math.min(15, Math.max(1, Math.round(o.density)))}`)
  cmd('SPEED 3')
  for (const it of labels) {
    if (!it.qty) continue
    const { widthBytes, height, bits } = canvasToBits(renderLabelCanvas(it, o))
    cmd('CLS')
    parts.push(enc.encode(`BITMAP 0,0,${widthBytes},${height},0,`))
    parts.push(bits)
    parts.push(enc.encode('\r\n'))
    cmd(`PRINT 1,${it.qty}`)
  }
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export interface BridgeStatus { version: string; printers: string[]; default: string }

/** Is the FPS Print Bridge running on this PC? (fast; null when not installed) */
export async function detectBridge(timeoutMs = 1200): Promise<BridgeStatus | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${BRIDGE_URL}/status`, { signal: ctl.signal })
    if (!r.ok) return null
    const j = await r.json()
    return j && j.version ? { version: j.version, printers: j.printers || [], default: j.default || '' } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Prefer a label printer (Xprinter / TSC / Zebra …) over office printers. */
export function pickLabelPrinter(st: BridgeStatus, saved?: string | null): string {
  if (saved && st.printers.includes(saved)) return saved
  return st.printers.find((p) => /xprinter|xp-|label|tsc|zebra|godex|gprinter/i.test(p)) || st.default || st.printers[0] || ''
}

export async function printViaBridge(printer: string, labels: DirectLabel[], o: DirectOptions): Promise<void> {
  const job = buildTsplJob(labels, o)
  const r = await fetch(`${BRIDGE_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer, name: 'FPS labels', data: toBase64(job) }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.error || `Print bridge error ${r.status}`)
}

export interface CatalogItem { barcode: string; name: string; price: number | null; expiry: string | null }

/** Save the item list in the bridge so labels can be printed offline. */
export async function pushCatalog(items: CatalogItem[], pharmacyName: string): Promise<void> {
  const r = await fetch(`${BRIDGE_URL}/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pharmacy: pharmacyName, savedAt: new Date().toISOString(), items }),
  })
  if (!r.ok) throw new Error(`Catalog sync failed (${r.status})`)
}
