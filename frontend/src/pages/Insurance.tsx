import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Plus, Edit2, X, FileText, BarChart3 } from 'lucide-react'
import Layout from '../components/Layout'
import { insuranceAPI } from '../lib/api'
import type { InsuranceCompany, InsurancePlan, InsuranceClaim } from '../lib/insurance'
import {
  INSURANCE_FIELD_KEYS, INSURANCE_POS_SECTION_ORDER, INSURANCE_POS_SECTIONS,
  insuranceFieldLabel, type FieldMode,
} from '../lib/insurance'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import { downloadApiExcel } from '../lib/downloadExcel'
import { downloadApiPdf } from '../lib/downloadPdf'

type Tab = 'companies' | 'claims' | 'dashboard' | 'reports' | 'templates'

const emptyCompany = (): Partial<InsuranceCompany> => ({
  code: '', name_ar: '', name_en: '', status: 'active', field_config: {},
  local_drugs_pct: 80, imported_drugs_pct: 70,
  patient_share_timing: 'after_discount',
})

function formatApiError(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: string }).msg)
        return String(item)
      })
      .join('; ')
  }
  return fallback
}

function companyPayload(c: Partial<InsuranceCompany>) {
  const nameEn = (c.name_en || '').trim()
  return {
    code: (c.code || '').trim(),
    name_en: nameEn,
    name_ar: (c.name_ar || '').trim() || nameEn,
    status: c.status || 'active',
    field_config: c.field_config || {},
    local_drugs_pct: c.local_drugs_pct ?? 80,
    imported_drugs_pct: c.imported_drugs_pct ?? 70,
    default_patient_share_pct: c.default_patient_share_pct ?? undefined,
    patient_share_timing: c.patient_share_timing || 'after_discount',
  }
}

function defaultPlanForCompany(plans: InsurancePlan[], companyId: number) {
  return plans.find((p) => p.company_id === companyId && p.code === 'DEFAULT')
    || plans.find((p) => p.company_id === companyId)
}

