import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScanLine, UserCircle2, X } from 'lucide-react'
import type { Employee } from '../lib/api'
import { employeesAPI } from '../lib/api'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

interface Props {
  employees: Employee[]
  selectedSeller: Employee | null
  onSellerChange: (seller: Employee | null) => void
  onEmployeesChange?: (employees: Employee[]) => void
  autoFocusScan?: boolean
  compact?: boolean
}

export default function SellerPicker({
  employees,
  selectedSeller,
  onSellerChange,
  onEmployeesChange,
  autoFocusScan = false,
  compact = false,
}: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanCode, setScanCode] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const applyScan = useCallback(async () => {
    const code = scanCode.trim()
    if (!code) return
    try {
      const { data } = await employeesAPI.lookupByCode(code)
      onSellerChange(data)
      if (onEmployeesChange && !employees.some((e) => e.id === data.id)) {
        onEmployeesChange([...employees, data])
      }
      setScanCode('')
      setFeedback({ type: 'ok', text: t('pos.seller_scan_ok') as string })
      scanRef.current?.focus()
      window.setTimeout(() => setFeedback(null), 2500)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setFeedback({
        type: 'err',
        text: typeof detail === 'string' ? detail : (t('pos.seller_scan_fail') as string),
      })
      scanRef.current?.select()
    }
  }, [scanCode, employees, onSellerChange, onEmployeesChange, t])

  const selectSelf = useCallback(() => {
    if (!user) return
    const me = employees.find((e) => e.id === user.id)
    if (me) {
      onSellerChange(me)
      setFeedback({ type: 'ok', text: t('pos.seller_scan_ok') as string })
      window.setTimeout(() => setFeedback(null), 2000)
    }
  }, [user, employees, onSellerChange, t])

  const sellerName = selectedSeller
    ? (lang === 'ar' ? selectedSeller.name_ar : selectedSeller.name_en) || selectedSeller.name_en
    : null

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
        <UserCircle2 size={13} className={selectedSeller ? 'text-emerald-600' : 'text-red-500'} />
        {t('pos.seller')}
      </label>
      <div className="flex items-center gap-2">
        <select
          value={selectedSeller?.id ?? ''}
          onChange={(e) => {
            const emp = employees.find((em) => em.id === parseInt(e.target.value, 10))
            onSellerChange(emp || null)
            setFeedback(null)
          }}
          className={`flex-1 min-w-0 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pharma-100 transition-colors ${
            selectedSeller
              ? 'border border-slate-200 bg-slate-50 text-slate-800 focus:border-pharma-400 font-semibold'
              : 'border-2 border-red-300 bg-red-50 text-red-800 font-bold focus:border-red-400 animate-pulse-soft'
          }`}
        >
          <option value="">{t('pos.select_seller')}</option>
          {employees.map((e) => {
            const display = lang === 'ar'
              ? (e.name_ar || e.name_en || `#${e.id}`)
              : (e.name_en || e.name_ar || `#${e.id}`)
            return (
              <option key={e.id} value={e.id}>{display}</option>
            )
          })}
        </select>
        {user && employees.some((e) => e.id === user.id) && (
          <button
            type="button"
            onClick={selectSelf}
            className="flex-shrink-0 text-xs font-semibold px-2.5 py-2.5 rounded-xl border border-pharma-200 bg-pharma-50 text-pharma-700 hover:bg-pharma-100 transition-all hover:scale-[1.02] active:scale-95"
            title={t('pos.seller_me') as string}
          >
            {t('pos.seller_me')}
          </button>
        )}
        {selectedSeller && (
          <button
            type="button"
            onClick={() => { onSellerChange(null); setFeedback(null) }}
            className="flex-shrink-0 text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
            title={t('pos.clear_seller') as string}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-500">{t('pos.scan_seller_or')}</p>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <ScanLine size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={scanRef}
            type="text"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void applyScan() }}
            placeholder={t('pos.scan_seller_placeholder') as string}
            autoFocus={autoFocusScan && !selectedSeller}
            className="w-full text-sm border border-slate-200 rounded-xl ps-9 pe-3 py-2.5 bg-white focus:border-pharma-400 focus:ring-2 focus:ring-pharma-100 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void applyScan()}
          disabled={!scanCode.trim()}
          className="flex-shrink-0 text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-all active:scale-95"
        >
          {t('pos.scan_seller_apply')}
        </button>
      </div>
      {sellerName && !compact && (
        <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
          {t('payment.salesperson')}: {sellerName}
        </p>
      )}
      {feedback && (
        <p className={`text-xs ${feedback.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`} role="status">
          {feedback.text}
        </p>
      )}
    </div>
  )
}
