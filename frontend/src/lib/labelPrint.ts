/**
 * Barcode / QR label printing through the Windows (OS) print dialog.
 *
 * No printer-specific code (no Zebra ZPL, no calibration offsets): we lay out one
 * printed PAGE per gap-to-gap section of the roll at the exact physical size, and the
 * installed Windows printer driver feeds to the next gap. Set the same paper size in
 * the printer's Windows "Printing preferences" (e.g. 38 × 12 mm, or 38 × 25 mm when
 * two labels sit between gaps).
 *
 *   1 per gap:  [label] gap [label] gap …
 *   2 per gap:  [label]        ← two labels stacked between gaps (e.g. 38 × 25 roll)
 *               [label] gap
 *               [label]
 *               [label] gap …
 */
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import api from './api'

export type LabelPreset = '37x12' | '25x5' | '38x10' | '38x12' | 'custom'
export type CodeKind = 'barcode' | 'qr'
export type BarSize = 'small' | 'medium' | 'large'

export interface LabelPrefs {
  preset: LabelPreset
  customW: number
  customH: number
  /** Labels between two gaps of the roll: 1, or 2 stacked (label, label, gap, label, label …). */
  perPage: 1 | 2
  /** Space between the two stacked labels of a page (mm). */
  pairGap: number
  code: CodeKind
  /** How much of the label the bars take. */
  barSize: BarSize
  showName: boolean
  showPrice: boolean
  showExpiry: boolean
  showPharmacy: boolean
}

export interface LabelEntry {
  barcode: string
  name?: string
  price?: number | null
  expiryDate?: string | null
}

export interface LabelPrintConfig extends LabelPrefs {
  wMm: number
  hMm: number
  pharmacyName: string
}

export interface LabelPrintDialogLabels {
  printToolbar: string
  popupBlocked: string
}

export const PRESET_DIMS: Record<Exclude<LabelPreset, 'custom'>, { wMm: number; hMm: number }> = {
  // 37 × 12 mm labels, one per gap (two of them make 25 mm on the roll).
  '37x12': { wMm: 37, hMm: 12 },
  '25x5': { wMm: 25, hMm: 5 },
  '38x10': { wMm: 38, hMm: 10 },
  '38x12': { wMm: 38, hMm: 12 },
}

export const DEFAULT_LABEL_PREFS: LabelPrefs = {
  preset: '37x12',
  customW: 37,
  customH: 12,
  perPage: 1,
  pairGap: 1,
  code: 'barcode',
  barSize: 'medium',
  showName: true,
  showPrice: true,
  showExpiry: true,
  showPharmacy: false,
}

const PREFS_KEY = 'fps_label_prefs_v7'

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
}

export function loadLabelPrefs(): LabelPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    const p = raw ? (JSON.parse(raw) as Partial<LabelPrefs>) : {}
    return {
      ...DEFAULT_LABEL_PREFS,
      ...p,
      perPage: p.perPage === 2 ? 2 : 1,
      code: p.code === 'qr' ? 'qr' : 'barcode',
      barSize: p.barSize === 'small' || p.barSize === 'large' ? p.barSize : 'medium',
    }
  } catch {
    return { ...DEFAULT_LABEL_PREFS }
  }
}

export function saveLabelPrefs(prefs: LabelPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode / quota — prefs are a convenience only */
  }
}

export function labelDims(p: LabelPrefs): { wMm: number; hMm: number } {
  if (p.preset === 'custom') {
    return { wMm: clamp(p.customW, 10, 120, 38), hMm: clamp(p.customH, 4, 100, 12) }
  }
  return PRESET_DIMS[p.preset] ?? PRESET_DIMS['37x12']
}

/** Size of one printed page = one gap-to-gap section (the paper size to set in Windows). */
export function pageSizeMm(p: LabelPrefs): { wMm: number; hMm: number } {
  const { wMm, hMm } = labelDims(p)
  return { wMm, hMm: p.perPage === 2 ? +(hMm * 2 + clamp(p.pairGap, 0, 10, 1)).toFixed(2) : hMm }
}

