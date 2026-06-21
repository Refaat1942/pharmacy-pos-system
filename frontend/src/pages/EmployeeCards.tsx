import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { canManageEmployees } from '../lib/hrAccess'
import HrUnauthorized from '../components/HrUnauthorized'
import { Navigate } from 'react-router-dom'
import EmployeeIdCard from '../components/EmployeeIdCard'
import {
  openAllEmployeeIdCardsPrint,
  openEmployeeBarcodeLabelPrint,
  openEmployeeIdCardPrint,
  type EmployeeCardData,
} from '../lib/employeeCardPrint'

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

  const printLabels = useMemo(
    () => ({
      printToolbar: t('bulk_barcode.print_toolbar_btn'),
      popupBlocked: t('bulk_barcode.popup_blocked'),
    }),
    [t],
  )

  const toCardData = (e: Employee): EmployeeCardData => {
    const branch = (i18n.language === 'ar' ? e.branch_name_ar : e.branch_name_en) || e.branch_name_en || e.branch_name_ar || ''
    return {
      name: e.name,
      pharmaName,
      role: e.role || '',
      branch,
      code: e.clock_code!,
      scanLabel: t('hr.scan_to_clock'),
    }
  }

  const printAll = () => openAllEmployeeIdCardsPrint(rows.map(toCardData), printLabels)

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <style>{`
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 14px;
        }
      `}</style>

      <div className="max-w-4xl mx-auto mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('hr.print_cards')}</h1>
        <button
          type="button"
          onClick={printAll}
          className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white font-medium px-4 py-2 rounded-lg text-sm"
        >
          <Printer size={16} /> {t('settings.print_all', 'Print all')}
        </button>
      </div>

      <div className="cards-grid max-w-4xl mx-auto">
        {rows.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }} className="text-center text-slate-400 py-10">{t('hr.no_employees')}</div>
        )}
        {rows.map((e) => {
          const card = toCardData(e)
          return (
            <EmployeeIdCard
              key={e.id}
              {...card}
              onPrintIdCard={() => openEmployeeIdCardPrint(card, printLabels)}
              onPrintBarcodeLabel={() => openEmployeeBarcodeLabelPrint(card, printLabels, i18n.language === 'ar')}
              printIdCardTitle={t('common.print_id_card')}
              printBarcodeLabelTitle={t('common.print_barcode_label')}
            />
          )
        })}
      </div>
    </div>
  )
}
