import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stethoscope, Plus, Edit2, RefreshCw, Copy, Check, Link as LinkIcon, X } from 'lucide-react'
import Layout from '../components/Layout'
import { clinicsAPI, Clinic } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function Clinics() {
  const { t } = useTranslation()
  const { user, tenant } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [list, setList] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Partial<Clinic> | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    clinicsAPI.list()
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const linkFor = (c: Clinic) =>
    `${window.location.origin}/rx/${tenant?.slug || ''}/${c.portal_token}`

  const copyLink = async (c: Clinic) => {
    try {
      await navigator.clipboard.writeText(linkFor(c))
      setCopied(c.id)
      setTimeout(() => setCopied(null), 1800)
    } catch { /* ignore */ }
  }

  const save = async () => {
    if (!editing || !editing.name?.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: editing.name.trim(),
        phone: editing.phone || undefined,
        notes: editing.notes || undefined,
        active: editing.active ?? true,
      }
      if (editing.id) await clinicsAPI.update(editing.id, payload)
      else await clinicsAPI.create(payload)
      setEditing(null)
      load()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const regenerate = async (c: Clinic) => {
    if (!window.confirm(t('clinics.regenerate_confirm') as string)) return
    await clinicsAPI.regenerate(c.id)
    load()
  }

  if (!isAdmin) {
    return (
      <Layout>
        <main className="flex-1 p-6 text-slate-500">{t('common.admins_only') || 'Admins only'}</main>
      </Layout>
    )
  }

  return (
    <Layout>
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Stethoscope className="text-pharma-600" />
            {t('clinics.title')}
          </h1>
          <button onClick={() => setEditing({ name: '', active: true })}
            className="bg-pharma-600 hover:bg-pharma-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <Plus size={16} />
            {t('clinics.new')}
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4 max-w-2xl">{t('clinics.intro')}</p>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('clinics.col_name')}</th>
                <th className="px-3 py-2 text-start">{t('clinics.col_phone')}</th>
                <th className="px-3 py-2 text-center">{t('clinics.col_status')}</th>
                <th className="px-3 py-2 text-start">{t('clinics.col_link')}</th>
                <th className="px-3 py-2 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('clinics.empty')}</td></tr>}
              {list.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                  <td className="px-3 py-2 text-slate-600 font-mono text-xs">{c.phone || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {c.active
                      ? <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">{t('clinics.active')}</span>
                      : <span className="inline-block px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold">{t('clinics.inactive')}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {c.active ? (
                      <button onClick={() => copyLink(c)}
                        className="inline-flex items-center gap-1.5 text-xs text-pharma-700 hover:text-pharma-800 font-medium bg-pharma-50 hover:bg-pharma-100 px-2 py-1 rounded-lg max-w-xs">
                        {copied === c.id ? <Check size={13} /> : <Copy size={13} />}
                        <span className="truncate">{copied === c.id ? t('clinics.copied') : t('clinics.copy_link')}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 inline-flex items-center gap-1"><LinkIcon size={13} /> {t('clinics.link_disabled')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(c)} title={t('common.edit') as string}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-pharma-700"><Edit2 size={15} /></button>
                      <button onClick={() => regenerate(c)} title={t('clinics.regenerate') as string}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-amber-600"><RefreshCw size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">{editing.id ? t('clinics.edit') : t('clinics.new')}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('clinics.col_name')} *</label>
                <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="input w-full" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('clinics.col_phone')}</label>
                <input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('clinics.notes')}</label>
                <textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  className="input w-full" rows={2} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editing.active ?? true}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                {t('clinics.active')}
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">{t('common.cancel')}</button>
              <button onClick={save} disabled={saving || !editing.name?.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-pharma-600 hover:bg-pharma-700 text-white disabled:opacity-50">
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
