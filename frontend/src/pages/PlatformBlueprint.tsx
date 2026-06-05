import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, FileText, Video, Download } from 'lucide-react'
import { platformAPI, PlanDef } from '../lib/platform'

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

interface BlueprintData {
  meta: BilingualMeta
  sections: BlueprintSection[]
  pos_video_script: VideoScene[]
  plans: PlanDef[]
  features: { key: string; label: string }[]
  feature_labels_ar: Record<string, string>
}

function fmtLimit(n: number | null | undefined, lang: 'en' | 'ar') {
  if (n == null) return lang === 'ar' ? 'غير محدود' : 'Unlimited'
  return String(n)
}

function sectionsForPlan(all: BlueprintSection[], plan?: PlanDef) {
  const feats = new Set(plan?.features ?? [])
  return all.filter((sec) => {
    if (sec.always_show) return true
    const keys = sec.feature_keys ?? []
    return keys.some((k) => feats.has(k))
  })
}

export default function PlatformBlueprint() {
  const [data, setData] = useState<BlueprintData | null>(null)
  const [tab, setTab] = useState<'document' | 'video'>('document')
  const [pharmacyName, setPharmacyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('')
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    platformAPI.getBlueprint().then((r) => {
      setData(r.data)
      const pro = r.data.plans.find((p: PlanDef) => p.key === 'pro')
      setSelectedPlan(pro?.key || r.data.plans[0]?.key || '')
    }).catch(() => {})
  }, [])

  const plan = data?.plans.find((p) => p.key === selectedPlan)
  const visibleSections = useMemo(
    () => (data ? sectionsForPlan(data.sections, plan) : []),
    [data, plan],
  )

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
              <p className="text-xs text-white/60">Bilingual · chosen plan only</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white">
                {data.plans.map((p) => (
                  <option key={p.key} value={p.key} className="text-slate-900">
                    {p.label} — {p.price_le.toLocaleString()} LE
                  </option>
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
              <button type="button" onClick={() => window.print()}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 flex items-center gap-1.5 font-medium">
                <Printer size={14} /> Print
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="blueprint-print max-w-4xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none">
        {!data ? (
          <div className="text-center text-slate-500 py-20">Loading…</div>
        ) : tab === 'video' ? (
          <VideoScriptView scenes={data.pos_video_script} meta={data.meta} plan={plan} />
        ) : (
          <DocumentView
            meta={data.meta}
            sections={visibleSections}
            plans={data.plans}
            features={data.features}
            featureLabelsAr={data.feature_labels_ar}
            pharmacyName={pharmacyName}
            setPharmacyName={setPharmacyName}
            contactName={contactName}
            setContactName={setContactName}
            contactPhone={contactPhone}
            setContactPhone={setContactPhone}
            selectedPlan={selectedPlan}
            setSelectedPlan={setSelectedPlan}
            docDate={docDate}
            setDocDate={setDocDate}
            plan={plan}
          />
        )}
      </div>
    </div>
  )
}

function DocumentView({
  meta, sections, plans, features, featureLabelsAr,
  pharmacyName, setPharmacyName, contactName, setContactName,
  contactPhone, setContactPhone, selectedPlan, setSelectedPlan, docDate, setDocDate, plan,
}: {
  meta: BilingualMeta
  sections: BlueprintSection[]
  plans: PlanDef[]
  features: { key: string; label: string }[]
  featureLabelsAr: Record<string, string>
  pharmacyName: string; setPharmacyName: (v: string) => void
  contactName: string; setContactName: (v: string) => void
  contactPhone: string; setContactPhone: (v: string) => void
  selectedPlan: string; setSelectedPlan: (v: string) => void
  docDate: string; setDocDate: (v: string) => void
  plan?: PlanDef
}) {
  return (
    <div className="bg-white print:shadow-none shadow-sm border border-slate-200 rounded-2xl print:border-0 print:rounded-none overflow-hidden">
      {/* Cover — bilingual */}
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 text-white px-8 py-10 print:py-8">
        <div className="text-xs uppercase tracking-widest text-indigo-200 mb-2">Fratelanza · {meta.version}</div>
        <h1 className="text-2xl md:text-3xl font-bold">{meta.title_en}</h1>
        <h1 className="text-2xl md:text-3xl font-bold mt-1" dir="rtl">{meta.title_ar}</h1>
        <p className="text-base text-indigo-100 mt-3">{meta.subtitle_en}</p>
        <p className="text-base text-indigo-100" dir="rtl">{meta.subtitle_ar}</p>
        <p className="text-sm text-indigo-200/80 mt-3">{meta.tagline_en}</p>
        <p className="text-sm text-indigo-200/80" dir="rtl">{meta.tagline_ar}</p>
      </div>

      {/* Customer fields */}
      <div className="px-8 py-5 border-b border-slate-200 bg-slate-50 print:bg-white">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Customer details · بيانات العميل</h2>
        <p className="text-[10px] text-slate-400 mb-3 no-print">Fill before printing · املأ قبل الطباعة</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <BilingualField en="Pharmacy name" ar="اسم الصيدلية" printValue={pharmacyName || '________________________'}>
            <input className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} />
          </BilingualField>
          <BilingualField en="Contact person" ar="مسؤول التواصل" printValue={contactName || '________________________'}>
            <input className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </BilingualField>
          <BilingualField en="Phone" ar="الهاتف" printValue={contactPhone || '________________________'}>
            <input className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </BilingualField>
          <BilingualField en="Plan" ar="الباقة" printValue={plan ? `${plan.label} — ${plan.price_le.toLocaleString()} LE` : '—'}>
            <select className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>{p.label} — {p.price_le.toLocaleString()} LE</option>
              ))}
            </select>
          </BilingualField>
          <BilingualField en="Date" ar="التاريخ" printValue={docDate} className="sm:col-span-2">
            <input type="date" className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </BilingualField>
        </div>
      </div>

      {/* Selected plan only */}
      {plan && (
        <div className="px-8 py-4 border-b border-slate-200 blueprint-section">
          <h2 className="text-sm font-bold text-slate-800">Selected plan · الباقة المختارة: {plan.label}</h2>
          <div className="grid grid-cols-3 gap-4 text-sm mt-2">
            <div>
              <span className="text-slate-500 text-xs">Users · مستخدمون</span>
              <div className="font-semibold">{fmtLimit(plan.max_users, 'en')} / {fmtLimit(plan.max_users, 'ar')}</div>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Branches · فروع</span>
              <div className="font-semibold">{fmtLimit(plan.max_branches, 'en')} / {fmtLimit(plan.max_branches, 'ar')}</div>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Price · السعر</span>
              <div className="font-semibold">{plan.price_le.toLocaleString()} LE</div>
            </div>
          </div>
          {plan.features?.length > 0 && (
            <div className="mt-3 text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Modules · الوحدات:</span>{' '}
                {plan.features.map((k) => features.find((f) => f.key === k)?.label || k).join(' · ')}
              </p>
              <p dir="rtl">
                {plan.features.map((k) => featureLabelsAr[k] || k).join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feature sections — bilingual, plan-filtered */}
      <div className="px-8 py-6 space-y-6">
        <p className="text-sm text-slate-600">
          Features included in your selected plan. Check each section reviewed with the customer.
        </p>
        <p className="text-sm text-slate-600" dir="rtl">
          المميزات المشمولة في باقتك المختارة. ضع علامة على كل قسم تمت مراجعته مع العميل.
        </p>
        {sections.map((sec) => (
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

      {/* Signatures — bilingual */}
      <div className="px-8 py-8 border-t-2 border-slate-300 signature-block">
        <h2 className="text-sm font-bold text-slate-800">Customer acknowledgment · إقرار العميل</h2>
        <p className="text-xs text-slate-600 mt-2">
          I confirm I reviewed the feature overview for plan <strong>{plan?.label}</strong> and accept the pricing and modules listed above.
        </p>
        <p className="text-xs text-slate-600 mt-1" dir="rtl">
          أقر بأنني راجعت عرض المميزات لباقة <strong>{plan?.label}</strong> وأوافق على التسعير والوحدات المذكورة أعلاه.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
          <SigBlock en="Customer representative" ar="ممثل الصيدلية" />
          <SigBlock en="Fratelanza representative" ar="ممثل فراتيلانزا" />
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-8">
          © 2026 Fratelanza · © 2026 فراتيلانزا. جميع الحقوق محفوظة.
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

function VideoScriptView({ scenes, meta, plan }: {
  scenes: VideoScene[]
  meta: BilingualMeta
  plan?: PlanDef
}) {
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-indigo-50">
        <h2 className="text-lg font-bold text-slate-900">POS demo video script · سكربت فيديو نقطة البيع</h2>
        <p className="text-sm text-slate-600 mt-1">
          ~11 minutes · full POS walkthrough · bilingual EN/AR · download for offline use
        </p>
        {plan && (
          <p className="text-xs text-indigo-700 mt-2 font-medium">
            Showing all POS capabilities (plan on document: {plan.label})
          </p>
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
      <div className="px-6 py-4 bg-slate-50 text-xs text-slate-500 space-y-1">
        <p>Tip: Record each scene separately at erp.fratelanza.com with a demo pharmacy.</p>
        <p dir="rtl">نصيحة: سجّل كل مشهد على حدة باستخدام حساب تجريبي على النظام.</p>
        <p className="text-[10px] text-slate-400 pt-2">{meta.title_en} · {meta.version}</p>
      </div>
    </div>
  )
}
