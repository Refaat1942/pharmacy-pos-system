import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Award, Download, Gift, Loader2, Save, Settings2 } from 'lucide-react'
import Layout from '../components/Layout'
import { loyaltyAPI, LoyaltyCalculateResult, LoyaltyMember, LoyaltySettings, LoyaltyTransaction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { downloadApiExcel } from '../lib/downloadExcel'
import { formatDateTime } from '../lib/formatDate'
import { useSort, SortTh, useQuickFilter, TableFilter } from '../components/DataTable'

type Tab = 'settings' | 'members' | 'transactions'

export default function Loyalty() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<Tab>('members')
  const [status, setStatus] = useState<{ operational: boolean } | null>(null)

  useEffect(() => {
    loyaltyAPI.status().then((r) => setStatus(r.data)).catch(() => setStatus(null))
  }, [])

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Award className="text-pharma-600" />
              {t('loyalty.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{t('loyalty.subtitle')}</p>
          </div>
          {status && (
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              status.operational ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {status.operational ? t('loyalty.status_on') : t('loyalty.status_off')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-2">
          {(['members', 'transactions', 'settings'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-pharma-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t(`loyalty.tab_${key}`)}
            </button>
          ))}
        </div>

        {tab === 'settings' && <SettingsPanel isAdmin={isAdmin} onSaved={() => loyaltyAPI.status().then((r) => setStatus(r.data))} />}
        {tab === 'members' && <MembersPanel isAdmin={isAdmin} />}
        {tab === 'transactions' && <TransactionsPanel isAdmin={isAdmin} />}
      </main>
    </Layout>
  )
}

function SettingsPanel({ isAdmin, onSaved }: { isAdmin: boolean; onSaved: () => void }) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<LoyaltySettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewSale, setPreviewSale] = useState('500')
  const [previewRedeem, setPreviewRedeem] = useState('0')
  const [preview, setPreview] = useState<LoyaltyCalculateResult | null>(null)

  const load = useCallback(() => {
    loyaltyAPI.getSettings().then((r) => setSettings(r.data)).catch(() => setSettings(null))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!settings) return
    const net = parseFloat(previewSale) || 0
    const redeem = parseInt(previewRedeem, 10) || 0
    const timer = setTimeout(() => {
      loyaltyAPI.calculate({ net_total: net, redeem_points: redeem }).then((r) => {
        setPreview(r.data)
      }).catch(() => setPreview(null))
    }, 300)
    return () => clearTimeout(timer)
  }, [settings, previewSale, previewRedeem])

  const save = async () => {
    if (!settings || !isAdmin) return
    setSaving(true)
    try {
      await loyaltyAPI.updateSettings(settings)
      onSaved()
      alert(t('loyalty.saved') as string)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div className="text-slate-400 py-10 text-center">{t('common.loading')}</div>
  }

  const set = <K extends keyof LoyaltySettings>(k: K, v: LoyaltySettings[K]) => {
    setSettings({ ...settings, [k]: v })
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Settings2 size={18} /> {t('loyalty.rules_title')}
        </h2>
        {!isAdmin && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {t('loyalty.admin_only_settings')}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!settings.loyalty_enabled}
            onChange={(e) => set('loyalty_enabled', e.target.checked)}
            disabled={!isAdmin}
          />
          {t('loyalty.enabled')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('loyalty.points_per_egp') as string}>
            <input type="number" min={0} step="0.01" className="input w-full"
              value={settings.loyalty_points_per_egp}
              onChange={(e) => set('loyalty_points_per_egp', Number(e.target.value))}
              disabled={!isAdmin} />
          </Field>
          <Field label={t('loyalty.egp_per_point') as string}>
            <input type="number" min={0} step="0.01" className="input w-full"
              value={settings.loyalty_egp_per_point}
              onChange={(e) => set('loyalty_egp_per_point', Number(e.target.value))}
              disabled={!isAdmin} />
          </Field>
          <Field label={t('loyalty.min_redeem') as string}>
            <input type="number" min={0} step="1" className="input w-full"
              value={settings.loyalty_min_redeem}
              onChange={(e) => set('loyalty_min_redeem', Number(e.target.value))}
              disabled={!isAdmin} />
          </Field>
          <Field label={t('loyalty.min_sale') as string}>
            <input type="number" min={0} step="0.01" className="input w-full"
              value={settings.loyalty_min_sale_egp}
              onChange={(e) => set('loyalty_min_sale_egp', Number(e.target.value))}
              disabled={!isAdmin} />
          </Field>
          <Field label={t('loyalty.max_redeem_pct') as string}>
            <input type="number" min={0} max={100} step="1" className="input w-full"
              value={settings.loyalty_max_redeem_pct}
              onChange={(e) => set('loyalty_max_redeem_pct', Number(e.target.value))}
              disabled={!isAdmin} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!settings.loyalty_earn_on_account}
            onChange={(e) => set('loyalty_earn_on_account', e.target.checked)}
            disabled={!isAdmin}
          />
          {t('loyalty.earn_on_account')}
        </label>
        {isAdmin && (
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t('common.save')}
          </button>
        )}
      </div>

      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl border border-indigo-100 p-5 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Gift size={18} className="text-indigo-600" /> {t('loyalty.calculator_title')}
        </h2>
        <p className="text-xs text-slate-600">{t('loyalty.calculator_hint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('loyalty.preview_sale') as string}>
            <input type="number" min={0} className="input w-full" value={previewSale}
              onChange={(e) => setPreviewSale(e.target.value)} />
          </Field>
          <Field label={t('loyalty.preview_redeem') as string}>
            <input type="number" min={0} className="input w-full" value={previewRedeem}
              onChange={(e) => setPreviewRedeem(e.target.value)} />
          </Field>
        </div>
        {preview && (
          <dl className="grid grid-cols-2 gap-2 text-sm bg-white/80 rounded-lg p-4 border border-indigo-100">
            <dt className="text-slate-500">{t('loyalty.col_max_redeem')}</dt>
            <dd className="font-semibold">{preview.max_redeem_points ?? 0}</dd>
            <dt className="text-slate-500">{t('loyalty.col_discount')}</dt>
            <dd className="font-semibold text-emerald-700">{(preview.loyalty_discount ?? 0).toFixed(2)}</dd>
            <dt className="text-slate-500">{t('loyalty.col_net_after')}</dt>
            <dd className="font-semibold">{(preview.net_after_loyalty ?? 0).toFixed(2)}</dd>
            <dt className="text-slate-500">{t('loyalty.col_earn')}</dt>
            <dd className="font-semibold text-indigo-700">{preview.points_earn ?? 0}</dd>
          </dl>
        )}
      </div>
    </div>
  )
}

function MembersPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation()
  const [list, setList] = useState<LoyaltyMember[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [minPoints, setMinPoints] = useState('')
  const [maxPoints, setMaxPoints] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    loyaltyAPI.members({
      q,
      min_points: minPoints ? Number(minPoints) : undefined,
      max_points: maxPoints ? Number(maxPoints) : undefined,
    })
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [q, minPoints, maxPoints])

  useEffect(() => {
    const id = setTimeout(load, 250)
    return () => clearTimeout(id)
  }, [load])

  const filter = useQuickFilter(list, [
    (m) => m.name,
    (m) => m.code,
    (m) => m.phone,
  ])
  const accessors = useMemo(() => ({
    code: (m: LoyaltyMember) => m.code || '',
    name: (m: LoyaltyMember) => m.name,
    phone: (m: LoyaltyMember) => m.phone || '',
    points: (m: LoyaltyMember) => Number(m.loyalty_points || 0),
    sales: (m: LoyaltyMember) => Number(m.total_sales || 0),
    count: (m: LoyaltyMember) => Number(m.sale_count || 0),
    earned: (m: LoyaltyMember) => Number(m.lifetime_earned || 0),
    last: (m: LoyaltyMember) => m.last_sale_at || '',
  }), [])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  const exportExcel = () => {
    if (!isAdmin) return
    void downloadApiExcel('/loyalty/members/export', `loyalty-members-${new Date().toISOString().slice(0, 10)}.xlsx`, {
      q, min_points: minPoints || undefined, max_points: maxPoints || undefined,
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('loyalty.search_members') as string}
          className="input w-full md:w-72" />
        <input value={minPoints} onChange={(e) => setMinPoints(e.target.value)} placeholder={t('loyalty.min_points') as string}
          className="input w-28" type="number" min={0} />
        <input value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} placeholder={t('loyalty.max_points') as string}
          className="input w-28" type="number" min={0} />
        <TableFilter value={filter.query} onChange={filter.setQuery}
          placeholder={t('common.filter_placeholder') as string} className="w-full md:w-56" />
        {isAdmin && (
          <button onClick={exportExcel} disabled={list.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40 ms-auto">
            <Download size={16} /> {t('loyalty.export_excel')}
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortTh k="code" sort={sort} onToggle={toggle} align="start">{t('customers.col_code')}</SortTh>
              <SortTh k="name" sort={sort} onToggle={toggle} align="start">{t('customers.col_name')}</SortTh>
              <SortTh k="phone" sort={sort} onToggle={toggle} align="start">{t('customers.col_phone')}</SortTh>
              <SortTh k="points" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_points')}</SortTh>
              <SortTh k="sales" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_total_sales')}</SortTh>
              <SortTh k="count" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_sale_count')}</SortTh>
              <SortTh k="earned" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_lifetime_earned')}</SortTh>
              <SortTh k="last" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_last_sale')}</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && sorted.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('loyalty.empty_members')}</td></tr>}
            {sorted.map((m) => (
              <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{m.code || '—'}</td>
                <td className="px-3 py-2 font-medium">{m.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{m.phone || '—'}</td>
                <td className="px-3 py-2 text-end font-bold text-indigo-700">{Number(m.loyalty_points || 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-end">{Number(m.total_sales || 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-end">{m.sale_count ?? 0}</td>
                <td className="px-3 py-2 text-end text-slate-600">{Number(m.lifetime_earned || 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-end text-xs text-slate-500">{m.last_sale_at ? formatDateTime(m.last_sale_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TransactionsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation()
  const [list, setList] = useState<LoyaltyTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    loyaltyAPI.transactions({ q, kind: kind || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined })
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [q, kind, dateFrom, dateTo])

  useEffect(() => {
    const id = setTimeout(load, 250)
    return () => clearTimeout(id)
  }, [load])

  const filter = useQuickFilter(list, [
    (tx) => tx.customer_name,
    (tx) => tx.customer_code,
    (tx) => tx.invoice_number,
    (tx) => tx.kind,
  ])
  const accessors = useMemo(() => ({
    date: (tx: LoyaltyTransaction) => tx.created_at || '',
    customer: (tx: LoyaltyTransaction) => tx.customer_name || '',
    kind: (tx: LoyaltyTransaction) => tx.kind || '',
    points: (tx: LoyaltyTransaction) => Number(tx.points || 0),
    balance: (tx: LoyaltyTransaction) => Number(tx.balance_after || 0),
    invoice: (tx: LoyaltyTransaction) => tx.invoice_number || '',
  }), [])
  const { sorted, sort, toggle } = useSort(filter.filtered, accessors)

  const kindLabel = (k: string) => t(`loyalty.kind_${k}`, k)

  const exportExcel = () => {
    if (!isAdmin) return
    void downloadApiExcel('/loyalty/transactions/export', `loyalty-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`, {
      q, kind: kind || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined,
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('loyalty.search_txns') as string}
          className="input w-full md:w-64" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="input w-36">
          <option value="">{t('loyalty.all_kinds')}</option>
          {['earn', 'redeem', 'adjust', 'reversal', 'restore'].map((k) => (
            <option key={k} value={k}>{kindLabel(k)}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-36" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-36" />
        <TableFilter value={filter.query} onChange={filter.setQuery}
          placeholder={t('common.filter_placeholder') as string} className="w-full md:w-48" />
        {isAdmin && (
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 ms-auto">
            <Download size={16} /> {t('loyalty.export_excel')}
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortTh k="date" sort={sort} onToggle={toggle} align="start">{t('customers.col_date')}</SortTh>
              <SortTh k="customer" sort={sort} onToggle={toggle} align="start">{t('customers.col_name')}</SortTh>
              <SortTh k="kind" sort={sort} onToggle={toggle} align="start">{t('customers.col_kind')}</SortTh>
              <SortTh k="points" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_points')}</SortTh>
              <SortTh k="balance" sort={sort} onToggle={toggle} align="end">{t('loyalty.col_balance_after')}</SortTh>
              <SortTh k="invoice" sort={sort} onToggle={toggle} align="start">{t('customers.col_reference')}</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && sorted.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('loyalty.empty_txns')}</td></tr>}
            {sorted.map((tx) => (
              <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-xs">{tx.created_at ? formatDateTime(tx.created_at) : '—'}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{tx.customer_name}</div>
                  <div className="text-xs text-slate-500 font-mono">{tx.customer_code}</div>
                </td>
                <td className="px-3 py-2 capitalize">{kindLabel(tx.kind)}</td>
                <td className={`px-3 py-2 text-end font-semibold ${tx.points >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {tx.points > 0 ? '+' : ''}{tx.points}
                </td>
                <td className="px-3 py-2 text-end">{tx.balance_after}</td>
                <td className="px-3 py-2 font-mono text-xs">{tx.invoice_number || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600 font-medium">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
