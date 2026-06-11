import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, Edit2, Trash2, X, Search } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'
import { productsAPI, type Product } from '../lib/api'
import type { PromoOffer, OfferType } from '../lib/offerEngine'
import { offerTypeLabel } from '../lib/offerEngine'
import i18n from '../lib/i18n'
import { useAuth } from '../lib/auth'

const OFFER_TYPES: OfferType[] = ['second_half', 'bogo', 'buy2get1', 'direct_percent', 'direct_amount']

type OfferForm = {
  name_en: string
  name_ar: string
  offer_type: OfferType
  discount_percent: number
  discount_amount: number
  priority: number
  active: boolean
  valid_from: string
  valid_to: string
  product_ids: number[]
}

const emptyForm = (): OfferForm => ({
  name_en: '',
  name_ar: '',
  offer_type: 'bogo',
  discount_percent: 50,
  discount_amount: 0,
  priority: 0,
  active: true,
  valid_from: '',
  valid_to: '',
  product_ids: [],
})

export default function Offers() {
  const { t } = useTranslation()
  const { hasFeatureOption } = useAuth()
  const canManage = hasFeatureOption('offers', 'manage')
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [list, setList] = useState<PromoOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<OfferForm | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [productQ, setProductQ] = useState('')
  const [productHits, setProductHits] = useState<Product[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.get<PromoOffer[]>('/offers')
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!productQ.trim()) { setProductHits([]); return }
    const tmr = setTimeout(() => {
      productsAPI.search(productQ.trim()).then((r) => setProductHits(r.data.slice(0, 12))).catch(() => setProductHits([]))
    }, 200)
    return () => clearTimeout(tmr)
  }, [productQ])

  const selectedProducts = useMemo(() => {
    if (!editing) return []
    const ids = new Set(editing.product_ids)
    const fromOffer = list.flatMap((o) => o.products || []).filter((p) => ids.has(p.id))
    const map = new Map(fromOffer.map((p) => [p.id, p]))
    productHits.forEach((p) => { if (ids.has(p.id)) map.set(p.id, p) })
    return editing.product_ids.map((id) => map.get(id)).filter(Boolean) as Product[]
  }, [editing, list, productHits])

  const openNew = () => { setEditId(null); setEditing(emptyForm()); setError('') }
  const openEdit = (o: PromoOffer) => {
    setEditId(o.id)
    setEditing({
      name_en: o.name_en,
      name_ar: o.name_ar || '',
      offer_type: o.offer_type,
      discount_percent: Number(o.discount_percent ?? 50),
      discount_amount: Number(o.discount_amount ?? 0),
      priority: o.priority ?? 0,
      active: o.active,
      valid_from: o.valid_from?.slice(0, 10) || '',
      valid_to: o.valid_to?.slice(0, 10) || '',
      product_ids: [...(o.product_ids || [])],
    })
    setError('')
  }

  const save = async () => {
    if (!editing) return
    if (!editing.name_en.trim()) { setError(t('offers.name_required') as string); return }
    if (!editing.product_ids.length) { setError(t('offers.products_required') as string); return }
    setError('')
    const body = {
      ...editing,
      valid_from: editing.valid_from || null,
      valid_to: editing.valid_to || null,
      branch_ids: null,
    }
    try {
      if (editId) await api.put(`/offers/${editId}`, body)
      else await api.post('/offers', body)
      setEditing(null)
      load()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Error')
    }
  }

  const remove = async (id: number) => {
    if (!confirm(t('offers.confirm_delete') as string)) return
    await api.delete(`/offers/${id}`)
    load()
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="text-pharma-600" />
              {t('offers.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{t('offers.subtitle')}</p>
          </div>
          {canManage && (
            <button onClick={openNew} className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus size={16} /> {t('offers.new')}
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-start">{t('offers.col_name')}</th>
                <th className="px-4 py-2 text-start">{t('offers.col_type')}</th>
                <th className="px-4 py-2 text-center">{t('offers.col_items')}</th>
                <th className="px-4 py-2 text-center">{t('offers.col_active')}</th>
                <th className="px-4 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center py-10 text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">{t('offers.empty')}</td></tr>}
              {list.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{lang === 'ar' ? (o.name_ar || o.name_en) : o.name_en}</td>
                  <td className="px-4 py-3 text-slate-600">{offerTypeLabel(o.offer_type, lang)}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{o.product_ids?.length || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      {o.active ? t('common.active') : t('offers.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    {canManage && (
                      <>
                        <button onClick={() => openEdit(o)} className="p-1.5 hover:bg-slate-100 rounded text-slate-600"><Edit2 size={14} /></button>
                        <button onClick={() => remove(o.id)} className="p-1.5 hover:bg-red-100 rounded text-red-700"><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex justify-between items-center">
              <h2 className="font-bold text-lg">{editId ? t('offers.edit') : t('offers.new')}</h2>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">{t('offers.name_en')}</span>
                  <input className="input mt-1 w-full" value={editing.name_en} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">{t('offers.name_ar')}</span>
                  <input className="input mt-1 w-full" value={editing.name_ar} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">{t('offers.col_type')}</span>
                <select className="input mt-1 w-full" value={editing.offer_type} onChange={(e) => setEditing({ ...editing, offer_type: e.target.value as OfferType })}>
                  {OFFER_TYPES.map((ot) => (
                    <option key={ot} value={ot}>{offerTypeLabel(ot, lang)}</option>
                  ))}
                </select>
              </label>
              {(editing.offer_type === 'second_half' || editing.offer_type === 'direct_percent') && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">{t('offers.discount_percent')}</span>
                  <input type="number" min={0} max={100} className="input mt-1 w-full" value={editing.discount_percent}
                    onChange={(e) => setEditing({ ...editing, discount_percent: parseFloat(e.target.value) || 0 })} />
                </label>
              )}
              {editing.offer_type === 'direct_amount' && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">{t('offers.discount_amount')}</span>
                  <input type="number" min={0} className="input mt-1 w-full" value={editing.discount_amount}
                    onChange={(e) => setEditing({ ...editing, discount_amount: parseFloat(e.target.value) || 0 })} />
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">{t('offers.valid_from')}</span>
                  <input type="date" className="input mt-1 w-full" value={editing.valid_from} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">{t('offers.valid_to')}</span>
                  <input type="date" className="input mt-1 w-full" value={editing.valid_to} onChange={(e) => setEditing({ ...editing, valid_to: e.target.value })} />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <span>{t('offers.col_active')}</span>
              </label>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">{t('offers.pick_products')}</p>
                <div className="relative mb-2">
                  <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input w-full ps-10" placeholder={t('offers.search_products') as string} value={productQ} onChange={(e) => setProductQ(e.target.value)} />
                </div>
                {productHits.length > 0 && (
                  <div className="border rounded-lg mb-2 max-h-40 overflow-y-auto">
                    {productHits.map((p) => (
                      <button key={p.id} type="button" className="w-full text-start px-3 py-2 text-sm hover:bg-pharma-50 border-b last:border-0"
                        onClick={() => {
                          if (!editing.product_ids.includes(p.id)) {
                            setEditing({ ...editing, product_ids: [...editing.product_ids, p.id] })
                          }
                          setProductQ('')
                          setProductHits([])
                        }}>
                        {lang === 'ar' ? (p.name_ar || p.name_en) : p.name_en} <span className="text-slate-400 font-mono text-xs">{p.barcode}</span>
                      </button>
                    ))}
                  </div>
                )}
                <ul className="space-y-1">
                  {selectedProducts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="truncate">{lang === 'ar' ? (p.name_ar || p.name_en) : p.name_en}</span>
                      <button type="button" onClick={() => setEditing({ ...editing, product_ids: editing.product_ids.filter((id) => id !== p.id) })}
                        className="text-red-600 text-xs font-semibold">{t('pos.remove')}</button>
                    </li>
                  ))}
                </ul>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-slate-200">{t('common.cancel')}</button>
              <button onClick={() => void save()} className="px-4 py-2 rounded-lg bg-pharma-600 text-white font-medium">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
