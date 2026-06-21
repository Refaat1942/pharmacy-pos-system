import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Plus, Trash2, Pencil, X } from 'lucide-react'
import {
  customerTreatmentsAPI,
  productsAPI,
  type CustomerTreatmentItem,
  type CustomerTreatmentPlan,
  type Product,
} from '../lib/api'
import { useAuth } from '../lib/auth'

function defaultReminderDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export default function CustomerTreatmentPlans({ customerId }: { customerId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [plans, setPlans] = useState<CustomerTreatmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(t('treatment.default_title') as string)
  const [reminderDate, setReminderDate] = useState(defaultReminderDate())
  const [planNotes, setPlanNotes] = useState('')
  const [items, setItems] = useState<CustomerTreatmentItem[]>([])
  const [productQ, setProductQ] = useState('')
  const [productHits, setProductHits] = useState<Product[]>([])
  const [editId, setEditId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    customerTreatmentsAPI.listForCustomer(customerId)
      .then((r) => setPlans(r.data))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [customerId])

  useEffect(() => {
    if (!productQ.trim()) { setProductHits([]); return }
    const id = setTimeout(() => {
      productsAPI.search(productQ.trim())
        .then((r) => setProductHits((r.data || []).slice(0, 8)))
        .catch(() => setProductHits([]))
    }, 250)
    return () => clearTimeout(id)
  }, [productQ])

  const resetForm = () => {
    setTitle(t('treatment.default_title') as string)
    setReminderDate(defaultReminderDate())
    setPlanNotes('')
    setItems([])
    setProductQ('')
    setEditId(null)
    setShowForm(false)
  }

  const addProduct = (p: Product) => {
    setItems((prev) => [
      ...prev,
      { product_id: p.id, product_name: p.name_en || p.name_ar || `#${p.id}`, quantity: 1 },
    ])
    setProductQ('')
    setProductHits([])
  }

  const savePlan = async () => {
    if (!title.trim() || !reminderDate || items.length === 0) {
      alert(t('treatment.form_incomplete'))
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        next_reminder_date: reminderDate,
        recurrence: 'monthly',
        notes: planNotes.trim() || undefined,
        items,
      }
      if (editId) {
        await customerTreatmentsAPI.update(editId, payload)
      } else {
        await customerTreatmentsAPI.create(customerId, payload)
      }
      resetForm()
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (plan: CustomerTreatmentPlan) => {
    if (!isAdmin) return
    setEditId(plan.id)
    setTitle(plan.title)
    setReminderDate(plan.next_reminder_date)
    setPlanNotes(plan.notes || '')
    setItems(plan.items.map((it) => ({ ...it })))
    setShowForm(true)
  }

  const removePlan = async (planId: number) => {
    if (!window.confirm(t('treatment.delete_confirm') as string)) return
    setBusy(true)
    try {
      await customerTreatmentsAPI.remove(planId)
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Calendar size={15} className="text-pharma-600" /> {t('treatment.plans_title')}
        </h3>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-pharma-700 hover:bg-pharma-50 px-2 py-1 rounded-lg"
          >
            <Plus size={14} /> {t('treatment.add_plan')}
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3">{t('treatment.plans_hint')}</p>

      {showForm && (
        <div className="border border-pharma-200 rounded-lg p-3 mb-3 bg-pharma-50/30 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('treatment.plan_title')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1 w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">{t('treatment.reminder_date')}</label>
              <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className="input mt-1 w-full text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('treatment.add_products')}</label>
            <input
              value={productQ}
              onChange={(e) => setProductQ(e.target.value)}
              placeholder={t('treatment.search_product') as string}
              className="input mt-1 w-full text-sm"
            />
            {productHits.length > 0 && (
              <ul className="mt-1 border border-slate-200 rounded-lg bg-white max-h-36 overflow-y-auto">
                {productHits.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => addProduct(p)} className="w-full text-start px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      {p.name_en || p.name_ar} · {p.barcode || p.id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items.length > 0 && (
            <ul className="space-y-1.5">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                  <input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value) || 1)
                      setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, quantity: q } : row)))
                    }}
                    className="input w-16 text-xs py-1"
                  />
                  <span className="flex-1 truncate">{it.product_name}</span>
                  <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label className="text-xs text-slate-600 font-medium">{t('common.notes')}</label>
            <textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} className="input mt-1 w-full text-sm min-h-[48px]" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200">{t('common.cancel')}</button>
            <button type="button" onClick={savePlan} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-pharma-600 text-white font-semibold disabled:opacity-50">
              {busy ? t('common.saving') : (editId ? t('common.save') : t('treatment.save_plan'))}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">{t('common.loading')}</p>
      ) : plans.length === 0 ? (
        <p className="text-xs text-slate-400">{t('treatment.no_plans')}</p>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <li key={plan.id} className="border border-slate-200 rounded-lg p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-800">{plan.title}</div>
                  <div className="text-[11px] text-slate-500">{t('treatment.next_on', { date: plan.next_reminder_date })}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => startEdit(plan)} className="p-1 text-slate-400 hover:text-pharma-600"><Pencil size={14} /></button>
                    <button type="button" onClick={() => removePlan(plan.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <ul className="mt-1.5 text-xs text-slate-600 space-y-0.5">
                {plan.items.map((it, idx) => (
                  <li key={it.id ?? idx}>{it.quantity}× {it.product_name}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
