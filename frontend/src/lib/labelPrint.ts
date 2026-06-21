import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import api from './api'

export type LabelSize = 'strip38' | 'small' | 'medium' | 'large' | 'custom'

export interface LabelDims {
  wMm: number
  hMm: number
}

const PROFILE_DIMS: Record<Exclude<LabelSize, 'custom'>, LabelDims> = {
  strip38: { wMm: 38, hMm: 12 },
  small: { wMm: 40, hMm: 20 },
  medium: { wMm: 50, hMm: 25 },
  large: { wMm: 80, hMm: 50 },
}

export const CUSTOM_DEFAULT: LabelDims = { wMm: 38, hMm: 11 }

export interface LabelStyle {
  barcodeHeightMm: number
  barcodeScaleMm: number
  fontSizeMm: number
  paddingMm: number
  offsetYMm: number
  offsetXMm: number
  topRowOffsetMm: number
}

export interface LabelPrefs {
  size?: string
  useQR?: boolean
  showName?: boolean
  showPrice?: boolean
  showExpiry?: boolean
  customW?: number
  customH?: number
  overrides?: Partial<LabelStyle>
  layout?: 'page' | 'grid' | 'paired'
  columns?: number
  rowGap?: number
  colGap?: number
  groupSize?: number
  groupGap?: number
}

export interface GridOpts {
  layout: 'page' | 'grid' | 'paired'
  columns: number
  rowGap: number
  colGap: number
  groupSize: number
  groupGap: number
}

export interface LabelEntry {
  barcode: string
  name?: string
  price?: number | null
  expiryDate?: string | null
}

export interface LabelPrintConfig {
  dims: LabelDims
  style: LabelStyle
  gridOpts: GridOpts
  useQR: boolean
  showName: boolean
  showPrice: boolean
  showExpiry: boolean
  showPharmacy: boolean
  pharmacyName: string
}

export interface LabelPrintDialogLabels {
  printToolbar: string
  popupBlocked: string
}

export const LABEL_PREFS_KEY = 'pharma_label_print_prefs'

function clampMm(v: number, fallback: number): number {
  if (!Number.isFinite(v) || v <= 0) return fallback
  return Math.min(200, Math.max(5, v))
}

export function dimsFor(size: LabelSize, customW: number, customH: number): LabelDims {
  if (size === 'custom') {
    return { wMm: clampMm(customW, CUSTOM_DEFAULT.wMm), hMm: clampMm(customH, CUSTOM_DEFAULT.hMm) }
  }
  return PROFILE_DIMS[size]
}

export function defaultStyle({ hMm }: LabelDims): LabelStyle {
  const short = hMm < 16
  return {
    barcodeHeightMm: short ? 5 : 10,
    barcodeScaleMm: short ? 0.3 : 0.5,
    fontSizeMm: short ? 1.5 : 2.5,
    paddingMm: short ? 0 : 1.5,
    offsetYMm: 0,
    offsetXMm: 0,
    topRowOffsetMm: 0,
  }
}

export function normalizeSize(s?: string): LabelSize {
  if (s === 'strip38' || s === 'small' || s === 'medium' || s === 'large' || s === 'custom') return s
  if (s === 'sm') return 'small'
  if (s === 'lg' || s === 'zebra2x3') return 'large'
  if (s === 'thermal') return 'strip38'
  return 'custom'
}

export function loadLabelPrefs(): LabelPrefs {
  try {
    const raw = localStorage.getItem(LABEL_PREFS_KEY)
    return raw ? (JSON.parse(raw) as LabelPrefs) : {}
  } catch {
    return {}
  }
}

