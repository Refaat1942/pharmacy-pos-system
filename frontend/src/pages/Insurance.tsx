import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Plus, Edit2, X, FileText, BarChart3 } from 'lucide-react'
import Layout from '../components/Layout'
import { insuranceAPI } from '../lib/api'
import type { InsuranceCompany, InsurancePlan, InsuranceClaim } from '../lib/insurance'
import {
  DEFAULT_CONTROLS, DEFAULT_COVERAGE_RULES, DEFAULT_FINANCIAL_RULES,
  INSURANCE_FIELD_KEYS, insuranceFieldLabel, type FieldMode,
} from '../lib/insurance'
import { useAuth } from '../lib/auth'
import i18n from '../lib/i18n'
import { downloadApiExcel } from '../lib/downloadExcel'
import { downloadApiPdf } from '../lib/downloadPdf'

type Tab = 'companies' | 'plans' | 'claims' | 'dashboard' | 'reports' | 'templates'

const emptyCompany = (): Partial<InsuranceCompany> => ({
  code: '', name_ar: '', name_en: '', status: 'active', field_config: {},
  local_drugs_pct: 80, imported_drugs_pct: 70, patient_share_pct: 20,
})

function defaultPlanForCompany(plans: InsurancePlan[], companyId: number) {
  return plans.find((p) => p.company_id === companyId && p.code === 'DEFAULT')
    || plans.find((p) => p.company_id === companyId)
}

