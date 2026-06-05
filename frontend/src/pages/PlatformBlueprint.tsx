import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, FileText, Video } from 'lucide-react'
import { platformAPI, PlanDef } from '../lib/platform'
import { COPYRIGHT_EN } from '../lib/branding'

interface BlueprintSection {
  id: string
  title: string
  summary: string
  bullets: string[]
  feature_keys?: string[]
  video_hook?: string
}

interface VideoScene {
  time: string
  scene: string
  script: string
}

interface BlueprintData {
  meta: { title: string; subtitle: string; tagline: string; version: string }
  sections: BlueprintSection[]
  video_script: VideoScene[]
  plans: PlanDef[]
  features: { key: string; label: string }[]
}

function fmtLimit(n: number | null | undefined) {
  return n == null ? 'Unlimited' : String(n)
}

export default function PlatformBlueprint() {
  const [data, setData] = useState<BlueprintData | null>(null)
  const [tab, setTab] = useState<'document' | 'video'>('document')
  const [pharmacyName, setPharmacyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('')
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    platformAPI.getBlueprint().then((r) => {
      setData(r.data)
      if (r.data.plans.length) setSelectedPlan(r.data.plans[0].key)
    }).catch(() => {})
  }, [])

  const plan = data?.plans.find((p) => p.key === selectedPlan)

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

      {/* Toolbar */}
      <div className="no-print bg-gradient-to-r from-slate-900 to-indigo-950 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/platform" className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-bold text-sm">Sales Blueprint</h1>
              <p className="text-xs text-white/60">Print for customer sign-off · use video tab for demos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTab('document')}
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${tab === 'document' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>
              <FileText size={14} /> Document
            </button>
            <button type="button" onClick={() => setTab('video')}
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${tab === 'video' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>
              <Video size={14} /> Video script
            </button>
            <button type="button" onClick={() => window.print()}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 flex items-center gap-1.5 font-medium">
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
      </div>

      <div className="blueprint-print max-w-4xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none">
        {!data ? (
          <div className="text-center text-slate-500 py-20">Loading blueprint…</div>
        ) : tab === 'video' ? (
          <VideoScriptView scenes={data.video_script} meta={data.meta} />
        ) : (
          <DocumentView
            data={data}
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
  data, pharmacyName, setPharmacyName, contactName, setContactName,
  contactPhone, setContactPhone, selectedPlan, setSelectedPlan, docDate, setDocDate, plan,
}: {
  data: BlueprintData
  pharmacyName: string; setPharmacyName: (v: string) => void
  contactName: string; setContactName: (v: string) => void
  contactPhone: string; setContactPhone: (v: string) => void
  selectedPlan: string; setSelectedPlan: (v: string) => void
  docDate: string; setDocDate: (v: string) => void
  plan?: PlanDef
}) {
  const { meta, sections, plans, features } = data

  return (
    <div className="bg-white print:shadow-none shadow-sm border border-slate-200 rounded-2xl print:border-0 print:rounded-none overflow-hidden">
      {/* Cover */}
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 text-white px-8 py-10 print:py-8 print:bg-indigo-800">
        <div className="text-xs uppercase tracking-widest text-indigo-200 mb-2">Fratelanza · {meta.version}</div>
        <h1 className="text-3xl font-bold">{meta.title}</h1>
        <p className="text-lg text-indigo-100 mt-1">{meta.subtitle}</p>
        <p className="text-sm text-indigo-200/80 mt-3 max-w-xl">{meta.tagline}</p>
      </div>

      {/* Customer fields — editable on screen, print as filled values */}
      <div className="px-8 py-5 border-b border-slate-200 bg-slate-50 print:bg-white">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Customer details (fill before printing)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Pharmacy name" printValue={pharmacyName || '________________________'}>
            <input className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} placeholder="e.g. Dr. Mohamed Saber Pharmacy" />
          </Field>
          <Field label="Contact person" printValue={contactName || '________________________'}>
            <input className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Phone" printValue={contactPhone || '________________________'}>
            <input className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </Field>
          <Field label="Proposed plan" printValue={plan?.label || '—'}>
            <select className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>{p.label} — {p.price_le.toLocaleString()} LE</option>
              ))}
            </select>
          </Field>
          <Field label="Document date" printValue={docDate} className="sm:col-span-2">
            <input type="date" className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2"
              value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Selected plan summary */}
      {plan && (
        <div className="px-8 py-4 border-b border-slate-200 blueprint-section">
          <h2 className="text-sm font-bold text-slate-800 mb-2">Selected plan: {plan.label}</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-slate-500 text-xs">Max users</span><div className="font-semibold">{fmtLimit(plan.max_users)}</div></div>
            <div><span className="text-slate-500 text-xs">Max branches</span><div className="font-semibold">{fmtLimit(plan.max_branches)}</div></div>
            <div><span className="text-slate-500 text-xs">Price</span><div className="font-semibold">{plan.price_le.toLocaleString()} LE</div></div>
          </div>
          {plan.features?.length > 0 && (
            <p className="text-xs text-slate-600 mt-2">
              Includes: {plan.features.map((k) => features.find((f) => f.key === k)?.label || k).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Feature sections */}
      <div className="px-8 py-6 space-y-6">
        <p className="text-sm text-slate-600">
          The following modules are included in the Fratelanza Pharmacy ERP platform.
          Check the boxes you have reviewed with the customer before signing below.
        </p>
        {sections.map((sec) => (
          <section key={sec.id} className="blueprint-section border-b border-slate-100 pb-5 last:border-0">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 no-print" defaultChecked />
              <span className="hidden print:inline-block w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">{sec.title}</h3>
                <p className="text-sm text-slate-600 mt-0.5">{sec.summary}</p>
                <ul className="mt-2 space-y-1">
                  {sec.bullets.map((b, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-indigo-500 shrink-0">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Plans comparison */}
      <div className="px-8 py-5 border-t border-slate-200 blueprint-section">
        <h2 className="text-sm font-bold text-slate-800 mb-3">Subscription plans (reference)</h2>
        <table className="w-full text-xs border border-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-start px-3 py-2 border-b">Plan</th>
              <th className="text-center px-3 py-2 border-b">Users</th>
              <th className="text-center px-3 py-2 border-b">Branches</th>
              <th className="text-end px-3 py-2 border-b">Price (LE)</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.key} className={p.key === selectedPlan ? 'bg-indigo-50 font-semibold' : ''}>
                <td className="px-3 py-2 border-b">{p.label}</td>
                <td className="text-center px-3 py-2 border-b">{fmtLimit(p.max_users)}</td>
                <td className="text-center px-3 py-2 border-b">{fmtLimit(p.max_branches)}</td>
                <td className="text-end px-3 py-2 border-b">{p.price_le.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Signatures */}
      <div className="px-8 py-8 border-t-2 border-slate-300 signature-block">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Customer acknowledgment</h2>
        <p className="text-xs text-slate-600 mb-6">
          I confirm that I have reviewed the Fratelanza Pharmacy ERP feature overview above.
          I understand the proposed plan, pricing, and that my pharmacy will receive a dedicated
          isolated system with the modules listed for my subscription tier.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-slate-500 mb-8">Customer / pharmacy representative</p>
            <div className="border-b border-slate-400 mb-1 h-8" />
            <p className="text-xs text-slate-500">Signature</p>
            <div className="border-b border-slate-400 mt-6 mb-1 h-6 w-40" />
            <p className="text-xs text-slate-500">Date</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-8">Fratelanza representative</p>
            <div className="border-b border-slate-400 mb-1 h-8" />
            <p className="text-xs text-slate-500">Signature</p>
            <div className="border-b border-slate-400 mt-6 mb-1 h-6 w-40" />
            <p className="text-xs text-slate-500">Date</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-8">{COPYRIGHT_EN}</p>
      </div>
    </div>
  )
}

function Field({ label, printValue, className = '', children }: {
  label: string; printValue: string; className?: string; children: ReactNode
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <div className="print:hidden mt-0.5">{children}</div>
      <div className="hidden print:block mt-0.5 font-semibold text-slate-900">{printValue}</div>
    </label>
  )
}

function VideoScriptView({ scenes, meta }: { scenes: VideoScene[]; meta: BlueprintData['meta'] }) {
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-indigo-50">
        <h2 className="text-lg font-bold text-slate-900">Demo video script · ~6 minutes</h2>
        <p className="text-sm text-slate-600 mt-1">
          Use this outline when recording a sales video for {meta.title}. Record each scene separately for easier editing.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {scenes.map((s, i) => (
          <div key={i} className="px-6 py-4 flex gap-4">
            <div className="shrink-0 w-20 text-xs font-mono font-semibold text-indigo-600 pt-0.5">{s.time}</div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{s.scene}</div>
              <p className="text-sm text-slate-800 mt-1 leading-relaxed">{s.script}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 bg-slate-50 text-xs text-slate-500">
        Tip: Screen-record the live system at erp.fratelanza.com using a demo pharmacy account.
        Add Arabic captions for local audience.
      </div>
    </div>
  )
}