export function saveLabelPrefs(prefs: LabelPrefs): void {
  try {
    localStorage.setItem(LABEL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function detectType(v: string): 'EAN13' | 'EAN8' | 'UPC' | 'ITF14' | 'CODE128' {
  const s = v.trim()
  if (/^\d{13}$/.test(s)) return 'EAN13'
  if (/^\d{8}$/.test(s)) return 'EAN8'
  if (/^\d{12}$/.test(s)) return 'UPC'
  if (/^\d{14}$/.test(s)) return 'ITF14'
  return 'CODE128'
}

export async function renderBarcodeDataUrl(
  value: string,
  useQR: boolean,
  style: LabelStyle,
): Promise<string | null> {
  try {
    if (useQR) {
      const scale = Math.max(3, Math.round((style.barcodeHeightMm * 3.8) / 12))
      return await QRCode.toDataURL(value, { margin: 0, scale, errorCorrectionLevel: 'M' })
    }
    const c = document.createElement('canvas')
    JsBarcode(c, value, {
      format: detectType(value),
      displayValue: true,
      width: Math.max(1, style.barcodeScaleMm * 3.8),
      height: Math.max(10, style.barcodeHeightMm * 3.8),
      margin: 0,
      font: 'Arial Black, Arial, sans-serif',
      fontSize: Math.max(6, style.fontSizeMm * 3.8),
      fontOptions: 'bold',
      textMargin: 1,
      lineColor: '#000000',
      background: '#ffffff',
    })
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

export function buildLabelStyles(dims: LabelDims, style: LabelStyle, grid: GridOpts): string {
  const w = `${dims.wMm}mm`
  const h = `${dims.hMm}mm`
  const imgMaxH = `${Math.max(4, dims.hMm * 0.55).toFixed(1)}mm`
  const isGrid = grid.layout === 'grid'
  const isPaired = grid.layout === 'paired'
  const cols = Math.max(1, Math.round(grid.columns) || 1)

  const pageW = isGrid ? (cols * dims.wMm + (cols - 1) * grid.colGap).toFixed(2) + 'mm' : w
  const pageH = isPaired ? `25mm` : (isGrid ? 'auto' : h)

  const cellH = isPaired ? '12.5mm' : `${Math.max(4, dims.hMm).toFixed(2)}mm`

  const sheetScreen = isGrid
    ? `display: grid; grid-template-columns: repeat(${cols}, ${w}); column-gap: ${grid.colGap}mm; row-gap: ${grid.rowGap}mm; justify-content: center; justify-items: center; padding: 16px; background: #f1f5f9;`
    : `display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; background: #f1f5f9;`
  const sheetPrint = isGrid
    ? `padding: 0; margin: 0; background: #fff; column-gap: ${grid.colGap}mm; row-gap: ${grid.rowGap}mm; justify-content: center; justify-items: center;`
    : `display: block; padding: 0; margin: 0; background: #fff; gap: 0;`

  const cellBreak = 'page-break-inside: avoid; break-inside: avoid;'
  const shiftTransform = (style.offsetXMm || style.offsetYMm)
    ? `transform: translate(${style.offsetXMm}mm, ${style.offsetYMm}mm);`
    : ''

  return `
    @page { size: ${pageW} ${pageH}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: 'Arial Black', Arial, sans-serif; color: #000; font-weight: 700; }
    #print-toolbar {
      position: sticky; top: 0; z-index: 99; padding: 12px 16px; background: #ecfdf5;
      border-bottom: 2px solid #10b981; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    #print-toolbar button { padding: 10px 18px; background: #059669; color: #fff; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
    .sheet { ${sheetScreen} }

    .paired-page {
      width: ${pageW};
      height: ${pageH};
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }

    .cell {
      direction: ltr;
      width: ${w}; height: ${cellH}; box-sizing: border-box; overflow: hidden;
      padding: ${style.paddingMm}mm; margin: 0 auto; background: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 0.5mm;
      ${isPaired ? '' : cellBreak}
      border: 1px dashed #cbd5e1;
    }
    .shift { display: flex; flex-direction: column; justify-content: space-between; align-items: stretch; width: 100%; height: 100%; max-width: 100%; ${shiftTransform} }

    .top-row { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 1mm; transform: translateY(${style.topRowOffsetMm || 0}mm); }
    .t-left { text-align: left; font-size: ${style.fontSizeMm}mm; font-weight: 900; line-height: 0.8; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .t-right { text-align: right; font-size: ${style.fontSizeMm}mm; font-weight: 900; line-height: 1; white-space: nowrap; margin-left: auto; padding-left: 1mm; }

    .bc-wrap { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; width: 100%; }
    img, svg { max-width: 100%; max-height: ${imgMaxH}; width: auto; height: auto; object-fit: contain; display: block; }
    svg { shape-rendering: crispEdges; }

    .bottom-row { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; gap: 1mm; }
    .b-left { text-align: left; font-size: ${Math.max(1, style.fontSizeMm - 0.3)}mm; font-weight: 900; line-height: 1; white-space: nowrap; margin-right: auto; padding-right: 1mm; }
    .b-right { text-align: right; text-transform: uppercase; font-size: ${Math.max(1, style.fontSizeMm - 0.3)}mm; font-weight: 900; line-height: 1; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

    .group-gap { width: 100%; height: ${grid.groupGap}mm; grid-column: 1 / -1; }

    @media print {
      #print-toolbar { display: none !important; }
      .sheet { ${sheetPrint} }

      .paired-page {
        page-break-after: always !important;
        break-after: page !important;
        border: none !important;
      }

      .cell {
        box-sizing: border-box !important;
        overflow: hidden !important;
        width: ${w} !important;
        height: ${cellH} !important;
        max-height: ${cellH} !important;
        margin: 0 !important;
        border: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        ${isGrid || isPaired ? '' : 'page-break-after: auto !important; break-after: auto !important;'}
      }
      ${isGrid || isPaired ? '' : '.cell:last-child { page-break-after: auto !important; break-after: auto !important; }'}
      .shift { gap: 0 !important; height: 100% !important; }
      img, svg { margin: 0 auto !important; }
      html, body { margin: 0 !important; padding: 0 !important; }
      @page { size: ${pageW} ${pageH}; margin: 0; }
    }
  `
}

function buildConfigFromPrefs(prefs: LabelPrefs, pharmacyName: string, showPharmacy: boolean): LabelPrintConfig {
  const size = normalizeSize(prefs.size ?? 'custom')
  const customW = prefs.customW ?? CUSTOM_DEFAULT.wMm
  const customH = prefs.customH ?? CUSTOM_DEFAULT.hMm
  const dims = dimsFor(size, customW, customH)
  const style = { ...defaultStyle(dims), ...(prefs.overrides ?? {}) }
  return {
    dims,
    style,
    gridOpts: {
      layout: prefs.layout ?? 'paired',
      columns: prefs.columns ?? 1,
      rowGap: prefs.rowGap ?? 0,
      colGap: prefs.colGap ?? 0,
      groupSize: prefs.groupSize ?? 0,
      groupGap: prefs.groupGap ?? 0,
    },
    useQR: prefs.useQR ?? false,
    showName: prefs.showName ?? true,
    showPrice: prefs.showPrice ?? true,
    showExpiry: prefs.showExpiry ?? true,
    showPharmacy,
    pharmacyName,
  }
}

type PharmacyProfile = {
  name_ar?: string
  name_en?: string
  show_pharmacy_name_on_labels?: boolean
  label_print_settings?: LabelPrefs | null
}

export async function loadEffectiveLabelPrintConfig(
  isAr: boolean,
  fallbackPharmacyName = '',
): Promise<LabelPrintConfig> {
  let prefs = loadLabelPrefs()
  try {
    const r = await api.get<PharmacyProfile>('/settings/profile')
    const p = r.data
    const nm = (isAr ? p.name_ar : p.name_en) || p.name_en || p.name_ar || ''
    const pharmacyName = nm.trim() || fallbackPharmacyName
    const showPharmacy = p.show_pharmacy_name_on_labels !== false
    if (p.label_print_settings && Object.keys(p.label_print_settings).length) {
      prefs = { ...prefs, ...p.label_print_settings }
    }
    return buildConfigFromPrefs(prefs, pharmacyName, showPharmacy)
  } catch {
    return buildConfigFromPrefs(prefs, fallbackPharmacyName, true)
  }
}

export function expandLabelPrintList(
  entries: LabelEntry[],
  qtyByIndex: number[],
  gridOpts: GridOpts,
): LabelEntry[] {
  const printList: LabelEntry[] = []
  entries.forEach((entry, idx) => {
    let n = qtyByIndex[idx] ?? 1
    if (n <= 0) return
    if (gridOpts.layout === 'paired' && n % 2 !== 0) n += 1
    for (let i = 0; i < n; i++) printList.push(entry)
  })
  return printList
}

export async function fillLabelSheet(
  doc: Document,
  sheet: HTMLElement,
  printList: LabelEntry[],
  config: LabelPrintConfig,
): Promise<void> {
  const { style, gridOpts, useQR, showName, showPrice, showExpiry, showPharmacy, pharmacyName } = config
  const svgNS = 'http://www.w3.org/2000/svg'

  for (let i = 0; i < printList.length; i++) {
    const it = printList[i]
    let container = sheet

    if (gridOpts.layout === 'paired') {
      if (i % 2 === 0) {
        const pageWrap = doc.createElement('div')
        pageWrap.className = 'paired-page'
        sheet.appendChild(pageWrap)
      }
      container = sheet.lastElementChild as HTMLElement
    } else if (gridOpts.layout === 'grid' && gridOpts.groupSize > 0 && i > 0 && i % gridOpts.groupSize === 0) {
      const gap = doc.createElement('div')
      gap.className = 'group-gap'
      sheet.appendChild(gap)
    }

    const cell = doc.createElement('div')
    cell.className = 'cell'
    const shift = doc.createElement('div')
    shift.className = 'shift'
    cell.appendChild(shift)

    const hasPrice = showPrice && it.price != null

    let expStr = ''
    if (showExpiry && it.expiryDate) {
      const d = new Date(it.expiryDate)
      if (!isNaN(d.valueOf())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yy = String(d.getFullYear()).slice(-2)
        expStr = `${mm}/${yy}`
      } else {
        expStr = String(it.expiryDate).replace(/exp/i, '').trim()
      }
    }

    const top = doc.createElement('div')
    top.className = 'top-row'
    const tLeft = doc.createElement('span')
    tLeft.className = 't-left'
    tLeft.textContent = showName ? (it.name ?? '') : ''
    const tRight = doc.createElement('span')
    tRight.className = 't-right'
    tRight.textContent = hasPrice ? Number(it.price).toFixed(2) : ''
    top.append(tLeft, tRight)
    shift.appendChild(top)

    const qrUrl = useQR ? await renderBarcodeDataUrl(it.barcode, true, style) : null
    if (useQR && !qrUrl) continue

    const bcWrap = doc.createElement('div')
    bcWrap.className = 'bc-wrap'
    shift.appendChild(bcWrap)
    if (useQR) {
      const img = doc.createElement('img')
      img.src = qrUrl as string
      bcWrap.appendChild(img)
    } else {
      const svg = doc.createElementNS(svgNS, 'svg')
      bcWrap.appendChild(svg)
      try {
        JsBarcode(svg, it.barcode, {
          format: detectType(it.barcode),
          displayValue: true,
          width: Math.max(1, style.barcodeScaleMm * 3.8),
          height: Math.max(10, style.barcodeHeightMm * 3.8),
          margin: 0,
          font: 'Arial Black, Arial, sans-serif',
          fontSize: Math.max(6, style.fontSizeMm * 3.8),
          fontOptions: 'bold',
          textMargin: 1,
          lineColor: '#000000',
          background: '#ffffff',
        })
        const vw = parseFloat(svg.getAttribute('width') || '0')
        const vh = parseFloat(svg.getAttribute('height') || '0')
        if (vw > 0 && vh > 0) {
          svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`)
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
          svg.removeAttribute('width')
          svg.removeAttribute('height')
        }
      } catch {
        if (svg.parentNode === bcWrap) bcWrap.removeChild(svg)
      }
    }

    const bottom = doc.createElement('div')
    bottom.className = 'bottom-row'
    const bLeft = doc.createElement('span')
    bLeft.className = 'b-left'
    bLeft.textContent = expStr
    const bRight = doc.createElement('span')
    bRight.className = 'b-right'
    bRight.textContent = showPharmacy && pharmacyName ? pharmacyName : ''
    bottom.append(bLeft, bRight)
    shift.appendChild(bottom)

    container.appendChild(cell)
  }
}

export function waitForLabelImages(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve()
          else {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }
        }),
    ),
  ).then(() => undefined)
}

export async function openLabelPrintWindow(
  printList: LabelEntry[],
  config: LabelPrintConfig,
  labels: LabelPrintDialogLabels,
  openPrinterDialog = false,
  windowName = 'PRINT_LABELS',
): Promise<void> {
  if (printList.length === 0) return

  const { dims, style, gridOpts } = config

  if (openPrinterDialog) {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(iframe)
    const win = iframe.contentWindow
    const doc = win?.document
    if (!win || !doc) {
      document.body.removeChild(iframe)
      return
    }
    doc.open()
    doc.write('<!doctype html><html><head><title> </title></head><body></body></html>')
    doc.close()
    const styleEl = doc.createElement('style')
    styleEl.textContent = buildLabelStyles(dims, style, gridOpts)
    doc.head.appendChild(styleEl)
    const sheet = doc.createElement('div')
    sheet.className = 'sheet'
    doc.body.appendChild(sheet)
    await fillLabelSheet(doc, sheet, printList, config)
    await waitForLabelImages(doc)
    const cleanup = () => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe)
      } catch {
        /* ignore */
      }
    }
    win.onafterprint = cleanup
    win.focus()
    win.print()
    setTimeout(cleanup, 60000)
    return
  }

  const w = window.open('', windowName, 'width=820,height=640,scrollbars=yes')
  if (!w) {
    alert(labels.popupBlocked)
    return
  }
  w.document.title = ' '
  const styleEl = w.document.createElement('style')
  styleEl.textContent = buildLabelStyles(dims, style, gridOpts)
  w.document.head.appendChild(styleEl)
  const toolbar = w.document.createElement('div')
  toolbar.id = 'print-toolbar'
  const btn = w.document.createElement('button')
  btn.type = 'button'
  btn.textContent = labels.printToolbar
  btn.onclick = () => {
    w.focus()
    w.print()
  }
  toolbar.append(btn)
  w.document.body.appendChild(toolbar)
  const sheet = w.document.createElement('div')
  sheet.className = 'sheet'
  w.document.body.appendChild(sheet)
  await fillLabelSheet(w.document, sheet, printList, config)
  await waitForLabelImages(w.document)
  w.focus()
}
