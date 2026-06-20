import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { Printer } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { canManageEmployees } from '../lib/hrAccess'
import HrUnauthorized from '../components/HrUnauthorized'
import { Navigate } from 'react-router-dom'

type Employee = {
  id: number; name: string; role: string | null
  clock_code: string | null; active: boolean
  branch_name_en?: string; branch_name_ar?: string
}

export default function EmployeeCards() {
  const { t, i18n } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [rows, setRows] = useState<Employee[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<{ name_en?: string; name_ar?: string; logo_url?: string } | null>(null)
  const printed = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return
    (async () => {
      try {
        const [{ data }, prof] = await Promise.all([
          api.get('/hr/employees', { params: { active_only: true } }),
          api.get('/settings/profile').catch(() => ({ data: null })),
        ])
        const list = (data as Employee[]).filter((e) => e.clock_code)
        setRows(list)
        setProfile(prof.data)
        const map: Record<string, string> = {}
        for (const e of list) {
          if (!e.clock_code) continue
          map[e.clock_code] = await QRCode.toDataURL(e.clock_code, {
            width: 220, margin: 1, errorCorrectionLevel: 'M',
          })
        }
        setQrs(map)
      } catch (e) {
        console.error(e)
      }
    })()
  }, [isAuthenticated])

  const ready = rows.length > 0 && Object.keys(qrs).length === rows.length
  useEffect(() => {
    if (ready && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [ready])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!canManageEmployees(user)) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <HrUnauthorized className="max-w-lg w-full" />
      </div>
    )
  }

  const pharmaName = (i18n.language === 'ar' ? profile?.name_ar : profile?.name_en) || 'Fratelanza'

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
          .card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print max-w-5xl mx-auto mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('hr.print_cards')}</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-4 py-2 rounded-lg text-sm">
          <Printer size={16} /> {t('common.print')}
        </button>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4 print:gap-3">
        {rows.length === 0 && (
          <div className="col-span-3 text-center text-slate-400 py-10">{t('hr.no_employees')}</div>
        )}
        {rows.map((e) => (
          <div key={e.id} className="card bg-white border-2 border-slate-300 rounded-xl p-4 flex flex-col items-center text-center shadow-sm">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">{pharmaName}</div>
            <div className="mt-2 font-bold text-slate-800 text-base leading-tight">{e.name}</div>
            {e.role && <div className="text-xs text-slate-500 capitalize">{e.role}</div>}
            <div className="my-3">
              {qrs[e.clock_code!] ? (
                <img src={qrs[e.clock_code!]} alt={e.clock_code!} className="w-40 h-40" />
              ) : (
                <div className="w-40 h-40 bg-slate-100 animate-pulse rounded" />
              )}
            </div>
            <Barcode value={e.clock_code!.replace(/[^A-Za-z0-9]/g, '')} />
            <div className="font-mono text-[11px] text-slate-700 break-all mt-1">{e.clock_code}</div>
            <div className="text-[10px] text-slate-400 mt-1">{t('hr.scan_to_clock')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128', width: 1.8, height: 56, displayValue: false, margin: 0,
      })
    } catch {}
  }, [value])
  return <svg ref={ref} className="w-48 h-16" />
}
