import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { customerStaffNotesAPI, type CustomerStaffNote } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/formatDate'

export default function CustomerStaffNotes({ customerId }: { customerId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [notes, setNotes] = useState<CustomerStaffNote[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const load = () => {
    setLoading(true)
    customerStaffNotesAPI.list(customerId)
      .then((r) => setNotes(r.data))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [customerId])

  const addNote = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await customerStaffNotesAPI.add(customerId, body)
      setDraft('')
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (noteId: number) => {
    const body = editDraft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await customerStaffNotesAPI.update(noteId, body)
      setEditingId(null)
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const removeNote = async (noteId: number) => {
    if (!window.confirm(t('customers.staff_note_delete_confirm') as string)) return
    setBusy(true)
    try {
      await customerStaffNotesAPI.remove(noteId)
      load()
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
      <h3 className="text-sm font-bold text-slate-800 mb-2">{t('customers.staff_notes')}</h3>
      <p className="text-[11px] text-slate-500 mb-3">{t('customers.staff_notes_hint')}</p>
      {loading ? (
        <p className="text-xs text-slate-400">{t('common.loading')}</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-400 mb-3">{t('customers.staff_notes_empty')}</p>
      ) : (
        <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className="bg-white border border-slate-200 rounded-lg p-2.5 text-sm">
              {editingId === n.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="input w-full text-sm min-h-[60px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded border border-slate-200">
                      {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => saveEdit(n.id)} disabled={busy} className="text-xs px-2 py-1 rounded bg-pharma-600 text-white">
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-slate-800 whitespace-pre-wrap">{n.body}</p>
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span className="text-[10px] text-slate-400">
                      {n.author_name || '—'} · {formatDateTime(n.created_at)}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => { setEditingId(n.id); setEditDraft(n.body) }} className="p-1 text-slate-400 hover:text-pharma-600" title={t('common.edit') as string}>
                          <Pencil size={12} />
                        </button>
                        <button type="button" onClick={() => removeNote(n.id)} className="p-1 text-slate-400 hover:text-red-600" title={t('common.delete') as string}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('customers.staff_note_placeholder') as string}
          className="input flex-1 text-sm min-h-[56px]"
        />
        <button
          type="button"
          onClick={addNote}
          disabled={busy || !draft.trim()}
          className="self-end inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-pharma-600 text-white text-xs font-semibold disabled:opacity-40"
        >
          <MessageSquarePlus size={14} /> {t('common.add')}
        </button>
      </div>
    </div>
  )
}
