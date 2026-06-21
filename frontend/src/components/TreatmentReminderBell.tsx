import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Bell, CalendarHeart, ShoppingCart, Trash2, X } from 'lucide-react'
import { customerTreatmentsAPI, type CustomerTreatmentPlan } from '../lib/api'
import { useTabLeader } from '../lib/tabLeader'
import { formatDateTime } from '../lib/formatDate'

interface Props {
  onLoad: (plan: CustomerTreatmentPlan) => Promise<string[]>
}

const POLL_MS = 15000
const REPEAT_MS = 60000

function recurrenceLabel(rem: CustomerTreatmentPlan, t: TFunction): string {
  if (rem.recurrence === 'weekly') return t('treatment.repeat_weekly')
  if (rem.recurrence === 'custom') {
    return t('treatment.repeat_custom_days', { days: rem.recurrence_days || 30 })
  }
  return t('treatment.repeat_monthly')
}

export default function TreatmentReminderBell({ onLoad }: Props) {
  const { t } = useTranslation()
  const [count, setCount] = useState(0)
  const [pending, setPending] = useState(0)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<CustomerTreatmentPlan[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const prevPending = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const isPollLeader = useTabLeader('customer-treatments')

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = audioRef.current || new Ctx()
      audioRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ })
      const tone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
        gain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + dur)
      }
      tone(523, 0, 0.25)
      tone(659, 0.28, 0.25)
      tone(784, 0.56, 0.35)
    } catch { /* ignore */ }
  }, [])

  const notify = useCallback((n: number) => {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const note = new Notification(t('treatment.notify_title') as string, {
        body: t('treatment.notify_body', { count: n }) as string,
        tag: 'pharma-treatment',
      })
      note.onclick = () => { window.focus(); note.close() }
    } catch { /* ignore */ }
  }, [t])

  useEffect(() => {
    const unlock = () => {
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => { /* ignore */ })
        }
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        const ctx = audioRef.current || new Ctx()
        audioRef.current = ctx
        if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ })
      } catch { /* ignore */ }
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const refreshCount = useCallback(() => {
    customerTreatmentsAPI.dueCount()
      .then((r) => {
        const active = r.data.count
        const newPending = r.data.new
        if (newPending > prevPending.current) {
          beep()
          if (document.hidden) notify(newPending)
        }
        prevPending.current = newPending
        setPending(newPending)
        setCount(active)
      })
      .catch(() => { /* ignore */ })
  }, [beep, notify])

  useEffect(() => {
    if (!isPollLeader) {
      if (!document.hidden) refreshCount()
      return
    }
    refreshCount()
    const id = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(id)
  }, [refreshCount, isPollLeader])

  useEffect(() => {
    if (!isPollLeader || document.hidden || open || pending <= 0) return
    const id = setInterval(beep, REPEAT_MS)
    return () => clearInterval(id)
  }, [open, pending, beep, isPollLeader])

  const loadList = useCallback(() => {
    setLoadingList(true)
    customerTreatmentsAPI.due()
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoadingList(false))
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) loadList()
  }

  const handleLoad = async (plan: CustomerTreatmentPlan) => {
    setBusy(plan.id)
    try {
      const unmatched = await onLoad(plan)
      await customerTreatmentsAPI.setStatus(plan.id, 'loaded')
      loadList()
      refreshCount()
      if (unmatched.length) {
        alert(`${t('treatment.unmatched_notice')}\n\n• ${unmatched.join('\n• ')}`)
      }
    } catch { /* ignore */ } finally {
      setBusy(null)
    }
  }

  const handleDismiss = async (plan: CustomerTreatmentPlan) => {
    if (!window.confirm(t('treatment.dismiss_confirm') as string)) return
    setBusy(plan.id)
    try {
      await customerTreatmentsAPI.setStatus(plan.id, 'dismissed')
      loadList()
      refreshCount()
    } catch { /* ignore */ } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        title={t('treatment.bell_title') as string}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-pharma-700 transition-colors"
      >
        <Bell size={18} className={count > 0 ? 'animate-pulse text-amber-600' : ''} />
        {count > 0 && (
          <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute end-0 mt-2 w-[min(95vw,560px)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-amber-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <CalendarHeart size={16} className="text-amber-600" /> {t('treatment.bell_title')}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto divide-y divide-slate-100">
              {loadingList && <div className="py-10 text-center text-slate-400 text-sm">{t('common.loading')}</div>}
              {!loadingList && list.length === 0 && (
                <div className="py-10 text-center text-slate-400 text-sm">{t('treatment.due_empty')}</div>
              )}
              {list.map((plan) => (
                <div key={plan.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                  <div className="font-semibold text-slate-800 text-sm truncate">{plan.customer_name}</div>
                  <div className="text-[11px] text-amber-700 font-medium">{plan.next_reminder_date}</div>
                  <div className="text-[10px] text-slate-500">{recurrenceLabel(plan, t)}</div>
                    </div>
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 whitespace-nowrap">
                      {plan.next_reminder_date}
                    </span>
                  </div>
                  {(plan.discount_percent != null && Number(plan.discount_percent) > 0) && (
                    <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 mb-2">
                      {t('treatment.customer_discount', { pct: Number(plan.discount_percent).toFixed(0) })}
                      {plan.discount_notes ? ` — ${plan.discount_notes}` : ''}
                    </div>
                  )}
                  <ul className="bg-slate-50 rounded-lg p-2 space-y-1 mb-2">
                    {plan.items.map((it, idx) => (
                      <li key={it.id ?? idx} className="text-xs text-slate-700">
                        <span className="font-semibold">{it.quantity}×</span> {it.product_name}
                        {it.dose_text ? <span className="text-slate-400"> — {it.dose_text}</span> : null}
                      </li>
                    ))}
                  </ul>
                  {plan.notes ? <div className="text-[11px] text-slate-400 italic mb-2">{plan.notes}</div> : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoad(plan)}
                      disabled={busy === plan.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 text-white text-xs font-semibold rounded-lg py-2 disabled:opacity-50"
                    >
                      <ShoppingCart size={14} /> {busy === plan.id ? t('common.loading') : t('treatment.load_pos')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(plan)}
                      disabled={busy === plan.id}
                      className="inline-flex items-center justify-center gap-1 text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50"
                    >
                      <Trash2 size={14} /> {t('treatment.snooze_month')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
