import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, ShoppingCart, RotateCcw, AlertTriangle, Package,
  Calendar as CalendarIcon, Users, BarChart3, Loader2, Percent, DollarSign,
  Building2,
} from 'lucide-react'
import Layout from '../components/Layout'
import i18n from '../lib/i18n'
import api, { branchesAPI, dashboardAPI } from '../lib/api'
import type {
  DashboardSummary, SalesSeriesPoint, TopProduct, TopSeller, DashboardAlerts, PnlSummary,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Branch } from '../lib/api'

type Period = 'today' | 'month' | 'year'
const todayStr = () => new Date().toISOString().slice(0, 10)
const monthStartStr = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
const yearStartStr = () => { const d = new Date(); return `${d.getFullYear()}-01-01` }
function periodRange(p: Period): { date_from: string; date_to: string } {
  const to = todayStr()
  if (p === 'today') return { date_from: to, date_to: to }
  if (p === 'month') return { date_from: monthStartStr(), date_to: to }
  return { date_from: yearStartStr(), date_to: to }
}

function dashboardBranchHeaders(branchFilter: string, isAdmin: boolean) {
  if (!isAdmin) return {}
  return {
    headers: {
      'X-Active-Branch': branchFilter ? String(branchFilter) : 'all',
    },
  }
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const lang = i18n.language
  const isAdmin = user?.role === 'admin'

  const [branchFilter, setBranchFilter] = useState('')
  const [allBranches, setAllBranches] = useState<Branch[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [series, setSeries] = useState<SalesSeriesPoint[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topSellers, setTopSellers] = useState<TopSeller[]>([])
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('month')
  const [pnl, setPnl] = useState<PnlSummary | null>(null)
  const [pnlLoading, setPnlLoading] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    branchesAPI.list().then((r) => setAllBranches(r.data)).catch(() => setAllBranches([]))
  }, [isAdmin])

  const branchScopeLabel = useMemo(() => {
    if (!isAdmin) {
      const b = allBranches.find((x) => x.id === user?.branch_id)
      if (b) return lang === 'ar' ? b.name_ar : b.name_en
      return ''
    }
    if (!branchFilter) return t('dashboard.all_branches')
    const b = allBranches.find((x) => String(x.id) === branchFilter)
    return b ? (lang === 'ar' ? b.name_ar : b.name_en) : ''
  }, [isAdmin, branchFilter, allBranches, user?.branch_id, lang, t])

  const branchCfg = () => dashboardBranchHeaders(branchFilter, isAdmin)

  const loadAll = () => {
    setLoading(true)
    const cfg = branchCfg()
    Promise.all([
      dashboardAPI.summary(cfg),
      dashboardAPI.series(7, cfg),
      dashboardAPI.topProducts(5, 30, cfg),
      dashboardAPI.topSellers(3, 30, cfg),
      dashboardAPI.alerts(cfg),
    ])
      .then(([s, sr, tp, ts, al]) => {
        setSummary(s.data)
        setSeries(sr.data)
        setTopProducts(tp.data)
        setTopSellers(ts.data)
        setAlerts(al.data)
      })
      .finally(() => setLoading(false))
  }

  const loadPnl = (p: Period) => {
    setPnlLoading(true)
    api
      .get<PnlSummary>('/reports/pnl', {
        params: periodRange(p),
        ...branchCfg(),
      })
      .then((r) => setPnl(r.data))
      .catch(() => setPnl(null))
      .finally(() => setPnlLoading(false))
  }

  useEffect(() => {
    if (!isAdmin && user?.branch_id && allBranches.length === 0) {
      branchesAPI.list().then((r) => setAllBranches(r.data)).catch(() => {})
    }
  }, [isAdmin, user?.branch_id, allBranches.length])

  useEffect(() => {
    loadAll()
    loadPnl(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter, isAdmin])

  useEffect(() => {
    loadPnl(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const egp = t('sales.egp')

  const maxSales = Math.max(1, ...series.map((p) => p.sales))

  const fmtDay = (d: string) =>
    new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'short', day: 'numeric',
    })

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.subtitle')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {isAdmin && (
                <div className="min-w-[11rem]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block flex items-center gap-1 mb-1">
                    <Building2 size={11} />
                    {t('dashboard.filter_branch')}
                  </label>
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="input text-sm w-full min-w-[11rem]"
                  >
                    <option value="">{t('dashboard.all_branches')}</option>
                    {allBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {lang === 'ar' ? b.name_ar : b.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={() => { loadAll(); loadPnl(period) }}
                className="text-sm text-pharma-700 hover:text-pharma-800 font-semibold px-3 py-2"
              >
                {t('common.refresh')}
              </button>
            </div>
          </div>

          {branchScopeLabel && (
            <p className="text-sm text-gray-600 -mt-2">
              <span className="font-medium text-gray-500">{t('dashboard.scope_hint')}:</span>{' '}
              <span className="inline-flex items-center gap-1.5 bg-pharma-50 text-pharma-800 border border-pharma-100 rounded-lg px-2.5 py-1 font-semibold">
                <Building2 size={14} />
                {branchScopeLabel}
              </span>
            </p>
          )}

          {loading && !summary ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 size={24} className="animate-spin me-2" />
              {t('common.loading')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  icon={<TrendingUp size={18} />}
                  label={t('dashboard.today_sales')}
                  value={`${egp} ${(summary?.today_sales ?? 0).toFixed(2)}`}
                  tone="pharma"
                />
                <KpiCard
                  icon={<ShoppingCart size={18} />}
                  label={t('dashboard.invoice_count')}
                  value={String(summary?.invoice_count ?? 0)}
                  tone="blue"
                />
                <KpiCard
                  icon={<RotateCcw size={18} />}
                  label={t('dashboard.returns_total')}
                  value={`${egp} ${(summary?.returns_total ?? 0).toFixed(2)}`}
                  tone="amber"
                />
                <KpiCard
                  icon={<BarChart3 size={18} />}
                  label={t('dashboard.net_sales')}
                  value={`${egp} ${(summary?.net_sales ?? 0).toFixed(2)}`}
                  tone="green"
                />
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                    <Percent size={16} className="text-emerald-600" />
                    {t('dashboard.profit_margin')}
                  </h2>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(['today', 'month', 'year'] as Period[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                          period === p ? 'bg-white text-pharma-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {t(`dashboard.period_${p}`)}
                      </button>
                    ))}
                  </div>
                </div>
                {pnlLoading && !pnl ? (
                  <div className="flex items-center justify-center py-6 text-gray-400">
                    <Loader2 size={18} className="animate-spin me-2" />
                    {t('common.loading')}
                  </div>
                ) : !pnl || pnl.net_revenue <= 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">{t('common.no_data')}</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard
                      icon={<DollarSign size={18} />}
                      label={t('dashboard.net_revenue')}
                      value={`${egp} ${pnl.net_revenue.toFixed(2)}`}
                      tone="blue"
                    />
                    <KpiCard
                      icon={<Package size={18} />}
                      label={t('dashboard.cogs')}
                      value={`${egp} ${pnl.cogs.toFixed(2)}`}
                      tone="amber"
                    />
                    <KpiCard
                      icon={<TrendingUp size={18} />}
                      label={t('dashboard.gross_profit')}
                      value={`${egp} ${pnl.gross_profit.toFixed(2)}`}
                      tone="green"
                    />
                    <KpiCard
                      icon={<Percent size={18} />}
                      label={t('dashboard.margin_pct')}
                      value={`${pnl.margin_pct.toFixed(2)}%`}
                      tone="pharma"
                    />
                  </div>
                )}
              </div>

              {alerts && (alerts.expired_count > 0 || alerts.near_expiry_count > 0 ||
                          alerts.low_stock_count > 0 || alerts.returns_high) && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
                  <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={16} className="text-amber-500" />
                    {t('dashboard.alerts')}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {alerts.expired_count > 0 && (
                      <AlertRow tone="red" icon={<CalendarIcon size={14} />}
                        text={`${alerts.expired_count} ${t('dashboard.alert_expired')}`} />
                    )}
                    {alerts.near_expiry_count > 0 && (
                      <AlertRow tone="amber" icon={<CalendarIcon size={14} />}
                        text={`${alerts.near_expiry_count} ${t('dashboard.alert_near_expiry')}`} />
                    )}
                    {alerts.low_stock_count > 0 && (
                      <AlertRow tone="amber" icon={<Package size={14} />}
                        text={`${alerts.low_stock_count} ${t('dashboard.alert_low_stock')}`} />
                    )}
                    {alerts.returns_high && (
                      <AlertRow tone="red" icon={<RotateCcw size={14} />}
                        text={`${t('dashboard.alert_high_returns')} (${(alerts.returns_ratio * 100).toFixed(1)}%)`} />
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-bold text-gray-700 mb-4">{t('dashboard.last_7_days')}</h2>
                <div className="flex items-end gap-3 h-48">
                  {series.map((p) => {
                    const h = (p.sales / maxSales) * 100
                    return (
                      <div key={p.date} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-[10px] font-semibold text-gray-500 tabular-nums">
                          {p.sales > 0 ? p.sales.toFixed(0) : ''}
                        </div>
                        <div className="w-full bg-gray-100 rounded-t-md flex-1 flex flex-col justify-end">
                          <div
                            className="w-full bg-gradient-to-t from-pharma-600 to-pharma-400 rounded-t-md transition-all"
                            style={{ height: `${h}%`, minHeight: p.sales > 0 ? '4px' : '0' }}
                            title={`${p.date}: ${p.sales}`}
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">
                          {fmtDay(p.date)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Package size={16} className="text-pharma-600" />
                    {t('dashboard.top_products')}
                  </h2>
                  {topProducts.length === 0 ? (
                    <p className="text-xs text-gray-400 py-6 text-center">{t('common.no_data')}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase text-gray-400 border-b">
                          <th className="text-start py-2 font-semibold">#</th>
                          <th className="text-start py-2 font-semibold">{t('dashboard.product')}</th>
                          <th className="text-end py-2 font-semibold">{t('dashboard.qty')}</th>
                          <th className="text-end py-2 font-semibold">{t('dashboard.revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((p, idx) => (
                          <tr key={p.id} className="border-b border-gray-50">
                            <td className="py-2 text-gray-400 text-xs tabular-nums">{idx + 1}</td>
                            <td className="py-2 text-gray-800 font-medium">
                              {lang === 'ar' ? p.name_ar : p.name_en}
                            </td>
                            <td className="py-2 text-end font-bold tabular-nums">{p.qty}</td>
                            <td className="py-2 text-end text-pharma-700 tabular-nums">
                              {egp} {p.revenue.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Users size={16} className="text-pharma-600" />
                    {t('dashboard.top_sellers')}
                  </h2>
                  {topSellers.length === 0 ? (
                    <p className="text-xs text-gray-400 py-6 text-center">{t('common.no_data')}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase text-gray-400 border-b">
                          <th className="text-start py-2 font-semibold">#</th>
                          <th className="text-start py-2 font-semibold">{t('dashboard.seller')}</th>
                          <th className="text-end py-2 font-semibold">{t('dashboard.invoices')}</th>
                          <th className="text-end py-2 font-semibold">{t('dashboard.sales')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topSellers.map((s, idx) => (
                          <tr key={s.id} className="border-b border-gray-50">
                            <td className="py-2 text-gray-400 text-xs tabular-nums">{idx + 1}</td>
                            <td className="py-2 text-gray-800 font-medium">
                              {lang === 'ar' ? s.name_ar : s.name_en}
                            </td>
                            <td className="py-2 text-end tabular-nums">{s.invoices}</td>
                            <td className="py-2 text-end text-pharma-700 font-bold tabular-nums">
                              {egp} {s.sales.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}

function KpiCard({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string;
  tone: 'pharma' | 'blue' | 'amber' | 'green';
}) {
  const tones: Record<string, string> = {
    pharma: 'bg-pharma-50 border-pharma-200 text-pharma-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1 opacity-80">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function AlertRow({ tone, icon, text }: { tone: 'red' | 'amber'; icon: React.ReactNode; text: string }) {
  const tones: Record<string, string> = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }
  return (
    <div className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm font-medium ${tones[tone]}`}>
      {icon}
      <span>{text}</span>
    </div>
  )
}
