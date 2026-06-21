import { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { useTranslation } from 'react-i18next'
import { X, Printer, Minus, Plus, Eye, RotateCcw } from 'lucide-react'
import { formatExpiryForLabel } from '../lib/barcodeLabel'
import {
  CUSTOM_DEFAULT,
  defaultStyle,
  dimsFor,
  expandLabelPrintList,
  loadLabelPrefs,
  normalizeSize,
  openLabelPrintWindow,
  renderBarcodeDataUrl,
  saveLabelPrefs,
  type LabelEntry,
  type LabelPrefs,
  type LabelPrintConfig,
  type LabelSize,
  type LabelStyle,
} from '../lib/labelPrint'
import {
  ZebraDevice,
  isBrowserPrintAvailable,
  listPrinters,
  getDefaultPrinter,
  sendZpl,
  readLabelSize,
} from '../lib/zebraBrowserPrint'
import { renderLabelCanvas, canvasToZpl } from '../lib/labelZpl'
import { useAuth } from '../lib/auth'

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
  defaultSize?: LabelSize | string
  onClose: () => void
}

type PharmacyProfile = {
  name_ar?: string
  name_en?: string
  show_pharmacy_name_on_labels?: boolean
  label_print_settings?: LabelPrefs | null
}

export default function BulkBarcodePrint({ items, currency, defaultSize = 'custom', onClose }: Props) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
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
  
  const [layout, setLayout] = useState<'page' | 'grid' | 'paired'>(savedPrefs.layout ?? 'paired')
  const [columns, setColumns] = useState<number>(savedPrefs.columns ?? 1)
  const [rowGap, setRowGap] = useState<number>(savedPrefs.rowGap ?? 0)
  const [colGap, setColGap] = useState<number>(savedPrefs.colGap ?? 0)
  const [groupSize, setGroupSize] = useState<number>(savedPrefs.groupSize ?? 0)
  const [groupGap, setGroupGap] = useState<number>(savedPrefs.groupGap ?? 0)
  
  const gridOpts = useMemo(
    () => ({ layout, columns, rowGap, colGap, groupSize, groupGap }),
    [layout, columns, rowGap, colGap, groupSize, groupGap],
  )

  const dims = useMemo(() => dimsFor(size, customW, customH), [size, customW, customH])
  const effectiveStyle = useMemo<LabelStyle>(
    () => ({ ...defaultStyle(dims), ...overrides }),
    [dims, overrides],
  )

  const [zebraReady, setZebraReady] = useState(false)
  const [zebraDevices, setZebraDevices] = useState<ZebraDevice[]>([])
  const [zebraDevice, setZebraDevice] = useState<ZebraDevice | null>(null)
  const [zebraDirect, setZebraDirect] = useState(true)
  const [zebraDpi, setZebraDpi] = useState(203)
  const [zebraSizeNote, setZebraSizeNote] = useState('')

  useEffect(() => {
    saveLabelPrefs({ size, useQR, showName, showPrice, showExpiry, customW, customH, overrides, layout, columns, rowGap, colGap, groupSize, groupGap })
  }, [size, useQR, showName, showPrice, showExpiry, customW, customH, overrides, layout, columns, rowGap, colGap, groupSize, groupGap])

  const [savingShared, setSavingShared] = useState(false)

  const applyPrefs = (p?: LabelPrefs | null) => {
    if (!p || typeof p !== 'object') return
    if (p.size) setSize(normalizeSize(p.size))
    if (typeof p.useQR === 'boolean') setUseQR(p.useQR)
    if (typeof p.showName === 'boolean') setShowName(p.showName)
    if (typeof p.showPrice === 'boolean') setShowPrice(p.showPrice)
    if (typeof p.showExpiry === 'boolean') setShowExpiry(p.showExpiry)
    if (typeof p.customW === 'number') setCustomW(p.customW)
    if (typeof p.customH === 'number') setCustomH(p.customH)
    if (p.overrides && typeof p.overrides === 'object') setOverrides(p.overrides)
    if (p.layout === 'page' || p.layout === 'grid' || p.layout === 'paired') setLayout(p.layout)
    if (typeof p.columns === 'number') setColumns(p.columns)
    if (typeof p.rowGap === 'number') setRowGap(p.rowGap)
    if (typeof p.colGap === 'number') setColGap(p.colGap)
    if (typeof p.groupSize === 'number') setGroupSize(p.groupSize)
    if (typeof p.groupGap === 'number') setGroupGap(p.groupGap)
  }

  useEffect(() => {
    api.get<PharmacyProfile>('/settings/profile')
      .then((r) => {
        const p = r.data
        const nm = (isAr ? p.name_ar : p.name_en) || p.name_en || p.name_ar || ''
        setPharmacyName(nm.trim())
        setShowPharmacy(p.show_pharmacy_name_on_labels !== false)
        if (p.label_print_settings && Object.keys(p.label_print_settings).length) {
          applyPrefs(p.label_print_settings)
        }
      })
      .catch(() => {})
  }, [isAr])

  const saveForAllTerminals = async () => {
    setSavingShared(true)
    try {
      const prefs: LabelPrefs = {
        size, useQR, showName, showPrice, showExpiry,
        customW, customH, overrides, layout, columns, rowGap, colGap, groupSize, groupGap,
      }
      await api.put('/settings/profile', { label_print_settings: prefs })
      alert(t('bulk_barcode.saved_for_all'))
    } catch (e: any) {
      alert(e?.response?.data?.detail || (t('common.error') as string))
    } finally {
      setSavingShared(false)
    }
  }

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

  const openPrintWindow = async (openPrinterDialog: boolean) => {
    if (totalLabels === 0) return
    setBusy(true)
    try {
      const config: LabelPrintConfig = {
        dims,
        style: effectiveStyle,
        gridOpts,
        useQR,
        showName,
        showPrice,
        showExpiry,
        showPharmacy,
        pharmacyName,
      }
      const entries: LabelEntry[] = []
      const qtyList: number[] = []
      for (const it of printable) {
        entries.push({
          barcode: it.barcode!,
          name: it.name,
          price: it.price,
          expiryDate: it.expiryDate,
        })
        qtyList.push(qty[it.id] || 0)
      }
      const printList = expandLabelPrintList(entries, qtyList, gridOpts)
      await openLabelPrintWindow(
        printList,
        config,
        {
          printToolbar: t('bulk_barcode.print_toolbar_btn') as string,
          popupBlocked: t('bulk_barcode.popup_blocked') as string,
        },
        openPrinterDialog,
      )
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
      const barStyle: LabelStyle = {
        ...style,
        barcodeScaleMm: 3,
        barcodeHeightMm: Math.max(40, Math.round(hIn * zebraDpi * 0.38)),
        fontSizeMm: Math.max(10, Math.round(hIn * zebraDpi * 0.05)),
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
              {t('bulk_barcode.custom_w')} (mm)
              <input type="number" min={5} max={200} step={1} value={customW}
                onChange={(e) => setCustomW(parseInt(e.target.value, 10) || CUSTOM_DEFAULT.wMm)}
                className="w-20 border border-emerald-300 rounded px-2 py-1 text-emerald-900" />
            </label>
            <label className="flex items-center gap-1.5 font-medium">
              {t('bulk_barcode.custom_h')} (mm)
              <input type="number" min={5} max={200} step={1} value={customH}
                onChange={(e) => setCustomH(parseInt(e.target.value, 10) || CUSTOM_DEFAULT.hMm)}
                className="w-20 border border-emerald-300 rounded px-2 py-1 text-emerald-900" />
            </label>
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
                <span className="text-slate-500">{t('bulk_barcode.bc_height')} (mm)</span>
                <input type="number" min={2} max={50} step={0.5} value={effectiveStyle.barcodeHeightMm}
                  onChange={e => setOverride('barcodeHeightMm', parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_width')} (mm)</span>
                <input type="number" min={0.1} max={5} step={0.1} value={effectiveStyle.barcodeScaleMm}
                  onChange={e => setOverride('barcodeScaleMm', parseFloat(e.target.value) || 0.5)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_font')} (mm)</span>
                <input type="number" min={1} max={20} step={0.5} value={effectiveStyle.fontSizeMm}
                  onChange={e => setOverride('fontSizeMm', parseFloat(e.target.value) || 2)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_padding')} (mm)</span>
                <input type="number" min={0} max={10} step={0.5} value={effectiveStyle.paddingMm}
                  onChange={e => setOverride('paddingMm', parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_offset')} (mm)</span>
                <input type="number" min={-15} max={15} step={0.5} value={effectiveStyle.offsetYMm}
                  onChange={e => setOverride('offsetYMm', parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">{t('bulk_barcode.bc_offset_x')} (mm)</span>
                <input type="number" min={-20} max={20} step={0.5} value={effectiveStyle.offsetXMm}
                  onChange={e => setOverride('offsetXMm', parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded px-2 py-1" />
              </label>
              
              {/* الحقل الجديد الخاص بالتحكم في إزاحة اسم الصنف والسعر */}
              <label className="flex flex-col gap-1">
                <span className="text-slate-500 font-bold text-pharma-700">Top Offset (mm)</span>
                <input type="number" min={-10} max={10} step={0.1} value={effectiveStyle.topRowOffsetMm}
                  onChange={e => setOverride('topRowOffsetMm', parseFloat(e.target.value) || 0)}
                  className="border border-pharma-300 bg-pharma-50 rounded px-2 py-1 text-pharma-900" />
              </label>

              <button type="button" onClick={resetStyle}
                className="col-span-2 md:col-span-4 inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 w-fit">
                <RotateCcw size={12} /> {t('bulk_barcode.bc_reset')}
              </button>
              <div className="col-span-2 md:col-span-4 border-t border-slate-200 pt-2 mt-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">{t('bulk_barcode.layout')}</span>
                  <select value={layout} onChange={e => setLayout(e.target.value as 'page' | 'grid' | 'paired')}
                    className="border border-slate-300 rounded px-2 py-1 font-bold text-emerald-700">
                    <option value="paired">2-in-1 Roll (38x25mm)</option>
                    <option value="page">One label per page</option>
                    <option value="grid">Grid / Sheet</option>
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
                      <span className="text-slate-500">{t('bulk_barcode.row_gap')} (mm)</span>
                      <input type="number" min={0} max={20} step={0.5} value={rowGap}
                        onChange={e => setRowGap(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="border border-slate-300 rounded px-2 py-1" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-500">{t('bulk_barcode.col_gap')} (mm)</span>
                      <input type="number" min={0} max={20} step={0.5} value={colGap}
                        onChange={e => setColGap(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="border border-slate-300 rounded px-2 py-1" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-500">{t('bulk_barcode.group_gap')} (mm)</span>
                      <input type="number" min={0} max={20} step={0.5} value={groupGap}
                        onChange={e => setGroupGap(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="border border-slate-300 rounded px-2 py-1" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-500">{t('bulk_barcode.group_size')}</span>
                      <input type="number" min={0} max={10} value={groupSize}
                        onChange={e => setGroupSize(Math.max(0, parseInt(e.target.value, 10) || 0))}
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
          <div className="text-xs text-slate-600 flex items-center gap-3">
            {skipped > 0 && <span className="text-amber-700">{t('bulk_barcode.skipped', { n: skipped })}</span>}
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={saveForAllTerminals}
                disabled={savingShared}
                className="text-pharma-700 hover:text-pharma-900 underline disabled:opacity-50"
              >
                {savingShared ? t('common.loading') : t('bulk_barcode.save_for_all')}
              </button>
            )}
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