// Share of the label the bars take (width %, height % of the label).
const BAR_SIZE: Record<BarSize, { w: number; h: number }> = {
  small: { w: 55, h: 34 },
  medium: { w: 72, h: 44 },
  large: { w: 92, h: 58 },
}

export function buildConfig(prefs: LabelPrefs, pharmacyName: string): LabelPrintConfig {
  return { ...prefs, ...labelDims(prefs), pharmacyName }
}

/** Saved prefs (this computer) + pharmacy name from the profile. */
export async function loadEffectiveLabelPrintConfig(
  isAr: boolean,
  fallbackPharmacyName = '',
): Promise<LabelPrintConfig> {
  const prefs = loadLabelPrefs()
  try {
    const r = await api.get<{ name_ar?: string; name_en?: string }>('/settings/profile')
    const nm = ((isAr ? r.data.name_ar : r.data.name_en) || r.data.name_en || r.data.name_ar || '').trim()
    return buildConfig(prefs, nm || fallbackPharmacyName)
  } catch {
    return buildConfig(prefs, fallbackPharmacyName)
  }
}

/** Repeat each entry by its quantity. With 2 per row an odd total leaves the last slot blank. */
export function expandLabelPrintList(entries: LabelEntry[], qtyByIndex: number[], _unused?: unknown): LabelEntry[] {
  const out: LabelEntry[] = []
  entries.forEach((e, i) => {
    const n = Math.max(0, qtyByIndex[i] ?? 1)
    for (let k = 0; k < n; k++) out.push(e)
  })
  return out
}

function detectFormat(v: string): 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' {
  const s = v.trim()
  if (/^\d{13}$/.test(s)) return 'EAN13'
  if (/^\d{8}$/.test(s)) return 'EAN8'
  if (/^\d{12}$/.test(s)) return 'UPC'
  return 'CODE128'
}

function formatExpiry(raw?: string | null): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.valueOf())) return String(raw)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
}

// Thermal label printers (Xprinter XP-370B etc.) are 203 dpi = 8 dots/mm.
const DOT_MM = 25.4 / 203
const MIN_DOTS = 2

function buildStyles(c: LabelPrintConfig): string {
  const page = pageSizeMm(c)
  const bar = BAR_SIZE[c.barSize] ?? BAR_SIZE.medium
  const tiny = c.hMm < 9
  const font = Math.min(3.2, Math.max(1.4, c.hMm * 0.15))
  const pad = tiny ? 0.3 : 0.6
  return `
    @page { size: ${page.wMm}mm ${page.hMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    #print-toolbar { position: sticky; top: 0; z-index: 9; padding: 10px 14px; background: #effaf9;
      border-bottom: 2px solid #147c7d; display: flex; gap: 12px; align-items: center; font: 13px Arial; }
    #print-toolbar button { padding: 8px 16px; background: #147c7d; color: #fff; font-weight: 700;
      border: 0; border-radius: 8px; cursor: pointer; }
    .sheet { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px; background: #f1f5f9; }
    .row { width: ${page.wMm}mm; height: ${page.hMm}mm; display: flex; flex-direction: column;
      gap: ${c.perPage === 2 ? c.pairGap : 0}mm; overflow: hidden; box-sizing: border-box; background: #fff; }
    .label { width: ${c.wMm}mm; height: ${c.hMm}mm; flex: 0 0 ${c.hMm}mm; box-sizing: border-box;
      padding: ${pad}mm ${tiny ? 0.8 : 1.2}mm; overflow: hidden; display: flex; outline: 1px dashed #cbd5e1; }
    .label.blank { outline-color: transparent; }
    .col { display: flex; flex-direction: column; justify-content: center; align-items: center;
      width: 100%; height: 100%; min-width: 0; }
    .col .line { width: 100%; }
    .line { display: flex; justify-content: space-between; gap: 1mm; font-size: ${font}mm; line-height: 1.05;
      font-weight: 700; white-space: nowrap; }
    .line .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .bars { flex: 0 0 auto; width: ${tiny ? 100 : bar.w}%; display: block; margin: 0.3mm auto 0;
      height: ${tiny ? 100 : c.hMm < 12 ? Math.min(bar.h, 36) : bar.h}%; }
    .digits { margin-top: 0.3mm; font-size: ${Math.max(1.3, font * 0.85)}mm; text-align: center; letter-spacing: 0.3mm; line-height: 1; font-weight: 700; }
    .qr-wrap { display: flex; gap: 1mm; width: 100%; height: 100%; align-items: center; min-width: 0; }
    .qr { height: 100%; aspect-ratio: 1 / 1; flex: 0 0 auto; image-rendering: pixelated; }
    .qr-text { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex: 1; gap: 0.3mm;
      font-size: ${tiny ? Math.max(1.2, c.hMm * 0.3) : font}mm; font-weight: 700; line-height: 1.05; }
    .qr-text div { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    @media print {
      #print-toolbar { display: none !important; }
      .sheet { display: block; padding: 0; background: #fff; }
      .row { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
      .row + .row { page-break-before: always; break-before: page; }
      .row:last-child { page-break-after: auto; break-after: auto; }
      .label { outline: none; }
    }
  `
}

