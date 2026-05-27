import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Layers } from 'lucide-react'
import Layout from '../components/Layout'
import api from '../lib/api'

type Row = {
  key: string
  barcode: string | null
  name_en: string
  name_ar: string
  category: string | null
  unit: string
  total_stock: number
  total_min: number
  branches: { branch_id: number; branch_name_en: string; branch_name_ar: string; stock: number; min_stock: number; product_id: number | null }[]
}

type Branch = { id: number; name_en: string; name_ar: string }

export default function BranchesStock() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [data, setData] = useState<{ branches: Branch[]; items: Row[] }>({ branches: [], items: [] })
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/inventory/branch-stock', { params: q ? { q } : {} })
      setData(data)
    } finally { setLoading(false) }
  }
  useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id) }, [q])

  const branchName = (b: { name_en: string; name_ar: string }) => isAr ? b.name_ar : b.name_en

  return (
    <Layout>
      <div className="flex-1 overflow-auto p-6 max-w-screen-2xl mx-auto w-full">
        <div className="mb-5 flex items-center gap-3">
          <div className="bg-pharma-100 text-pharma-700 rounded-xl p-2.5">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('nav.branches_stock')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('inventory.bs_hint')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-64 relative">
              <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('inventory.bs_multi_search_placeholder') as string}
                className="w-full ps-10 pe-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-start">{t('inventory.col_name')}</th>
                    <th className="px-3 py-2.5 text-start">{t('inventory.col_barcode')}</th>
                    {data.branches.map(b => (
                      <th key={b.id} className="px-3 py-2.5 text-center whitespace-nowrap">{branchName(b)}</th>
                    ))}
                    <th className="px-3 py-2.5 text-center bg-slate-100">{t('inventory.bs_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={data.branches.length + 3} className="text-center py-8 text-slate-400">…</td></tr>}
                  {!loading && data.items.length === 0 && (
                    <tr><td colSpan={data.branches.length + 3} className="text-center py-8 text-slate-400">{t('inventory.no_items')}</td></tr>
                  )}
                  {data.items.map(row => (
                    <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800">{isAr ? row.name_ar : row.name_en}</div>
                        {row.category && <div className="text-[11px] text-slate-400">{row.category}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{row.barcode || '—'}</td>
                      {data.branches.map(b => {
                        const cell = row.branches.find(x => x.branch_id === b.id)
                        const stock = cell?.stock ?? 0
                        const min = cell?.min_stock ?? 0
                        const missing = cell?.product_id == null
                        const cls = missing
                          ? 'text-slate-300'
                          : stock <= 0
                            ? 'text-red-600 font-bold'
                            : stock <= min
                              ? 'text-amber-600 font-semibold'
                              : 'text-slate-700'
                        return (
                          <td key={b.id} className={`px-3 py-2.5 text-center font-mono ${cls}`}>
                            {missing ? '—' : stock}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-center font-mono font-bold bg-slate-50">{row.total_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
