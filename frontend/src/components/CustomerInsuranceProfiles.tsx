import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Shield } from 'lucide-react'
import { insuranceAPI } from '../lib/api'
import type { InsuranceCompany, InsurancePlan } from '../lib/insurance'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'

export interface CustomerInsuranceProfile {
  id: number
  customer_id: number
  company_id: number
  plan_id?: number | null
  insurance_card_number?: string
  membership_number?: string
  policy_number?: string
  national_id?: string
  expiry_date?: string | null
  approval_number?: string
  coverage_class?: string
  max_coverage?: number | null
  remaining_balance?: number | null
  notes?: string
  is_primary?: boolean
  active?: boolean
  company_name_en?: string
  company_name_ar?: string
  plan_name_en?: string
  plan_name_ar?: string
}

interface Props {
  customerId: number
  compact?: boolean
}

const emptyProfile = (customerId: number): Partial<CustomerInsuranceProfile> & { customer_id: number } => ({
  customer_id: customerId,
  company_id: 0,
  is_primary: false,
  active: true,
})

export default function CustomerInsuranceProfiles({ customerId, compact }: Props) {
  const { t } = useTranslation()
  const { hasFeatureOption } = useAuth()
  const canManage = hasFeatureOption('insurance', 'manage')
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [profiles, setProfiles] = useState<CustomerInsuranceProfile[]>([])
  const [companies, setCompanies] = useState<InsuranceCompany[]>([])
  const [plans, setPlans] = useState<InsurancePlan[]>([])
  const [editing, setEditing] = useState<(Partial<CustomerInsuranceProfile> & { customer_id: number }) | null>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const load = useCallback(() => {
    insuranceAPI.profiles(customerId).then((r) => setProfiles(r.data)).catch(() => setProfiles([]))
  }, [customerId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    insuranceAPI.companies('active').then((r) => setCompanies(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!editing?.company_id) { setPlans([]); return }
    insuranceAPI.plans(editing.company_id).then((r) => setPlans(r.data)).catch(() => setPlans([]))
  }, [editing?.company_id])

  const save = async () => {
    if (!editing?.company_id) return
    const body = { ...editing, customer_id: customerId }
    if (editId) await insuranceAPI.updateProfile(editId, body)
    else await insuranceAPI.createProfile(body)
    setEditing(null)
    load()
  }

  const remove = async (id: number) => {
    if (!confirm(t('insurance.confirm_delete_profile') as string)) return
    await insuranceAPI.deleteProfile(id)
    load()
  }

  if (!canManage && !profiles.length) return null

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`font-semibold text-slate-800 flex items-center gap-2 ${compact ? 'text-sm' : ''}`}>
          <Shield size={16} className="text-sky-600" />
          {t('insurance.customer_profiles')}
        </h3>
        {canManage && (
          <button type="button" onClick={() => { setEditId(null); setEditing(emptyProfile(customerId)) }}
            className="text-xs px-2 py-1 rounded-lg bg-sky-600 text-white flex items-center gap-1">
            <Plus size={12} /> {t('insurance.add_profile')}
          </button>
        )}
      </div>

      {profiles.length === 0 ? (
        <p className="text-xs text-slate-500">{t('insurance.no_profiles')}</p>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="border border-slate-200 rounded-lg p-3 text-sm bg-slate-50">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">{lang === 'ar' ? p.company_name_ar : p.company_name_en}</p>
                  <p className="text-xs text-slate-500">
                    {lang === 'ar' ? p.plan_name_ar : p.plan_name_en}
                    {p.is_primary && ` · ${t('insurance.primary')}`}
                  </p>
                  {p.insurance_card_number && (
                    <p className="text-xs font-mono mt-1">{t('insurance.fields.insurance_card_number')}: {p.insurance_card_number}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { setEditId(p.id); setEditing({ ...p, customer_id: customerId }) }}
                      className="text-xs text-pharma-600 hover:underline">{t('common.edit')}</button>
                    <button type="button" onClick={() => remove(p.id)} className="text-xs text-red-600 p-1"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-bold">{editId ? t('insurance.edit_profile') : t('insurance.add_profile')}</h4>
            <select value={editing.company_id || ''} onChange={(e) => setEditing({ ...editing, company_id: Number(e.target.value), plan_id: null })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('insurance.select_company')}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</option>)}
            </select>
            <select value={editing.plan_id || ''} onChange={(e) => setEditing({ ...editing, plan_id: e.target.value ? Number(e.target.value) : null })}
              disabled={!editing.company_id} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('insurance.select_plan')}</option>
              {plans.map((pl) => <option key={pl.id} value={pl.id}>{lang === 'ar' ? pl.name_ar : pl.name_en}</option>)}
            </select>
            {(['insurance_card_number', 'membership_number', 'policy_number', 'national_id', 'approval_number'] as const).map((k) => (
              <input key={k} placeholder={t(`insurance.fields.${k}`) as string} value={String((editing as Record<string, unknown>)[k] ?? '')}
                onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            ))}
            <input type="date" value={editing.expiry_date?.slice(0, 10) || ''} onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editing.is_primary} onChange={(e) => setEditing({ ...editing, is_primary: e.target.checked })} />
              {t('insurance.primary')}
            </label>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 border rounded-lg py-2 text-sm">{t('common.cancel')}</button>
              <button type="button" onClick={save} className="flex-1 bg-pharma-600 text-white rounded-lg py-2 text-sm">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
