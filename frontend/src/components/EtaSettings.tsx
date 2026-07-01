import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCheck2, Loader2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react'
import api from '../lib/api'
import i18n from '../lib/i18n'

type WalkInDefaults = {
  CustomerName: string
  CustomerCode: string
  CustomerCountryCode: string
  CustomerGovernate: string
  CustomerCity: string
  CustomerStreet: string
  CustomerBuilding: string
}

type EnvSettings = {
  environment: string
  base_url: string
  issuer_rin: string
  active: boolean
  has_auth_key: boolean
  has_secret_key: boolean
  walk_in_defaults: WalkInDefaults
}

type BranchDevice = {
  id: number
  branch_id: number
  branch_code: string | null
  pos_serial: string
  device_label: string | null
  active: boolean
  branch_name_en: string
  branch_name_ar: string
}

type BranchRow = { id: number; name_en: string; name_ar: string }

type Readiness = {
  ready: boolean
  blockers: string[]
  warnings: string[]
  credentials_configured: boolean
  credentials_active: boolean
  products_missing_item_code: number
  active_products: number
  devices_mapped: number
}

export default function EtaSettings() {
  const { t } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [processingQueue, setProcessingQueue] = useState(false)
  const [queueResult, setQueueResult] = useState<{ claimed?: number; accepted?: number; failed?: number } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{
    auth_ok?: boolean
    reachable?: boolean
    http_status?: number | null
    error_codes?: string[]
    hint?: string
  } | null>(null)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [devices, setDevices] = useState<BranchDevice[]>([])
  const [missingBranches, setMissingBranches] = useState<BranchRow[]>([])

  const [baseUrl, setBaseUrl] = useState('https://testserver.misrapp.com/api')
  const [authKey, setAuthKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [issuerRin, setIssuerRin] = useState('')
  const [active, setActive] = useState(false)
  const [walkIn, setWalkIn] = useState<WalkInDefaults>({
    CustomerName: 'Walk-in Customer',
    CustomerCode: 'WALKIN',
    CustomerCountryCode: 'EG',
    CustomerGovernate: 'Cairo',
    CustomerCity: 'Cairo',
    CustomerStreet: 'N/A',
    CustomerBuilding: '1',
  })

  const [deviceForms, setDeviceForms] = useState<Record<number, { branch_code: string; pos_serial: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [settingsRes, readinessRes] = await Promise.all([
        api.get('/eta/settings'),
        api.get('/eta/readiness'),
      ])
      const staging = settingsRes.data.staging as EnvSettings
      setBaseUrl(staging.base_url || 'https://testserver.misrapp.com/api')
      setIssuerRin(staging.issuer_rin || '')
      setActive(!!staging.active)
      setWalkIn({ ...walkIn, ...staging.walk_in_defaults })
      setDevices(settingsRes.data.devices || [])
      setMissingBranches(settingsRes.data.branches_missing_device || [])
      setReadiness(readinessRes.data)

      const forms: Record<number, { branch_code: string; pos_serial: string }> = {}
      for (const d of settingsRes.data.devices || []) {
        forms[d.branch_id] = {
          branch_code: d.branch_code || '',
          pos_serial: d.pos_serial || '',
        }
      }
      for (const b of settingsRes.data.branches_missing_device || []) {
        if (!forms[b.id]) forms[b.id] = { branch_code: String(b.id), pos_serial: '' }
      }
      setDeviceForms(forms)
    } catch {
      setError(t('settings.eta.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const saveCredentials = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await api.put('/eta/settings', {
        environment: 'staging',
        base_url: baseUrl.trim(),
        auth_key: authKey.trim() || undefined,
        secret_key: secretKey.trim() || undefined,
        issuer_rin: issuerRin.trim() || undefined,
        walk_in_defaults: walkIn,
        active,
      })
      setAuthKey('')
      setSecretKey('')
      setSaved(true)
      await load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('settings.eta.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const saveDevice = async (branchId: number) => {
    const form = deviceForms[branchId]
    if (!form?.branch_code?.trim() || !form?.pos_serial?.trim()) return
    setSaving(true)
    try {
      await api.put(`/eta/devices/${branchId}`, {
        branch_code: form.branch_code.trim(),
        pos_serial: form.pos_serial.trim(),
        active: true,
      })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post('/eta/test-connection', null, { params: { environment: 'staging' } })
      setTestResult(r.data)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setTestResult({ reachable: false, auth_ok: false, error_codes: [typeof detail === 'string' ? detail : 'request_failed'] })
    } finally {
      setTesting(false)
    }
  }

  const runProcessQueue = async () => {
    setProcessingQueue(true)
    setQueueResult(null)
    try {
      const r = await api.post('/eta/process-queue', null, { params: { limit: 20 } })
      setQueueResult(r.data)
    } catch {
      setQueueResult({ claimed: 0, accepted: 0, failed: 0 })
    } finally {
      setProcessingQueue(false)
    }
  }

  const branchLabel = (b: BranchRow | BranchDevice) =>
    lang === 'ar' ? ((b as BranchDevice).branch_name_ar || (b as BranchRow).name_ar) : ((b as BranchDevice).branch_name_en || (b as BranchRow).name_en)

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-slate-400">
        <Loader2 className="animate-spin" size={28} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {readiness && (
        <div className={`rounded-2xl border p-5 ${readiness.ready ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
          <div className="flex items-start gap-3">
            {readiness.ready ? (
              <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={22} />
            ) : (
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
            )}
            <div>
              <h2 className="font-bold text-slate-800">{t('settings.eta.readiness_title')}</h2>
              <p className="text-sm text-slate-600 mt-1">
                {readiness.ready ? t('settings.eta.readiness_ok') : t('settings.eta.readiness_pending')}
              </p>
              {readiness.blockers?.length > 0 && (
                <ul className="mt-2 text-sm text-red-700 list-disc ps-5">
                  {readiness.blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              {readiness.warnings?.length > 0 && (
                <ul className="mt-2 text-sm text-amber-800 list-disc ps-5">
                  {readiness.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-1">
          <FileCheck2 size={20} className="text-pharma-600" />
          {t('settings.eta.credentials_title')}
        </h2>
        <p className="text-sm text-slate-500 mb-4">{t('settings.eta.credentials_hint')}</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {saved && <p className="text-sm text-emerald-600 mb-3">{t('settings.eta.saved')}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">{t('settings.eta.base_url')}</span>
            <input className="input mt-1 w-full" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t('settings.eta.auth_key')}</span>
            <input className="input mt-1 w-full" type="password" placeholder="••••••••" value={authKey} onChange={(e) => setAuthKey(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t('settings.eta.secret_key')}</span>
            <input className="input mt-1 w-full" type="password" placeholder="••••••••" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="off" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">{t('settings.eta.issuer_rin')}</span>
            <input className="input mt-1 w-full" value={issuerRin} onChange={(e) => setIssuerRin(e.target.value)} />
          </label>
        </div>

        <details className="mt-4">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer">{t('settings.eta.walk_in_title')}</summary>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            {(['CustomerName', 'CustomerCode', 'CustomerGovernate', 'CustomerCity', 'CustomerStreet', 'CustomerBuilding'] as const).map((key) => (
              <label key={key} className="block">
                <span className="text-xs text-slate-500">{key}</span>
                <input
                  className="input mt-1 w-full"
                  value={walkIn[key] || ''}
                  onChange={(e) => setWalkIn({ ...walkIn, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </details>

        <label className="flex items-center gap-2 mt-4 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t('settings.eta.active_label')}
        </label>
        <p className="text-xs text-slate-500 mt-1">{t('settings.eta.active_hint')}</p>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="btn-primary" disabled={saving} onClick={saveCredentials}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : t('settings.eta.save')}
          </button>
          <button type="button" className="btn-secondary" disabled={testing} onClick={runTest}>
            {testing ? <Loader2 className="animate-spin" size={16} /> : t('settings.eta.test_connection')}
          </button>
          {active && (
            <button type="button" className="btn-secondary" disabled={processingQueue} onClick={runProcessQueue}>
              {processingQueue ? <Loader2 className="animate-spin" size={16} /> : t('settings.eta.process_queue')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={load}>
            <RefreshCw size={16} />
          </button>
        </div>

        {testResult && (
          <div className={`text-sm mt-3 p-3 rounded-lg ${testResult.auth_ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <p className="font-medium">
              {testResult.auth_ok ? t('settings.eta.test_ok') : t('settings.eta.test_fail')}
            </p>
            {testResult.http_status != null && (
              <p className="text-xs mt-1">HTTP {testResult.http_status}{testResult.reachable === false ? ' — not reachable' : ''}</p>
            )}
            {testResult.error_codes?.length ? (
              <p className="text-xs mt-1">Codes: {testResult.error_codes.join(', ')}</p>
            ) : null}
            {testResult.hint ? (
              <p className="text-xs mt-2">{testResult.hint}</p>
            ) : null}
          </div>
        )}
        {queueResult && (
          <p className="text-xs mt-2 text-slate-600">
            {t('settings.eta.queue_result', {
              claimed: queueResult.claimed ?? 0,
              accepted: queueResult.accepted ?? 0,
              failed: queueResult.failed ?? 0,
            })}
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-bold text-slate-800 mb-1">{t('settings.eta.devices_title')}</h2>
        <p className="text-sm text-slate-500 mb-4">{t('settings.eta.devices_hint')}</p>

        <div className="space-y-3">
          {[...devices, ...missingBranches.filter((b) => !devices.some((d) => d.branch_id === b.id))].map((row) => {
            const branchId = 'branch_id' in row ? row.branch_id : row.id
            const form = deviceForms[branchId] || { branch_code: String(branchId), pos_serial: '' }
            return (
              <div key={branchId} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <p className="font-medium text-slate-800 mb-2">{branchLabel(row as BranchDevice)}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-slate-500">{t('settings.eta.branch_code')}</span>
                    <input
                      className="input mt-1 w-full"
                      value={form.branch_code}
                      onChange={(e) => setDeviceForms({ ...deviceForms, [branchId]: { ...form, branch_code: e.target.value } })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">{t('settings.eta.pos_serial')}</span>
                    <input
                      className="input mt-1 w-full"
                      value={form.pos_serial}
                      onChange={(e) => setDeviceForms({ ...deviceForms, [branchId]: { ...form, pos_serial: e.target.value } })}
                    />
                  </label>
                </div>
                <button type="button" className="btn-secondary mt-2 text-sm" disabled={saving} onClick={() => saveDevice(branchId)}>
                  {t('settings.eta.save_device')}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
