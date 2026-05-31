import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, X, ShoppingCart, Trash2, User, Stethoscope } from 'lucide-react'
import { prescriptionsAPI, Prescription } from '../lib/api'

interface Props {
  onLoad: (rx: Prescription) => Promise<string[]>
}

const POLL_MS = 15000

export default function PrescriptionBell({ onLoad }: Props) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Prescription[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const prevCount = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = audioRef.current || new Ctx()
      audioRef.current = ctx
      const tone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + dur)
      }
      tone(880, 0, 0.18)
      tone(1175, 0.16, 0.22)
    } catch { /* ignore */ }
  }, [])

  const refreshCount = useCallback(() => {
    prescriptionsAPI.count()
      .then((r) => {
        const c = r.data.count
        if (c > prevCount.current) beep()
        prevCount.current = c
        setCount(c)
      })
      .catch(() => { /* ignore */ })
  }, [beep])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(id)
  }, [refreshCount])

  const loadList = useCallback(() => {
    setLoadingList(true)
    prescriptionsAPI.list('pending')
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoadingList(false))
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) loadList()
  }

  const handleLoad = async (rx: Prescription) => {
    setBusy(rx.id)
    try {
      const unmatched = await onLoad(rx)
      await prescriptionsAPI.setStatus(rx.id, 'loaded')
      setList((l) => l.filter((p) => p.id !== rx.id))
      setCount((c) => Math.max(0, c - 1))
      prevCount.current = Math.max(0, prevCount.current - 1)
      if (unmatched.length) {
        alert(`${t('rx.unmatched_notice')}\n\n• ${unmatched.join('\n• ')}`)
      }
    } catch { /* ignore */ } finally { setBusy(null) }
  }

  const handleDismiss = async (rx: Prescription) => {
    if (!window.confirm(t('rx.dismiss_confirm') as string)) return
    setBusy(rx.id)
    try {
      await prescriptionsAPI.setStatus(rx.id, 'dismissed')
      setList((l) => l.filter((p) => p.id !== rx.id))
      setCount((c) => Math.max(0, c - 1))
      prevCount.current = Math.max(0, prevCount.current - 1)
    } catch { /* ignore */ } finally { setBusy(null) }
  }

  const fmtTime = (s: string) => {
    try { return new Date(s).toLocaleString(isAr ? 'ar' : 'en', { dateStyle: 'short', timeStyle: 'short' }) }
    catch { return s }
  }

  return (
    <div className="relative">
      <button onClick={toggle} title={t('rx.title') as string}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-pharma-700 transition-colors">
        <Bell size={18} className={count > 0 ? 'animate-pulse text-pharma-600' : ''} />
        {count > 0 && (
          <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute end-0 mt-2 w-[min(92vw,420px)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Stethoscope size={16} className="text-pharma-600" /> {t('rx.title')}
              </h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
              {loadingList && <div className="py-10 text-center text-slate-400 text-sm">{t('common.loading')}</div>}
              {!loadingList && list.length === 0 && <div className="py-10 text-center text-slate-400 text-sm">{t('rx.empty')}</div>}
              {list.map((rx) => (
                <div key={rx.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 text-sm truncate">{rx.clinic_name}</div>
                      <div className="text-[11px] text-slate-400">{fmtTime(rx.created_at)}</div>
                    </div>
                    {(rx.branch_name_en || rx.branch_name_ar) && (
                      <span className="text-[10px] font-semibold bg-pharma-50 text-pharma-700 rounded-full px-2 py-0.5 whitespace-nowrap">
                        {isAr ? (rx.branch_name_ar || rx.branch_name_en) : (rx.branch_name_en || rx.branch_name_ar)}
                      </span>
                    )}
                  </div>
                  {(rx.patient_name || rx.doctor_name) && (
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 mb-1.5">
                      {rx.patient_name && <span className="inline-flex items-center gap-1"><User size={11} /> {rx.patient_name}{rx.patient_phone ? ` · ${rx.patient_phone}` : ''}</span>}
                      {rx.doctor_name && <span>{t('rx.doctor')}: {rx.doctor_name}</span>}
                    </div>
                  )}
                  <ul className="bg-slate-50 rounded-lg p-2 space-y-1 mb-2">
                    {rx.items.map((it) => (
                      <li key={it.id} className="text-xs text-slate-700">
                        <span className="font-semibold">{it.quantity}×</span> {it.medicine_name}
                        {it.dose && <span className="text-slate-400"> — {it.dose}</span>}
                        {it.note && <span className="block text-[11px] text-slate-400 ps-4">{it.note}</span>}
                      </li>
                    ))}
                  </ul>
                  {rx.notes && <div className="text-[11px] text-slate-400 italic mb-2">{rx.notes}</div>}
                  <div className="flex gap-2">
                    <button onClick={() => handleLoad(rx)} disabled={busy === rx.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-pharma-600 hover:bg-pharma-700 text-white text-xs font-semibold rounded-lg py-2 disabled:opacity-50">
                      <ShoppingCart size={14} /> {busy === rx.id ? t('common.loading') : t('rx.load')}
                    </button>
                    <button onClick={() => handleDismiss(rx)} disabled={busy === rx.id}
                      className="inline-flex items-center justify-center gap-1 text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50">
                      <Trash2 size={14} /> {t('rx.dismiss')}
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
