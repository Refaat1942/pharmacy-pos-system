import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, FileText, Video, Download } from 'lucide-react'
import { platformAPI, PlanDef, Tenant } from '../lib/platform'

interface BilingualMeta {
  title_en: string
  title_ar: string
  subtitle_en: string
  subtitle_ar: string
  tagline_en: string
  tagline_ar: string
  version: string
}

interface BlueprintSection {
  id: string
  always_show?: boolean
  feature_keys?: string[]
  title_en: string
  title_ar: string
  summary_en: string
  summary_ar: string
  bullets_en: string[]
  bullets_ar: string[]
}

interface VideoScene {
  time: string
  scene_en: string
  scene_ar: string
  script_en: string
  script_ar: string
  steps_en: string[]
  steps_ar: string[]
}

interface TenantBlueprint {
  id: number
  slug: string
  name: string
  plan_key: string | null
  plan_label: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  features: string[]
  max_users: number | null
  max_branches: number | null
}

interface BlueprintData {
  meta: BilingualMeta
  sections: BlueprintSection[]
  pos_video_script: VideoScene[]
  plans: PlanDef[]
  features: { key: string; label: string }[]
  feature_labels_ar: Record<string, string>
  tenant?: TenantBlueprint
}

const PROSPECT = 'prospect'

function fmtLimit(n: number | null | undefined, lang: 'en' | 'ar') {
  if (n == null) return lang === 'ar' ? 'غير محدود' : 'Unlimited'
  return String(n)
}

function sectionsForFeatures(all: BlueprintSection[], featureKeys: string[]) {
  const feats = new Set(featureKeys)
  return all.filter((sec) => {
    if (sec.always_show) return true
    const keys = sec.feature_keys ?? []
    return keys.some((k) => feats.has(k))
  })
}

function pharmacyTenants(all: Tenant[]) {
  return all.filter((t) => t.schema_name !== 'public')
}