export default function Insurance() {
  const { t } = useTranslation()
  const { hasFeatureOption } = useAuth()
  const canManage = hasFeatureOption('insurance', 'manage')
  const canClaims = hasFeatureOption('insurance', 'claims')
  const canReports = hasFeatureOption('insurance', 'reports')
  const canTemplates = hasFeatureOption('insurance', 'templates')
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [tab, setTab] = useState<Tab>('companies')
  const [companies, setCompanies] = useState<InsuranceCompany[]>([])
  const [plans, setPlans] = useState<InsurancePlan[]>([])
  const [claims, setClaims] = useState<InsuranceClaim[]>([])
  const [templates, setTemplates] = useState<Array<{ id: number; name: string; template_type: string; language: string; is_default: boolean }>>([])
  const [salesReport, setSalesReport] = useState<{ summary?: { count: number; covered: number; patient_paid: number }; rows?: unknown[] } | null>(null)
  const [reportRange, setReportRange] = useState({ date_from: '', date_to: '', company_id: '' })
  const [dashboard, setDashboard] = useState<{ month_sales?: { total_covered: number; patient_paid: number; invoice_count: number } } | null>(null)
  const [editCompany, setEditCompany] = useState<Partial<InsuranceCompany> | null>(null)
  const [editCompanyId, setEditCompanyId] = useState<number | null>(null)
  const [showFieldConfig, setShowFieldConfig] = useState(false)
  const [error, setError] = useState('')
  const [claimForm, setClaimForm] = useState({ company_id: '', date_from: '', date_to: '' })

  const load = useCallback(() => {
    insuranceAPI.companies().then((r) => setCompanies(r.data)).catch(() => setCompanies([]))
    insuranceAPI.plans().then((r) => setPlans(r.data)).catch(() => setPlans([]))
    if (canClaims) insuranceAPI.claims().then((r) => setClaims(r.data)).catch(() => setClaims([]))
    if (hasFeatureOption('insurance', 'dashboard')) {
      insuranceAPI.dashboard().then((r) => setDashboard(r.data)).catch(() => setDashboard(null))
    }
    if (canTemplates) insuranceAPI.templates().then((r) => setTemplates(r.data)).catch(() => setTemplates([]))
  }, [canClaims, canTemplates, hasFeatureOption])

  useEffect(() => { load() }, [load])

  const saveCompany = async () => {
    if (!editCompany?.code?.trim() || !editCompany.name_en?.trim()) {
      setError(t('insurance.required_fields') as string)
      return
    }
    setError('')
    const payload = companyPayload(editCompany)
    try {
      if (editCompanyId) await insuranceAPI.updateCompany(editCompanyId, payload)
      else await insuranceAPI.createCompany(payload)
      setEditCompany(null)
      setEditCompanyId(null)
      load()
    } catch (e: unknown) {
      setError(formatApiError(e, t('common.error') as string))
    }
  }

  const generateClaim = async () => {
    if (!claimForm.company_id || !claimForm.date_from || !claimForm.date_to) return
    try {
      await insuranceAPI.generateClaim({
        company_id: Number(claimForm.company_id),
        period_type: 'custom',
        date_from: claimForm.date_from,
        date_to: claimForm.date_to,
      })
      load()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Error')
    }
  }

  const setFieldMode = (key: string, mode: FieldMode) => {
    if (!editCompany) return
    setEditCompany({
      ...editCompany,
      field_config: { ...(editCompany.field_config || {}), [key]: mode },
    })
  }

  const tabs: { id: Tab; label: string; Icon: typeof Shield }[] = [
    { id: 'companies', label: t('insurance.tab_companies'), Icon: Shield },
    ...(canClaims ? [{ id: 'claims' as Tab, label: t('insurance.tab_claims'), Icon: FileText }] : []),
    ...(canReports ? [{ id: 'reports' as Tab, label: t('insurance.tab_reports'), Icon: BarChart3 }] : []),
    ...(canTemplates ? [{ id: 'templates' as Tab, label: t('insurance.tab_templates'), Icon: FileText }] : []),
    { id: 'dashboard', label: t('insurance.tab_dashboard'), Icon: BarChart3 },
  ]

  const loadSalesReport = () => {
    insuranceAPI.salesReport({
      date_from: reportRange.date_from || undefined,
      date_to: reportRange.date_to || undefined,
      company_id: reportRange.company_id ? Number(reportRange.company_id) : undefined,
    }).then((r) => setSalesReport(r.data)).catch(() => setSalesReport(null))
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="feature-page-title flex items-center gap-2">
            <Shield className="text-pharma-600" /> {t('insurance.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('insurance.subtitle')}</p>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === id ? 'bg-pharma-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {tab === 'companies' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {canManage && (
              <div className="p-4 border-b">
                <button onClick={() => { setError(''); setEditCompanyId(null); setShowFieldConfig(false); setEditCompany(emptyCompany()) }}
                  className="bg-pharma-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                  <Plus size={16} /> {t('insurance.new_company')}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{t('insurance.col_code')}</th>
                  <th className="px-4 py-2 text-start">{t('insurance.col_name')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.local_pct')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.imported_pct')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.col_status')}</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const dp = defaultPlanForCompany(plans, c.id)
                  return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono">{c.code}</td>
                    <td className="px-4 py-2">{lang === 'ar' ? c.name_ar : c.name_en}</td>
                    <td className="px-4 py-2 text-center">{dp?.coverage_rules?.local_drugs_pct ?? '—'}%</td>
                    <td className="px-4 py-2 text-center">{dp?.coverage_rules?.imported_drugs_pct ?? '—'}%</td>
                    <td className="px-4 py-2 text-center">{c.status}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-end">
                        <button onClick={() => {
                          const plan = defaultPlanForCompany(plans, c.id)
                          setEditCompanyId(c.id)
                          setShowFieldConfig(false)
                          setEditCompany({
                            ...c,
                            field_config: c.field_config || {},
                            local_drugs_pct: plan?.coverage_rules?.local_drugs_pct ?? 80,
                            imported_drugs_pct: plan?.coverage_rules?.imported_drugs_pct ?? 70,
                            default_patient_share_pct: plan?.financial_rules?.patient_share_pct != null
                              ? Number(plan.financial_rules.patient_share_pct)
                              : undefined,
                            patient_share_timing: String(plan?.financial_rules?.patient_share_timing || 'after_discount'),
                          })
                        }}
                          className="text-pharma-600 hover:underline flex items-center gap-1 ms-auto">
                          <Edit2 size={14} /> {t('common.edit')}
                        </button>
                      </td>
                    )}
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'claims' && canClaims && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-2 items-end">
              <select value={claimForm.company_id} onChange={(e) => setClaimForm((f) => ({ ...f, company_id: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{t('insurance.select_company')}</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
              <input type="date" value={claimForm.date_from} onChange={(e) => setClaimForm((f) => ({ ...f, date_from: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={claimForm.date_to} onChange={(e) => setClaimForm((f) => ({ ...f, date_to: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <button onClick={generateClaim} className="bg-pharma-600 text-white px-4 py-2 rounded-lg text-sm">{t('insurance.generate_claim')}</button>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('insurance.claim_number')}</th>
                    <th className="px-4 py-2 text-start">{t('insurance.col_company')}</th>
                    <th className="px-4 py-2 text-center">{t('insurance.receipts')}</th>
                    <th className="px-4 py-2 text-end">{t('insurance.claim_amount')}</th>
                    <th className="px-4 py-2 text-center">{t('insurance.col_status')}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((cl) => (
                    <tr key={cl.id} className="border-t">
                      <td className="px-4 py-2 font-mono">{cl.claim_number}</td>
                      <td className="px-4 py-2">{cl.company_name_en}</td>
                      <td className="px-4 py-2 text-center">{cl.receipt_count}</td>
                      <td className="px-4 py-2 text-end font-mono">{Number(cl.net_claim_amount).toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">{cl.status}</td>
                      <td className="px-4 py-2 text-end">
                        <div className="flex flex-col items-end gap-1">
                          {hasFeatureOption('insurance', 'claims_export') && (
                            <>
                              <button onClick={() => downloadApiExcel(`/insurance/claims/${cl.id}/export`, `claim-${cl.claim_number}.xlsx`)}
                                className="text-xs text-pharma-600 hover:underline">{t('insurance.export')} Excel</button>
                              <button onClick={() => downloadApiPdf(`/insurance/claims/${cl.id}/pdf`, `claim-${cl.claim_number}.pdf`)}
                                className="text-xs text-pharma-600 hover:underline">{t('insurance.export')} PDF</button>
                              <button onClick={() => downloadApiPdf(`/insurance/claims/${cl.id}/payment-request/pdf`, `payment-${cl.claim_number}.pdf`)}
                                className="text-xs text-sky-600 hover:underline">{t('insurance.payment_request')}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'dashboard' && dashboard && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-500 uppercase">{t('insurance.month_invoices')}</p>
              <p className="text-2xl font-bold">{dashboard.month_sales?.invoice_count ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-500 uppercase">{t('insurance.covered')}</p>
              <p className="text-2xl font-bold text-sky-700">{(dashboard.month_sales?.total_covered ?? 0).toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-500 uppercase">{t('insurance.patient_paid')}</p>
              <p className="text-2xl font-bold">{(dashboard.month_sales?.patient_paid ?? 0).toFixed(2)}</p>
            </div>
          </div>
        )}

        {tab === 'reports' && canReports && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-2 items-end">
              <input type="date" value={reportRange.date_from} onChange={(e) => setReportRange((r) => ({ ...r, date_from: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={reportRange.date_to} onChange={(e) => setReportRange((r) => ({ ...r, date_to: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <select value={reportRange.company_id} onChange={(e) => setReportRange((r) => ({ ...r, company_id: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{t('insurance.all_companies')}</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
              <button onClick={loadSalesReport} className="bg-pharma-600 text-white px-4 py-2 rounded-lg text-sm">{t('insurance.run_report')}</button>
              <button onClick={() => downloadApiExcel('/insurance/reports/sales/export', 'insurance-sales.xlsx', reportRange)} className="border px-4 py-2 rounded-lg text-sm">{t('insurance.export')} Excel</button>
            </div>
            {salesReport?.summary && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('insurance.invoices')}</p><p className="text-xl font-bold">{salesReport.summary.count}</p></div>
                <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('insurance.covered')}</p><p className="text-xl font-bold text-sky-700">{salesReport.summary.covered.toFixed(2)}</p></div>
                <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('insurance.patient_paid')}</p><p className="text-xl font-bold">{salesReport.summary.patient_paid.toFixed(2)}</p></div>
              </div>
            )}
          </div>
        )}

        {tab === 'templates' && canTemplates && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex justify-between">
              <p className="text-sm text-slate-600">{t('insurance.templates_hint')}</p>
              {canManage && (
                <button onClick={() => insuranceAPI.createTemplate({ template_type: 'insurance_receipt', name: 'Default Receipt', language: 'bilingual', is_default: true }).then(() => load())}
                  className="text-sm bg-pharma-600 text-white px-3 py-1.5 rounded-lg">{t('insurance.add_template')}</button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{t('insurance.col_name')}</th>
                  <th className="px-4 py-2 text-start">{t('insurance.template_type')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tm) => (
                  <tr key={tm.id} className="border-t">
                    <td className="px-4 py-2">{tm.name}{tm.is_default ? ' ★' : ''}</td>
                    <td className="px-4 py-2 font-mono text-xs">{tm.template_type}</td>
                    <td className="px-4 py-2 text-center">{tm.language}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editCompany && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b shrink-0">
                <h2 className="font-bold text-xl">{editCompanyId ? t('insurance.edit_company') : t('insurance.new_company')}</h2>
                <button type="button" onClick={() => { setEditCompany(null); setEditCompanyId(null); setError('') }} className="p-1 hover:bg-slate-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">{t('insurance.col_code')} *</span>
                    <input value={editCompany.code || ''} onChange={(e) => setEditCompany({ ...editCompany, code: e.target.value })}
                      className="mt-1 w-full border rounded-lg px-3 py-2.5 text-sm font-mono uppercase" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">{t('insurance.col_status')}</span>
                    <select value={editCompany.status || 'active'} onChange={(e) => setEditCompany({ ...editCompany, status: e.target.value })}
                      className="mt-1 w-full border rounded-lg px-3 py-2.5 text-sm">
                      <option value="active">{t('insurance.active')}</option>
                      <option value="inactive">{t('insurance.inactive')}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">{t('offers.name_en')} *</span>
                    <input value={editCompany.name_en || ''} onChange={(e) => setEditCompany({ ...editCompany, name_en: e.target.value })}
                      className="mt-1 w-full border rounded-lg px-3 py-2.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">{t('offers.name_ar')}</span>
                    <input value={editCompany.name_ar || ''} onChange={(e) => setEditCompany({ ...editCompany, name_ar: e.target.value })}
                      placeholder={t('insurance.name_ar_optional') as string}
                      className="mt-1 w-full border rounded-lg px-3 py-2.5 text-sm" />
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                  <label className="text-sm">
                    <span className="block text-slate-600 mb-1 font-medium">{t('insurance.local_pct')}</span>
                    <input type="number" min={0} max={100} value={editCompany.local_drugs_pct ?? 80}
                      onChange={(e) => setEditCompany({ ...editCompany, local_drugs_pct: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm text-end" />
                  </label>
                  <label className="text-sm">
                    <span className="block text-slate-600 mb-1 font-medium">{t('insurance.imported_pct')}</span>
                    <input type="number" min={0} max={100} value={editCompany.imported_drugs_pct ?? 70}
                      onChange={(e) => setEditCompany({ ...editCompany, imported_drugs_pct: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm text-end" />
                  </label>
                  <label className="text-sm">
                    <span className="block text-slate-600 mb-1 font-medium">{t('insurance.default_patient_share_pct')}</span>
                    <input type="number" min={0} max={100}
                      value={editCompany.default_patient_share_pct ?? ''}
                      placeholder={t('insurance.patient_share_optional_ph') as string}
                      onChange={(e) => setEditCompany({
                        ...editCompany,
                        default_patient_share_pct: e.target.value === '' ? undefined : Number(e.target.value),
                      })}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm text-end" />
                  </label>
                  <label className="text-sm">
                    <span className="block text-slate-600 mb-1 font-medium">{t('insurance.patient_share_timing')}</span>
                    <select value={editCompany.patient_share_timing || 'after_discount'}
                      onChange={(e) => setEditCompany({ ...editCompany, patient_share_timing: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm">
                      <option value="after_discount">{t('insurance.patient_share_after_discount')}</option>
                      <option value="before_discount">{t('insurance.patient_share_before_discount')}</option>
                    </select>
                  </label>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-1">{t('insurance.pos_field_layout')}</p>
                  <p className="text-xs text-slate-500 mb-3">{t('insurance.pos_field_layout_hint')}</p>
                  <button type="button" onClick={() => setShowFieldConfig((v) => !v)}
                    className="text-sm text-pharma-600 hover:underline font-medium">
                    {showFieldConfig ? t('insurance.hide_advanced') : t('insurance.show_advanced')}
                  </button>
                  {showFieldConfig && (
                    <div className="mt-3 space-y-4 max-h-[45vh] overflow-y-auto border rounded-xl p-3 bg-slate-50">
                      {INSURANCE_POS_SECTION_ORDER.map((sectionKey) => {
                        const keys = (INSURANCE_POS_SECTIONS[sectionKey] || []).filter((k) =>
                          INSURANCE_FIELD_KEYS.includes(k as typeof INSURANCE_FIELD_KEYS[number]),
                        )
                        if (!keys.length) return null
                        return (
                          <div key={sectionKey}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                              {t(`insurance.section_${sectionKey}`)}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {keys.map((key) => (
                                <div key={key} className="flex items-center justify-between gap-2 text-xs bg-white border rounded-lg px-2 py-2">
                                  <span className="truncate">{insuranceFieldLabel(key, t)}</span>
                                  <select value={editCompany.field_config?.[key] || 'optional'} onChange={(e) => setFieldMode(key, e.target.value as FieldMode)}
                                    className="border rounded px-2 py-1 text-[11px] shrink-0">
                                    <option value="required">{t('insurance.mode_required')}</option>
                                    <option value="optional">{t('insurance.mode_optional')}</option>
                                    <option value="hidden">{t('insurance.mode_hidden')}</option>
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>
              <div className="px-6 py-4 border-t shrink-0">
                <button type="button" onClick={saveCompany} className="w-full bg-pharma-600 text-white py-3 rounded-lg font-semibold hover:bg-pharma-700">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </Layout>
  )
}
