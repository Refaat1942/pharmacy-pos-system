import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const [profile, setProfile] = useState<{ name_en?: string; name_ar?: string; logo_url?: string } | null>(null)
  const [printOnly, setPrintOnly] = useState<number | null>(null)

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
      } catch (e) {
        console.error(e)
      }
    })()
  }, [isAuthenticated])

  useEffect(() => {
    if (printOnly == null) return
    const run = () => window.print()
    const raf = requestAnimationFrame(() => requestAnimationFrame(run))
    const reset = () => setPrintOnly(null)
    window.addEventListener('afterprint', reset, { once: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('afterprint', reset)
    }
  }, [printOnly])

  const printCard = (id: number) => setPrintOnly(id)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!canManageEmployees(user)) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <HrUnauthorized className="max-w-lg w-full" />
      </div>
    )
  }

  const pharmaName = (i18n.language === 'ar' ? profile?.name_ar : profile?.name_en)
    || profile?.name_en || profile?.name_ar || t('app.brand', 'Pharmacy')

  return (
    <div className={`min-h-screen bg-slate-100 p-6 print:bg-white print:p-0 ${printOnly != null ? 'print-single' : ''}`}>
      <style>{`
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 14px;
        }
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          .cards-grid { display: block !important; }
          .id-card {
            display: block !important;
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
            margin-bottom: 10px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-single .id-card:not(.print-target) { display: none !important; }
          .print-single .id-card.print-target { display: block !important; }
          .card-header {
            background: #059669 !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="no-print max-w-4xl mx-auto mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('hr.print_cards')}</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-4 py-2 rounded-lg text-sm">
          <Printer size={16} /> {t('settings.print_all', 'Print all')}
        </button>
      </div>

      <div className="cards-grid max-w-4xl mx-auto">
        {rows.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }} className="text-center text-slate-400 py-10">{t('hr.no_employees')}</div>
        )}
        {rows.map((e) => {
          const branch = (i18n.language === 'ar' ? e.branch_name_ar : e.branch_name_en) || e.branch_name_en || e.branch_name_ar || ''
          return (
            <IdCard
              key={e.id}
              isPrintTarget={printOnly === e.id}
              name={e.name}
              pharmaName={pharmaName}
              role={e.role || ''}
              branch={branch}
              code={e.clock_code!}
              scanLabel={t('hr.scan_to_clock')}
              onPrint={() => printCard(e.id)}
              printLabel={t('common.print')}
            />
          )
        })}
      </div>
    </div>
  )
}

function IdCard({ name, pharmaName, role, branch, code, scanLabel, isPrintTarget, onPrint, printLabel }: {
  name: string; pharmaName: string; role: string; branch?: string; code: string; scanLabel: string
  isPrintTarget?: boolean; onPrint?: () => void; printLabel?: string
}) {
  return (
    <div className={`id-card relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm ${isPrintTarget ? 'print-target' : ''}`}>
      <button
        onClick={onPrint}
        title={printLabel}
        className="no-print absolute top-1.5 end-1.5 z-10 p-1.5 rounded-lg bg-white/90 border border-slate-200 text-slate-500 hover:text-pharma-600 hover:border-pharma-300 shadow-sm"
      >
        <Printer size={14} />
      </button>
      <div className="card-header bg-pharma-600 text-white px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-center">
        {pharmaName}
      </div>
      <div className="px-4 py-3 flex flex-col items-center text-center">
        <div className="font-bold text-slate-800 text-base leading-tight">{name}</div>
        {role && <div className="text-xs text-slate-500 capitalize">{role}</div>}
        {branch && <div className="text-[11px] text-slate-400 mt-0.5">{branch}</div>}
        <Barcode value={code.replace(/[^A-Za-z0-9]/g, '')} />
        <div className="font-mono text-[12px] text-slate-700 tracking-wide">{code}</div>
        <div className="text-[10px] text-slate-400 mt-0.5">{scanLabel}</div>
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
        format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0,
      })
    } catch {}
  }, [value])
  return <svg ref={ref} className="w-full max-w-[220px] h-16 my-2" />
}
