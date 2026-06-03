import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, RefreshCw, Printer, Download, Check } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { appendLabelMeta, formatExpiryForLabel } from '../lib/barcodeLabel'

type CodeType = 'CODE128' | 'EAN13' | 'EAN8' | 'CODE39' | 'UPC' | 'ITF14' | 'QR'

interface Props {
  initialValue?: string
  productName?: string
  /** Expiry date (YYYY-MM-DD) printed on the label below the barcode */
  expiryDate?: string | null
  onClose: () => void
  onUse?: (value: string) => void
}

function ean13Checksum(d12: string): string {
  const digits = d12.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return d12 + String(check)
}

function autoFor(type: CodeType): string {
  const rand = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
  switch (type) {
    case 'EAN13': return ean13Checksum('200' + rand(9))
    case 'EAN8':  return rand(8)
    case 'UPC':   return rand(12)
    case 'ITF14': return rand(14)
    case 'CODE39':return 'P' + rand(7)
    case 'QR':    return 'P-' + rand(10)
    default:      return rand(12)
  }
}

function validForType(value: string, type: CodeType): boolean {
  const v = value.trim()
  if (!v) return false
  switch (type) {
    case 'EAN13': return /^\d{13}$/.test(v)
    case 'EAN8':  return /^\d{8}$/.test(v)
    case 'UPC':   return /^\d{12}$/.test(v)
    case 'ITF14': return /^\d{14}$/.test(v)
    case 'CODE39':return /^[0-9A-Z\-. $/+%]+$/.test(v)
    case 'CODE128':return v.length >= 1
    case 'QR':    return v.length >= 1
  }
}

