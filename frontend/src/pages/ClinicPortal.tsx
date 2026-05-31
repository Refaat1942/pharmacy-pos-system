import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Stethoscope, Plus, Trash2, Send, CheckCircle2 } from 'lucide-react'
import { clinicPortalAPI, ClinicPortalInfo } from '../lib/api'

interface Row { medicine_name: string; quantity: number; dose: string; note: string }

const emptyRow = (): Row => ({ medicine_name: '', quantity: 1, dose: '', note: '' })

export default function ClinicPortal() {
  const { slug = '', token = '' } = useParams()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [info, setInfo] = useState<ClinicPortalInfo | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  const [branchId, setBranchId] = useState<number | ''>('')
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const [sugg, setSugg] = useState<string[]>([])
  const [suggRow, setSuggRow] = useState<number | null>(null)
  const suggTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggSeq = useRef(0)

  useEffect(() => {
    document.documentElement.dir = isAr ? 'rtl' : 'ltr'
  }, [isAr])

  useEffect(() => {
    clinicPortalAPI.info(slug, token)
      .then((r) => {
        setInfo(r.data)
        if (r.data.branches.length === 1) setBranchId(r.data.branches[0].id)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [slug, token])

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, emptyRow()])
  const removeRow = (i: number) => setRows((rs) => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)

  const onMedicineInput = (i: number, value: string) => {
    setRow(i, { medicine_name: value })
    setSuggRow(i)
    if (suggTimer.current) clearTimeout(suggTimer.current)
    const q = value.trim()
    if (q.length < 2) { setSugg([]); return }
    const seq = ++suggSeq.current
    suggTimer.current = setTimeout(() => {
      clinicPortalAPI.products(slug, token, q)
        .then((r) => {
          if (seq !== suggSeq.current) return
          const names = r.data.map((p) => (isAr ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)))
          setSugg(Array.from(new Set(names.filter(Boolean))))
        })
        .catch(() => { if (seq === suggSeq.current) setSugg([]) })
    }, 250)
  }

  const pickSugg = (i: number, name: string) => {
    setRow(i, { medicine_name: name })
    setSugg([])
    setSuggRow(null)
  }

  const branchName = (b: { name_ar: string; name_en: string }) => (isAr ? b.name_ar : b.name_en)

  const submit = async () => {
    setErr('')
    const items = rows
      .filter((r) => r.medicine_name.trim())
      .map((r) => ({
        medicine_name: r.medicine_name.trim(),
        quantity: Math.max(1, Number(r.quantity) || 1),
        dose: r.dose.trim() || undefined,
        note: r.note.trim() || undefined,
      }))
    if (!branchId) { setErr(t('portal.err_branch') as string); return }
    if (items.length === 0) { setErr(t('portal.err_items') as string); return }
    setSubmitting(true)
    try {
      await clinicPortalAPI.submit(slug, token, {
        branch_id: Number(branchId),
        patient_name: patientName.trim() || undefined,
        patient_phone: patientPhone.trim() || undefined,
        doctor_name: doctorName.trim() || undefined,
        notes: notes.trim() || undefined,
        items,
      })
      setDone(true)
    } catch {
      setErr(t('portal.err_submit') as string)
    } finally { setSubmitting(false) }
  }

  const resetForNew = () => {
    setPatientName(''); setPatientPhone(''); setDoctorName(''); setNotes('')
    setRows([emptyRow()]); setDone(false); setErr('')
  }

  const toggleLang = () => i18n.changeLanguage(isAr ? 'en' : 'ar')

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">{t('common.loading')}</div>
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm text-center">
          <div className="text-3xl mb-3">🔗</div>
          <h1 className="text-lg font-bold text-slate-800 mb-1">{t('portal.invalid_title')}</h1>
          <p className="text-sm text-slate-500">{t('portal.invalid_body')}</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48} />
          <h1 className="text-lg font-bold text-slate-800 mb-1">{t('portal.sent_title')}</h1>
          <p className="text-sm text-slate-500 mb-5">{t('portal.sent_body')}</p>
          <button onClick={resetForNew}
            className="bg-pharma-600 hover:bg-pharma-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
            {t('portal.new_prescription')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="text-pharma-600" size={22} />
            <div>
              <div className="font-bold text-slate-800 leading-tight">{info.clinic.name}</div>
              <div className="text-xs text-slate-400">{t('portal.subtitle')}</div>
            </div>
          </div>
          <button onClick={toggleLang} className="text-xs font-medium text-slate-500 hover:text-pharma-700 border border-slate-200 rounded-lg px-3 py-1.5">
            {isAr ? 'English' : 'العربية'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('portal.details')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('portal.branch')} *</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')} className="input w-full">
                <option value="">{t('portal.choose_branch')}</option>
                {info.branches.map((b) => <option key={b.id} value={b.id}>{branchName(b)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('portal.patient_name')}</label>
              <input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('portal.patient_phone')}</label>
              <input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('portal.doctor_name')}</label>
              <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('portal.notes')}</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">{t('portal.medicines')}</h2>
            <button onClick={addRow} className="text-xs font-medium text-pharma-700 hover:text-pharma-800 inline-flex items-center gap-1 bg-pharma-50 hover:bg-pharma-100 px-2.5 py-1.5 rounded-lg">
              <Plus size={14} /> {t('portal.add_medicine')}
            </button>
          </div>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-6 relative">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('portal.medicine_name')} *</label>
                    <input value={r.medicine_name}
                      onChange={(e) => onMedicineInput(i, e.target.value)}
                      onFocus={() => setSuggRow(i)}
                      onBlur={() => setTimeout(() => setSuggRow((cur) => (cur === i ? null : cur)), 150)}
                      autoComplete="off" className="input w-full" />
                    {suggRow === i && sugg.length > 0 && (
                      <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {sugg.map((name) => (
                          <li key={name}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickSugg(i, name)}
                              className="w-full text-start px-3 py-2 text-sm text-slate-700 hover:bg-pharma-50">
                              {name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('portal.qty')}</label>
                    <input type="number" min={1} value={r.quantity} onChange={(e) => setRow(i, { quantity: Number(e.target.value) })} className="input w-full" />
                  </div>
                  <div className="col-span-8 sm:col-span-4">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('portal.dose')}</label>
                    <input value={r.dose} onChange={(e) => setRow(i, { dose: e.target.value })} className="input w-full" placeholder={t('portal.dose_ph') as string} />
                  </div>
                  <div className="col-span-12 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('portal.item_note')}</label>
                      <input value={r.note} onChange={(e) => setRow(i, { note: e.target.value })} className="input w-full" />
                    </div>
                    <button onClick={() => removeRow(i)} disabled={rows.length === 1}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 mb-0.5">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        <button onClick={submit} disabled={submitting}
          className="w-full bg-pharma-600 hover:bg-pharma-700 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <Send size={18} />
          {submitting ? t('common.saving') : t('portal.send')}
        </button>
      </main>
    </div>
  )
}
