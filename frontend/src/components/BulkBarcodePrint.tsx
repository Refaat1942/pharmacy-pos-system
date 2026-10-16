import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Printer, Minus, Plus, Eye, Barcode, QrCode, Download, Zap, CloudOff } from 'lucide-react'
import api from '../lib/api'
import { formatExpiryForLabel } from '../lib/barcodeLabel'
import {
  buildConfig,
  expandLabelPrintList,
  labelDims,
  loadLabelPrefs,
  openLabelPrintWindow,
  pageSizeMm,
  saveLabelPrefs,
  type LabelEntry,
  type LabelPrefs,
  type LabelPreset,
  type BarSize,
} from '../lib/labelPrint'
import {
  detectBridge,
  pickLabelPrinter,
  printViaBridge,
  pushCatalog,
  type BridgeStatus,
  type CatalogItem,
  type DirectLabel,
} from '../lib/tsplLabel'

// Per-PC direct-print settings (FPS Print Bridge). Defaults suit Xprinter 38 × 10 rolls.
interface DirectPrefs { printer: string; gapMm: number; shiftXmm: number; shiftYmm: number; rotate180: boolean; density: number }
const DIRECT_KEY = 'fps_direct_print_v1'
const DIRECT_DEFAULTS: DirectPrefs = { printer: '', gapMm: 2, shiftXmm: 0, shiftYmm: 0, rotate180: false, density: 10 }
function loadDirect(): DirectPrefs {
  try { return { ...DIRECT_DEFAULTS, ...JSON.parse(localStorage.getItem(DIRECT_KEY) || '{}') } } catch { return { ...DIRECT_DEFAULTS } }
}

export interface BulkItem {
  id: number
  barcode: string | null
  name: string
  price?: number | null
  expiryDate?: string | null
  defaultQty?: number
}

interface Props {
  items: BulkItem[]
  currency?: string
  /** Kept for callers; the size now comes from the saved choice on this computer. */
  defaultSize?: string
  onClose: () => void
}

