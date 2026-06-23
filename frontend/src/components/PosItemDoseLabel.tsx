import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Printer, Settings2 } from 'lucide-react'
import {
  doseTextForPreset,
  mergeDosePresets,
  type DosePreset,
  type DosePresetCustom,
} from '../lib/dosePresets'
import { openDoseLabelPrintWindow } from '../lib/doseLabelPrintWindow'
import i18n from '../lib/i18n'

interface Props {
  productId: number
  productName: string
  patientName?: string
  defaultQty?: number
  customPresets?: DosePresetCustom[]
  pharmacyName?: string
  showPharmacyOnLabels?: boolean
  onOpenFullEditor: (doseText: string) => void
  onDoseChange?: (doseText: string) => void
  includeOnReceipt?: boolean
  onReceiptToggle?: (include: boolean) => void
}

const QUICK_PRESET_IDS = [
  'once-daily',
  'twice-daily',
  'three-times-daily',
  'after-meals',
  'before-meals',
  'before-bed',
  'as-needed',
] as const

export default function PosItemDoseLabel({
  productId,
  productName,
  patientName = '',
  defaultQty = 1,
  customPresets = [],
  pharmacyName = '',
  showPharmacyOnLabels = true,
  onOpenFullEditor,
  onDoseChange,
  includeOnReceipt = false,
  onReceiptToggle,
}: Props) {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [open, setOpen] = useState(false)
  const [customDose, setCustomDose] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [qty, setQty] = useState(defaultQty)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const allPresets = useMemo(() => mergeDosePresets(customPresets), [customPresets])

  const quickPresets = useMemo(() => {
    const byId = new Map(allPresets.map((p) => [p.id, p]))
    const quick = QUICK_PRESET_IDS.map((id) => byId.get(id)).filter(Boolean) as DosePreset[]
    const rest = allPresets.filter((p) => !QUICK_PRESET_IDS.includes(p.id as typeof QUICK_PRESET_IDS[number]))
    return [...quick, ...rest]
  }, [allPresets])

  const activeDoseText = useMemo(() => {
    if (customDose.trim()) return customDose.trim()
    if (selectedPresetId) {
      const p = allPresets.find((x) => x.id === selectedPresetId)
      if (p) return doseTextForPreset(p, lang)
    }
    return ''
  }, [customDose, selectedPresetId, allPresets, lang])

  useEffect(() => {
    setQty(defaultQty)
  }, [defaultQty, productId])

  // Report the chosen dose text up so it can be saved on the sale line / receipt.
  useEffect(() => {
    onDoseChange?.(activeDoseText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoseText])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const printLabels = (autoPrint: boolean) => {
    if (!activeDoseText) {
      alert(t('dose_labels.dose_required'))
      return
    }
    setBusy(true)
    try {
      openDoseLabelPrintWindow({
        rows: [{
          name: productName,
          doseText: activeDoseText,
          qty: Math.max(1, qty),
          patientName,
        }],
        showPharmacy: showPharmacyOnLabels,
        pharmacyName,
        autoPrint,
        labels: {
          title: t('dose_labels.print_title') as string,
          toolbarTitle: t('dose_labels.print_toolbar_title') as string,
          toolbarBtn: t('dose_labels.print_toolbar_btn') as string,
          toolbarHint: t('dose_labels.print_toolbar_hint') as string,
          doseRequired: t('dose_labels.dose_required') as string,
          popupBlocked: t('dose_labels.popup_blocked') as string,
        },
      })
    } finally {
      setBusy(false)
    }
  }

  const pickPreset = (preset: DosePreset) => {
    setSelectedPresetId(preset.id)
    setCustomDose('')
  }

  return (
    <div className="relative mt-2" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
          open || activeDoseText
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
        }`}
        title={t('dose_labels.pos_btn') as string}
      >
        <Printer size={12} />
        {t('dose_labels.pos_btn')}
        {includeOnReceipt && (
          <span className="bg-white/25 rounded px-1 text-[9px] uppercase tracking-wide">{t('dose_labels.on_receipt_short')}</span>
        )}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {activeDoseText && !open && (
        <p className="mt-1 text-[10px] text-blue-700 font-medium line-clamp-2" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {activeDoseText}
        </p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 start-0 w-[min(100vw-3rem,22rem)] rounded-xl border-2 border-blue-200 bg-white shadow-xl p-3 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {t('dose_labels.presets')}
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {quickPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p)}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                  selectedPresetId === p.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-400'
                }`}
              >
                {doseTextForPreset(p, lang)}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">
              {t('dose_labels.custom_dose')}
            </label>
            <textarea
              value={customDose}
              onChange={(e) => {
                setCustomDose(e.target.value)
                setSelectedPresetId(null)
              }}
              rows={2}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              placeholder={t('dose_labels.custom_ph') as string}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] text-slate-600 flex items-center gap-1">
              {t('dose_labels.col_qty')}
              <input
                type="number"
                min={1}
                max={99}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                className="w-12 text-center border border-slate-200 rounded px-1 py-0.5 text-xs font-bold"
              />
            </label>
            <div className="flex flex-wrap gap-1.5 justify-end">
              <button
                type="button"
                onClick={() => onOpenFullEditor(activeDoseText)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Settings2 size={11} />
                {t('dose_labels.pos_more')}
              </button>
              <button
                type="button"
                disabled={busy || !activeDoseText}
                onClick={() => printLabels(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold disabled:opacity-40"
              >
                <Printer size={11} />
                {t('dose_labels.print')}
              </button>
            </div>
          </div>

          {onReceiptToggle && (
            <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer pt-1 border-t border-slate-100">
              <input
                type="checkbox"
                checked={includeOnReceipt}
                disabled={!activeDoseText}
                onChange={(e) => onReceiptToggle(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
              />
              {t('dose_labels.include_on_receipt')}
            </label>
          )}
        </div>
      )}
    </div>
  )
}