async function fillSheet(doc: Document, sheet: HTMLElement, list: LabelEntry[], c: LabelPrintConfig) {
  const tiny = c.hMm < 9
  const svgNS = 'http://www.w3.org/2000/svg'
  const el = (tag: string, cls?: string, text?: string) => {
    const e = doc.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  for (let i = 0; i < list.length; i += c.perPage) {
    const row = el('div', 'row')
    for (let k = 0; k < c.perPage; k++) {
      const it = list[i + k]
      const label = el('div', it ? 'label' : 'label blank')
      row.appendChild(label)
      if (!it) continue

      const price = c.showPrice && it.price != null ? Number(it.price).toFixed(2) : ''
      const exp = c.showExpiry ? formatExpiry(it.expiryDate) : ''
      const name = c.showName ? it.name || '' : ''

      if (c.code === 'qr') {
        const wrap = el('div', 'qr-wrap')
        const img = doc.createElement('img')
        img.className = 'qr'
        img.src = await QRCode.toDataURL(it.barcode, { margin: 0, scale: 6, errorCorrectionLevel: 'M' })
        wrap.appendChild(img)
        const text = el('div', 'qr-text')
        if (tiny) {
          text.appendChild(el('div', '', it.barcode))
        } else {
          if (name) text.appendChild(el('div', '', name))
          if (price || exp) text.appendChild(el('div', '', [price, exp && `EXP ${exp}`].filter(Boolean).join('  ')))
          text.appendChild(el('div', '', it.barcode))
          if (c.showPharmacy && c.pharmacyName && c.hMm >= 14) text.appendChild(el('div', '', c.pharmacyName))
        }
        wrap.appendChild(text)
        label.appendChild(wrap)
        continue
      }

      // Labels under 12 mm (e.g. 38 × 10): expiry moves up next to the price and the
      // bottom line is dropped, so nothing spills past the label edge.
      const compact = c.hMm < 12
      const col = el('div', 'col')
      const right = compact ? [price, exp].filter(Boolean).join(' · ') : price
      if (!tiny && (name || right)) {
        const top = el('div', 'line')
        top.append(el('span', 'grow', name), el('span', '', right))
        col.appendChild(top)
      }
      const svg = doc.createElementNS(svgNS, 'svg') as unknown as SVGSVGElement
      svg.setAttribute('class', 'bars')
      // width: 1 → the SVG is exactly one unit per barcode module.
      try {
        JsBarcode(svg, it.barcode, {
          format: detectFormat(it.barcode), displayValue: false, margin: 0, width: 1, height: 60,
          lineColor: '#000', background: '#fff',
        })
      } catch {
        JsBarcode(svg, it.barcode, { format: 'CODE128', displayValue: false, margin: 0, width: 1, height: 60 })
      }
      const modules = parseFloat(svg.getAttribute('width') || '0')
      const vh = parseFloat(svg.getAttribute('height') || '0')
      if (modules && vh) {
        svg.setAttribute('viewBox', `0 0 ${modules} ${vh}`)
        svg.setAttribute('preserveAspectRatio', 'none')
        svg.removeAttribute('width')
        svg.removeAttribute('height')
        // Snap every bar to whole printer dots so thermal printers draw it cleanly:
        // the widest module that fits the chosen bar size, never under 2 dots
        // (0.25 mm) unless the label itself is too narrow.
        const innerW = c.wMm - (tiny ? 1.6 : 2.4)
        const maxW = tiny ? innerW : (innerW * (BAR_SIZE[c.barSize] ?? BAR_SIZE.medium).w) / 100
        let dots = Math.floor(maxW / (modules * DOT_MM))
        if (dots < MIN_DOTS) dots = Math.max(1, Math.min(MIN_DOTS, Math.floor(innerW / (modules * DOT_MM))))
        svg.style.width = `${(modules * dots * DOT_MM).toFixed(3)}mm`
      }
      col.appendChild(svg as unknown as Node)
      if (!tiny) {
        col.appendChild(el('div', 'digits', it.barcode))
        const pharm = c.showPharmacy && c.pharmacyName ? c.pharmacyName : ''
        if (!compact && (exp || pharm)) {
          const bottom = el('div', 'line')
          bottom.append(el('span', '', exp && `EXP ${exp}`), el('span', 'grow', pharm))
          ;(bottom.lastChild as HTMLElement).style.textAlign = 'end'
          col.appendChild(bottom)
        }
      }
      label.appendChild(col)
    }
    sheet.appendChild(row)
  }
}

function waitForImages(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r() })),
  ).then(() => undefined)
}

