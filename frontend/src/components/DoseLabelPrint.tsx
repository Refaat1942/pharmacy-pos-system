import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Printer, Minus, Plus, Eye } from 'lucide-react'
import api from '../lib/api'
import {
  mergeDosePresets,
  doseTextForPreset,
  type DosePresetCustom,
  newCustomPresetId,
} from '../lib/dosePresets'
import { openDoseLabelPrintWindow, type DoseLabelSize } from '../lib/doseLabelPrintWindow'

export interface DoseLabelItem {
  id: number
  name: string
  doseText: string
  defaultQty?: number
  patientName?: string
}

type LabelSize = DoseLabelSize

type PharmacyProfile = {
  name_ar?: string
  name_en?: string
  show_pharmacy_name_on_labels?: boolean
  dose_label_presets?: DosePresetCustom[]
}

interface Props {
  items: DoseLabelItem[]
  onClose: () => void
  defaultSize?: LabelSize
}

export default function DoseLabelPrint({ items, onClose, defaultSize = 'thermal_tall' }: Props) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const lang = isAr ? 'ar' : 'en'

  const [rows, setRows] = useState(() =>
    items.map((it) => ({
      ...it,
      doseText: it.doseText || '',
      qty: it.defaultQty ?? 1,
      patientName: it.patientName || '',
    })),
  )
  const [size, setSize] = useState<LabelSize>(defaultSize)
  const [showPharmacy, setShowPharmacy] = useState(true)
  const [pharmacyName, setPharmacyName] = useState('')
  const [customPresets, setCustomPresets] = useState<DosePresetCustom[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [customDose, setCustomDose] = useState('')
  const [saveCustomToSettings, setSaveCustomToSettings] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<PharmacyProfile>('/settings/profile')
      .then((r) => {
        const p = r.data
        const nm = (isAr ? p.name_ar : p.name_en) || p.name_en || p.name_ar || ''
        setPharmacyName(nm.trim())
        setShowPharmacy(p.show_pharmacy_name_on_labels !== false)
        setCustomPresets(Array.isArray(p.dose_label_presets) ? p.dose_label_presets : [])
      })
      .catch(() => {})
  }, [isAr])

  const allPresets = useMemo(() => mergeDosePresets(customPresets), [customPresets])

  const applyPresetToAll = (presetId: string) => {
    const p = allPresets.find((x) => x.id === presetId)
    if (!p) return
    const text = doseTextForPreset(p, lang)
    setRows((prev) => prev.map((r) => ({ ...r, doseText: text })))
    setSelectedPresetId(presetId)
    setCustomDose('')
  }

  const applyCustomToAll = () => {
    const text = customDose.trim()
    if (!text) return
    setRows((prev) => prev.map((r) => ({ ...r, doseText: text })))
    setSelectedPresetId('')
  }

  const saveNewCustomPreset = async () => {
    const text = customDose.trim()
    if (!text) return
    const entry: DosePresetCustom = {
      id: newCustomPresetId(),
      text_en: isAr ? '' : text,
      text_ar: isAr ? text : '',
    }
    if (!entry.text_en) entry.text_en = text
    if (!entry.text_ar) entry.text_ar = text
    const next = [...customPresets, entry]
    setCustomPresets(next)
    if (saveCustomToSettings) {
      try {
        await api.put('/settings/profile', { dose_label_presets: next })
      } catch {
        alert(t('dose_labels.save_preset_failed'))
      }
    }
    applyCustomToAll()
  }

  const totalLabels = rows.reduce((s, r) => s + (r.qty || 0), 0)

  const openPrint = async (dialog: boolean) => {
    setBusy(true)
    try {
      openDoseLabelPrintWindow({
        rows: rows.map((r) => ({
          name: r.name,
          doseText: r.doseText,
          qty: r.qty,
          patientName: r.patientName,
        })),
        size,
        showPharmacy,
        pharmacyName,
        autoPrint: dialog,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div>
            <h2 className="font-bold text-lg">{t('dose_labels.title')}</h2>
            <p className="text-xs text-white/80">{t('dose_labels.subtitle', { n: items.length, total: totalLabels })}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 text-sm">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">{t('dose_labels.presets')}</p>
            <div className="flex flex-wrap gap-2">
              {allPresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPresetToAll(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selectedPresetId === p.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-400'
                  }`}
                >
                  {doseTextForPreset(p, lang)}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2">
            <label className="text-xs font-bold text-slate-600">{t('dose_labels.custom_dose')}</label>
            <textarea
              value={customDose}
              onChange={(e) => setCustomDose(e.target.value)}
              rows={2}
              dir={isAr ? 'rtl' : 'ltr'}
              placeholder={t('dose_labels.custom_ph') as string}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={applyCustomToAll} disabled={!customDose.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-40">
                {t('dose_labels.apply_custom')}
              </button>
              <button type="button" onClick={() => void saveNewCustomPreset()} disabled={!customDose.trim()}
                className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-800 text-xs font-semibold disabled:opacity-40">
                {t('dose_labels.save_preset')}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={saveCustomToSettings} onChange={(e) => setSaveCustomToSettings(e.target.checked)} />
                {t('dose_labels.save_to_pharmacy')}
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">{t('dose_labels.label_size')}</span>
              <select value={size} onChange={(e) => setSize(e.target.value as LabelSize)} className="border rounded-lg px-2 py-1">
                <option value="thermal_tall">{t('dose_labels.size_tall')}</option>
                <option value="thermal">{t('dose_labels.size_standard')}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showPharmacy} onChange={(e) => setShowPharmacy(e.target.checked)} />
              {t('dose_labels.show_pharmacy')}
            </label>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t('dose_labels.col_product')}</th>
                  <th className="px-3 py-2 text-start">{t('dose_labels.col_dose')}</th>
                  <th className="px-3 py-2 text-start">{t('dose_labels.col_patient')}</th>
                  <th className="px-3 py-2 text-center w-28">{t('dose_labels.col_qty')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800 max-w-[8rem] truncate">{row.name}</td>
                    <td className="px-3 py-2">
                      <input
                        value={row.doseText}
                        onChange={(e) => setRows((prev) => prev.map((r, i) => i === idx ? { ...r, doseText: e.target.value } : r))}
                        className="w-full min-w-[10rem] border border-slate-200 rounded px-2 py-1 text-xs"
                        dir={isAr ? 'rtl' : 'ltr'}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.patientName || ''}
                        onChange={(e) => setRows((prev) => prev.map((r, i) => i === idx ? { ...r, patientName: e.target.value } : r))}
                        placeholder={t('dose_labels.patient_ph') as string}
                        className="w-full min-w-[6rem] border border-slate-200 rounded px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => setRows((p) => p.map((r, i) => i === idx ? { ...r, qty: Math.max(1, r.qty - 1) } : r))}
                          className="p-1 rounded border"><Minus size={12} /></button>
                        <input type="number" min={1} max={99} value={row.qty}
                          onChange={(e) => setRows((p) => p.map((r, i) => i === idx ? { ...r, qty: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) } : r))}
                          className="w-10 text-center border rounded py-1 text-xs" />
                        <button type="button" onClick={() => setRows((p) => p.map((r, i) => i === idx ? { ...r, qty: Math.min(99, r.qty + 1) } : r))}
                          className="p-1 rounded border"><Plus size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">{t('common.close')}</button>
          <button type="button" disabled={busy || totalLabels === 0} onClick={() => void openPrint(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 text-blue-800 text-sm font-semibold disabled:opacity-40">
            <Eye size={16} /> {t('dose_labels.preview')}
          </button>
          <button type="button" disabled={busy || totalLabels === 0} onClick={() => void openPrint(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40">
            <Printer size={16} /> {t('dose_labels.print')}
          </button>
        </div>
      </div>
    </div>
  )
}