function Segmented<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-all ${
            value === o.value ? 'bg-white text-pharma-700 shadow-sm ring-1 ring-pharma-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function BulkBarcodePrint({ items, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const printable = items.filter((i) => i.barcode && i.barcode.trim().length > 0)
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(printable.map((i) => [i.id, i.defaultQty ?? 1])),
  )
  const [prefs, setPrefs] = useState<LabelPrefs>(loadLabelPrefs)
  const [pharmacyName, setPharmacyName] = useState('')
  const [busy, setBusy] = useState(false)
  const [bridge, setBridge] = useState<BridgeStatus | null | 'checking'>('checking')
  const [direct, setDirect] = useState<DirectPrefs>(loadDirect)
  const [showTune, setShowTune] = useState(false)
  const [msg, setMsg] = useState('')
  const setD = <K extends keyof DirectPrefs>(k: K, v: DirectPrefs[K]) => setDirect((d) => ({ ...d, [k]: v }))

  useEffect(() => { try { localStorage.setItem(DIRECT_KEY, JSON.stringify(direct)) } catch { /* ignore */ } }, [direct])
  useEffect(() => {
    let alive = true
    void detectBridge().then((st) => {
      if (!alive) return
      setBridge(st)
      if (st) setDirect((d) => ({ ...d, printer: pickLabelPrinter(st, d.printer) }))
    })
    return () => { alive = false }
  }, [])

  const set = <K extends keyof LabelPrefs>(k: K, v: LabelPrefs[K]) => setPrefs((p) => ({ ...p, [k]: v }))

  useEffect(() => { saveLabelPrefs(prefs) }, [prefs])
  useEffect(() => {
    api.get<{ name_ar?: string; name_en?: string }>('/settings/profile')
      .then((r) => setPharmacyName(((isAr ? r.data.name_ar : r.data.name_en) || r.data.name_en || r.data.name_ar || '').trim()))
      .catch(() => {})
  }, [isAr])

  const dims = labelDims(prefs)
  const tiny = dims.hMm < 9
  const totalLabels = useMemo(() => printable.reduce((s, i) => s + (qty[i.id] || 0), 0), [qty, printable])
  const skipped = items.length - printable.length

  const bump = (id: number, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(500, (q[id] || 0) + d)) }))
  const setQ = (id: number, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(500, isNaN(v) ? 0 : v)) }))

  const print = async (openPrinterDialog: boolean) => {
    if (!totalLabels) return
    setBusy(true)
    try {
      const entries: LabelEntry[] = printable.map((it) => ({
        barcode: it.barcode!, name: it.name, price: it.price, expiryDate: it.expiryDate,
      }))
      const list = expandLabelPrintList(entries, printable.map((it) => qty[it.id] || 0))
      await openLabelPrintWindow(list, buildConfig(prefs, pharmacyName), {
        printToolbar: t('bulk_barcode.print_toolbar_btn') as string,
        popupBlocked: t('bulk_barcode.popup_blocked') as string,
      }, openPrinterDialog)
    } finally {
      setBusy(false)
    }
  }

  // One-click printing through FPS Print Bridge: exact label size + gap are sent to
  // the printer as TSPL, so no Windows paper size / offsets are involved.
  const printDirect = async () => {
    if (!totalLabels || !bridge || bridge === 'checking') return
    setBusy(true)
    setMsg('')
    try {
      const labels: DirectLabel[] = printable.map((it) => ({
        barcode: it.barcode!, name: it.name, price: it.price, expiryDate: it.expiryDate, qty: qty[it.id] || 0,
      }))
      await printViaBridge(direct.printer, labels, {
        ...dims, gapMm: direct.gapMm, code: prefs.code, barSize: prefs.barSize,
        showName: prefs.showName, showPrice: prefs.showPrice, showExpiry: prefs.showExpiry,
        showPharmacy: prefs.showPharmacy, pharmacyName,
        shiftXmm: direct.shiftXmm, shiftYmm: direct.shiftYmm, rotate180: direct.rotate180, density: direct.density,
      })
      setMsg(t('bulk_barcode.direct_sent', { n: totalLabels }) as string)
    } catch (e: any) {
      setMsg(`${t('bulk_barcode.direct_failed')}: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  // Copy the item list into the bridge so labels can be printed with no internet.
  const saveOffline = async () => {
    setBusy(true)
    setMsg(t('bulk_barcode.offline_saving') as string)
    try {
      const all: CatalogItem[] = []
      for (let offset = 0; offset < 200000; offset += 1000) {
        const { data } = await api.get('/inventory/items', { params: { load_all: true, paged: true, offset, limit: 1000 } })
        const page = (data.items || []) as any[]
        page.forEach((p) => p.barcode && all.push({
          barcode: String(p.barcode), name: (isAr ? p.name_ar : p.name_en) || p.name_en || p.name_ar || '',
          price: p.price ?? null, expiry: p.expiry_date ?? null,
        }))
        if (page.length < 1000) break
      }
      await pushCatalog(all, pharmacyName)
      setMsg(t('bulk_barcode.offline_saved', { n: all.length }) as string)
    } catch (e: any) {
      setMsg(`${t('bulk_barcode.direct_failed')}: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const bridgeOk = !!bridge && bridge !== 'checking'

  const sample = printable[0]
  // On-screen preview scale: 1 mm ≈ 5 px.
  const px = (mm: number) => `${mm * 5}px`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">{t('bulk_barcode.title')}</h3>
            <p className="text-[11px] text-slate-500">{t('bulk_barcode.subtitle', { n: printable.length, total: totalLabels })}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 border-b bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div>
              <p className="text-slate-600 font-semibold mb-1.5">{t('bulk_barcode.size')}</p>
              <Segmented<LabelPreset>
                value={prefs.preset}
                onChange={(v) => set('preset', v)}
                options={[
                  { value: '25x5', label: '25 × 5 mm' },
                  { value: '38x10', label: '38 × 10 mm' },
                  { value: '38x12', label: '38 × 12 mm' },
                  { value: 'custom', label: t('bulk_barcode.size_custom') },
                ]}
              />
              {prefs.preset === 'custom' && (
                <div className="flex items-center gap-2 mt-2">
                  <label className="flex items-center gap-1">{t('bulk_barcode.custom_w')}
                    <input type="number" min={10} max={120} value={prefs.customW}
                      onChange={(e) => set('customW', parseFloat(e.target.value) || 38)}
                      className="w-16 border border-slate-300 rounded px-2 py-1" /> mm
                  </label>
                  <label className="flex items-center gap-1">{t('bulk_barcode.custom_h')}
                    <input type="number" min={4} max={100} value={prefs.customH}
                      onChange={(e) => set('customH', parseFloat(e.target.value) || 12)}
                      className="w-16 border border-slate-300 rounded px-2 py-1" /> mm
                  </label>
                </div>
              )}
            </div>
            <div>
              <p className="text-slate-600 font-semibold mb-1.5">{t('bulk_barcode.per_page')}</p>
              <Segmented<1 | 2>
                value={prefs.perPage}
                onChange={(v) => set('perPage', v)}
                options={[
                  { value: 1, label: t('bulk_barcode.per_page_1') },
                  { value: 2, label: t('bulk_barcode.per_page_2') },
                ]}
              />
              {prefs.perPage === 2 && (
                <label className="flex items-center gap-1 mt-2">{t('bulk_barcode.pair_gap')}
                  <input type="number" min={0} max={10} step={0.5} value={prefs.pairGap}
                    onChange={(e) => set('pairGap', Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-16 border border-slate-300 rounded px-2 py-1" /> mm
                </label>
              )}
            </div>
            <div>
              <p className="text-slate-600 font-semibold mb-1.5">{t('bulk_barcode.bar_size')}</p>
              <Segmented<BarSize>
                value={prefs.barSize}
                onChange={(v) => set('barSize', v)}
                options={[
                  { value: 'small', label: t('bulk_barcode.bar_small') },
                  { value: 'medium', label: t('bulk_barcode.bar_medium') },
                  { value: 'large', label: t('bulk_barcode.bar_large') },
                ]}
              />
            </div>
            <div>
              <p className="text-slate-600 font-semibold mb-1.5">{t('bulk_barcode.type')}</p>
              <Segmented<'barcode' | 'qr'>
                value={prefs.code}
                onChange={(v) => set('code', v)}
                options={[
                  { value: 'barcode', label: <><Barcode size={13} /> {t('bulk_barcode.type_barcode')}</> },
                  { value: 'qr', label: <><QrCode size={13} /> {t('bulk_barcode.type_qr')}</> },
                ]}
              />
            </div>
            <div className={`grid grid-cols-2 gap-1.5 ${tiny ? 'opacity-50' : ''}`}>
              {(['showName', 'showPrice', 'showExpiry', 'showPharmacy'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={prefs[k]} disabled={tiny} onChange={(e) => set(k, e.target.checked)} />
                  {t(`bulk_barcode.${k === 'showName' ? 'show_name' : k === 'showPrice' ? 'show_price' : k === 'showExpiry' ? 'show_expiry' : 'show_pharmacy_short'}`)}
                </label>
              ))}
              {tiny && <p className="col-span-2 text-[11px] text-slate-500">{t('bulk_barcode.tiny_hint')}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-slate-600 font-semibold">{t('bulk_barcode.preview_title')}</p>
            <div className="rounded-lg border border-slate-200 bg-white p-3 overflow-x-auto">
              {[0, 1].map((r) => (
                // One block = one gap-to-gap page of the roll; the dashed line between blocks is the gap.
                <div key={r} className="flex flex-col items-center mb-3 last:mb-0 pb-3 last:pb-0 border-b-2 border-dashed border-amber-300 last:border-b-0"
                  style={{ gap: prefs.perPage === 2 ? px(prefs.pairGap) : 0 }}>
                  {Array.from({ length: prefs.perPage }).map((_, c) => (
                    <div key={c} className="border border-slate-400 rounded-sm flex items-center justify-center bg-white overflow-hidden"
                      style={{ width: px(dims.wMm), height: px(dims.hMm), flex: `0 0 ${px(dims.hMm)}` }}>
                      {prefs.code === 'qr'
                        ? <QrCode size={Math.max(12, dims.hMm * 4)} className="text-slate-800" />
                        : <Barcode className="text-slate-800" style={{
                            width: `${{ small: 55, medium: 72, large: 92 }[prefs.barSize]}%`,
                            height: `${{ small: 34, medium: 44, large: 58 }[prefs.barSize]}%`,
                          }} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t('bulk_barcode.windows_hint', pageSizeMm(prefs))}
            </p>
            {sample && (
              <p className="text-[11px] text-slate-400">{t('bulk_barcode.sample', { name: sample.name })}</p>
            )}
          </div>
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
              {printable.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600" dir="ltr">{it.barcode}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">{formatExpiryForLabel(it.expiryDate) || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => bump(it.id, -1)} className="p-1 rounded border border-slate-200 hover:bg-slate-100"><Minus size={12} /></button>
                      <input type="number" min={0} max={500} value={qty[it.id] ?? 0}
                        onChange={(e) => setQ(it.id, parseInt(e.target.value))}
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

        {bridgeOk ? (
          <div className="px-5 py-3 border-t bg-pharma-50 text-xs text-pharma-900 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Zap size={14} className="text-pharma-700" />
              <span className="font-semibold">{t('bulk_barcode.direct_ready')}</span>
              <select value={direct.printer} onChange={(e) => setD('printer', e.target.value)}
                className="border border-pharma-200 rounded px-2 py-1 bg-white">
                {(bridge as BridgeStatus).printers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="button" onClick={() => setShowTune((v) => !v)} className="underline text-pharma-700">
                {t('bulk_barcode.fine_tune')}
              </button>
              <button type="button" onClick={saveOffline} disabled={busy}
                className="ms-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-pharma-300 bg-white hover:bg-pharma-100 disabled:opacity-50">
                <CloudOff size={13} /> {t('bulk_barcode.offline_save')}
              </button>
            </div>
            {showTune && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1">{t('bulk_barcode.gap_mm')}
                  <input type="number" step={0.5} min={0} max={10} value={direct.gapMm} onChange={(e) => setD('gapMm', parseFloat(e.target.value) || 0)} className="w-16 border rounded px-1.5 py-0.5" /></label>
                <label className="flex items-center gap-1">{t('bulk_barcode.move_right')}
                  <input type="number" step={0.5} min={-20} max={40} value={direct.shiftXmm} onChange={(e) => setD('shiftXmm', parseFloat(e.target.value) || 0)} className="w-16 border rounded px-1.5 py-0.5" /></label>
                <label className="flex items-center gap-1">{t('bulk_barcode.move_down')}
                  <input type="number" step={0.5} min={-10} max={10} value={direct.shiftYmm} onChange={(e) => setD('shiftYmm', parseFloat(e.target.value) || 0)} className="w-16 border rounded px-1.5 py-0.5" /></label>
                <label className="flex items-center gap-1">{t('bulk_barcode.darkness')}
                  <input type="number" min={1} max={15} value={direct.density} onChange={(e) => setD('density', parseInt(e.target.value) || 10)} className="w-14 border rounded px-1.5 py-0.5" /></label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={direct.rotate180} onChange={(e) => setD('rotate180', e.target.checked)} /> {t('bulk_barcode.rotate')}</label>
              </div>
            )}
          </div>
        ) : bridge === null ? (
          <div className="px-5 py-3 border-t bg-amber-50 text-xs text-amber-900 flex flex-wrap items-center gap-2">
            <Zap size={14} />
            <span>{t('bulk_barcode.bridge_missing')}</span>
            <a href="/downloads/FPS-Print-Bridge.exe" download
              className="ms-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700">
              <Download size={13} /> {t('bulk_barcode.bridge_download')}
            </a>
          </div>
        ) : null}

        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs">
            {msg && <div className="text-pharma-800 font-semibold">{msg}</div>}
            {skipped > 0 && <div className="text-amber-700">{t('bulk_barcode.skipped', { n: skipped })}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-100">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => print(false)} disabled={busy || !totalLabels}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-medium disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap">
              <Eye size={14} /> {t('bulk_barcode.preview')}
            </button>
            <button type="button" onClick={() => print(true)} disabled={busy || !totalLabels}
              className={bridgeOk
                ? 'px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-medium disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap'
                : 'px-4 py-2 text-sm rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap'}>
              <Printer size={14} /> {bridgeOk ? t('bulk_barcode.windows_print') : t('bulk_barcode.choose_printer', { n: totalLabels })}
            </button>
            {bridgeOk && (
              <button type="button" onClick={printDirect} disabled={busy || !totalLabels}
                className="px-4 py-2 text-sm rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap">
                <Zap size={14} /> {t('bulk_barcode.direct_print', { n: totalLabels })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
