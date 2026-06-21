import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Plus, Edit2, FileText, DollarSign, X, Trash2, Download, FileSpreadsheet } from 'lucide-react'
import Layout from '../components/Layout'
import GovernorateRegionSelect from '../components/GovernorateRegionSelect'
import CustomerInfoCard from '../components/CustomerInfoCard'
import CustomerInsuranceProfiles from '../components/CustomerInsuranceProfiles'
import CustomerStaffNotes from '../components/CustomerStaffNotes'
import CustomerTreatmentPlans from '../components/CustomerTreatmentPlans'
import CustomerWhatsAppButton from '../components/CustomerWhatsAppButton'
import { customersAPI, branchesAPI, Customer, Branch } from '../lib/api'
import PhoneField from '../components/PhoneField'
import { isValidPhone } from '../lib/phone'
import { useAuth } from '../lib/auth'
import { regionLabel } from '../lib/regions'
import { exportCSV } from '../lib/csv'
import i18n from '../lib/i18n'
import { formatDateTime } from '../lib/formatDate'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'
import api from '../lib/api'

export default function Customers() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const [statement, setStatement] = useState<any>(null)
  const [paying, setPaying] = useState<Customer | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [viewing, setViewing] = useState<Customer | null>(null)
  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  const saleTypeLabel = (st: string | null | undefined) => {
    if (st === 'delivery') return t('payment.delivery_sale')
    if (st === 'digital') return t('payment.digital_sale')
    if (st === 'insurance') return t('payment.insurance_sale')
    return t('payment.cash_sale')
  }

  const saleTypeBadgeClass = (st: string | null | undefined) => {
    if (st === 'delivery') return 'bg-amber-100 text-amber-800 border-amber-200'
    if (st === 'digital') return 'bg-violet-100 text-violet-800 border-violet-200'
    if (st === 'insurance') return 'bg-sky-100 text-sky-800 border-sky-200'
    return 'bg-slate-100 text-slate-700 border-slate-200'
  }

  const filter = useQuickFilter(list, [
    (c) => c.name,
    (c) => c.code,
    (c) => c.phone,
    (c) => regionLabel(c.region, lang),
  ])
  const accessors = useMemo(() => ({
    code: (c: Customer) => c.code || '',
    name: (c: Customer) => c.name,
    phone: (c: Customer) => c.phone,
    region: (c: Customer) => regionLabel(c.region, lang),
    limit: (c: Customer) => Number(c.credit_limit || 0),
    charged: (c: Customer) => Number(c.total_charged || 0),
    paid: (c: Customer) => Number(c.total_paid || 0),
    balance: (c: Customer) => Number(c.balance || 0),
    sale_type: (c: Customer) => saleTypeLabel(c.sale_type),
  }), [lang, t])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  const load = () => {
    setLoading(true)
    customersAPI.listV2({ q })
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    const id = setTimeout(load, 250)
    return () => clearTimeout(id)
  }, [q])

  const exportList = () => {
    exportCSV(`customers-${new Date().toISOString().slice(0, 10)}.csv`, list, [
      { label: t('customers.col_code'), value: (c) => c.code || '' },
      { label: t('customers.col_name'), value: (c) => c.name },
      { label: t('customers.col_phone'), value: (c) => c.phone || '' },
      { label: t('customers.col_region'), value: (c) => regionLabel(c.region, lang) || '' },
      { label: t('customers.col_sale_type'), value: (c) => saleTypeLabel(c.sale_type) },
      { label: t('customers.col_limit'), value: (c) => Number(c.credit_limit || 0).toFixed(2) },
      { label: t('customers.col_charged'), value: (c) => Number(c.total_charged || 0).toFixed(2) },
      { label: t('customers.col_paid'), value: (c) => Number(c.total_paid || 0).toFixed(2) },
      { label: t('customers.col_balance'), value: (c) => Number(c.balance || 0).toFixed(2) },
    ])
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="feature-page-title flex items-center gap-2">
              <Users className="text-pharma-600" />
              {t('customers.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">{t('customers.subtitle')}</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                <FileSpreadsheet size={16} />
                {t('customers.bulk_upload')}
              </button>
              <button onClick={exportList} disabled={list.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                <Download size={16} />
                {t('common.export')}
              </button>
              <button onClick={() => setEditing({ name: '', active: true, credit_limit: 0 })}
                className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <Plus size={16} />
                {t('customers.new')}
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('customers.search_placeholder') as string}
            className="input w-full md:w-96" />
          <TableFilter value={filter.query} onChange={filter.setQuery}
            placeholder={t('common.filter_placeholder') as string} className="w-full md:w-64" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="code" sort={sort} onToggle={toggle} align="start">{t('customers.col_code')}</SortTh>
                <SortTh k="name" sort={sort} onToggle={toggle} align="start">{t('customers.col_name')}</SortTh>
                <SortTh k="sale_type" sort={sort} onToggle={toggle} align="start">{t('customers.col_sale_type')}</SortTh>
                <SortTh k="phone" sort={sort} onToggle={toggle} align="start">{t('customers.col_phone')}</SortTh>
                <SortTh k="region" sort={sort} onToggle={toggle} align="start">{t('customers.col_region')}</SortTh>
                <SortTh k="limit" sort={sort} onToggle={toggle} align="end">{t('customers.col_limit')}</SortTh>
                <SortTh k="charged" sort={sort} onToggle={toggle} align="end">{t('customers.col_charged')}</SortTh>
                <SortTh k="paid" sort={sort} onToggle={toggle} align="end">{t('customers.col_paid')}</SortTh>
                <SortTh k="balance" sort={sort} onToggle={toggle} align="end">{t('customers.col_balance')}</SortTh>
                <th className="px-3 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && sorted.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-slate-400">{t('customers.empty')}</td></tr>}
              {sorted.map((c) => {
                const bal = Number(c.balance)
                const limit = Number(c.credit_limit || 0)
                const overLimit = limit > 0 && bal > limit
                return (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.code || '—'}</td>
                    <td className="px-3 py-2 font-medium">
                      <button
                        type="button"
                        onClick={() => setViewing(c)}
                        className="text-start hover:text-pharma-700 hover:underline"
                        title={t('customers.view_card') as string}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${saleTypeBadgeClass(c.sale_type)}`}>
                        {saleTypeLabel(c.sale_type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{c.phone || '—'}</span>
                        <CustomerWhatsAppButton phone={c.phone} customerName={c.name} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{regionLabel(c.region, lang) || '—'}</td>
                    <td className="px-3 py-2 text-end">{limit > 0 ? limit.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-end">{Number(c.total_charged || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-end">{Number(c.total_paid || 0).toFixed(2)}</td>
                    <td className={`px-3 py-2 text-end font-semibold ${overLimit ? 'text-red-700' : bal > 0 ? 'text-amber-700' : bal < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {bal.toFixed(2)}{overLimit && ' ⚠'}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => customersAPI.statement(c.id).then((r) => setStatement(r.data))}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title={t('customers.statement') as string}>
                          <FileText size={14} />
                        </button>
                        <button onClick={() => setPaying(c)}
                          className="p-1.5 hover:bg-emerald-100 rounded text-emerald-700" title={t('customers.record_payment') as string}>
                          <DollarSign size={14} />
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => setEditing(c)}
                              className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title={t('common.edit') as string}>
                              <Edit2 size={14} />
                            </button>
                            <button onClick={async () => {
                              if (!confirm(t('customers.confirm_delete') as string)) return
                              await customersAPI.removeV2(c.id); load()
                            }} className="p-1.5 hover:bg-red-100 rounded text-red-700" title={t('common.delete') as string}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>

      {editing && <EditModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {viewing && <CustomerCardModal customer={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null) }} />}
      {statement && <StatementModal data={statement} onClose={() => setStatement(null)} />}
      {paying && <PaymentModal customer={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load() }} />}
      {showUpload && <CustomerUploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load() }} />}
    </Layout>
  )
}

function CustomerUploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ inserted: number; updated: number; errors: number; error_details?: string[] } | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!file) return
    setError('')
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const { data } = await api.post('/customers/bulk-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error')
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/customers/bulk-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'customers_template.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(t('customers.download_failed'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('customers.bulk_upload')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="bg-slate-50 p-3 rounded-lg text-slate-700">
            <div className="font-semibold mb-1">{t('customers.excel_help_title')}</div>
            <div>{t('customers.excel_help_cols')}</div>
            <code className="block mt-2 text-xs bg-white p-2 rounded border border-slate-200 break-all">
              Name, Phone, Email, Region, Address Details, Tax #, Credit Limit, Notes, Active, Authorized Branches
            </code>
            <button type="button" onClick={downloadTemplate} className="text-pharma-700 hover:underline text-xs mt-2 inline-block">
              ⬇ {t('customers.download_template')}
            </button>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-2 border border-dashed border-slate-300 rounded-lg"
          />
          {error && <div className="text-red-600">{error}</div>}
          {result && (
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-800">
              ✅ {result.inserted} {t('customers.imported')}, {result.updated} {t('customers.updated_count')}, {result.errors} {t('customers.errors')}
              {result.error_details && result.error_details.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">{t('customers.show_errors')}</summary>
                  <ul className="mt-1 list-disc list-inside">
                    {result.error_details.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.close')}</button>
          {!result && (
            <button onClick={submit} disabled={!file || uploading} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50">
              {uploading ? t('common.loading') : t('customers.upload')}
            </button>
          )}
          {result && (
            <button onClick={onDone} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium">{t('common.close')}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function CustomerCardModal({
  customer,
  onClose,
  onEdit,
}: {
  customer: Customer
  onClose: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const { user, hasFeature, hasFeatureOption } = useAuth()
  const isAdmin = user?.role === 'admin'
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const showInsurance = hasFeature('insurance')
  const showTreatments = hasFeatureOption('customers', 'treatment_reminders')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('customers.customer_card')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <CustomerInfoCard customer={customer} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-slate-500">{t('customers.col_sale_type')}</dt>
            <dd className="text-slate-800">
              {customer.sale_type === 'delivery' ? t('payment.delivery_sale')
                : customer.sale_type === 'digital' ? t('payment.digital_sale')
                : customer.sale_type === 'insurance' ? t('payment.insurance_sale')
                : t('payment.cash_sale')}
            </dd>
            {customer.email && (
              <>
                <dt className="text-slate-500">{t('customers.col_email')}</dt>
                <dd className="text-slate-800 break-all">{customer.email}</dd>
              </>
            )}
            {customer.address_details && (
              <>
                <dt className="text-slate-500">{t('customers.col_address_details')}</dt>
                <dd className="text-slate-800 col-span-1">{customer.address_details}</dd>
              </>
            )}
            {customer.credit_limit != null && Number(customer.credit_limit) > 0 && (
              <>
                <dt className="text-slate-500">{t('customers.col_limit')}</dt>
                <dd className="text-slate-800">{Number(customer.credit_limit).toFixed(2)}</dd>
              </>
            )}
            {customer.region && (
              <>
                <dt className="text-slate-500">{t('customers.col_region')}</dt>
                <dd className="text-slate-800">{regionLabel(customer.region, lang)}</dd>
              </>
            )}
          </dl>
          {(customer.discount_percent != null && Number(customer.discount_percent) > 0) || customer.discount_notes ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">{t('customers.discount_profile')}</div>
              {customer.discount_percent != null && Number(customer.discount_percent) > 0 && (
                <div className="text-emerald-900 font-semibold">{t('customers.discount_percent_value', { pct: Number(customer.discount_percent).toFixed(1) })}</div>
              )}
              {customer.discount_notes && <p className="text-emerald-800 mt-1 whitespace-pre-wrap">{customer.discount_notes}</p>}
              {!isAdmin && <p className="text-[10px] text-emerald-700/80 mt-1">{t('customers.admin_notes_readonly')}</p>}
            </div>
          ) : null}
          {customer.notes && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">{t('customers.admin_notes')}</div>
              <p className="text-slate-700 whitespace-pre-wrap">{customer.notes}</p>
              {!isAdmin && <p className="text-[10px] text-slate-500 mt-1">{t('customers.admin_notes_readonly')}</p>}
            </div>
          )}
          {showTreatments && <CustomerTreatmentPlans customerId={customer.id} />}
          <CustomerStaffNotes customerId={customer.id} />
          {showInsurance && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{t('insurance.title')}</p>
              <CustomerInsuranceProfiles customerId={customer.id} compact />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.close')}</button>
          {isAdmin && (
            <button onClick={onEdit} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700">
              {t('common.edit')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EditModal({ initial, onClose, onSaved }: { initial: Partial<Customer>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { hasFeature } = useAuth()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [f, setF] = useState<Partial<Customer>>(initial)
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(new Set())
  useEffect(() => {
    branchesAPI.list().then((r) => setBranches(r.data)).catch(() => {})
    if (initial.id) {
      customersAPI.branches(initial.id).then((r) => setSelectedBranches(new Set(r.data.map((b) => b.branch_id)))).catch(() => {})
    }
  }, [initial.id])
  const toggleBranch = (bid: number) => {
    const next = new Set(selectedBranches)
    if (next.has(bid)) next.delete(bid); else next.add(bid)
    setSelectedBranches(next)
  }
  const save = async () => {
    if (!f.name?.trim()) { alert(t('customers.name_required')); return }
    if (!isValidPhone(f.phone)) { alert(t('validation.phone_invalid')); return }
    setSaving(true)
    try {
      const payload = { ...f, branch_ids: Array.from(selectedBranches) }
      if (f.id) await customersAPI.updateV2(f.id, payload)
      else await customersAPI.createV2(payload)
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{f.id ? t('customers.edit') : t('customers.new')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[75vh] overflow-auto">
          {f.id && f.name && (
            <CustomerInfoCard customer={f as Customer} showBalance={false} />
          )}
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.col_code')}</label>
            <input value={f.code || ''} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              placeholder={f.id ? undefined : (t('customers.code_auto') as string)}
              className="input mt-1 w-full font-mono" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.col_name')} *</label>
            <input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} className="input mt-1 w-full" />
          </div>
          {f.id && (
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.col_sale_type')}</label>
              <select
                value={f.sale_type || 'cash'}
                onChange={(e) => setF({ ...f, sale_type: e.target.value })}
                className="input mt-1 w-full"
              >
                <option value="cash">{t('payment.cash_sale')}</option>
                <option value="delivery">{t('payment.delivery_sale')}</option>
                <option value="digital">{t('payment.digital_sale')}</option>
                <option value="insurance">{t('payment.insurance_sale')}</option>
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.col_phone')}</label>
              <PhoneField value={f.phone || ''} onChange={(v) => setF({ ...f, phone: v })} />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.col_email')}</label>
              <input value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} className="input mt-1 w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.col_region')}</label>
            <GovernorateRegionSelect value={f.region} onChange={(v) => setF({ ...f, region: v })} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.col_address_details')}</label>
            <input value={f.address_details || ''}
              onChange={(e) => setF({ ...f, address_details: e.target.value })}
              placeholder={t('customers.address_details_placeholder') as string}
              className="input mt-1 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.col_tax')}</label>
              <input value={f.tax_number || ''} onChange={(e) => setF({ ...f, tax_number: e.target.value })} className="input mt-1 w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.col_limit')}</label>
              <input type="number" min={0} step="0.01" value={f.credit_limit ?? 0}
                onChange={(e) => setF({ ...f, credit_limit: Number(e.target.value) })} className="input mt-1 w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('common.notes')}</label>
            <input value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} className="input mt-1 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.discount_percent')}</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={f.discount_percent ?? ''}
                onChange={(e) => setF({ ...f, discount_percent: e.target.value === '' ? null : Number(e.target.value) })}
                className="input mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('customers.discount_notes')}</label>
              <input
                value={f.discount_notes || ''}
                onChange={(e) => setF({ ...f, discount_notes: e.target.value })}
                placeholder={t('customers.discount_notes_placeholder') as string}
                className="input mt-1 w-full"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            {t('common.active')}
          </label>
          <div className="pt-2 border-t">
            <label className="text-xs text-slate-600 font-medium">{t('customers.authorized_branches')}</label>
            <p className="text-[11px] text-slate-500 mb-2">{t('customers.authorized_branches_hint')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedBranches.has(b.id)} onChange={() => toggleBranch(b.id)} />
                  <span>{lang === 'ar' ? b.name_ar : b.name_en}</span>
                </label>
              ))}
            </div>
          </div>
          {f.id && hasFeature('insurance') && (
            <div className="pt-2 border-t">
              <CustomerInsuranceProfiles customerId={f.id} compact />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-pharma-600 text-white font-medium hover:bg-pharma-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatementModal({ data, onClose }: { data: any; onClose: () => void }) {
  const { t } = useTranslation()
  const txns = data.transactions || []
  const stmtAccessors = useMemo(() => ({
    date: (tx: any) => tx.at || '',
    kind: (tx: any) => tx.kind || '',
    reference: (tx: any) => tx.reference || '',
    debit: (tx: any) => Number(tx.debit) || 0,
    credit: (tx: any) => Number(tx.credit) || 0,
    balance: (tx: any) => Number(tx.balance) || 0,
  }), [])
  const { sorted: sortedTxns, sort: stmtSort, toggle: stmtToggle } = useSort(txns, stmtAccessors)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{data.customer.name} — {t('customers.statement')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <div className="mb-4">
            <CustomerInfoCard customer={data.customer} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="date" sort={stmtSort} onToggle={stmtToggle} align="start">{t('customers.col_date')}</SortTh>
                <SortTh k="kind" sort={stmtSort} onToggle={stmtToggle} align="start">{t('customers.col_kind')}</SortTh>
                <SortTh k="reference" sort={stmtSort} onToggle={stmtToggle} align="start">{t('customers.col_reference')}</SortTh>
                <SortTh k="debit" sort={stmtSort} onToggle={stmtToggle} align="end">{t('customers.col_debit')}</SortTh>
                <SortTh k="credit" sort={stmtSort} onToggle={stmtToggle} align="end">{t('customers.col_credit')}</SortTh>
                <SortTh k="balance" sort={stmtSort} onToggle={stmtToggle} align="end">{t('customers.col_balance')}</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortedTxns.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-400">{t('customers.no_txns')}</td></tr>}
              {sortedTxns.map((tx: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs">{tx.at ? formatDateTime(tx.at) : '—'}</td>
                  <td className="px-3 py-2">{tx.kind === 'sale' ? t('customers.kind_sale') : t('customers.kind_payment')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{tx.reference || '—'}</td>
                  <td className="px-3 py-2 text-end text-amber-700">{Number(tx.debit) > 0 ? Number(tx.debit).toFixed(2) : ''}</td>
                  <td className="px-3 py-2 text-end text-emerald-700">{Number(tx.credit) > 0 ? Number(tx.credit).toFixed(2) : ''}</td>
                  <td className="px-3 py-2 text-end font-semibold">{Number(tx.balance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PaymentModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [amount, setAmount] = useState<number>(0)
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [invoiceId, setInvoiceId] = useState<number | ''>('')
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    customersAPI.statement(customer.id).then((r) => {
      const sales = (r.data.transactions as any[]).filter((t) => t.kind === 'sale')
      setOpenInvoices(sales)
    }).catch(() => setOpenInvoices([]))
  }, [customer.id])
  const submit = async () => {
    if (amount <= 0) { alert(t('customers.invalid_amount')); return }
    if (!isAdmin && !invoiceId) { alert(t('customers.invoice_required')); return }
    setSaving(true)
    try {
      await customersAPI.pay(customer.id, {
        amount,
        payment_method: method,
        invoice_id: invoiceId ? Number(invoiceId) : undefined,
        reference: reference || undefined,
        notes: notes || undefined,
      })
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('customers.record_payment')} — {customer.name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <CustomerInfoCard customer={customer} />
          <div>
            <label className="text-xs text-slate-600 font-medium">
              {t('customers.against_invoice')}{!isAdmin && ' *'}
            </label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value ? Number(e.target.value) : '')} className="input mt-1 w-full">
              <option value="">{isAdmin ? t('customers.untied_payment') : '—'}</option>
              {openInvoices.map((inv) => (
                <option key={inv.ref_id} value={inv.ref_id}>
                  {inv.reference} — {Number(inv.debit).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.amount')}</label>
            <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.method')}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="input mt-1 w-full">
              <option value="cash">{t('customers.method_cash')}</option>
              <option value="bank">{t('customers.method_bank')}</option>
              <option value="check">{t('customers.method_check')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('customers.reference')}</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('common.notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1 w-full" />
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={submit} disabled={saving || amount <= 0} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('customers.record_payment')}
          </button>
        </div>
      </div>
    </div>
  )
}
