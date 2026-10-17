import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, Wand2, CheckCircle2, AlertTriangle } from 'lucide-react'
import api, { formatApiError } from '../lib/api'

export type ImportKind = 'customers' | 'suppliers' | 'purchases'

interface Field { key: string; label_en: string; label_ar: string; required: boolean }
interface Column { index: number; header: string; field: string | null; confidence: string; samples: string[] }
interface Preview {
  sheets: string[]; sheet_index: number; header_row: number; row_count: number
  columns: Column[]; fields: Field[]; preview_rows: string[][]
}
interface Result {
  created: number; updated: number; skipped: number; rows: number; errors: { row: number; error: string }[]
  lines?: number; unmatched_items?: number; suppliers_created?: number
}

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-sky-100 text-sky-800',
  guess: 'bg-amber-100 text-amber-800',
  none: 'bg-slate-100 text-slate-500',
}

/**
 * Import customers / suppliers / old purchase invoices from any program's export.
 * The server finds the header row and matches every column by name and content;
 * the user checks (and can change) the matching before importing.
 */
export default function SmartImportModal({ kind, onClose, onDone }: { kind: ImportKind; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData()
    fd.append('file', file!)
    if (preview) {
      fd.append('sheet_index', String(preview.sheet_index))
      fd.append('header_row', String(preview.header_row))
    }
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v))
    return fd
  }

  const analyze = async (f: File) => {
    setFile(f); setPreview(null); setResult(null); setError(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const { data } = await api.post<Preview>(`/import/${kind}/preview`, fd)
      setPreview(data)
      setMapping(Object.fromEntries(data.columns.filter((c) => c.field).map((c) => [c.index, c.field as string])))
    } catch (e) {
      setError(formatApiError(e, t('smart_import.read_failed') as string))
    } finally { setBusy(false) }
  }

  const setField = (index: number, field: string) => {
    setMapping((m) => {
      const next = { ...m }
      // One column per field: picking a field for this column frees it elsewhere.
      Object.keys(next).forEach((k) => { if (field && next[+k] === field) delete next[+k] })
      if (field) next[index] = field
      else delete next[index]
      return next
    })
  }

  const missing = preview?.fields.filter((f) => f.required && !Object.values(mapping).includes(f.key)) ?? []

  const run = async () => {
    if (!file || !preview || missing.length) return
    setBusy(true); setError('')
    try {
      const { data } = await api.post<Result>(`/import/${kind}`, form({ mapping: JSON.stringify(mapping) }))
      setResult(data)
    } catch (e) {
      setError(formatApiError(e, t('smart_import.import_failed') as string))
    } finally { setBusy(false) }
  }

  const label = (f: Field) => (isAr ? f.label_ar : f.label_en)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><Wand2 size={18} className="text-pharma-600" />{t(`smart_import.title_${kind}`)}</h2>
            <p className="text-xs text-slate-500">{t('smart_import.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4 text-sm">
          {!result && (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-pharma-400 hover:bg-pharma-50/40">
              <Upload size={22} className="text-pharma-600" />
              <span className="font-semibold">{file ? file.name : t('smart_import.choose_file')}</span>
              <span className="text-xs text-slate-500">{t('smart_import.formats')}</span>
              <input type="file" className="hidden" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt,.htm,.html"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyze(f) }} />
            </label>
          )}
          {kind === 'purchases' && !result && (
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">{t('smart_import.purchases_note')}</p>
          )}
          {busy && <p className="text-pharma-700 font-semibold">{t('common.loading')}</p>}
          {error && <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

          {preview && !result && (
            <>
              <p className="text-slate-600">
                {t('smart_import.detected', { rows: preview.row_count, header: preview.header_row, sheet: preview.sheets[preview.sheet_index] })}
              </p>
              <div className="overflow-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('smart_import.col_in_file')}</th>
                      <th className="px-3 py-2 text-start">{t('smart_import.col_samples')}</th>
                      <th className="px-3 py-2 text-start">{t('smart_import.col_field')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.columns.filter((c) => c.header || c.samples.length).map((c) => {
                      const f = mapping[c.index] || ''
                      const conf = f && f === c.field ? c.confidence : f ? 'high' : 'none'
                      return (
                        <tr key={c.index} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold whitespace-nowrap">{c.header || `#${c.index + 1}`}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[260px] truncate" title={c.samples.join(' · ')}>{c.samples.join(' · ')}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <select value={f} onChange={(e) => setField(c.index, e.target.value)}
                                className="border border-slate-300 rounded-md px-2 py-1 bg-white min-w-[170px]">
                                <option value="">{t('smart_import.ignore')}</option>
                                {preview.fields.map((fd) => (
                                  <option key={fd.key} value={fd.key}>{label(fd)}{fd.required ? ' *' : ''}</option>
                                ))}
                              </select>
                              {f && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONF_STYLE[conf]}`}>{t(`smart_import.conf_${conf}`)}</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {missing.length > 0 && (
                <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle size={15} />{t('smart_import.missing', { fields: missing.map(label).join('، ') })}
                </p>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-emerald-800 font-semibold text-base"><CheckCircle2 size={18} />{t('smart_import.done')}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {([
                  [kind === 'purchases' ? 'smart_import.invoices' : 'smart_import.created', result.created],
                  ...(kind === 'purchases'
                    ? [['smart_import.lines', result.lines ?? 0], ['smart_import.unmatched', result.unmatched_items ?? 0],
                       ['smart_import.suppliers_created', result.suppliers_created ?? 0]]
                    : [['smart_import.updated', result.updated], ['smart_import.skipped', result.skipped]]),
                  ['smart_import.errors', result.errors.length],
                ] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">{t(k)}</div>
                    <div className="text-xl font-bold">{v.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              {kind === 'purchases' && (result.unmatched_items ?? 0) > 0 && (
                <p className="text-xs text-slate-600">{t('smart_import.unmatched_hint')}</p>
              )}
              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-xl max-h-48 overflow-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="px-3 py-1.5 text-xs border-b border-red-100 last:border-0">
                      <b>{t('smart_import.row', { n: e.row })}</b> — {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-slate-50 flex justify-end gap-2">
          {result ? (
            <button onClick={onDone} className="px-4 py-2 rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium">{t('common.close')}</button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100">{t('common.cancel')}</button>
              <button onClick={() => void run()} disabled={!preview || busy || missing.length > 0}
                className="px-4 py-2 rounded-lg bg-pharma-600 hover:bg-pharma-700 text-white font-medium disabled:opacity-50">
                {t('smart_import.import_n', { n: preview?.row_count ?? 0 })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
