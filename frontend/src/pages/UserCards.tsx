import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { Navigate } from 'react-router-dom'
import i18n from '../lib/i18n'
import EmployeeIdCard from '../components/EmployeeIdCard'
import {
  openAllEmployeeIdCardsPrint,
  openEmployeeBarcodeLabelPrint,
  openEmployeeIdCardPrint,
  type EmployeeCardData,
} from '../lib/employeeCardPrint'

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

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') {
    return <div className="p-10 text-center text-slate-500">{t('settings.admin_only')}</div>
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

  const toCardData = (u: UserRow): EmployeeCardData => {
    const name = (i18n.language === 'ar' ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.username
    const branch = (i18n.language === 'ar' ? u.branch_name_ar : u.branch_name_en) || u.branch_name_en || u.branch_name_ar || ''
    return {
      name,
      pharmaName,
      role: t(`settings.role_${u.role}`, u.role),
      branch,
      code: u.card_code!,
      scanLabel: t('settings.scan_to_unlock'),
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
        <h1 className="text-xl font-bold text-slate-800">{t('settings.login_cards')}</h1>
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
          <div style={{ gridColumn: '1 / -1' }} className="text-center text-slate-400 py-10">{t('settings.no_cards')}</div>
        )}
        {rows.map((u) => {
          const card = toCardData(u)
          return (
            <EmployeeIdCard
              key={u.id}
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
