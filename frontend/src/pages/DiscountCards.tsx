import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard, Plus, Edit2, X } from 'lucide-react'
import Layout from '../components/Layout'
import { discountCardsAPI } from '../lib/api'
import { DEFAULT_CARD_COMPATIBILITY, DEFAULT_CARD_RULES } from '../lib/insurance'
import { useAuth } from '../lib/auth'

type Program = {
  id: number
  name_en: string
  name_ar?: string
  code: string
  card_type: string
  status: string
  rules?: Record<string, unknown>
  compatibility?: Record<string, boolean>
}

type Card = {
  id: number
  program_id: number
  card_number: string
  customer_id?: number
  expiry_date?: string
  status: string
  program_name?: string
}

export default function DiscountCards() {
  const { t } = useTranslation()
  const { hasFeatureOption } = useAuth()
  const canManage = hasFeatureOption('discount_cards', 'manage')
  const [programs, setPrograms] = useState<Program[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [editProgram, setEditProgram] = useState<Partial<Program> | null>(null)
  const [editProgramId, setEditProgramId] = useState<number | null>(null)
  const [editCard, setEditCard] = useState<Partial<Card> & { program_id: number } | null>(null)
  const [editCardId, setEditCardId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    discountCardsAPI.programs().then((r) => setPrograms(r.data)).catch(() => setPrograms([]))
    discountCardsAPI.cards().then((r) => setCards(r.data)).catch(() => setCards([]))
  }, [])

  useEffect(() => { load() }, [load])

  const saveProgram = async () => {
    if (!editProgram?.code || !editProgram.name_en) { setError(t('insurance.required_fields') as string); return }
    setError('')
    const body = {
      ...editProgram,
      rules: editProgram.rules || DEFAULT_CARD_RULES,
      compatibility: editProgram.compatibility || DEFAULT_CARD_COMPATIBILITY,
    }
    try {
      if (editProgramId) await discountCardsAPI.updateProgram(editProgramId, body)
      else await discountCardsAPI.createProgram(body)
      setEditProgram(null)
      load()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Error')
    }
  }

  const saveCard = async () => {
    if (!editCard?.card_number || !editCard.program_id) return
    try {
      if (editCardId) await discountCardsAPI.updateCard(editCardId, editCard)
      else await discountCardsAPI.createCard(editCard)
      setEditCard(null)
      load()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Error')
    }
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6">
          <CreditCard className="text-pharma-600" /> {t('discount_cards.title')}
        </h1>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <section className="mb-8">
          <div className="flex justify-between mb-3">
            <h2 className="font-semibold">{t('discount_cards.programs')}</h2>
            {canManage && (
              <button onClick={() => { setEditProgramId(null); setEditProgram({
                code: '', name_en: '', status: 'active', card_type: 'promotional',
                rules: { ...DEFAULT_CARD_RULES, local_drugs_discount_pct: 10, imported_drugs_discount_pct: 5 },
              }) }}
                className="bg-pharma-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
                <Plus size={14} /> {t('discount_cards.new_program')}
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{t('insurance.col_code')}</th>
                  <th className="px-4 py-2 text-start">{t('insurance.col_name')}</th>
                  <th className="px-4 py-2 text-center">{t('discount_cards.discount_pct')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.local_pct')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.imported_pct')}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2 font-mono">{p.code}</td>
                    <td className="px-4 py-2">{p.name_en}</td>
                    <td className="px-4 py-2 text-center">{(p.rules as { percentage_discount?: number })?.percentage_discount ?? 0}%</td>
                    <td className="px-4 py-2 text-center">{(p.rules as { local_drugs_discount_pct?: number })?.local_drugs_discount_pct ?? 0}%</td>
                    <td className="px-4 py-2 text-center">{(p.rules as { imported_drugs_discount_pct?: number })?.imported_drugs_discount_pct ?? 0}%</td>
                    {canManage && (
                      <td className="px-4 py-2 text-end">
                        <button onClick={() => { setEditProgramId(p.id); setEditProgram({ ...p }) }} className="text-pharma-600 text-xs flex items-center gap-1 ms-auto">
                          <Edit2 size={12} /> {t('common.edit')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="flex justify-between mb-3">
            <h2 className="font-semibold">{t('discount_cards.cards')}</h2>
            {canManage && programs[0] && (
              <button onClick={() => { setEditCardId(null); setEditCard({ program_id: programs[0].id, card_number: '', status: 'active' }) }}
                className="bg-pharma-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
                <Plus size={14} /> {t('discount_cards.new_card')}
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{t('discount_cards.card_number')}</th>
                  <th className="px-4 py-2 text-start">{t('discount_cards.program')}</th>
                  <th className="px-4 py-2 text-center">{t('insurance.col_status')}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2 font-mono">{c.card_number}</td>
                    <td className="px-4 py-2">{c.program_name}</td>
                    <td className="px-4 py-2 text-center">{c.status}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-end">
                        <button onClick={() => { setEditCardId(c.id); setEditCard({ ...c, program_id: c.program_id }) }}
                          className="text-pharma-600 text-xs">{t('common.edit')}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {editProgram && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="flex justify-between mb-4">
                <h2 className="font-bold">{editProgramId ? t('common.edit') : t('discount_cards.new_program')}</h2>
                <button onClick={() => setEditProgram(null)}><X /></button>
              </div>
              <div className="space-y-3">
                <input placeholder={t('insurance.col_code') as string} value={editProgram.code || ''} onChange={(e) => setEditProgram({ ...editProgram, code: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                <input placeholder={t('offers.name_en') as string} value={editProgram.name_en || ''} onChange={(e) => setEditProgram({ ...editProgram, name_en: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <label className="text-xs">
                    <span className="block text-slate-500 mb-1">{t('insurance.local_pct')}</span>
                    <input type="number" min={0} max={100}
                      value={(editProgram.rules as { local_drugs_discount_pct?: number })?.local_drugs_discount_pct ?? 0}
                      onChange={(e) => setEditProgram({ ...editProgram, rules: { ...DEFAULT_CARD_RULES, ...(editProgram.rules || {}), local_drugs_discount_pct: Number(e.target.value), percentage_discount: 0 } })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm text-end" />
                  </label>
                  <label className="text-xs">
                    <span className="block text-slate-500 mb-1">{t('insurance.imported_pct')}</span>
                    <input type="number" min={0} max={100}
                      value={(editProgram.rules as { imported_drugs_discount_pct?: number })?.imported_drugs_discount_pct ?? 0}
                      onChange={(e) => setEditProgram({ ...editProgram, rules: { ...DEFAULT_CARD_RULES, ...(editProgram.rules || {}), imported_drugs_discount_pct: Number(e.target.value), percentage_discount: 0 } })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm text-end" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editProgram.compatibility?.combine_with_insurance ?? false}
                    onChange={(e) => setEditProgram({ ...editProgram, compatibility: { ...DEFAULT_CARD_COMPATIBILITY, combine_with_insurance: e.target.checked } })} />
                  {t('discount_cards.combine_insurance')}
                </label>
              </div>
              <button onClick={saveProgram} className="w-full mt-4 bg-pharma-600 text-white py-2 rounded-lg">{t('common.save')}</button>
            </div>
          </div>
        )}

        {editCard && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="flex justify-between mb-4"><h2 className="font-bold">{t('discount_cards.new_card')}</h2><button onClick={() => setEditCard(null)}><X /></button></div>
              <select value={editCard.program_id} onChange={(e) => setEditCard({ ...editCard, program_id: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm mb-2">
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
              </select>
              <input placeholder={t('discount_cards.card_number') as string} value={editCard.card_number || ''} onChange={(e) => setEditCard({ ...editCard, card_number: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
              <input type="date" value={editCard.expiry_date?.slice(0, 10) || ''} onChange={(e) => setEditCard({ ...editCard, expiry_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <button onClick={saveCard} className="w-full mt-4 bg-pharma-600 text-white py-2 rounded-lg">{t('common.save')}</button>
            </div>
          </div>
        )}
      </main>
    </Layout>
  )
}
