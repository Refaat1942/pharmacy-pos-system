import { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { useTranslation } from 'react-i18next'
import { X, Printer, Minus, Plus, Eye } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { formatExpiryForLabel } from '../lib/barcodeLabel'

export interface BulkItem {
  id: number
  barcode: string | null
  name: string
  price?: number | null
  expiryDate?: string | null
  /** Default label count (e.g. batch quantity) */
  defaultQty?: number
}

type LabelSize = 'sm' | 'md' | 'lg' | 'thermal'

type SizeCfg = {
  cols: number
  cellPad: string
  pharmacyFs: string
  nameFs: string
  priceFs: string
  expiryFs: string
  imgMaxW: string
  imgMaxH: string
  scale: number
  height: number
  barcodeFontSize: number
  labelW?: string
  labelH?: string
}

const SIZE_CSS: Record<LabelSize, SizeCfg> = {
  sm: { cols: 5, cellPad: '2mm', pharmacyFs: '7px', nameFs: '8px', priceFs: '8px', expiryFs: '7px', imgMaxW: '36mm', imgMaxH: 'none', scale: 1.5, height: 40, barcodeFontSize: 11 },
  md: { cols: 3, cellPad: '4mm', pharmacyFs: '8px', nameFs: '10px', priceFs: '10px', expiryFs: '9px', imgMaxW: '58mm', imgMaxH: 'none', scale: 2, height: 60, barcodeFontSize: 12 },
  lg: { cols: 2, cellPad: '5mm', pharmacyFs: '9px', nameFs: '12px', priceFs: '13px', expiryFs: '11px', imgMaxW: '90mm', imgMaxH: 'none', scale: 2.5, height: 80, barcodeFontSize: 13 },
  /* XP-370B 38mm roll — one sticker = one print page (38×30mm), compact bold text */
  thermal: {
    cols: 1,
    cellPad: '0.5mm 1mm',
    pharmacyFs: '6px',
    nameFs: '7px',
    priceFs: '8px',
    expiryFs: '6px',
    imgMaxW: '34mm',
    imgMaxH: '11mm',
    scale: 1.05,
    height: 22,
    barcodeFontSize: 8,
    labelW: '38mm',
    labelH: '25mm',
  },
}

function truncLabel(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
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
  cfg: SizeCfg,
  thermal: boolean,
): Promise<string | null> {
  try {
    if (useQR) {
      const qrScale = thermal ? 3 : Math.max(3, cfg.scale + 2)
      return await QRCode.toDataURL(value, { margin: 0, scale: qrScale, errorCorrectionLevel: 'M' })
    }
    const c = document.createElement('canvas')
    JsBarcode(c, value, {
      format: detectType(value),
      displayValue: true,
      width: cfg.scale,
      height: cfg.height,
      margin: thermal ? 0 : 2,
      font: 'Arial Black, Arial, sans-serif',
      fontSize: cfg.barcodeFontSize,
      fontOptions: 'bold',
      textMargin: thermal ? 0 : 2,
      lineColor: '#000000',
      background: '#ffffff',
    })
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

function buildPrintStyles(size: LabelSize, cfg: SizeCfg, pageMargin: string): string {
  if (size === 'thermal' && cfg.labelW && cfg.labelH) {
    return `
      @page{size:${cfg.labelW} ${cfg.labelH};margin:0}
      body{margin:0;font-family:Arial Black,Arial,sans-serif;background:#fff;color:#000;font-weight:700}
      #print-toolbar{
        position:sticky;top:0;z-index:99;padding:12px 16px;background:#ecfdf5;
        border-bottom:2px solid #10b981;display:flex;align-items:center;gap:12px;flex-wrap:wrap
      }
      #print-toolbar strong{font-size:14px;color:#065f46;font-weight:700}
      #print-toolbar button{
        padding:10px 18px;background:#059669;color:#fff;font-weight:700;border:none;
        border-radius:8px;cursor:pointer;font-size:14px
      }
      #print-toolbar span{font-size:12px;color:#047857}
      .grid{display:block;padding:8px}
      .cell{
        width:${cfg.labelW};height:${cfg.labelH};max-width:${cfg.labelW};max-height:${cfg.labelH};
        box-sizing:border-box;overflow:hidden;padding:${cfg.cellPad};
        margin:0 auto 4px;border:1px dashed #ccc;
        display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
        text-align:center;page-break-after:always;page-break-inside:avoid;break-after:page
      }
      .pharmacy{
        font-size:${cfg.pharmacyFs};font-weight:900;line-height:1;margin:0 0 0.5mm;
        max-height:1.2em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;width:100%;
        color:#000;text-transform:uppercase
      }
      .name{
        font-size:${cfg.nameFs};font-weight:900;line-height:1.05;margin:0 0 0.5mm;
        max-height:2.1em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
        width:100%;color:#000
      }
      .expiry{font-size:${cfg.expiryFs};font-weight:900;line-height:1;margin:0;color:#000}
      .price{font-size:${cfg.priceFs};font-weight:900;line-height:1;margin:0;color:#000}
      .row{display:flex;justify-content:space-between;width:100%;gap:2px;margin-top:0.5mm}
      img{
        max-width:${cfg.imgMaxW};max-height:${cfg.imgMaxH};width:auto;height:auto;
        object-fit:contain;margin:0.5mm 0;flex-shrink:0
      }
      @media print{
        #print-toolbar{display:none!important}
        .grid{padding:0}
        .cell{border:none;margin:0;page-break-after:always}
        @page{size:${cfg.labelW} ${cfg.labelH};margin:0}
      }
    `
  }
  return `
    @page{margin:${pageMargin}}
    body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#000}
    #print-toolbar{
      position:sticky;top:0;z-index:99;padding:12px 16px;background:#ecfdf5;
      border-bottom:2px solid #10b981;display:flex;align-items:center;gap:12px;flex-wrap:wrap
    }
    #print-toolbar strong{font-size:14px;color:#065f46}
    #print-toolbar button{
      padding:10px 18px;background:#059669;color:#fff;font-weight:700;border:none;
      border-radius:8px;cursor:pointer;font-size:14px
    }
    #print-toolbar span{font-size:12px;color:#047857}
    .grid{display:grid;grid-template-columns:repeat(${cfg.cols},1fr);gap:2mm;padding:8px}
    .cell{border:1px solid #000;padding:${cfg.cellPad};text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .pharmacy{font-size:${cfg.pharmacyFs};font-weight:800;margin-bottom:2px;line-height:1.1;max-height:2.2em;overflow:hidden;color:#000;text-transform:uppercase;letter-spacing:0.02em}
    .name{font-size:${cfg.nameFs};margin-bottom:2px;font-weight:700;line-height:1.15;max-height:2.5em;overflow:hidden;color:#000}
    .expiry{font-size:${cfg.expiryFs};font-weight:700;color:#000;margin-bottom:2px}
    .price{font-size:${cfg.priceFs};margin-top:2px;font-weight:700;color:#000}
    img{max-width:${cfg.imgMaxW};height:auto}
    @media print{
      #print-toolbar{display:none!important}
      .grid{padding:0}
      .cell{border-color:transparent}
      @page{margin:${pageMargin}}
    }
  `
}

interface Props {
  items: BulkItem[]
  currency?: string
  defaultSize?: LabelSize
  onClose: () => void
}

type PharmacyProfile = {
  name_ar?: string
  name_en?: string
  show_pharmacy_name_on_labels?: boolean
}

export default function BulkBarcodePrint({ items, currency, defaultSize = 'md', onClose }: Props) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const printable = items.filter(i => i.barcode && i.barcode.trim().length > 0)
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(printable.map((i) => [i.id, i.defaultQty ?? 1])),
  )
  const [size, setSize] = useState<LabelSize>(defaultSize)
  const [useQR, setUseQR] = useState(false)
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [showExpiry, setShowExpiry] = useState(true)
  const [showPharmacy, setShowPharmacy] = useState(true)
  const [pharmacyName, setPharmacyName] = useState('')
  const [busy, setBusy] = useState(false)

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

  const totalLabels = useMemo(() => printable.reduce((s, i) => s + (qty[i.id] || 0), 0), [qty, printable])
  const skipped = items.length - printable.length

  const bump = (id: number, delta: number) =>
    setQty(q => ({ ...q, [id]: Math.max(0, Math.min(500, (q[id] || 0) + delta)) }))

  const setQ = (id: number, v: number) =>
    setQty(q => ({ ...q, [id]: Math.max(0, Math.min(500, isNaN(v) ? 0 : v)) }))

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
      const cfg = SIZE_CSS[size]
      const isThermal = size === 'thermal'
      const pageMargin = isThermal ? '0' : '3mm'

      const w = window.open('', 'PRINT_BULK', 'width=960,height=720,scrollbars=yes')
      if (!w) {
        alert(t('bulk_barcode.popup_blocked'))
        return
      }
      w.document.title = `Barcodes (${totalLabels})`
      const style = w.document.createElement('style')
      style.textContent = buildPrintStyles(size, cfg, pageMargin)
      w.document.head.appendChild(style)

      const toolbar = w.document.createElement('div')
      toolbar.id = 'print-toolbar'
      const title = w.document.createElement('strong')
      title.textContent = t('bulk_barcode.print_toolbar_title')
      const btn = w.document.createElement('button')
      btn.type = 'button'
      btn.textContent = t('bulk_barcode.print_toolbar_btn')
      btn.onclick = () => {
        w.focus()
        w.print()
      }
      const hint = w.document.createElement('span')
      hint.textContent = t('bulk_barcode.print_toolbar_hint')
      toolbar.append(title, btn, hint)
      w.document.body.appendChild(toolbar)

      const grid = w.document.createElement('div')
      grid.className = 'grid'
      w.document.body.appendChild(grid)

      for (const it of printable) {
        const n = qty[it.id] || 0
        if (n <= 0) continue
        const url = await renderBarcodeDataUrl(it.barcode!, useQR, cfg, isThermal)
        if (!url) continue
        for (let i = 0; i < n; i++) {
          const cell = w.document.createElement('div')
          cell.className = 'cell'
          if (showPharmacy && pharmacyName) {
            const ph = w.document.createElement('div')
            ph.className = 'pharmacy'
            ph.textContent = isThermal ? truncLabel(pharmacyName, 26) : pharmacyName
            cell.appendChild(ph)
          }
          if (showName) {
            const nm = w.document.createElement('div')
            nm.className = 'name'
            nm.textContent = isThermal ? truncLabel(it.name, 34) : it.name
            cell.appendChild(nm)
          }
          const img = w.document.createElement('img')
          img.src = url
          cell.appendChild(img)
          const exp = showExpiry ? formatExpiryForLabel(it.expiryDate) : null
          const hasPrice = showPrice && it.price != null
          if (isThermal && (exp || hasPrice)) {
            const row = w.document.createElement('div')
            row.className = 'row'
            if (exp) {
              const ex = w.document.createElement('span')
              ex.className = 'expiry'
              ex.textContent = `Exp ${exp}`
              row.appendChild(ex)
            }
            if (hasPrice) {
              const pr = w.document.createElement('span')
              pr.className = 'price'
              pr.textContent = `${Number(it.price).toFixed(2)}${currency ? ' ' + currency : ''}`
              row.appendChild(pr)
            }
            cell.appendChild(row)
          } else {
            if (exp) {
              const ex = w.document.createElement('div')
              ex.className = 'expiry'
              ex.textContent = `${t('barcode_studio.exp_label')} ${exp}`
              cell.appendChild(ex)
            }
            if (hasPrice) {
              const pr = w.document.createElement('div')
              pr.className = 'price'
              pr.textContent = `${Number(it.price).toFixed(2)}${currency ? ' ' + currency : ''}`
              cell.appendChild(pr)
            }
          }
          grid.appendChild(cell)
        }
      }

      await waitForImages(w.document)
      w.focus()
      if (openPrinterDialog) {
        // Opens the OS / browser printer picker (choose XP-370B, etc.)
        w.print()
      }
    } finally {
      setBusy(false)
    }
  }

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

        {size === 'thermal' && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-900">
            {t('bulk_barcode.thermal_hint')}
          </div>
        )}

        <div className="px-5 py-3 border-b bg-slate-50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="md:col-span-2">
            <label className="text-slate-600 font-medium">{t('bulk_barcode.size')}</label>
            <select value={size} onChange={e => setSize(e.target.value as LabelSize)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 mt-1 font-medium">
              <option value="thermal">{t('bulk_barcode.size_thermal')}</option>
              <option value="sm">{t('bulk_barcode.size_sm')}</option>
              <option value="md">{t('bulk_barcode.size_md')}</option>
              <option value="lg">{t('bulk_barcode.size_lg')}</option>
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
              onClick={() => openPrintWindow(true)}
              disabled={busy || totalLabels === 0}
              className="px-4 py-2 text-sm rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Printer size={14} /> {t('bulk_barcode.choose_printer', { n: totalLabels })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
