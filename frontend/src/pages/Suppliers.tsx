import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Truck, Plus, Edit2, FileText, DollarSign, X, Trash2, Download } from 'lucide-react'
import Layout from '../components/Layout'
import { suppliersAPI, Supplier } from '../lib/api'
import PhoneField from '../components/PhoneField'
import { isValidPhone } from '../lib/phone'
import { useAuth } from '../lib/auth'
import RegionSelect from '../components/RegionSelect'
import { regionLabel } from '../lib/regions'
import { exportCSV } from '../lib/csv'
import i18n from '../lib/i18n'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'

export default function Suppliers() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [list, setList] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null)
  const [statement, setStatement] = useState<any>(null)
  const [paying, setPaying] = useState<Supplier | null>(null)

  const load = () => {
    setLoading(true)
    suppliersAPI
      .list({ q })
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const id = setTimeout(load, 250)
    return () => clearTimeout(id)
  }, [q])

  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  const filter = useQuickFilter(list, [
    (s) => s.name,
    (s) => s.contact_person,
    (s) => s.phone,
    (s) => regionLabel((s as any).region, lang),
  ])
  const accessors = useMemo(() => ({
    name: (s: Supplier) => s.name,
    contact: (s: Supplier) => s.contact_person,
    phone: (s: Supplier) => s.phone,
    region: (s: Supplier) => regionLabel((s as any).region, lang),
    charged: (s: Supplier) => Number(s.total_charged || 0),
    paid: (s: Supplier) => Number(s.total_paid || 0),
    balance: (s: Supplier) => Number(s.balance || 0),
  }), [lang])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  const exportList = () => {
    exportCSV(`suppliers-${new Date().toISOString().slice(0, 10)}.csv`, list, [
      { label: t('suppliers.col_name'), value: (s) => s.name },
      { label: t('suppliers.col_contact'), value: (s) => s.contact_person || '' },
      { label: t('suppliers.col_phone'), value: (s) => s.phone || '' },
      { label: t('suppliers.col_region'), value: (s) => regionLabel(s.region, lang) || '' },
      { label: t('suppliers.col_charged'), value: (s) => Number(s.total_charged || 0).toFixed(2) },
      { label: t('suppliers.col_paid'), value: (s) => Number(s.total_paid || 0).toFixed(2) },
      { label: t('suppliers.col_balance'), value: (s) => Number(s.balance || 0).toFixed(2) },
    ])
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-pharma-600" />
            {t('suppliers.title')}
          </h1>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={exportList} disabled={list.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                <Download size={16} />
                {t('common.export')}
              </button>
              <button
                onClick={() => setEditing({ name: '', active: true })}
                className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Plus size={16} />
                {t('suppliers.new')}
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('suppliers.search_placeholder') as string}
            className="input w-full md:w-96"
          />
          <TableFilter value={filter.query} onChange={filter.setQuery}
            placeholder={t('common.filter_placeholder') as string} className="w-full md:w-64" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh k="name" sort={sort} onToggle={toggle} align="start">{t('suppliers.col_name')}</SortTh>
                <SortTh k="contact" sort={sort} onToggle={toggle} align="start">{t('suppliers.col_contact')}</SortTh>
                <SortTh k="phone" sort={sort} onToggle={toggle} align="start">{t('suppliers.col_phone')}</SortTh>
                <SortTh k="region" sort={sort} onToggle={toggle} align="start">{t('suppliers.col_region')}</SortTh>
                <SortTh k="charged" sort={sort} onToggle={toggle} align="end">{t('suppliers.col_charged')}</SortTh>
                <SortTh k="paid" sort={sort} onToggle={toggle} align="end">{t('suppliers.col_paid')}</SortTh>
                <SortTh k="balance" sort={sort} onToggle={toggle} align="end">{t('suppliers.col_balance')}</SortTh>
                <th className="px-3 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && sorted.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('suppliers.empty')}</td></tr>}
              {sorted.map((s) => {
                const bal = Number(s.balance)
                return (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-slate-600">{s.contact_person || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs">{s.phone || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{regionLabel((s as any).region, i18n.language === 'ar' ? 'ar' : 'en') || '—'}</td>
                    <td className="px-3 py-2 text-end">{Number(s.total_charged).toFixed(2)}</td>
                    <td className="px-3 py-2 text-end">{Number(s.total_paid).toFixed(2)}</td>
                    <td className={`px-3 py-2 text-end font-semibold ${bal > 0 ? 'text-red-700' : bal < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {bal.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => suppliersAPI.statement(s.id).then((r) => setStatement(r.data))}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                          title={t('suppliers.statement') as string}
                        >
                          <FileText size={14} />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setPaying(s)}
                              className="p-1.5 hover:bg-emerald-100 rounded text-emerald-700"
                              title={t('suppliers.record_payment') as string}
                            >
                              <DollarSign size={14} />
                            </button>
                            <button
                              onClick={() => setEditing(s)}
                              className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                              title={t('common.edit') as string}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(t('suppliers.confirm_delete') as string)) return
                                await suppliersAPI.remove(s.id)
                                load()
                              }}
                              className="p-1.5 hover:bg-red-100 rounded text-red-700"
                              title={t('common.delete') as string}
                            >
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

      {editing && (
        <EditModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {statement && (
        <StatementModal data={statement} onClose={() => setStatement(null)} />
      )}
      {paying && (
        <PaymentModal supplier={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load() }} />
      )}
    </Layout>
  )
}

function EditModal({ initial, onClose, onSaved }: { initial: Partial<Supplier>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState<Partial<Supplier>>(initial)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!f.name?.trim()) { alert(t('suppliers.name_required')); return }
    if (!isValidPhone((f as any).phone)) { alert(t('validation.phone_invalid')); return }
    setSaving(true)
    try {
      if (f.id) await suppliersAPI.update(f.id, f)
      else await suppliersAPI.create(f)
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{f.id ? t('suppliers.edit') : t('suppliers.new')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[75vh] overflow-auto">
          {[
            ['name', t('suppliers.col_name')],
            ['contact_person', t('suppliers.col_contact')],
            ['email', t('suppliers.col_email')],
          ].map(([k, label]) => (
            <div key={k as string}>
              <label className="text-xs text-slate-600 font-medium">{label}</label>
              <input
                value={(f as any)[k as string] || ''}
                onChange={(e) => setF({ ...f, [k as string]: e.target.value })}
                className="input mt-1 w-full"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.col_phone')}</label>
            <PhoneField value={(f as any).phone || ''} onChange={(v) => setF({ ...f, phone: v })} />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.col_region')}</label>
            <RegionSelect value={(f as any).region} onChange={(v) => setF({ ...f, ...({ region: v } as any) })} className="mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.col_address_details')}</label>
            <input value={(f as any).address_details || ''}
              onChange={(e) => setF({ ...f, ...({ address_details: e.target.value } as any) })}
              placeholder={t('suppliers.address_details_placeholder') as string}
              className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.col_address')}</label>
            <input value={(f as any).address || ''}
              onChange={(e) => setF({ ...f, address: e.target.value })}
              className="input mt-1 w-full" />
          </div>
          {[
            ['tax_number', t('suppliers.col_tax')],
            ['notes', t('common.notes')],
          ].map(([k, label]) => (
            <div key={k as string}>
              <label className="text-xs text-slate-600 font-medium">{label}</label>
              <input
                value={(f as any)[k as string] || ''}
                onChange={(e) => setF({ ...f, [k as string]: e.target.value })}
                className="input mt-1 w-full"
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            {t('common.active')}
          </label>
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
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{data.supplier.name} — {t('suppliers.statement')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <div className="mb-3 text-sm">
            <span className="text-slate-500">{t('suppliers.col_balance')}: </span>
            <b className={data.balance > 0 ? 'text-red-700' : 'text-emerald-700'}>
              {Number(data.balance).toFixed(2)}
            </b>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('suppliers.col_date')}</th>
                <th className="px-3 py-2 text-start">{t('suppliers.col_kind')}</th>
                <th className="px-3 py-2 text-start">{t('suppliers.col_reference')}</th>
                <th className="px-3 py-2 text-end">{t('suppliers.col_debit')}</th>
                <th className="px-3 py-2 text-end">{t('suppliers.col_credit')}</th>
                <th className="px-3 py-2 text-end">{t('suppliers.col_balance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-400">{t('suppliers.no_txns')}</td></tr>}
              {data.transactions.map((tx: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs">{tx.at ? new Date(tx.at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{tx.kind === 'po' ? t('suppliers.kind_po') : t('suppliers.kind_payment')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{tx.reference || '—'}</td>
                  <td className="px-3 py-2 text-end text-red-700">{Number(tx.debit) > 0 ? Number(tx.debit).toFixed(2) : ''}</td>
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

function PaymentModal({ supplier, onClose, onSaved }: { supplier: Supplier; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<number>(0)
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (amount <= 0) { alert(t('suppliers.invalid_amount')); return }
    setSaving(true)
    try {
      await suppliersAPI.pay(supplier.id, { amount, payment_method: method, reference: reference || undefined, notes: notes || undefined })
      onSaved()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('suppliers.record_payment')} — {supplier.name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-sm">
            <span className="text-slate-500">{t('suppliers.col_balance')}: </span>
            <b className={Number(supplier.balance) > 0 ? 'text-red-700' : ''}>{Number(supplier.balance).toFixed(2)}</b>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.amount')}</label>
            <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.method')}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="input mt-1 w-full">
              <option value="cash">{t('suppliers.method_cash')}</option>
              <option value="bank">{t('suppliers.method_bank')}</option>
              <option value="check">{t('suppliers.method_check')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('suppliers.reference')}</label>
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
            {saving ? t('common.saving') : t('suppliers.record_payment')}
          </button>
        </div>
      </div>
    </div>
  )
}