const emptyPlan = (companyId: number): Partial<InsurancePlan> & { company_id: number } => ({
  company_id: companyId, code: '', name_ar: '', name_en: '', status: 'active', priority: 0,
  coverage_rules: { ...DEFAULT_COVERAGE_RULES },
  financial_rules: { ...DEFAULT_FINANCIAL_RULES },
  controls: { ...DEFAULT_CONTROLS },
})

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
  const [editPlan, setEditPlan] = useState<(Partial<InsurancePlan> & { company_id: number }) | null>(null)
  const [editPlanId, setEditPlanId] = useState<number | null>(null)
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
    if (!editCompany?.code || !editCompany.name_en || !editCompany.name_ar) {
      setError(t('insurance.required_fields') as string)
      return
    }
    setError('')
    try {
      if (editCompanyId) await insuranceAPI.updateCompany(editCompanyId, editCompany)
      else await insuranceAPI.createCompany(editCompany)
      setEditCompany(null)
      load()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Error')
    }
  }

  const savePlan = async () => {
    if (!editPlan?.code || !editPlan.name_en || !editPlan.company_id) {
      setError(t('insurance.required_fields') as string)
      return
    }
    setError('')
    try {
      if (editPlanId) await insuranceAPI.updatePlan(editPlanId, editPlan)
      else await insuranceAPI.createPlan(editPlan)
      setEditPlan(null)
      load()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Error')
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
    { id: 'plans', label: t('insurance.tab_plans'), Icon: FileText },
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
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
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
                <button onClick={() => { setEditCompanyId(null); setShowFieldConfig(false); setEditCompany(emptyCompany()) }}
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
                            patient_share_pct: plan?.financial_rules?.patient_share_pct ?? 20,
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

        {tab === 'plans' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {canManage && (
              <div className="p-4 border-b">
                <button onClick={() => {
                  const cid = companies[0]?.id
                  if (!cid) { setError(t('insurance.need_company') as string); return }
                  setEditPlanId(null); setEditPlan(emptyPlan(cid))
                }} className="bg-pharma-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                  <Plus size={16} /> {t('insurance.new_plan')}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{t('insurance.col_company')}</th>
                  <th className="px-4 py-2 text-start">{t('insurance.col_code')}</th>
                  <th className="px-4 py-2 text-start">{t('insurance.col_name')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.local_pct')}</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{lang === 'ar' ? p.company_name_ar : p.company_name_en}</td>
                    <td className="px-4 py-2 font-mono">{p.code}</td>
                    <td className="px-4 py-2">{lang === 'ar' ? p.name_ar : p.name_en}</td>
                    <td className="px-4 py-2 text-center">{p.coverage_rules?.local_drugs_pct ?? '—'}%</td>
                    {canManage && (
                      <td className="px-4 py-2 text-end">
                        <button onClick={() => { setEditPlanId(p.id); setEditPlan({ ...p, company_id: p.company_id }) }}
                          className="text-pharma-600 hover:underline flex items-center gap-1 ms-auto">
                          <Edit2 size={14} /> {t('common.edit')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
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
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="flex justify-between mb-4">
                <h2 className="font-bold text-lg">{editCompanyId ? t('insurance.edit_company') : t('insurance.new_company')}</h2>
                <button onClick={() => setEditCompany(null)}><X /></button>
              </div>
              <div className="space-y-3 mb-4">
                <input value={editCompany.code || ''} onChange={(e) => setEditCompany({ ...editCompany, code: e.target.value })}
                  placeholder={t('insurance.col_code') as string} className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                <input value={editCompany.name_en || ''} onChange={(e) => setEditCompany({ ...editCompany, name_en: e.target.value })}
                  placeholder={t('offers.name_en') as string} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <input value={editCompany.name_ar || ''} onChange={(e) => setEditCompany({ ...editCompany, name_ar: e.target.value })}
                  placeholder={t('offers.name_ar') as string} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <select value={editCompany.status || 'active'} onChange={(e) => setEditCompany({ ...editCompany, status: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="active">{t('insurance.active')}</option>
                  <option value="inactive">{t('insurance.inactive')}</option>
                </select>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                  <label className="text-xs">
                    <span className="block text-slate-500 mb-1">{t('insurance.local_pct')}</span>
                    <input type="number" min={0} max={100} value={editCompany.local_drugs_pct ?? 80}
                      onChange={(e) => setEditCompany({ ...editCompany, local_drugs_pct: Number(e.target.value) })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm text-end" />
                  </label>
                  <label className="text-xs">
                    <span className="block text-slate-500 mb-1">{t('insurance.imported_pct')}</span>
                    <input type="number" min={0} max={100} value={editCompany.imported_drugs_pct ?? 70}
                      onChange={(e) => setEditCompany({ ...editCompany, imported_drugs_pct: Number(e.target.value) })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm text-end" />
                  </label>
                  <label className="text-xs">
                    <span className="block text-slate-500 mb-1">{t('insurance.fields.patient_share_pct')}</span>
                    <input type="number" min={0} max={100} value={editCompany.patient_share_pct ?? 20}
                      onChange={(e) => setEditCompany({ ...editCompany, patient_share_pct: Number(e.target.value) })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm text-end" />
                  </label>
                </div>
                <button type="button" onClick={() => setShowFieldConfig((v) => !v)}
                  className="text-xs text-pharma-600 hover:underline">
                  {showFieldConfig ? t('insurance.hide_advanced') : t('insurance.show_advanced')}
                </button>
                {showFieldConfig && (
                  <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {INSURANCE_FIELD_KEYS.map((key) => (
                      <div key={key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{insuranceFieldLabel(key, t)}</span>
                        <select value={editCompany.field_config?.[key] || 'optional'} onChange={(e) => setFieldMode(key, e.target.value as FieldMode)}
                          className="border rounded px-1 py-0.5 text-[10px]">
                          <option value="required">{t('insurance.mode_required')}</option>
                          <option value="optional">{t('insurance.mode_optional')}</option>
                          <option value="hidden">{t('insurance.mode_hidden')}</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={saveCompany} className="w-full bg-pharma-600 text-white py-2 rounded-lg font-medium">{t('common.save')}</button>
            </div>
          </div>
        )}

        {editPlan && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between mb-4">
                <h2 className="font-bold text-lg">{editPlanId ? t('insurance.edit_plan') : t('insurance.new_plan')}</h2>
                <button onClick={() => setEditPlan(null)}><X /></button>
              </div>
              <div className="space-y-3">
                <select value={editPlan.company_id} onChange={(e) => setEditPlan({ ...editPlan, company_id: Number(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                </select>
                {(['code', 'name_en', 'name_ar'] as const).map((k) => (
                  <input key={k} value={(editPlan[k] as string) || ''} onChange={(e) => setEditPlan({ ...editPlan, [k]: e.target.value })}
                    placeholder={k} className="w-full border rounded-lg px-3 py-2 text-sm" />
                ))}
                {Object.entries(DEFAULT_COVERAGE_RULES).map(([k, v]) => (
                  <label key={k} className="flex justify-between text-sm items-center">
                    <span>{k.replace(/_/g, ' ')}</span>
                    <input type="number" min={0} max={100} className="border rounded w-20 px-2 py-1 text-end"
                      value={editPlan.coverage_rules?.[k] ?? v}
                      onChange={(e) => setEditPlan({
                        ...editPlan,
                        coverage_rules: { ...editPlan.coverage_rules, [k]: Number(e.target.value) },
                      })} />
                  </label>
                ))}
                <label className="flex justify-between text-sm items-center">
                  <span>{t('insurance.copayment')}</span>
                  <input type="number" min={0} step={0.5} className="border rounded w-24 px-2 py-1 text-end"
                    value={editPlan.financial_rules?.fixed_copayment ?? 0}
                    onChange={(e) => setEditPlan({
                      ...editPlan,
                      financial_rules: { ...editPlan.financial_rules, fixed_copayment: Number(e.target.value) },
                    })} />
                </label>
              </div>
              <button onClick={savePlan} className="w-full mt-4 bg-pharma-600 text-white py-2 rounded-lg font-medium">{t('common.save')}</button>
            </div>
          </div>
        )}
      </main>
    </Layout>
  )
}
