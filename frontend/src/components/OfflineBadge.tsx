import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff, CloudUpload, AlertTriangle, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import {
  flushQueue,
  listQueuedSales,
  onOfflineStatus,
  retryFailed,
  syncOfflinePack,
  type OfflineStatus,
} from '../lib/offline'

/** Top-bar status: online/offline, sales waiting to upload, offline data freshness. */
export default function OfflineBadge() {
  const { t, i18n } = useTranslation()
  const [st, setSt] = useState<OfflineStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState<{ number: string; error?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => onOfflineStatus(setSt), [])
  useEffect(() => {
    if (!open) return
    void listQueuedSales().then((q) => setFailed(q.filter((s) => s.error)))
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, st])

  if (!st) return null
  const tone = !st.online
    ? 'bg-amber-50 text-amber-800 border-amber-300'
    : st.failed
      ? 'bg-red-50 text-red-700 border-red-200'
      : st.pending
        ? 'bg-sky-50 text-sky-800 border-sky-200'
        : 'bg-pharma-50 text-pharma-700 border-pharma-200'

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 border px-2.5 py-1.5 rounded-lg text-xs font-semibold ${tone}`}
        title={t('offline.title') as string}
      >
        {st.online ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span className="hidden md:inline">{st.online ? t('offline.online') : t('offline.offline')}</span>
        {st.pending > 0 && (
          <span className="inline-flex items-center gap-0.5"><CloudUpload size={13} />{st.pending}</span>
        )}
        {st.failed > 0 && (
          <span className="inline-flex items-center gap-0.5"><AlertTriangle size={13} />{st.failed}</span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4 text-xs space-y-3">
          <p className="font-bold text-slate-800 text-sm">
            {st.online ? t('offline.online_long') : t('offline.offline_long')}
          </p>
          <div className="flex items-center justify-between">
            <span>{t('offline.pending', { n: st.pending })}</span>
            <button type="button" disabled={busy || !st.pending} onClick={() => run(() => flushQueue(api))}
              className="px-2.5 py-1 rounded-md bg-pharma-600 text-white font-semibold disabled:opacity-40">
              {t('offline.sync_now')}
            </button>
          </div>
          {failed.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 space-y-1">
              <p className="font-semibold text-red-700">{t('offline.failed', { n: failed.length })}</p>
              {failed.slice(0, 5).map((f) => (
                <p key={f.number} className="text-red-700"><span className="font-mono">{f.number}</span> — {f.error}</p>
              ))}
              <button type="button" disabled={busy} onClick={() => run(() => retryFailed(api))}
                className="mt-1 px-2.5 py-1 rounded-md border border-red-300 bg-white text-red-700 font-semibold">
                {t('offline.retry')}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-slate-600">
              {st.packCount
                ? t('offline.pack', {
                    n: st.packCount.toLocaleString(),
                    at: st.packAt ? new Date(st.packAt).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB') : '—',
                  })
                : t('offline.no_pack')}
            </span>
            <button type="button" disabled={busy || !st.online} onClick={() => run(() => syncOfflinePack(api))}
              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40" title={t('offline.refresh') as string}>
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">{t('offline.help')}</p>
        </div>
      )}
    </div>
  )
}
