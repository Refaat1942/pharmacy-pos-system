import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Calendar, Pill, Plus, ScanLine, Search, Trash2, Pencil, X } from 'lucide-react'
import api from '../lib/api'
import {
  customerTreatmentsAPI,
  type CustomerTreatmentItem,
  type CustomerTreatmentPlan,
  type Product,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { barcodeSearchQueries, matchProductByBarcode } from '../lib/barcodeSearch'
import i18n from '../lib/i18n'
import { formatReminderSchedule, normalizeReminderTime } from '../lib/formatDate'

const DEFAULT_REMINDER_TIME = '09:00'

type TreatmentLine = {
  product_id: number
  product_name: string
  barcode?: string | null
  quantity: number
}

type RecurrenceKind = 'weekly' | 'monthly' | 'custom'

function suggestReminderDate(recurrence: RecurrenceKind, customDays: number): string {
  const d = new Date()
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7)
  else if (recurrence === 'custom') d.setDate(d.getDate() + Math.max(1, customDays))
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function recurrenceLabel(rem: CustomerTreatmentPlan, t: TFunction): string {
  if (rem.recurrence === 'once') return t('treatment.repeat_once')
  if (rem.recurrence === 'weekly') return t('treatment.repeat_weekly')
  if (rem.recurrence === 'custom') {
    return t('treatment.repeat_custom_days', { days: rem.recurrence_days || 30 })
  }
  return t('treatment.repeat_monthly')
}

export default function CustomerTreatmentPlans({ customerId }: { customerId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isAr = i18n.language === 'ar'
  const [reminders, setReminders] = useState<CustomerTreatmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reminderDate, setReminderDate] = useState(() => suggestReminderDate('monthly', 30))
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME)
  const [isRepeating, setIsRepeating] = useState(true)
  const [recurrence, setRecurrence] = useState<RecurrenceKind>('monthly')
  const [customDays, setCustomDays] = useState(30)
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<TreatmentLine[]>([])
  const [searchQ, setSearchQ] = useState('')
  const [scanQ, setScanQ] = useState('')
  const [hits, setHits] = useState<Product[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    customerTreatmentsAPI.listForCustomer(customerId)
      .then((r) => setReminders(r.data))
      .catch(() => setReminders([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [customerId])

  useEffect(() => {
    if (!searchQ.trim()) { setHits([]); return }
    const id = setTimeout(() => {
      api.get<Product[]>('/inventory/items', { params: { q: searchQ.trim() } })
        .then((r) => setHits((r.data || []).slice(0, 10)))
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(id)
  }, [searchQ])

  const resetForm = () => {
    setIsRepeating(true)
    setRecurrence('monthly')
    setCustomDays(30)
    setReminderTime(DEFAULT_REMINDER_TIME)
    setReminderDate(suggestReminderDate('monthly', 30))
    setNote('')
    setLines([])
    setSearchQ('')
    setScanQ('')
    setEditId(null)
    setShowForm(false)
  }

  const addLine = (p: Product, qty = 1) => {
    const name = (isAr ? p.name_ar : p.name_en) || p.name_en || p.name_ar || `#${p.id}`
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id)
      if (existing) {
        return prev.map((l) =>
          l.product_id === p.id ? { ...l, quantity: l.quantity + qty } : l,
        )
      }
      return [...prev, {
        product_id: p.id,
        product_name: name,
        barcode: p.barcode || p.international_barcode,
        quantity: Math.max(1, qty),
      }]
    })
    setSearchQ('')
    setScanQ('')
    setHits([])
    scanRef.current?.focus()
  }

  const handleScan = async (raw: string) => {
    const code = raw.trim()
    if (!code) return
    setScanQ('')
    try {
      for (const q of barcodeSearchQueries(code)) {
        const r = await api.get<Product[]>('/inventory/items', { params: { q } })
        const list = r.data || []
        const hit = matchProductByBarcode(list, code) || list.find((p) =>
          String(p.barcode || '').toLowerCase() === code.toLowerCase()
          || String(p.international_barcode || '').toLowerCase() === code.toLowerCase(),
        ) || (list.length === 1 ? list[0] : undefined)
        if (hit) {
          addLine(hit)
          return
        }
      }
      alert(t('treatment.item_not_found', { code }))
    } catch {
      alert(t('treatment.item_not_found', { code }))
    }
  }

  const toPayloadItems = (): CustomerTreatmentItem[] =>
    lines.map((l) => ({
      product_id: l.product_id,
      product_name: l.product_name,
      quantity: l.quantity,
    }))

  const saveReminder = async () => {
    if (!reminderDate || lines.length === 0) {
      alert(t('treatment.form_incomplete'))
      return
    }
    if (isRepeating && recurrence === 'custom' && (customDays < 1 || customDays > 365)) {
      alert(t('treatment.custom_days_invalid'))
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: t('treatment.default_title') as string,
        next_reminder_date: reminderDate,
        next_reminder_time: reminderTime,
        recurrence: isRepeating ? recurrence : 'once',
        recurrence_days: isRepeating && recurrence === 'custom' ? customDays : null,
        notes: note.trim() || undefined,
        items: toPayloadItems(),
      }
      if (editId) {
        await customerTreatmentsAPI.update(editId, payload)
      } else {
        await customerTreatmentsAPI.create(customerId, payload)
      }
      resetForm()
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (rem: CustomerTreatmentPlan) => {
    if (!isAdmin) return
    setEditId(rem.id)
    setReminderDate(rem.next_reminder_date)
    setReminderTime(normalizeReminderTime(rem.next_reminder_time))
    const once = rem.recurrence === 'once'
    setIsRepeating(!once)
    setRecurrence((rem.recurrence === 'weekly' || rem.recurrence === 'custom' ? rem.recurrence : 'monthly'))
    setCustomDays(rem.recurrence_days || 30)
    setNote(rem.notes || '')
    setLines(rem.items.filter((it) => it.product_id).map((it) => ({
      product_id: it.product_id!,
      product_name: it.product_name,
      quantity: it.quantity,
    })))
    setShowForm(true)
  }

  const removeReminder = async (id: number) => {
    if (!window.confirm(t('treatment.delete_confirm') as string)) return
    setBusy(true)
    try {
      await customerTreatmentsAPI.remove(id)
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/40">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Pill size={15} className="text-amber-700" /> {t('treatment.reminder_title')}
        </h3>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setTimeout(() => scanRef.current?.focus(), 50) }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 px-2 py-1 rounded-lg"
          >
            <Plus size={14} /> {t('treatment.add_reminder')}
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-600 mb-3">{t('treatment.reminder_hint')}</p>

      {showForm && (
        <div className="border border-amber-300 rounded-lg p-3 mb-3 bg-white space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium flex items-center gap-1">
                <Calendar size={13} /> {t('treatment.reminder_date')}
              </label>
              <input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="input mt-1 w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('treatment.reminder_time')}</label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value || DEFAULT_REMINDER_TIME)}
                className="input mt-1 w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('treatment.repeat_mode')}</label>
              <select
                value={isRepeating ? 'repeat' : 'once'}
                onChange={(e) => {
                  const repeating = e.target.value === 'repeat'
                  setIsRepeating(repeating)
                  if (!editId) {
                    setReminderDate(
                      repeating
                        ? suggestReminderDate(recurrence, customDays)
                        : new Date().toISOString().slice(0, 10),
                    )
                  }
                }}
                className="input mt-1 w-full text-sm"
              >
                <option value="once">{t('treatment.repeat_once')}</option>
                <option value="repeat">{t('treatment.repeat_yes')}</option>
              </select>
              {isRepeating && (
                <>
                  <label className="text-xs text-slate-600 font-medium mt-2 block">{t('treatment.repeat_every')}</label>
                  <select
                    value={recurrence}
                    onChange={(e) => {
                      const next = e.target.value as RecurrenceKind
                      setRecurrence(next)
                      if (!editId) setReminderDate(suggestReminderDate(next, customDays))
                    }}
                    className="input mt-1 w-full text-sm"
                  >
                    <option value="weekly">{t('treatment.repeat_weekly')}</option>
                    <option value="monthly">{t('treatment.repeat_monthly')}</option>
                    <option value="custom">{t('treatment.repeat_custom')}</option>
                  </select>
                  {recurrence === 'custom' && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={customDays}
                        onChange={(e) => {
                          const days = Math.max(1, Math.min(365, Number(e.target.value) || 30))
                          setCustomDays(days)
                          if (!editId) setReminderDate(suggestReminderDate('custom', days))
                        }}
                        className="input w-20 text-sm py-1"
                      />
                      <span className="text-xs text-slate-500">{t('treatment.custom_days_label')}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium">{t('treatment.scan_or_search_items')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <div className="relative">
                <ScanLine size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={scanRef}
                  value={scanQ}
                  onChange={(e) => setScanQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleScan(scanQ)
                    }
                  }}
                  placeholder={t('treatment.scan_barcode') as string}
                  className="input w-full ps-9 text-sm font-mono"
                />
              </div>
              <div className="relative">
                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder={t('treatment.search_items') as string}
                  className="input w-full ps-9 text-sm"
                />
              </div>
            </div>
            {hits.length > 0 && (
              <ul className="mt-1 border border-slate-200 rounded-lg bg-white max-h-36 overflow-y-auto">
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addLine(p)}
                      className="w-full text-start px-3 py-2 text-xs hover:bg-amber-50 border-b border-slate-100 last:border-0"
                    >
                      {(isAr ? p.name_ar : p.name_en) || p.name_en}
                      <span className="text-slate-400 font-mono ms-2">{p.barcode || p.international_barcode || p.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-start px-2 py-1.5 font-semibold">#</th>
                    <th className="text-start px-2 py-1.5 font-semibold">{t('treatment.col_item')}</th>
                    <th className="text-start px-2 py-1.5 font-semibold">{t('treatment.col_qty')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.product_id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-slate-800">{line.product_name}</div>
                        {line.barcode && <div className="font-mono text-[10px] text-slate-400">{line.barcode}</div>}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => {
                            const q = Math.max(1, Number(e.target.value) || 1)
                            setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, quantity: q } : row)))
                          }}
                          className="input w-16 py-1 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600 p-1">
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-600 font-medium">{t('common.notes')}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1 w-full text-sm min-h-[44px]" placeholder={t('treatment.note_placeholder') as string} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200">{t('common.cancel')}</button>
            <button type="button" onClick={saveReminder} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50">
              {busy ? t('common.saving') : t('treatment.save_reminder')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">{t('common.loading')}</p>
      ) : reminders.length === 0 ? (
        <p className="text-xs text-slate-500">{t('treatment.no_reminders')}</p>
      ) : (
        <ul className="space-y-2">
          {reminders.map((rem) => (
            <li key={rem.id} className="border border-slate-200 rounded-lg p-2.5 text-sm bg-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-amber-800 inline-flex items-center gap-1">
                    <Calendar size={12} /> {t('treatment.next_on', {
                      date: formatReminderSchedule(rem.next_reminder_date, rem.next_reminder_time),
                    })}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{recurrenceLabel(rem, t)}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => startEdit(rem)} className="p-1 text-slate-400 hover:text-amber-700"><Pencil size={14} /></button>
                    <button type="button" onClick={() => removeReminder(rem.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <table className="w-full text-xs mt-2">
                <tbody>
                  {rem.items.map((it, idx) => (
                    <tr key={it.id ?? idx} className="border-t border-slate-100 first:border-0">
                      <td className="py-1 pe-2 text-slate-400 w-6">{idx + 1}</td>
                      <td className="py-1 font-medium text-slate-700">{it.product_name}</td>
                      <td className="py-1 text-end font-semibold tabular-nums">{it.quantity}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rem.notes ? <p className="text-[11px] text-slate-500 mt-1.5 italic">{rem.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
