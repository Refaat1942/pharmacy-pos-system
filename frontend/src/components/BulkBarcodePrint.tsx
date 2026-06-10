import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Printer, Minus, Plus } from 'lucide-react'
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

const SIZE_CSS: Record<LabelSize, { cols: number; cellPad: string; nameFs: string; priceFs: string; expiryFs: string; imgMaxW: string; scale: number; height: number }> = {
  sm: { cols: 5, cellPad: '2mm', nameFs: '8px', priceFs: '8px', expiryFs: '7px', imgMaxW: '36mm', scale: 1.5, height: 40 },
  md: { cols: 3, cellPad: '4mm', nameFs: '10px', priceFs: '10px', expiryFs: '9px', imgMaxW: '58mm', scale: 2, height: 60 },
  lg: { cols: 2, cellPad: '5mm', nameFs: '12px', priceFs: '13px', expiryFs: '11px', imgMaxW: '90mm', scale: 2.5, height: 80 },
  thermal: { cols: 1, cellPad: '2mm', nameFs: '11px', priceFs: '11px', expiryFs: '10px', imgMaxW: '38mm', scale: 2.2, height: 55 },
}

function detectType(v: string): 'EAN13' | 'EAN8' | 'UPC' | 'ITF14' | 'CODE128' {
  const s = v.trim()
  if (/^\d{13}$/.test(s)) return 'EAN13'
  if (/^\d{8}$/.test(s)) return 'EAN8'
  if (/^\d{12}$/.test(s)) return 'UPC'
  if (/^\d{14}$/.test(s)) return 'ITF14'
  return 'CODE128'
}

async function renderBarcodeDataUrl(value: string, useQR: boolean, scale: number, height: number): Promise<string | null> {
  try {
    if (useQR) {
      return await QRCode.toDataURL(value, { margin: 1, scale: Math.max(3, scale + 2), errorCorrectionLevel: 'M' })
    }
    const c = document.createElement('canvas')
    JsBarcode(c, value, {
      format: detectType(value),
      displayValue: true,
      width: scale,
      height,
      margin: 2,
      font: 'Arial, sans-serif',
      fontSize: 13,
      lineColor: '#000000',
      background: '#ffffff',
    })
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

interface Props {
  items: BulkItem[]
  currency?: string
  defaultSize?: LabelSize
  onClose: () => void
}

export default function BulkBarcodePrint({ items, currency, defaultSize = 'md', onClose }: Props) {
  const { t } = useTranslation()
  const printable = items.filter(i => i.barcode && i.barcode.trim().length > 0)
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(printable.map((i) => [i.id, i.defaultQty ?? 1])),
  )
  const [size, setSize] = useState<LabelSize>(defaultSize)
  const [useQR, setUseQR] = useState(false)
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [showExpiry, setShowExpiry] = useState(true)
  const [busy, setBusy] = useState(false)

  const totalLabels = useMemo(() => printable.reduce((s, i) => s + (qty[i.id] || 0), 0), [qty, printable])
  const skipped = items.length - printable.length

  const bump = (id: number, delta: number) =>
    setQty(q => ({ ...q, [id]: Math.max(0, Math.min(500, (q[id] || 0) + delta)) }))

  const setQ = (id: number, v: number) =>
    setQty(q => ({ ...q, [id]: Math.max(0, Math.min(500, isNaN(v) ? 0 : v)) }))

  const print = async () => {
    if (totalLabels === 0) return
    setBusy(true)
    try {
      const cfg = SIZE_CSS[size]
      const scale = cfg.scale
      const height = cfg.height

      const w = window.open('', 'PRINT_BULK')
      if (!w) return
      w.document.title = `Barcodes (${totalLabels})`
      const style = w.document.createElement('style')
      style.textContent = `
        @page{margin:3mm}
        body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#000}
        .grid{display:grid;grid-template-columns:repeat(${cfg.cols},1fr);gap:2mm}
        .cell{border:1px solid #000;padding:${cfg.cellPad};text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center}
        .name{font-size:${cfg.nameFs};margin-bottom:2px;font-weight:700;line-height:1.15;max-height:2.5em;overflow:hidden;color:#000}
        .expiry{font-size:${cfg.expiryFs};font-weight:700;color:#000;margin-bottom:2px}
        .price{font-size:${cfg.priceFs};margin-top:2px;font-weight:700;color:#000}
        img{max-width:${cfg.imgMaxW};height:auto}
        @media print{ .cell{border-color:transparent} @page{margin:5mm} }
      `
      w.document.head.appendChild(style)

      const grid = w.document.createElement('div')
      grid.className = 'grid'
      w.document.body.appendChild(grid)

      for (const it of printable) {
        const n = qty[it.id] || 0
        if (n <= 0) continue
        const url = await renderBarcodeDataUrl(it.barcode!, useQR, scale, height)
        if (!url) continue
        for (let i = 0; i < n; i++) {
          const cell = w.document.createElement('div')
          cell.className = 'cell'
          if (showName) {
            const nm = w.document.createElement('div')
            nm.className = 'name'
            nm.textContent = it.name
            cell.appendChild(nm)
          }
          const exp = showExpiry ? formatExpiryForLabel(it.expiryDate) : null
          if (exp) {
            const ex = w.document.createElement('div')
            ex.className = 'expiry'
            ex.textContent = `${t('barcode_studio.exp_label')} ${exp}`
            cell.appendChild(ex)
          }
          const img = w.document.createElement('img')
          img.src = url
          cell.appendChild(img)
          if (showPrice && it.price != null) {
            const pr = w.document.createElement('div')
            pr.className = 'price'
            pr.textContent = `${Number(it.price).toFixed(2)}${currency ? ' ' + currency : ''}`
            cell.appendChild(pr)
          }
          grid.appendChild(cell)
        }
      }

      const script = w.document.createElement('script')
      script.textContent = 'window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close()},600)},150)}'
      w.document.body.appendChild(script)
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

        <div className="px-5 py-3 border-b bg-slate-50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-slate-600 font-medium">{t('bulk_barcode.size')}</label>
            <select value={size} onChange={e => setSize(e.target.value as LabelSize)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 mt-1">
              <option value="sm">{t('bulk_barcode.size_sm')}</option>
              <option value="md">{t('bulk_barcode.size_md')}</option>
              <option value="lg">{t('bulk_barcode.size_lg')}</option>
              <option value="thermal">{t('bulk_barcode.size_thermal')}</option>
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
            <button onClick={print} disabled={busy || totalLabels === 0}
              className="px-4 py-2 text-sm rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium disabled:opacity-50 inline-flex items-center gap-1">
              <Printer size={14} /> {t('bulk_barcode.print', { n: totalLabels })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
