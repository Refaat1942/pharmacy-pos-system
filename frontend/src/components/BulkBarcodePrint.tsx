import { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { useTranslation } from 'react-i18next'
import { X, Printer, Minus, Plus, Eye, RotateCcw } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { formatExpiryForLabel } from '../lib/barcodeLabel'
import {
  ZebraDevice,
  isBrowserPrintAvailable,
  listPrinters,
  getDefaultPrinter,
  sendZpl,
  readLabelSize,
} from '../lib/zebraBrowserPrint'
import { renderLabelCanvas, canvasToZpl } from '../lib/labelZpl'

export interface BulkItem {
  id: number
  barcode: string | null
  name: string
  price?: number | null
  expiryDate?: string | null
  /** Default label count (e.g. batch quantity) */
  defaultQty?: number
}

// ─── Label profiles ─────────────────────────────────────────────────────────
// Every profile is one physical thermal label = one print page (single unit).
type LabelSize = 'strip38' | 'small' | 'medium' | 'large' | 'custom'

interface LabelDims {
  wMm: number
  hMm: number
}

const PROFILE_DIMS: Record<Exclude<LabelSize, 'custom'>, LabelDims> = {
  strip38: { wMm: 38, hMm: 12 },
  small: { wMm: 40, hMm: 20 },
  medium: { wMm: 50, hMm: 25 },
  large: { wMm: 80, hMm: 50 },
}

const CUSTOM_DEFAULT: LabelDims = { wMm: 50, hMm: 25 }

interface LabelStyle {
  /** Generated barcode bitmap height (px) */
  barcodeHeight: number
  /** Barcode module (bar) width — JsBarcode `width` */
  barcodeScale: number
  /** Text font size (px) */
  fontSize: number
  /** Label inner padding (mm) */
  padding: number
  /** Vertical registration nudge (mm, +down / -up) to centre on the sticker */
  offsetY: number
}

function clampMm(v: number, fallback: number): number {
  if (!Number.isFinite(v) || v <= 0) return fallback
  return Math.min(200, Math.max(5, v))
}

function dimsFor(size: LabelSize, customW: number, customH: number): LabelDims {
  if (size === 'custom') {
    return { wMm: clampMm(customW, CUSTOM_DEFAULT.wMm), hMm: clampMm(customH, CUSTOM_DEFAULT.hMm) }
  }
  return PROFILE_DIMS[size]
}

/** Sensible barcode/text sizing derived from the label height (never oversized). */
function defaultStyle({ hMm }: LabelDims): LabelStyle {
  return {
    barcodeHeight: Math.max(20, Math.round(hMm * 1.6)),
    // Thicker bars (>= 2 dots wide @203dpi) so they print solid black, not faint.
    barcodeScale: hMm >= 40 ? 3 : hMm >= 24 ? 2.5 : 2,
    fontSize: Math.max(6, Math.round(hMm * 0.34)),
    padding: hMm >= 40 ? 3 : hMm >= 24 ? 1.5 : 1,
    offsetY: 0,
  }
}

function normalizeSize(s?: string): LabelSize {
  if (s === 'strip38' || s === 'small' || s === 'medium' || s === 'large' || s === 'custom') return s
  if (s === 'sm') return 'small'
  if (s === 'lg' || s === 'zebra2x3') return 'large'
  if (s === 'thermal') return 'strip38'
  return 'medium' // md / undefined → sensible default
}

// Remembered label-print preferences (per browser/terminal) so the right size
// and layout are applied automatically next time without re-selecting.
const LABEL_PREFS_KEY = 'pharma_label_print_prefs'
interface LabelPrefs {
  size?: string
  useQR?: boolean
  showName?: boolean
  showPrice?: boolean
  showExpiry?: boolean
  customW?: number
  customH?: number
  overrides?: Partial<LabelStyle>
  layout?: 'page' | 'grid'
  columns?: number
  rowGap?: number
  colGap?: number
}
function loadLabelPrefs(): LabelPrefs {
  try {
    const raw = localStorage.getItem(LABEL_PREFS_KEY)
    return raw ? (JSON.parse(raw) as LabelPrefs) : {}
  } catch {
    return {}
  }
}
function saveLabelPrefs(prefs: LabelPrefs): void {
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

async function renderBarcodeDataUrl(
  value: string,
  useQR: boolean,
  style: LabelStyle,
): Promise<string | null> {
  try {
    if (useQR) {
      const scale = Math.max(3, Math.round(style.barcodeHeight / 12))
      return await QRCode.toDataURL(value, { margin: 0, scale, errorCorrectionLevel: 'M' })
    }
    const c = document.createElement('canvas')
    JsBarcode(c, value, {
      format: detectType(value),
      displayValue: true,
      width: style.barcodeScale,
      height: style.barcodeHeight,
      margin: 0,
      font: 'Arial Black, Arial, sans-serif',
      fontSize: style.fontSize + 1,
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

/**
 * One clean thermal layout for every profile: @page is exactly the label size
 * with zero margin (kills browser headers/footers/page numbers), and each cell
 * is a single, centred, overflow-clipped print unit.
 */
interface GridOpts {
  layout: 'page' | 'grid'
  columns: number
  rowGap: number
  colGap: number
}

function buildLabelStyles(dims: LabelDims, style: LabelStyle, grid: GridOpts): string {
  const w = `${dims.wMm}mm`
  const h = `${dims.hMm}mm`
  const imgMaxH = `${Math.max(6, dims.hMm * 0.55).toFixed(1)}mm`
  const metaFs = Math.max(6, style.fontSize - 1)
  const isGrid = grid.layout === 'grid'
  const cols = Math.max(1, Math.round(grid.columns) || 1)
  // Page width: a single label (page mode) or the full grid row (grid mode).
  const pageW = isGrid ? (cols * dims.wMm + (cols - 1) * grid.colGap).toFixed(2) + 'mm' : w
  const pageH = isGrid ? 'auto' : h
  const sheetScreen = isGrid
    ? `display: grid; grid-template-columns: repeat(${cols}, ${w}); column-gap: ${grid.colGap}mm; row-gap: ${grid.rowGap}mm; justify-content: start; padding: 16px; background: #f1f5f9;`
    : `display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; background: #f1f5f9;`
  const sheetPrint = isGrid
    ? `padding: 0; margin: 0; background: #fff; column-gap: ${grid.colGap}mm; row-gap: ${grid.rowGap}mm;`
    : `display: block; padding: 0; margin: 0; background: #fff; gap: 0;`
  // In page mode each label is its own page; in grid mode labels flow continuously.
  const cellBreak = isGrid
    ? 'page-break-inside: avoid; break-inside: avoid;'
    : 'page-break-after: always; page-break-inside: avoid; break-inside: avoid; break-after: page;'
  return `
    @page { size: ${pageW} ${pageH}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: 'Arial Black', Arial, sans-serif; color: #000; font-weight: 700; }
    #print-toolbar {
      position: sticky; top: 0; z-index: 99; padding: 12px 16px; background: #ecfdf5;
      border-bottom: 2px solid #10b981; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    #print-toolbar strong { font-size: 14px; color: #065f46; }
    #print-toolbar button { padding: 10px 18px; background: #059669; color: #fff; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
    #print-toolbar span { font-size: 12px; color: #047857; }
    .sheet { ${sheetScreen} }
    .cell {
      width: ${w}; height: ${h}; box-sizing: border-box; overflow: hidden;
      padding: ${style.padding}mm; background: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; gap: 1px;
      ${cellBreak}
      border: 1px dashed #cbd5e1;
    }
    .shift { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 100%; transform: translateY(${style.offsetY}mm); }
    .pharmacy { font-size: ${style.fontSize}px; font-weight: 900; line-height: 1.05; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-transform: uppercase; }
    .name { font-size: ${style.fontSize + 1}px; font-weight: 900; line-height: 1.05; width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    img, svg { max-width: 100%; max-height: ${imgMaxH}; width: auto; height: auto; object-fit: contain; display: block; margin: 1px auto; }
    svg { shape-rendering: crispEdges; }
    .row { display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 4px; }
    .meta { font-size: ${metaFs}px; font-weight: 900; line-height: 1; white-space: nowrap; }
    @media print {
      #print-toolbar { display: none !important; }
      .sheet { ${sheetPrint} }
      .cell { border: none !important; margin: 0; }
      .cell:last-child { page-break-after: auto; break-after: auto; }
      @page { size: ${pageW} ${pageH}; margin: 0; }
    }
  `
}

interface Props {
  items: BulkItem[]
  currency?: string
  defaultSize?: LabelSize | string
  onClose: () => void
}

type PharmacyProfile = {
  name_ar?: string
  name_en?: string
  show_pharmacy_name_on_labels?: boolean
}

export default function BulkBarcodePrint({ items, currency, defaultSize = 'medium', onClose }: Props) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const printable = items.filter(i => i.barcode && i.barcode.trim().length > 0)
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(printable.map((i) => [i.id, i.defaultQty ?? 1])),
  )
  const savedPrefs = useMemo(loadLabelPrefs, [])
  const [size, setSize] = useState<LabelSize>(normalizeSize(savedPrefs.size ?? defaultSize))
  const [useQR, setUseQR] = useState(savedPrefs.useQR ?? false)
  const [showName, setShowName] = useState(savedPrefs.showName ?? true)
  const [showPrice, setShowPrice] = useState(savedPrefs.showPrice ?? true)
  const [showExpiry, setShowExpiry] = useState(savedPrefs.showExpiry ?? true)
  const [showPharmacy, setShowPharmacy] = useState(true)
  const [pharmacyName, setPharmacyName] = useState('')
  const [busy, setBusy] = useState(false)
  const [customW, setCustomW] = useState<number>(savedPrefs.customW ?? CUSTOM_DEFAULT.wMm)
  const [customH, setCustomH] = useState<number>(savedPrefs.customH ?? CUSTOM_DEFAULT.hMm)
  const [overrides, setOverrides] = useState<Partial<LabelStyle>>(savedPrefs.overrides ?? {})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [layout, setLayout] = useState<'page' | 'grid'>(savedPrefs.layout ?? 'page')
  const [columns, setColumns] = useState<number>(savedPrefs.columns ?? 1)
  const [rowGap, setRowGap] = useState<number>(savedPrefs.rowGap ?? 2)
  const [colGap, setColGap] = useState<number>(savedPrefs.colGap ?? 2)
  const gridOpts = useMemo(
    () => ({ layout, columns, rowGap, colGap }),
    [layout, columns, rowGap, colGap],
  )

  const dims = useMemo(() => dimsFor(size, customW, customH), [size, customW, customH])
  const effectiveStyle = useMemo<LabelStyle>(
    () => ({ ...defaultStyle(dims), ...overrides }),
    [dims, overrides],
  )

  // Zebra Browser Print (direct-to-printer) state.
  const [zebraReady, setZebraReady] = useState(false)
  const [zebraDevices, setZebraDevices] = useState<ZebraDevice[]>([])
  const [zebraDevice, setZebraDevice] = useState<ZebraDevice | null>(null)
  const [zebraDirect, setZebraDirect] = useState(true)
  const [zebraDpi, setZebraDpi] = useState(203)
  const [zebraSizeNote, setZebraSizeNote] = useState('')

  // Persist chosen settings so they auto-apply next time.
  useEffect(() => {
    saveLabelPrefs({ size, useQR, showName, showPrice, showExpiry, customW, customH, overrides, layout, columns, rowGap, colGap })
  }, [size, useQR, showName, showPrice, showExpiry, customW, customH, overrides, layout, columns, rowGap, colGap])

  useEffect(() => {
    api.get<PharmacyProfile>('/settings/profile')
      .then((r) => {
        const p = r.data
        const nm = (isAr ? p.name_ar : p.name_en) || p.name_en || p.name_ar || ''
        setPharmacyName(nm.trim())
        setShowPharmacy(p.show_pharmacy_name_on_labels !== false)
      })
      .catch(() => {})
  }, [isAr])

  // Detect a Zebra printer via Browser Print (fails soft if not installed).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!(await isBrowserPrintAvailable())) return
      const [def, list] = await Promise.all([getDefaultPrinter(), listPrinters()])
      if (cancelled) return
      const devices = list.length ? list : def ? [def] : []
      setZebraDevices(devices)
      setZebraDevice(def || devices[0] || null)
      setZebraReady(devices.length > 0 || !!def)
    })()
    return () => { cancelled = true }
  }, [])

  const totalLabels = useMemo(() => printable.reduce((s, i) => s + (qty[i.id] || 0), 0), [qty, printable])
  const skipped = items.length - printable.length

  const bump = (id: number, delta: number) =>
    setQty(q => ({ ...q, [id]: Math.max(0, Math.min(500, (q[id] || 0) + delta)) }))
  const setQ = (id: number, v: number) =>
    setQty(q => ({ ...q, [id]: Math.max(0, Math.min(500, isNaN(v) ? 0 : v)) }))

  const setOverride = (k: keyof LabelStyle, v: number) =>
    setOverrides(o => ({ ...o, [k]: v }))
  const resetStyle = () => setOverrides({})

  const waitForImages = (doc: Document) =>
    Promise.all(
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
    )

  const openPrintWindow = async (openPrinterDialog: boolean) => {
    if (totalLabels === 0) return
    setBusy(true)
    try {
      const style = effectiveStyle
      const w = window.open('', 'PRINT_LABELS', 'width=820,height=640,scrollbars=yes')
      if (!w) {
        alert(t('bulk_barcode.popup_blocked'))
        return
      }
      // A single space title prevents the browser printing "Barcodes (N)" as a header.
      w.document.title = ' '
      const styleEl = w.document.createElement('style')
      styleEl.textContent = buildLabelStyles(dims, style, gridOpts)
      w.document.head.appendChild(styleEl)

      const toolbar = w.document.createElement('div')
      toolbar.id = 'print-toolbar'
      const title = w.document.createElement('strong')
      title.textContent = t('bulk_barcode.print_toolbar_title')
      const btn = w.document.createElement('button')
      btn.type = 'button'
      btn.textContent = t('bulk_barcode.print_toolbar_btn')
      btn.onclick = () => { w.focus(); w.print() }
      const hint = w.document.createElement('span')
      hint.textContent = t('bulk_barcode.print_toolbar_hint')
      toolbar.append(title, btn, hint)
      w.document.body.appendChild(toolbar)

      const sheet = w.document.createElement('div')
      sheet.className = 'sheet'
      w.document.body.appendChild(sheet)

      const svgNS = 'http://www.w3.org/2000/svg'
      for (const it of printable) {
        const n = qty[it.id] || 0
        if (n <= 0) continue
        // QR is rasterised (high-res PNG); 1D barcodes are drawn as crisp
        // vector SVG so the bars never become jagged when scaled to the label.
        const qrUrl = useQR ? await renderBarcodeDataUrl(it.barcode!, true, style) : null
        if (useQR && !qrUrl) continue
        for (let i = 0; i < n; i++) {
          const cell = w.document.createElement('div')
          cell.className = 'cell'
          const shift = w.document.createElement('div')
          shift.className = 'shift'
          cell.appendChild(shift)
          // Layout (top → bottom): store name · barcode (no digits) ·
          // code + price row · product name · optional expiry.
          if (showPharmacy && pharmacyName) {
            const ph = w.document.createElement('div')
            ph.className = 'pharmacy'
            ph.textContent = pharmacyName
            shift.appendChild(ph)
          }
          if (useQR) {
            const img = w.document.createElement('img')
            img.src = qrUrl as string
            shift.appendChild(img)
          } else {
            const svg = w.document.createElementNS(svgNS, 'svg')
            shift.appendChild(svg)
            try {
              JsBarcode(svg, it.barcode!, {
                format: detectType(it.barcode!),
                displayValue: false,
                width: style.barcodeScale,
                height: style.barcodeHeight,
                margin: 0,
                lineColor: '#000000',
                background: '#ffffff',
              })
              // Convert intrinsic px size to a viewBox so CSS can scale the
              // vector crisply within the label (no jagged raster scaling).
              const vw = parseFloat(svg.getAttribute('width') || '0')
              const vh = parseFloat(svg.getAttribute('height') || '0')
              if (vw > 0 && vh > 0) {
                svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`)
                svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
                svg.removeAttribute('width')
                svg.removeAttribute('height')
              }
            } catch {
              if (svg.parentNode === shift) shift.removeChild(svg)
            }
          }
          // Code (left) + price (right), like the reference label.
          const hasPrice = showPrice && it.price != null
          const codeRow = w.document.createElement('div')
          codeRow.className = 'row'
          const codeSpan = w.document.createElement('span')
          codeSpan.className = 'meta'
          codeSpan.textContent = it.barcode || ''
          const priceSpan = w.document.createElement('span')
          priceSpan.className = 'meta'
          priceSpan.textContent = hasPrice ? `${Number(it.price).toFixed(2)}${currency ? ' ' + currency : ''}` : ''
          codeRow.append(codeSpan, priceSpan)
          shift.appendChild(codeRow)
          if (showName) {
            const nm = w.document.createElement('div')
            nm.className = 'name'
            nm.textContent = it.name
            shift.appendChild(nm)
          }
          const exp = showExpiry ? formatExpiryForLabel(it.expiryDate) : null
          if (exp) {
            const ex = w.document.createElement('div')
            ex.className = 'meta'
            ex.textContent = `${t('barcode_studio.exp_label')} ${exp}`
            shift.appendChild(ex)
          }
          sheet.appendChild(cell)
        }
      }

      await waitForImages(w.document)
      w.focus()
      if (openPrinterDialog) w.print()
    } finally {
      setBusy(false)
    }
  }

  const readSizeFromPrinter = async () => {
    if (!zebraDevice) return
    setBusy(true)
    try {
      const r = await readLabelSize(zebraDevice)
      if (r.dpi) setZebraDpi(r.dpi)
      if (r.widthIn) setCustomW(Math.round(r.widthIn * 25.4))
      if (r.heightIn) setCustomH(Math.round(r.heightIn * 25.4))
      if (r.widthIn || r.heightIn) setSize('custom')
      setZebraSizeNote(
        r.widthIn || r.heightIn
          ? (t('bulk_barcode.zebra_size_read', {
              w: r.widthIn ? Math.round(r.widthIn * 25.4) : customW,
              h: r.heightIn ? Math.round(r.heightIn * 25.4) : customH,
              dpi: r.dpi,
            }) as string)
          : (t('bulk_barcode.zebra_size_unknown') as string),
      )
    } catch {
      setZebraSizeNote(t('bulk_barcode.zebra_size_unknown') as string)
    } finally {
      setBusy(false)
    }
  }

  const printDirectToZebra = async () => {
    if (!zebraDevice || totalLabels === 0) return
    setBusy(true)
    try {
      const wIn = dims.wMm / 25.4
      const hIn = dims.hMm / 25.4
      const style = effectiveStyle
      // High-resolution barcode bitmap so the rasterised ZPL label stays crisp.
      const barStyle: LabelStyle = {
        ...style,
        barcodeScale: 3,
        barcodeHeight: Math.max(40, Math.round(hIn * zebraDpi * 0.38)),
        fontSize: Math.max(10, Math.round(hIn * zebraDpi * 0.05)),
      }
      for (const it of printable) {
        const n = qty[it.id] || 0
        if (n <= 0) continue
        const url = await renderBarcodeDataUrl(it.barcode!, useQR, barStyle)
        if (!url) continue
        const canvas = await renderLabelCanvas({
          widthIn: wIn,
          heightIn: hIn,
          dpi: zebraDpi,
          barcodeDataUrl: url,
          pharmacy: showPharmacy && pharmacyName ? pharmacyName : undefined,
          name: showName ? it.name : undefined,
          expiry: showExpiry ? formatExpiryForLabel(it.expiryDate) : null,
          price: showPrice && it.price != null
            ? `${Number(it.price).toFixed(2)}${currency ? ' ' + currency : ''}`
            : null,
          isQR: useQR,
        })
        await sendZpl(zebraDevice, canvasToZpl(canvas, n))
      }
    } catch (e: any) {
      alert(t('bulk_barcode.zebra_print_error', { msg: e?.message || '' }))
    } finally {
      setBusy(false)
    }
  }

  const useZebraDirect = zebraReady && zebraDirect && !!zebraDevice
  const handlePrint = () => (useZebraDirect ? printDirectToZebra() : openPrintWindow(true))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">{t('bulk_barcode.title')}</h3>
            <p className="text-[11px] text-slate-500">{t('bulk_barcode.subtitle', { n: printable.length, total: totalLabels })}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>

        <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-900">
          {t('bulk_barcode.label_hint', { w: dims.wMm, h: dims.hMm })}
        </div>

        <div className="px-5 py-3 border-b bg-slate-50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="md:col-span-2">
            <label className="text-slate-600 font-medium">{t('bulk_barcode.size')}</label>
            <select value={size} onChange={e => setSize(e.target.value as LabelSize)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 mt-1 font-medium">
              <option value="strip38">{t('bulk_barcode.size_strip38')}</option>
              <option value="small">{t('bulk_barcode.size_small')}</option>
              <option value="medium">{t('bulk_barcode.size_medium')}</option>
              <option value="large">{t('bulk_barcode.size_large')}</option>
              <option value="custom">{t('bulk_barcode.size_custom')}</option>
            </select>
          </div>
          <div>
            <label className="text-slate-600 font-medium">{t('bulk_barcode.type')}</label>
            <select value={useQR ? 'qr' : 'auto'} onChange={e => setUseQR(e.target.value === 'qr')}
              className="w-full border border-slate-300 rounded px-2 py-1.5 mt-1">
              <option value="auto">{t('bulk_barcode.type_auto')}</option>
              <option value="qr">{t('bulk_barcode.type_qr')}</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-1">
            <input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} />
            <span>{t('bulk_barcode.show_name')}</span>
          </label>
          <label className="flex items-end gap-2 pb-1">
            <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} />
            <span>{t('bulk_barcode.show_price')}</span>
          </label>
          <label className="flex items-end gap-2 pb-1">
            <input type="checkbox" checked={showExpiry} onChange={e => setShowExpiry(e.target.checked)} />
            <span>{t('bulk_barcode.show_expiry')}</span>
          </label>
          <label className="flex items-end gap-2 pb-1 md:col-span-2">
            <input
              type="checkbox"
              checked={showPharmacy}
              onChange={e => setShowPharmacy(e.target.checked)}
              disabled={!pharmacyName}
            />
            <span>{t('bulk_barcode.show_pharmacy', { name: pharmacyName || '—' })}</span>
          </label>
        </div>

        {size === 'custom' && (
          <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-100 text-xs text-emerald-900 flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 font-medium">
              {t('bulk_barcode.custom_w')}
              <input type="number" min={5} max={200} step={1} value={customW}
                onChange={(e) => setCustomW(parseInt(e.target.value, 10) || CUSTOM_DEFAULT.wMm)}
                className="w-20 border border-emerald-300 rounded px-2 py-1 text-emerald-900" />
            </label>
            <label className="flex items-center gap-1.5 font-medium">
              {t('bulk_barcode.custom_h')}
              <input type="number" min={5} max={200} step={1} value={customH}
                onChange={(e) => setCustomH(parseInt(e.target.value, 10) || CUSTOM_DEFAULT.hMm)}
                className="w-20 border border-emerald-300 rounded px-2 py-1 text-emerald-900" />
            </label>
            <span className="text-emerald-700">{t('bulk_barcode.custom_unit_mm')}</span>
          </div>
        )}

        <div className="px-5 py-2 border-b bg-slate-50/60 text-xs">
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className="text-slate-600 hover:text-slate-800 font-medium inline-flex items-center gap-1">
            {showAdvanced ? '▾' : '▸'} {t('bulk_barcode.advanced')}
          </button>
          {showAdvanced && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_height')}</span>
                <input type="number" min={10} max={300} value={effectiveStyle.barcodeHeight}
                  onChange={e => setOverride('barcodeHeight', parseInt(e.target.value, 10) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_width')}</span>
                <input type="number" min={1} max={5} step={0.1} value={effectiveStyle.barcodeScale}
                  onChange={e => setOverride('barcodeScale', parseFloat(e.target.value) || 1)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_font')}</span>
                <input type="number" min={4} max={40} value={effectiveStyle.fontSize}
                  onChange={e => setOverride('fontSize', parseInt(e.target.value, 10) || 6)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_padding')}</span>
                <input type="number" min={0} max={10} step={0.5} value={effectiveStyle.padding}
                  onChange={e => setOverride('padding', parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_offset')}</span>
                <input type="number" min={-15} max={15} step={0.5} value={effectiveStyle.offsetY}
                  onChange={e => setOverride('offsetY', parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <button type="button" onClick={resetStyle}
                className="col-span-2 md:col-span-4 inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 w-fit">
                <RotateCcw size={12} /> {t('bulk_barcode.bc_reset')}
              </button>
              <div className="col-span-2 md:col-span-4 border-t border-slate-200 pt-2 mt-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">{t('bulk_barcode.layout')}</span>
                  <select value={layout} onChange={e => setLayout(e.target.value as 'page' | 'grid')}
                    className="border border-slate-300 rounded px-2 py-1">
                    <option value="page">{t('bulk_barcode.layout_page')}</option>
                    <option value="grid">{t('bulk_barcode.layout_grid')}</option>
                  </select>
                </label>
                {layout === 'grid' && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-500">{t('bulk_barcode.columns')}</span>
                      <input type="number" min={1} max={8} value={columns}
                        onChange={e => setColumns(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="border border-slate-300 rounded px-2 py-1" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-500">{t('bulk_barcode.row_gap')}</span>
                      <input type="number" min={0} max={20} step={0.5} value={rowGap}
                        onChange={e => setRowGap(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="border border-slate-300 rounded px-2 py-1" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-500">{t('bulk_barcode.col_gap')}</span>
                      <input type="number" min={0} max={20} step={0.5} value={colGap}
                        onChange={e => setColGap(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="border border-slate-300 rounded px-2 py-1" />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {zebraReady && (
          <div className="px-5 py-3 bg-sky-50 border-b border-sky-100 text-xs text-sky-900 space-y-2">
            <div className="flex items-center gap-2">
              <Printer size={14} />
              <span className="font-semibold">{t('bulk_barcode.zebra_detected')}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 font-medium">
                <input type="checkbox" checked={zebraDirect} onChange={(e) => setZebraDirect(e.target.checked)} />
                <span>{t('bulk_barcode.zebra_direct')}</span>
              </label>
              {zebraDevices.length > 1 ? (
                <select
                  value={zebraDevice?.uid || ''}
                  onChange={(e) => setZebraDevice(zebraDevices.find((d) => d.uid === e.target.value) || null)}
                  className="border border-sky-300 rounded px-2 py-1 text-sky-900"
                >
                  {zebraDevices.map((d) => <option key={d.uid} value={d.uid}>{d.name}</option>)}
                </select>
              ) : zebraDevice ? (
                <span className="font-mono">{zebraDevice.name}</span>
              ) : null}
              <button type="button" onClick={readSizeFromPrinter}
                className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium">
                {t('bulk_barcode.zebra_read_size')}
              </button>
              {zebraSizeNote && <span className="text-sky-700">{zebraSizeNote}</span>}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
              <tr>
                <th className="px-3 py-2 text-start">{t('bulk_barcode.item')}</th>
                <th className="px-3 py-2 text-start font-mono">{t('bulk_barcode.barcode')}</th>
                <th className="px-3 py-2 text-start">{t('bulk_barcode.expiry')}</th>
                <th className="px-3 py-2 text-center">{t('bulk_barcode.qty')}</th>
              </tr>
            </thead>
            <tbody>
              {printable.map(it => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600" dir="ltr">{it.barcode}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">
                    {formatExpiryForLabel(it.expiryDate) || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => bump(it.id, -1)} className="p-1 rounded border border-slate-200 hover:bg-slate-100"><Minus size={12} /></button>
                      <input type="number" min={0} max={500} value={qty[it.id] ?? 0}
                        onChange={e => setQ(it.id, parseInt(e.target.value))}
                        className="w-16 text-center border border-slate-300 rounded py-1" />
                      <button onClick={() => bump(it.id, 1)} className="p-1 rounded border border-slate-200 hover:bg-slate-100"><Plus size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {printable.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('bulk_barcode.none')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {skipped > 0 && <span className="text-amber-700">{t('bulk_barcode.skipped', { n: skipped })}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-100">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => openPrintWindow(false)}
              disabled={busy || totalLabels === 0}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-medium disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Eye size={14} /> {t('bulk_barcode.preview')}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={busy || totalLabels === 0}
              className="px-4 py-2 text-sm rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Printer size={14} />{' '}
              {useZebraDirect
                ? t('bulk_barcode.zebra_print_btn', { n: totalLabels })
                : t('bulk_barcode.choose_printer', { n: totalLabels })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
