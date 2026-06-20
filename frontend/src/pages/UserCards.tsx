import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import JsBarcode from 'jsbarcode'
import { Printer } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { Navigate } from 'react-router-dom'
import i18n from '../lib/i18n'

type UserRow = {
  id: number
  username: string
  name_en: string
  name_ar: string
  role: string
  card_code: string | null
  status: string
  branch_name_en?: string | null
  branch_name_ar?: string | null
}

export default function UserCards() {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [rows, setRows] = useState<UserRow[]>([])
  const [profile, setProfile] = useState<{ name_en?: string; name_ar?: string } | null>(null)
  const [printOnly, setPrintOnly] = useState<number | null>(null)
  const printed = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return
    (async () => {
      try {
        const [{ data }, prof] = await Promise.all([
          api.get('/settings/users'),
          api.get('/settings/profile').catch(() => ({ data: null })),
        ])
        const list = (data as UserRow[]).filter((u) => u.card_code && u.status === 'active')
        setRows(list)
        setProfile(prof.data)
      } catch (e) {
        console.error(e)
      }
    })()
  }, [isAuthenticated])

  useEffect(() => {
    if (rows.length > 0 && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [rows])

  const printCard = (id: number) => {
    setPrintOnly(id)
    setTimeout(() => {
      window.print()
      setTimeout(() => setPrintOnly(null), 200)
    }, 60)
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') {
    return <div className="p-10 text-center text-slate-500">{t('settings.admin_only')}</div>
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
          .cards-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .id-card { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
          .print-single .id-card.print-target { }
          .print-single .id-card:not(.print-target) { display: none !important; }
        }
      `}</style>

      <div className="no-print max-w-4xl mx-auto mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('settings.login_cards')}</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-4 py-2 rounded-lg text-sm">
          <Printer size={16} /> {t('settings.print_all', 'Print all')}
        </button>
      </div>

      <div className="cards-grid max-w-4xl mx-auto">
        {rows.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }} className="text-center text-slate-400 py-10">{t('settings.no_cards')}</div>
        )}
        {rows.map((u) => {
          const name = (i18n.language === 'ar' ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.username
          const branch = (i18n.language === 'ar' ? u.branch_name_ar : u.branch_name_en) || u.branch_name_en || u.branch_name_ar || ''
          return (
            <IdCard
              key={u.id}
              isPrintTarget={printOnly === u.id}
              name={name}
              pharmaName={pharmaName}
              role={t(`settings.role_${u.role}`, u.role)}
              branch={branch}
              code={u.card_code!}
              scanLabel={t('settings.scan_to_unlock')}
              onPrint={() => printCard(u.id)}
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
      <div className="bg-pharma-600 text-white px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-center">
        {pharmaName}
      </div>
      <div className="px-4 py-3 flex flex-col items-center text-center">
        <div className="font-bold text-slate-800 text-base leading-tight">{name}</div>
        <div className="text-xs text-slate-500 capitalize">{role}</div>
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