export default function PlatformBlueprint() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [base, setBase] = useState<BlueprintData | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantBlueprint, setTenantBlueprint] = useState<BlueprintData | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [prospectPlan, setProspectPlan] = useState('pro')
  const [tab, setTab] = useState<'document' | 'video'>('document')
  const [pharmacyName, setPharmacyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [downloading, setDownloading] = useState(false)
  const [loadingTenant, setLoadingTenant] = useState(false)

  const loadTenantBlueprint = useCallback(async (tid: number) => {
    setLoadingTenant(true)
    try {
      const { data } = await platformAPI.getBlueprintForTenant(tid)
      setTenantBlueprint(data)
      const t = data.tenant
      if (t) {
        setPharmacyName(t.name || '')
        setContactName(t.contact_name || '')
        setContactPhone(t.contact_phone || '')
      }
    } catch {
      setTenantBlueprint(null)
    } finally {
      setLoadingTenant(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      platformAPI.getBlueprint(),
      platformAPI.listTenants(),
    ]).then(([bp, tn]) => {
      setBase(bp.data)
      const list = pharmacyTenants(tn.data)
      setTenants(list)
      const fromUrl = searchParams.get('tenant')
      if (fromUrl && list.some((t) => String(t.id) === fromUrl)) {
        setSelectedCustomer(fromUrl)
      }
    }).catch(() => {})
  }, [searchParams])

  useEffect(() => {
    if (!selectedCustomer) {
      setTenantBlueprint(null)
      return
    }
    if (selectedCustomer === PROSPECT) {
      setTenantBlueprint(null)
      setPharmacyName('')
      setContactName('')
      setContactPhone('')
      return
    }
    const tid = parseInt(selectedCustomer, 10)
    if (Number.isFinite(tid)) {
      setSearchParams({ tenant: String(tid) }, { replace: true })
      loadTenantBlueprint(tid)
    }
  }, [selectedCustomer, loadTenantBlueprint, setSearchParams])

  const data = tenantBlueprint ?? base
  const tenantInfo = tenantBlueprint?.tenant
  const isProspect = selectedCustomer === PROSPECT

  const prospectPlanDef = base?.plans.find((p) => p.key === prospectPlan)
  const activeFeatures = tenantInfo?.features
    ?? (isProspect ? (prospectPlanDef?.features ?? []) : [])

  const visibleSections = useMemo(() => {
    if (!data) return []
    if (tenantInfo || isProspect) {
      return sectionsForFeatures(data.sections, activeFeatures)
    }
    return []
  }, [data, tenantInfo, isProspect, activeFeatures])

  const planLabel = tenantInfo?.plan_label
    ?? (isProspect ? prospectPlanDef?.label : null)

  const maxUsers = tenantInfo?.max_users ?? (isProspect ? prospectPlanDef?.max_users : null)
  const maxBranches = tenantInfo?.max_branches ?? (isProspect ? prospectPlanDef?.max_branches : null)

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          .blueprint-section { break-inside: avoid; page-break-inside: avoid; }
          .signature-block { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print bg-gradient-to-r from-slate-900 to-indigo-950 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/platform" className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-bold text-sm">Sales Blueprint · مخطط المبيعات</h1>
              <p className="text-xs text-white/60">Choose customer · their actual modules · no pricing</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white max-w-[200px]"
            >
              <option value="" className="text-slate-900">— Choose customer —</option>
              {tenants.map((t) => (
                <option key={t.id} value={String(t.id)} className="text-slate-900">
                  {t.name} ({t.slug})
                </option>
              ))}
              <option value={PROSPECT} className="text-slate-900">Manual prospect (not in system)</option>
            </select>
            {isProspect && base && (
              <select value={prospectPlan} onChange={(e) => setProspectPlan(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white">
                {base.plans.map((p) => (
                  <option key={p.key} value={p.key} className="text-slate-900">{p.label}</option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => setTab('document')}
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${tab === 'document' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>
              <FileText size={14} /> Document
            </button>
            <button type="button" onClick={() => setTab('video')}
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${tab === 'video' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>
              <Video size={14} /> POS video
            </button>
            {tab === 'video' ? (
              <button type="button" disabled={downloading}
                onClick={async () => { setDownloading(true); try { await platformAPI.downloadPosVideoScript() } finally { setDownloading(false) } }}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 font-medium disabled:opacity-50">
                <Download size={14} /> {downloading ? '…' : 'Download'}
              </button>
            ) : (
              <button type="button" onClick={() => window.print()} disabled={!selectedCustomer}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 flex items-center gap-1.5 font-medium disabled:opacity-40">
                <Printer size={14} /> Print
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="blueprint-print max-w-4xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none">
        {!data ? (
          <div className="text-center text-slate-500 py-20">Loading…</div>
        ) : !selectedCustomer ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-600">
            <p className="font-medium text-slate-800">Select a pharmacy customer above</p>
            <p className="text-sm mt-2">The blueprint will list only the modules that customer has enabled.</p>
            <p className="text-sm mt-1" dir="rtl">اختر صيدلية من القائمة — سيظهر فقط ما لديها من مميزات مفعّلة.</p>
          </div>
        ) : loadingTenant && !isProspect ? (
          <div className="text-center text-slate-500 py-20">Loading customer blueprint…</div>
        ) : tab === 'video' ? (
          <VideoScriptView scenes={data.pos_video_script} meta={data.meta} customerName={pharmacyName} />
        ) : (
          <DocumentView
            meta={data.meta}
            sections={visibleSections}
            features={data.features}
            featureLabelsAr={data.feature_labels_ar}
            enabledFeatures={activeFeatures}
            pharmacyName={pharmacyName}
            setPharmacyName={setPharmacyName}
            contactName={contactName}
            setContactName={setContactName}
            contactPhone={contactPhone}
            setContactPhone={setContactPhone}
            docDate={docDate}
            setDocDate={setDocDate}
            planLabel={planLabel}
            maxUsers={maxUsers}
            maxBranches={maxBranches}
            tenantSlug={tenantInfo?.slug}
            readOnlyCustomer={!!tenantInfo}
          />
        )}
      </div>
    </div>
  )
}

function DocumentView({
  meta, sections, features, featureLabelsAr, enabledFeatures,
  pharmacyName, setPharmacyName, contactName, setContactName,
  contactPhone, setContactPhone, docDate, setDocDate,
  planLabel, maxUsers, maxBranches, tenantSlug, readOnlyCustomer,
}: {
  meta: BilingualMeta
  sections: BlueprintSection[]
  features: { key: string; label: string }[]
  featureLabelsAr: Record<string, string>
  enabledFeatures: string[]
  pharmacyName: string; setPharmacyName: (v: string) => void
  contactName: string; setContactName: (v: string) => void
  contactPhone: string; setContactPhone: (v: string) => void
  docDate: string; setDocDate: (v: string) => void
  planLabel: string | null | undefined
  maxUsers: number | null | undefined
  maxBranches: number | null | undefined
  tenantSlug?: string
  readOnlyCustomer: boolean
}) {
  const inputCls = 'w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2'
  const ro = readOnlyCustomer ? ' bg-slate-100 text-slate-700' : ''

  return (
    <div className="bg-white print:shadow-none shadow-sm border border-slate-200 rounded-2xl print:border-0 print:rounded-none overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 text-white px-8 py-10 print:py-8">
        <div className="text-xs uppercase tracking-widest text-indigo-200 mb-2">Fratelanza · {meta.version}</div>
        <h1 className="text-2xl md:text-3xl font-bold">{meta.title_en}</h1>
        <h1 className="text-2xl md:text-3xl font-bold mt-1" dir="rtl">{meta.title_ar}</h1>
        <p className="text-base text-indigo-100 mt-3">{meta.subtitle_en}</p>
        <p className="text-base text-indigo-100" dir="rtl">{meta.subtitle_ar}</p>
      </div>

      <div className="px-8 py-5 border-b border-slate-200 bg-slate-50 print:bg-white">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Customer · العميل</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-2">
          <BilingualField en="Pharmacy name" ar="اسم الصيدلية" printValue={pharmacyName || '________________________'}>
            <input className={inputCls + ro} readOnly={readOnlyCustomer}
              value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} />
          </BilingualField>
          {tenantSlug && (
            <BilingualField en="Pharmacy code" ar="كود الصيدلية" printValue={tenantSlug}>
              <input className={inputCls + ' bg-slate-100'} readOnly value={tenantSlug} />
            </BilingualField>
          )}
          <BilingualField en="Contact person" ar="مسؤول التواصل" printValue={contactName || '________________________'}>
            <input className={inputCls + ro} readOnly={readOnlyCustomer}
              value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </BilingualField>
          <BilingualField en="Phone" ar="الهاتف" printValue={contactPhone || '________________________'}>
            <input className={inputCls + ro} readOnly={readOnlyCustomer}
              value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </BilingualField>
          <BilingualField en="Subscription tier" ar="باقة الاشتراك" printValue={planLabel || '—'}>
            <input className={inputCls + ' bg-slate-100'} readOnly value={planLabel || '—'} />
          </BilingualField>
          <BilingualField en="Date" ar="التاريخ" printValue={docDate}>
            <input type="date" className={inputCls}
              value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </BilingualField>
        </div>
      </div>

      {planLabel && (
        <div className="px-8 py-4 border-b border-slate-200 blueprint-section">
          <h2 className="text-sm font-bold text-slate-800">
            Your subscription · اشتراكك: {planLabel}
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm mt-2">
            <div>
              <span className="text-slate-500 text-xs">Max users · مستخدمون</span>
              <div className="font-semibold">{fmtLimit(maxUsers, 'en')}</div>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Max branches · فروع</span>
              <div className="font-semibold">{fmtLimit(maxBranches, 'en')}</div>
            </div>
          </div>
          {enabledFeatures.length > 0 && (
            <div className="mt-3 text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Your enabled modules · وحداتك المفعّلة:</span></p>
              <p>{enabledFeatures.map((k) => features.find((f) => f.key === k)?.label || k).join(' · ')}</p>
              <p dir="rtl">{enabledFeatures.map((k) => featureLabelsAr[k] || k).join(' · ')}</p>
            </div>
          )}
        </div>
      )}

      <div className="px-8 py-6 space-y-6">
        <p className="text-sm text-slate-600">
          Features enabled for this pharmacy. Check each section you reviewed with the customer.
        </p>
        <p className="text-sm text-slate-600" dir="rtl">
          المميزات المفعّلة لهذه الصيدلية. ضع علامة على كل قسم تمت مراجعته.
        </p>
        {sections.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No feature modules enabled for this customer.
          </p>
        ) : sections.map((sec) => (
          <section key={sec.id} className="blueprint-section border-b border-slate-100 pb-5 last:border-0">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 no-print shrink-0" defaultChecked />
              <span className="hidden print:inline-block w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-bold text-slate-900">{sec.title_en}</h3>
                  <p className="text-sm text-slate-600 mt-0.5">{sec.summary_en}</p>
                  <ul className="mt-2 space-y-1">
                    {sec.bullets_en.map((b, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2">
                        <span className="text-indigo-500 shrink-0">•</span><span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div dir="rtl" className="md:border-s md:border-slate-200 md:ps-4">
                  <h3 className="font-bold text-slate-900">{sec.title_ar}</h3>
                  <p className="text-sm text-slate-600 mt-0.5">{sec.summary_ar}</p>
                  <ul className="mt-2 space-y-1">
                    {sec.bullets_ar.map((b, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2">
                        <span className="text-indigo-500 shrink-0">•</span><span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="px-8 py-8 border-t-2 border-slate-300 signature-block">
        <h2 className="text-sm font-bold text-slate-800">Customer acknowledgment · إقرار العميل</h2>
        <p className="text-xs text-slate-600 mt-2">
          I confirm I reviewed the feature overview for <strong>{pharmacyName || 'this pharmacy'}</strong>
          {planLabel ? <> (tier: <strong>{planLabel}</strong>)</> : null} and accept the modules listed above.
        </p>
        <p className="text-xs text-slate-600 mt-1" dir="rtl">
          أقر بمراجعة عرض المميزات لـ <strong>{pharmacyName || 'هذه الصيدلية'}</strong>
          {planLabel ? <> (الباقة: <strong>{planLabel}</strong>)</> : null} وموافقتي على الوحدات المذكورة.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
          <SigBlock en="Customer representative" ar="ممثل الصيدلية" />
          <SigBlock en="Fratelanza representative" ar="ممثل فراتيلانزا" />
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-8">
          © 2026 Fratelanza · © 2026 فراتيلانزا
        </p>
      </div>
    </div>
  )
}

function SigBlock({ en, ar }: { en: string; ar: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{en}</p>
      <p className="text-xs text-slate-500 mb-6" dir="rtl">{ar}</p>
      <div className="border-b border-slate-400 mb-1 h-8" />
      <p className="text-xs text-slate-500">Signature · التوقيع</p>
      <div className="border-b border-slate-400 mt-6 mb-1 h-6 w-40" />
      <p className="text-xs text-slate-500">Date · التاريخ</p>
    </div>
  )
}

function BilingualField({ en, ar, printValue, className = '', children }: {
  en: string; ar: string; printValue: string; className?: string; children: ReactNode
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-slate-500">{en} · <span dir="rtl">{ar}</span></span>
      <div className="print:hidden mt-0.5">{children}</div>
      <div className="hidden print:block mt-0.5 font-semibold text-slate-900">{printValue}</div>
    </label>
  )
}

function VideoScriptView({ scenes, meta, customerName }: {
  scenes: VideoScene[]
  meta: BilingualMeta
  customerName: string
}) {
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-indigo-50">
        <h2 className="text-lg font-bold text-slate-900">POS demo video script · سكربت فيديو نقطة البيع</h2>
        <p className="text-sm text-slate-600 mt-1">~11 min · bilingual · downloadable</p>
        {customerName && (
          <p className="text-xs text-indigo-700 mt-2 font-medium">Customer: {customerName}</p>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {scenes.map((s, i) => (
          <div key={i} className="px-6 py-5">
            <div className="flex flex-wrap items-baseline gap-2 mb-3">
              <span className="text-xs font-mono font-semibold text-indigo-600">{s.time}</span>
              <span className="text-xs font-bold uppercase text-slate-500">{s.scene_en}</span>
              <span className="text-xs font-bold text-slate-500" dir="rtl">/ {s.scene_ar}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">English</div>
                <p className="text-sm text-slate-800 leading-relaxed">{s.script_en}</p>
                <ul className="mt-2 space-y-0.5">
                  {s.steps_en.map((step, j) => (
                    <li key={j} className="text-xs text-slate-600 flex gap-1.5">
                      <span className="text-indigo-400">{j + 1}.</span>{step}
                    </li>
                  ))}
                </ul>
              </div>
              <div dir="rtl">
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">العربية</div>
                <p className="text-sm text-slate-800 leading-relaxed">{s.script_ar}</p>
                <ul className="mt-2 space-y-0.5">
                  {s.steps_ar.map((step, j) => (
                    <li key={j} className="text-xs text-slate-600 flex gap-1.5">
                      <span className="text-indigo-400">{j + 1}.</span>{step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 bg-slate-50 text-xs text-slate-500">
        <p>{meta.title_en} · {meta.version}</p>
      </div>
    </div>
  )
}
