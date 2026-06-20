import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
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
}

export default function UserCards() {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [rows, setRows] = useState<UserRow[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<{ name_en?: string; name_ar?: string } | null>(null)
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
        const map: Record<string, string> = {}
        for (const u of list) {
          if (!u.card_code) continue
          map[u.card_code] = await QRCode.toDataURL(u.card_code, {
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
  if (user?.role !== 'admin') {
    return <div className="p-10 text-center text-slate-500">{t('settings.admin_only')}</div>
  }

  const pharmaName = (i18n.language === 'ar' ? profile?.name_ar : profile?.name_en) || 'Fratelanza'

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        @media (min-width: 768px) {
          .cards-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
          .cards-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
          .id-card { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print max-w-5xl mx-auto mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('settings.login_cards')}</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-4 py-2 rounded-lg text-sm">
          <Printer size={16} /> {t('common.print')}
        </button>
      </div>

      <div className="cards-grid max-w-5xl mx-auto">
        {rows.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }} className="text-center text-slate-400 py-10">{t('settings.no_cards')}</div>
        )}
        {rows.map((u) => {
          const name = (i18n.language === 'ar' ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.username
          return <UserCard key={u.id} name={name} pharmaName={pharmaName} role={t(`settings.role_${u.role}`, u.role)} code={u.card_code!} qr={qrs[u.card_code!]} scanLabel={t('settings.scan_to_unlock')} />
        })}
      </div>
    </div>
  )
}

function UserCard({ name, pharmaName, role, code, qr, scanLabel }: {
  name: string; pharmaName: string; role: string; code: string; qr?: string; scanLabel: string
}) {
  return (
    <div className="id-card bg-white border border-slate-300 rounded-2xl p-4 flex flex-col items-center text-center shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-pharma-600">{pharmaName}</div>
      <div className="mt-1 w-12 border-b-2 border-pharma-500/40" />
      <div className="mt-2 font-bold text-slate-800 text-base leading-tight">{name}</div>
      <div className="text-xs text-slate-500 capitalize">{role}</div>
      <div className="my-3">
        {qr ? (
          <img src={qr} alt={code} className="w-36 h-36" />
        ) : (
          <div className="w-36 h-36 bg-slate-100 animate-pulse rounded" />
        )}
      </div>
      <Barcode value={code.replace(/[^A-Za-z0-9]/g, '')} />
      <div className="font-mono text-[11px] text-slate-700 tracking-wide mt-1">{code}</div>
      <div className="text-[10px] text-slate-400 mt-1">{scanLabel}</div>
    </div>
  )
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128', width: 1.8, height: 54, displayValue: false, margin: 0,
      })
    } catch {}
  }, [value])
  return <svg ref={ref} className="w-44 h-14" />
}