/**
 * openPrinterDialog = true → straight to the Windows print dialog (choose printer, Print).
 * false → preview window with a Print button.
 */
export async function openLabelPrintWindow(
  list: LabelEntry[],
  config: LabelPrintConfig,
  labels: LabelPrintDialogLabels,
  openPrinterDialog = true,
  windowName = 'PRINT_LABELS',
): Promise<void> {
  if (!list.length) return

  if (openPrinterDialog) {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(iframe)
    const win = iframe.contentWindow
    const doc = win?.document
    if (!win || !doc) { iframe.remove(); return }
    doc.open()
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title> </title></head><body></body></html>')
    doc.close()
    const style = doc.createElement('style')
    style.textContent = buildStyles(config)
    doc.head.appendChild(style)
    const sheet = doc.createElement('div')
    sheet.className = 'sheet'
    doc.body.appendChild(sheet)
    await fillSheet(doc, sheet, list, config)
    await waitForImages(doc)
    const cleanup = () => { try { iframe.remove() } catch { /* ignore */ } }
    win.onafterprint = cleanup
    win.focus()
    win.print()
    setTimeout(cleanup, 60000)
    return
  }

  const w = window.open('', windowName, 'width=820,height=640,scrollbars=yes')
  if (!w) { alert(labels.popupBlocked); return }
  w.document.open()
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title> </title></head><body></body></html>')
  w.document.close()
  const style = w.document.createElement('style')
  style.textContent = buildStyles(config)
  w.document.head.appendChild(style)
  const bar = w.document.createElement('div')
  bar.id = 'print-toolbar'
  const btn = w.document.createElement('button')
  btn.type = 'button'
  btn.textContent = labels.printToolbar
  btn.onclick = () => { w.focus(); w.print() }
  const ps = pageSizeMm(config)
  bar.append(btn, `${ps.wMm} × ${ps.hMm} mm`)
  w.document.body.appendChild(bar)
  const sheet = w.document.createElement('div')
  sheet.className = 'sheet'
  w.document.body.appendChild(sheet)
  await fillSheet(w.document, sheet, list, config)
  await waitForImages(w.document)
  w.focus()
}
