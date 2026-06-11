import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, Plus, Trash2, UserPlus, Loader2 } from 'lucide-react'
import api from '../lib/api'
import i18n from '../lib/i18n'
import {
  BADGE_COLOR_OPTIONS,
  platformBadgeClass,
  type DigitalPlatform,
} from '../lib/digitalPlatforms'
import { invalidateDigitalPlatformsCache } from '../lib/useDigitalPlatforms'

type FormState = {
  name_en: string
  name_ar: string
  platform_key: string
  badge_color: string
  create_customer_account: boolean
}

const emptyForm = (): FormState => ({
  name_en: '',
  name_ar: '',
  platform_key: '',
  badge_color: 'teal',
  create_customer_account: true,
})

export default function DigitalPlatformsSettings() {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [list, setList] = useState<DigitalPlatform[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.get<DigitalPlatform[]>('/digital-platforms/manage')
      .then((r) => setList(r.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const label = (p: DigitalPlatform) =>
    lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)

  const saveNew = async () => {
    if (!form || !form.name_en.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.post('/digital-platforms/manage', {
        name_en: form.name_en.trim(),
        name_ar: form.name_ar.trim() || form.name_en.trim(),
        platform_key: form.platform_key.trim() || undefined,
        badge_color: form.badge_color,
        create_customer_account: form.create_customer_account,
        sort_order: list.length,
      })
      invalidateDigitalPlatformsCache()
      setForm(null)
      load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('settings.digital_platforms.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const linkCustomer = async (p: DigitalPlatform) => {
    setSaving(true)
    try {
      await api.put(`/digital-platforms/manage/${p.id}`, { create_customer_account: true })
      invalidateDigitalPlatformsCache()
      load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: DigitalPlatform) => {
    if (p.active) {
      if (!confirm(t('settings.digital_platforms.deactivate_confirm') as string)) return
      await api.delete(`/digital-platforms/manage/${p.id}`)
    } else {
      await api.put(`/digital-platforms/manage/${p.id}`, { active: true })
    }
    invalidateDigitalPlatformsCache()
    load()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-1">
          <Bike size={20} className="text-pharma-600" />
          {t('settings.digital_platforms.title')}
        </h2>
        <p className="text-sm text-slate-500 mb-4">{t('settings.digital_platforms.subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((p) => (
              <div
                key={p.id}
                className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${
                  p.active ? 'border-slate-200 bg-slate-50/50' : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${platformBadgeClass(p.platform_key, p.badge_color)}`}
                >
                  {label(p)}
                </span>
                <span className="text-xs text-slate-400 font-mono">{p.platform_key}</span>
                {p.customer_id ? (
                  <span className="text-xs text-emerald-700 font-medium">
                    {t('settings.digital_platforms.account_linked')}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void linkCustomer(p)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-pharma-700 hover:underline"
                  >
                    <UserPlus size={12} />
                    {t('settings.digital_platforms.create_account')}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => void toggleActive(p)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                  title={p.active ? t('settings.digital_platforms.deactivate') as string : t('settings.digital_platforms.reactivate') as string}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {!form ? (
          <button
            type="button"
            onClick={() => setForm(emptyForm())}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pharma-600 text-white text-sm font-semibold hover:bg-pharma-700"
          >
            <Plus size={16} />
            {t('settings.digital_platforms.add')}
          </button>
        ) : (
          <div className="mt-4 p-4 rounded-xl border-2 border-pharma-200 bg-pharma-50/40 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">{t('settings.digital_platforms.add')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder={t('settings.digital_platforms.name_en') as string}
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              />
              <input
                dir="rtl"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder={t('settings.digital_platforms.name_ar') as string}
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              />
              <input
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono md:col-span-2"
                placeholder={t('settings.digital_platforms.key_ph') as string}
                value={form.platform_key}
                onChange={(e) => setForm({ ...form, platform_key: e.target.value })}
              />
              <label className="text-sm text-slate-600 flex items-center gap-2">
                {t('settings.digital_platforms.badge_color')}
                <select
                  value={form.badge_color}
                  onChange={(e) => setForm({ ...form, badge_color: e.target.value })}
                  className="border rounded-lg px-2 py-1"
                >
                  {BADGE_COLOR_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.create_customer_account}
                  onChange={(e) => setForm({ ...form, create_customer_account: e.target.checked })}
                />
                {t('settings.digital_platforms.auto_customer')}
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !form.name_en.trim()}
                onClick={() => void saveNew()}
                className="px-4 py-2 rounded-lg bg-pharma-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => { setForm(null); setError('') }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">{t('settings.digital_platforms.hint')}</p>
    </div>
  )
}