export default function BarcodeDesigner({ initialValue, productName, expiryDate, onClose, onUse }: Props) {
  const { t } = useTranslation()
  const [type, setType] = useState<CodeType>('CODE128')
  const [value, setValue] = useState(initialValue || '')
  const [showText, setShowText] = useState(true)
  const [showExpiry, setShowExpiry] = useState(true)
  const [scale, setScale] = useState(2)
  const [height, setHeight] = useState(70)
  const [margin, setMargin] = useState(10)
  const [fg, setFg] = useState('#000000')
  const [bg, setBg] = useState('#ffffff')
  const [ecc, setEcc] = useState<'L' | 'M' | 'Q' | 'H'>('M')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [sheetCount, setSheetCount] = useState(12)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const valid = useMemo(() => validForType(value, type), [value, type])
  const expiryLabel = useMemo(
    () => (showExpiry ? formatExpiryForLabel(expiryDate) : null),
    [expiryDate, showExpiry],
  )

  useEffect(() => {
    if (type === 'QR') {
      if (!valid) { setQrDataUrl(''); return }
      QRCode.toDataURL(value, {
        errorCorrectionLevel: ecc,
        margin: Math.max(0, Math.round(margin / 4)),
        scale: Math.max(2, scale + 2),
        color: { dark: fg, light: bg },
      }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
      return
    }
    if (!svgRef.current || !valid) return
    try {
      JsBarcode(svgRef.current, value, {
        format: type,
        displayValue: showText,
        width: scale,
        height,
        margin,
        background: bg,
        lineColor: fg,
        font: 'Inter, sans-serif',
        fontSize: 14,
      })
    } catch {
      /* invalid value for selected format — handled by valid flag */
    }
  }, [type, value, showText, scale, height, margin, fg, bg, ecc, valid])

  const autoGen = () => setValue(autoFor(type))

  const renderToCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!valid) return null
    if (type === 'QR') {
      const c = document.createElement('canvas')
      await QRCode.toCanvas(c, value, {
        errorCorrectionLevel: ecc,
        margin: Math.max(0, Math.round(margin / 4)),
        scale: Math.max(4, scale + 4),
        color: { dark: fg, light: bg },
      })
      return c
    }
    const c = document.createElement('canvas')
    JsBarcode(c, value, {
      format: type,
      displayValue: showText,
      width: scale,
      height,
      margin,
      background: bg,
      lineColor: fg,
      font: 'Inter, sans-serif',
      fontSize: 14,
    })
    return c
  }

  const downloadPNG = async () => {
    const c = await renderToCanvas()
    if (!c) return
    const a = document.createElement('a')
    a.download = `barcode-${value}.png`
    a.href = c.toDataURL('image/png')
    a.click()
  }

  const downloadSVG = () => {
    if (type === 'QR') { downloadPNG(); return }
    if (!svgRef.current) return
    const s = new XMLSerializer().serializeToString(svgRef.current)
    const blob = new Blob([s], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = `barcode-${value}.svg`
    a.href = url
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const openPrintWindow = (title: string, bodyBuilder: (doc: Document) => void, styleCss: string) => {
    const w = window.open('', 'PRINT')
    if (!w) return
    w.document.title = title
    const style = w.document.createElement('style')
    style.textContent = styleCss
    w.document.head.appendChild(style)
    bodyBuilder(w.document)
    const script = w.document.createElement('script')
    script.textContent = 'window.onload=function(){window.print();setTimeout(function(){window.close()},500)}'
    w.document.body.appendChild(script)
  }

  const printOne = async () => {
    const c = await renderToCanvas()
    if (!c) return
    const url = c.toDataURL('image/png')
    openPrintWindow(`Barcode ${value}`, (doc) => {
      const wrap = doc.createElement('div')
      wrap.className = 'label'
      appendLabelMeta(wrap, doc, {
        productName,
        expiryDate: showExpiry ? expiryDate : null,
        expiryPrefix: t('barcode_studio.exp_label'),
      })
      const img = doc.createElement('img')
      img.src = url
      wrap.appendChild(img)
      doc.body.appendChild(wrap)
    }, `body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff}
      .label{text-align:center;font-family:Inter,sans-serif}
      .name{font-size:12px;margin-bottom:4px;color:#0f172a;font-weight:600}
      .expiry{font-size:11px;margin-bottom:6px;color:#b45309;font-weight:600}
      img{max-width:80mm}
      @media print { @page { margin: 4mm } }`)
  }

  const printSheet = async () => {
    const c = await renderToCanvas()
    if (!c) return
    const url = c.toDataURL('image/png')
    const n = Math.max(1, Math.min(120, sheetCount | 0))
    openPrintWindow(`Barcode sheet ${value}`, (doc) => {
      const grid = doc.createElement('div')
      grid.className = 'grid'
      for (let i = 0; i < n; i++) {
        const cell = doc.createElement('div')
        cell.className = 'cell'
        appendLabelMeta(cell, doc, {
          productName,
          expiryDate: showExpiry ? expiryDate : null,
          expiryPrefix: t('barcode_studio.exp_label'),
        })
        const img = doc.createElement('img')
        img.src = url
        cell.appendChild(img)
        grid.appendChild(cell)
      }
      doc.body.appendChild(grid)
    }, `body{margin:8mm;font-family:Inter,sans-serif;background:#fff;color:#0f172a}
      .grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:6mm}
      .cell{border:1px dashed #cbd5e1;border-radius:4px;padding:4mm;text-align:center;page-break-inside:avoid}
      .name{font-size:10px;margin-bottom:2px;font-weight:600}
      .expiry{font-size:9px;margin-bottom:4px;color:#b45309;font-weight:600}
      img{max-width:100%;height:auto}
      @media print { .cell{border-color:transparent} @page { margin: 6mm } }`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">{t('barcode_studio.title')}</h3>
            <p className="text-[11px] text-slate-500">{productName || t('barcode_studio.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">{t('barcode_studio.type')}</label>
              <select value={type} onChange={(e) => setType(e.target.value as CodeType)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1">
                <option value="CODE128">{t('barcode_studio.type_code128')}</option>
                <option value="EAN13">{t('barcode_studio.type_ean13')}</option>
                <option value="EAN8">{t('barcode_studio.type_ean8')}</option>
                <option value="UPC">{t('barcode_studio.type_upc')}</option>
                <option value="ITF14">{t('barcode_studio.type_itf14')}</option>
                <option value="CODE39">{t('barcode_studio.type_code39')}</option>
                <option value="QR">{t('barcode_studio.type_qr')}</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">{t('barcode_studio.value')}</label>
              <div className="flex gap-2 mt-1">
                <input value={value} onChange={(e) => setValue(e.target.value)}
                  dir="ltr"
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono ${value && !valid ? 'border-red-400' : 'border-slate-300'}`} />
                <button type="button" onClick={autoGen}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1">
                  <RefreshCw size={13} /> {t('barcode_studio.auto_generate')}
                </button>
              </div>
              {value && !valid && (
                <p className="text-[11px] text-red-600 mt-1">{t('barcode_studio.invalid_for_type')}</p>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">{t('barcode_studio.options')}</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {type !== 'QR' && (
                  <label className="flex items-center gap-2 col-span-2">
                    <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} />
                    {t('barcode_studio.show_text')}
                  </label>
                )}
                <label className="flex items-center gap-2 col-span-2">
                  <input
                    type="checkbox"
                    checked={showExpiry}
                    onChange={(e) => setShowExpiry(e.target.checked)}
                    disabled={!formatExpiryForLabel(expiryDate)}
                  />
                  {t('barcode_studio.show_expiry')}
                  {formatExpiryForLabel(expiryDate) && (
                    <span className="text-slate-400 font-mono">({formatExpiryForLabel(expiryDate)})</span>
                  )}
                </label>
                <div>
                  <label className="text-slate-600">{t('barcode_studio.scale')}</label>
                  <input type="range" min={1} max={6} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full" />
                </div>
                {type !== 'QR' && (
                  <div>
                    <label className="text-slate-600">{t('barcode_studio.height')}</label>
                    <input type="range" min={30} max={160} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full" />
                  </div>
                )}
                <div>
                  <label className="text-slate-600">{t('barcode_studio.margin')}</label>
                  <input type="range" min={0} max={30} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="w-full" />
                </div>
                {type === 'QR' && (
                  <div>
                    <label className="text-slate-600">{t('barcode_studio.ecc')}</label>
                    <select value={ecc} onChange={(e) => setEcc(e.target.value as any)} className="w-full border border-slate-300 rounded px-2 py-1">
                      <option value="L">L</option><option value="M">M</option>
                      <option value="Q">Q</option><option value="H">H</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-slate-600">{t('barcode_studio.fg')}</label>
                  <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="w-full h-8 rounded border border-slate-300" />
                </div>
                <div>
                  <label className="text-slate-600">{t('barcode_studio.bg')}</label>
                  <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-full h-8 rounded border border-slate-300" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">{t('barcode_studio.preview')}</p>
            <div className="border border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center min-h-[200px]" style={{ background: bg }}>
              {productName && (
                <div className="text-xs font-semibold text-slate-800 mb-1 text-center px-2">{productName}</div>
              )}
              {showExpiry && expiryLabel && (
                <div className="text-[11px] font-semibold text-amber-800 mb-2">
                  {t('barcode_studio.exp_label')} {expiryLabel}
                </div>
              )}
              {!valid ? (
                <span className="text-xs text-slate-400">—</span>
              ) : type === 'QR' ? (
                qrDataUrl ? <img src={qrDataUrl} alt={t('barcode_studio.type_qr')} className="max-w-full" /> : <span className="text-xs text-slate-400">…</span>
              ) : (
                <svg ref={svgRef} />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={printOne} disabled={!valid}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                <Printer size={13} /> {t('barcode_studio.print')}
              </button>
              <button type="button" onClick={downloadPNG} disabled={!valid}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                <Download size={13} /> {t('barcode_studio.download_png')}
              </button>
              <button type="button" onClick={downloadSVG} disabled={!valid}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                <Download size={13} /> {t('barcode_studio.download_svg')}
              </button>
            </div>

            <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
              <p className="text-[11px] font-semibold text-slate-700 mb-2">{t('barcode_studio.print_sheet')}</p>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-600">{t('barcode_studio.print_sheet_count')}</label>
                <input type="number" min={1} max={120} value={sheetCount}
                  onChange={(e) => setSheetCount(Number(e.target.value))}
                  className="w-20 border border-slate-300 rounded px-2 py-1 text-sm" />
                <button type="button" onClick={printSheet} disabled={!valid}
                  className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-white hover:bg-slate-700 inline-flex items-center gap-1 disabled:opacity-50">
                  <Printer size={13} /> {t('barcode_studio.print')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-100">
            {t('common.cancel')}
          </button>
          {onUse && (
            <button onClick={() => valid && onUse(value)} disabled={!valid}
              className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50 inline-flex items-center gap-1">
              <Check size={14} /> {t('barcode_studio.use_save')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
