/**
 * Barcode / QR label printing through the Windows (OS) print dialog.
 *
 * FPS has no label-size settings: one label = one printed page, and the page size
 * is whatever paper size is set for the printer in Windows (Printing preferences →
 * Stock / Paper size). Each label stretches to fill that page, so the same print
 * works on any roll the printer is set up for.
 */
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import api from './api'

export type CodeKind = 'barcode' | 'qr'

export interface LabelEntry {
  barcode: string
  name?: string
  price?: number | null
  expiryDate?: string | null
}

export interface LabelPrintConfig {
  code: CodeKind
  showName: boolean
  showPrice: boolean
  showExpiry: boolean
  pharmacyName: string
}

export interface LabelPrintDialogLabels {
  printToolbar: string
  popupBlocked: string
}

export function buildConfig(pharmacyName = ''): LabelPrintConfig {
  return { code: 'barcode', showName: true, showPrice: true, showExpiry: true, pharmacyName }
}

/** Default config + pharmacy name from the profile. */
export async function loadEffectiveLabelPrintConfig(
  isAr: boolean,
  fallbackPharmacyName = '',
): Promise<LabelPrintConfig> {
  try {
    const r = await api.get<{ name_ar?: string; name_en?: string }>('/settings/profile')
    const nm = ((isAr ? r.data.name_ar : r.data.name_en) || r.data.name_en || r.data.name_ar || '').trim()
    return buildConfig(nm || fallbackPharmacyName)
  } catch {
    return buildConfig(fallbackPharmacyName)
  }
}

/** Repeat each entry by its quantity. */
export function expandLabelPrintList(entries: LabelEntry[], qtyByIndex: number[]): LabelEntry[] {
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

// Thermal label printers are 203 dpi = 8 dots/mm. Bars are sized in whole dots so
// they print crisp and scan; the widest module size that fits the label is picked
// with container queries once the real (Windows) paper size is known.
const DOT_MM = 25.4 / 203
const MODULE_DOTS = [4, 3, 2, 1]
// Share of the label width the bars may take (the rest is quiet zone).
const BAR_SHARE = 0.86

function moduleRules(modulesSeen: Set<number>): string {
  let css = ''
  modulesSeen.forEach((m) => {
    // Fallback (narrowest): fill the allowed width.
    css += `.m${m} { width: ${BAR_SHARE * 100}%; }\n`
    ;[...MODULE_DOTS].reverse().forEach((dots) => {
      const w = m * dots * DOT_MM
      css += `@container label (min-width: ${(w / BAR_SHARE).toFixed(2)}mm) { .m${m} { width: ${w.toFixed(3)}mm; } }\n`
    })
  })
  return css
}

const BASE_STYLES = `
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; }
  #print-toolbar { position: sticky; top: 0; z-index: 9; padding: 10px 14px; background: #effaf9;
    border-bottom: 2px solid #147c7d; display: flex; gap: 12px; align-items: center; font: 13px Arial; }
  #print-toolbar button { padding: 8px 16px; background: #147c7d; color: #fff; font-weight: 700;
    border: 0; border-radius: 8px; cursor: pointer; }
  .sheet { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; background: #f1f5f9; }
  /* On screen: a 38 × 12 mm sample. In print: exactly one page (the Windows paper size). */
  .label { width: 38mm; height: 12mm; container: label / size; box-sizing: border-box; overflow: hidden;
    background: #fff; outline: 1px dashed #cbd5e1; display: flex; }
  .col, .qr-wrap { box-sizing: border-box; padding: 4cqh 3cqw; }
  .col { display: flex; flex-direction: column; align-items: center; width: 100%; height: 100%; min-width: 0; }
  .line { display: flex; justify-content: space-between; gap: 2cqw; width: 100%; flex: 0 0 auto;
    font-size: clamp(1.3mm, 15cqh, 3.2mm); line-height: 1.1; font-weight: 700; white-space: nowrap; }
  .line .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .bars { flex: 1 1 0; min-height: 0; display: block; margin: 2cqh auto 0; shape-rendering: crispEdges; }
  .digits { flex: 0 0 auto; margin-top: 1cqh; font-size: clamp(1.2mm, 12cqh, 2.8mm); line-height: 1.05;
    letter-spacing: 0.25mm; font-weight: 700; text-align: center; }
  .qr-wrap { display: flex; gap: 3cqw; width: 100%; height: 100%; align-items: center; min-width: 0; }
  .qr { height: 100%; aspect-ratio: 1 / 1; flex: 0 0 auto; image-rendering: pixelated; }
  .qr-text { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex: 1; gap: 2cqh;
    font-size: clamp(1.2mm, 15cqh, 3.2mm); font-weight: 700; line-height: 1.1; }
  .qr-text div { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  @media print {
    #print-toolbar { display: none !important; }
    .sheet { display: block; padding: 0; background: #fff; }
    .label { width: 100vw; height: 100vh; outline: none; break-after: page; page-break-after: always; }
    .label:last-child { break-after: auto; page-break-after: auto; }
  }
`

async function fillSheet(doc: Document, sheet: HTMLElement, list: LabelEntry[], c: LabelPrintConfig): Promise<string> {
  const svgNS = 'http://www.w3.org/2000/svg'
  const modulesSeen = new Set<number>()
  const el = (tag: string, cls?: string, text?: string) => {
    const e = doc.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  for (const it of list) {
    const label = el('div', 'label')
    sheet.appendChild(label)
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
      if (name) text.appendChild(el('div', '', name))
      if (price || exp) text.appendChild(el('div', '', [price, exp && `EXP ${exp}`].filter(Boolean).join('  ')))
      text.appendChild(el('div', '', it.barcode))
      wrap.appendChild(text)
      label.appendChild(wrap)
      continue
    }

    const col = el('div', 'col')
    const right = [price, exp].filter(Boolean).join(' · ')
    if (name || right) {
      const top = el('div', 'line')
      top.append(el('span', 'grow', name), el('span', '', right))
      col.appendChild(top)
    }
    const svg = doc.createElementNS(svgNS, 'svg') as unknown as SVGSVGElement
    // width: 1 → the SVG is exactly one unit per barcode module.
    try {
      JsBarcode(svg, it.barcode, {
        format: detectFormat(it.barcode), displayValue: false, margin: 0, width: 1, height: 60,
        lineColor: '#000', background: '#fff',
      })
    } catch {
      JsBarcode(svg, it.barcode, { format: 'CODE128', displayValue: false, margin: 0, width: 1, height: 60 })
    }
    const modules = Math.round(parseFloat(svg.getAttribute('width') || '0'))
    const vh = parseFloat(svg.getAttribute('height') || '0')
    svg.setAttribute('class', `bars m${modules}`)
    if (modules && vh) {
      modulesSeen.add(modules)
      svg.setAttribute('viewBox', `0 0 ${modules} ${vh}`)
      svg.setAttribute('preserveAspectRatio', 'none')
      svg.removeAttribute('width')
      svg.removeAttribute('height')
    }
    col.appendChild(svg as unknown as Node)
    col.appendChild(el('div', 'digits', it.barcode))
    label.appendChild(col)
  }
  return moduleRules(modulesSeen)
}

function waitForImages(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r() })),
  ).then(() => undefined)
}

async function render(doc: Document, list: LabelEntry[], config: LabelPrintConfig, before?: HTMLElement) {
  const style = doc.createElement('style')
  doc.head.appendChild(style)
  if (before) doc.body.appendChild(before)
  const sheet = doc.createElement('div')
  sheet.className = 'sheet'
  doc.body.appendChild(sheet)
  style.textContent = BASE_STYLES + (await fillSheet(doc, sheet, list, config))
  await waitForImages(doc)
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
    await render(doc, list, config)
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
  const bar = w.document.createElement('div')
  bar.id = 'print-toolbar'
  const btn = w.document.createElement('button')
  btn.type = 'button'
  btn.textContent = labels.printToolbar
  btn.onclick = () => { w.focus(); w.print() }
  bar.append(btn)
  await render(w.document, list, config, bar)
  w.focus()
}
