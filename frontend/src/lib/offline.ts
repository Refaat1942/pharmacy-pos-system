/**
 * Offline POS.
 *
 * - Every successful GET answer is kept in IndexedDB; when the network is down the
 *   last good answer is served instead (customers, offers, open shift, profile …).
 * - Product search uses the branch's "offline pack" (all sellable products),
 *   downloaded while online from GET /api/pos/offline-pack.
 * - A sale that cannot reach the server is queued on this PC with a client_uuid and
 *   the receipt still prints (temporary number OFF-…). When the network returns the
 *   queue is uploaded to POST /api/sales; the server de-duplicates by client_uuid.
 *
 * Wired into the shared axios instance by installOffline(api) (see lib/api.ts).
 */
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

// ─── tiny IndexedDB key/value store ────────────────────────────────────────
const DB_NAME = 'fps-offline'
const STORE = 'kv'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db()
    return await new Promise((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as T | undefined)
      r.onerror = () => reject(r.error)
    })
  } catch {
    return undefined
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const d = await db()
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* storage full / private mode — offline is best effort */
  }
}

// ─── scope: tenant + branch (never mix pharmacies or branches) ────────────
function scope(): string {
  let slug = 't'
  try { slug = JSON.parse(localStorage.getItem('pharma_tenant') || '{}').slug || 't' } catch { /* ignore */ }
  return `${slug}|${localStorage.getItem('pharma_active_branch') || '0'}`
}

export function isNetworkError(err: any): boolean {
  if (!err || err.response) return false
  return err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.message === 'Network Error' || !navigator.onLine
}

// ─── status events for the UI ──────────────────────────────────────────────
export interface OfflineStatus { online: boolean; pending: number; failed: number; packAt: string | null; packCount: number }
const status: OfflineStatus = { online: navigator.onLine, pending: 0, failed: 0, packAt: null, packCount: 0 }
const listeners = new Set<(s: OfflineStatus) => void>()
function emit() { listeners.forEach((l) => l({ ...status })) }
export function onOfflineStatus(fn: (s: OfflineStatus) => void): () => void {
  listeners.add(fn)
  fn({ ...status })
  return () => listeners.delete(fn)
}
function setOnline(v: boolean) { if (status.online !== v) { status.online = v; emit() } }

// ─── offline product pack ──────────────────────────────────────────────────
type Row = (string | number | null)[]
interface Pack { generated_at: string; product_columns: string[]; products: Row[] }
let packMem: { key: string; items: Record<string, any>[] } | null = null

async function loadPack(): Promise<Record<string, any>[]> {
  const key = `pack|${scope()}`
  if (packMem?.key === key) return packMem.items
  const pack = await idbGet<Pack>(key)
  const items = pack ? pack.products.map((r) => Object.fromEntries(pack.product_columns.map((c, i) => [c, r[i]]))) : []
  packMem = { key, items }
  status.packAt = pack?.generated_at ?? null
  status.packCount = items.length
  emit()
  return items
}

let packSyncing = false
/** Download the branch's products for offline selling (call while online). */
export async function syncOfflinePack(api: AxiosInstance): Promise<void> {
  if (packSyncing || !localStorage.getItem('pharma_token')) return
  packSyncing = true
  try {
    const { data } = await api.get<Pack>('/pos/offline-pack', { headers: { 'X-Offline-Skip': '1' } })
    await idbSet(`pack|${scope()}`, data)
    packMem = null
    await loadPack()
  } catch {
    /* keep the previous pack */
  } finally {
    packSyncing = false
  }
}

function normalize(s: string) { return s.toLowerCase().replace(/\s+/g, ' ').trim() }

/** Same matching idea as the server search: barcode exact/prefix, then name words. */
export async function searchOfflineProducts(q: string, limit = 60): Promise<any[]> {
  const items = await loadPack()
  const query = normalize(q)
  if (!query) return []
  const digits = query.replace(/\D/g, '')
  const words = query.split(' ')
  const scored: { p: any; s: number }[] = []
  for (const p of items) {
    const bc = String(p.barcode || '').toLowerCase()
    const ib = String(p.international_barcode || '').toLowerCase()
    let s = 0
    if (bc === query || ib === query || (digits.length >= 4 && (bc === digits || ib === digits))) s = 100
    else if (bc.startsWith(query) || ib.startsWith(query)) s = 60
    else {
      const name = normalize(`${p.name_en || ''} ${p.name_ar || ''}`)
      if (words.every((w) => name.includes(w))) s = name.startsWith(words[0]) ? 40 : 30
    }
    if (s) scored.push({ p, s })
  }
  scored.sort((a, b) => b.s - a.s || String(a.p.name_en).localeCompare(String(b.p.name_en)))
  return scored.slice(0, limit).map((x) => ({ ...x.p, active: true }))
}

// ─── offline sale queue ────────────────────────────────────────────────────
interface QueuedSale {
  client_uuid: string
  created_at: string
  number: string
  scope: string
  branch: string | null
  payload: any
  error?: string
}

const queueKey = () => `sales-queue|${scope().split('|')[0]}`

async function readQueue(): Promise<QueuedSale[]> { return (await idbGet<QueuedSale[]>(queueKey())) || [] }
async function writeQueue(q: QueuedSale[]) {
  await idbSet(queueKey(), q)
  status.pending = q.filter((s) => !s.error).length
  status.failed = q.filter((s) => s.error).length
  emit()
}
export async function listQueuedSales(): Promise<QueuedSale[]> { return readQueue() }

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function terminalId(): string {
  let id = localStorage.getItem('fps_terminal_id')
  if (!id) { id = uuid().slice(0, 4).toUpperCase(); localStorage.setItem('fps_terminal_id', id) }
  return id
}

/** Queue a sale and build a receipt-shaped response from the local data. */
async function queueSale(payload: any): Promise<{ invoice: any; items: any[] }> {
  if (payload?.type === 'insurance') throw new Error('Insurance sales need internet.')
  if (Number(payload?.loyalty_points_redeemed || 0) > 0) throw new Error('Loyalty points cannot be redeemed offline.')
  const seq = Number(localStorage.getItem('fps_offline_seq') || '0') + 1
  localStorage.setItem('fps_offline_seq', String(seq))
  const now = new Date()
  const number = `OFF-${terminalId()}-${String(seq).padStart(4, '0')}`
  const q = await readQueue()
  q.push({
    client_uuid: payload.client_uuid || uuid(), created_at: now.toISOString(), number, scope: scope(),
    branch: localStorage.getItem('pharma_active_branch'), payload,
  })
  await writeQueue(q)

  const products = await loadPack()
  const byId = new Map(products.map((p) => [p.id, p]))
  const items = (payload.items || []).map((it: any, i: number) => {
    const p = byId.get(it.product_id) || {}
    const unitLabel = it.unit_type === 'sub' ? p.sub_unit : it.unit_type === 'mid' ? p.mid_unit : p.unit
    return {
      id: -(i + 1), product_id: it.product_id, product_name_en: p.name_en || '', product_name_ar: p.name_ar || p.name_en || '',
      barcode: p.barcode || '', quantity: it.quantity, unit_price: it.unit_price, discount: it.discount || 0,
      total: +(it.quantity * it.unit_price - (it.discount || 0)).toFixed(2), unit_label: unitLabel || null,
      offer_id: it.offer_id ?? null, offer_discount: it.offer_discount || 0, dose_text: it.dose_text ?? null,
    }
  })
  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
  const fee = payload.type === 'delivery' || payload.type === 'digital' ? Number(payload.delivery_fee || 0) : 0
  const net = Math.max(0, +(subtotal - Number(payload.discount || 0) + fee).toFixed(2))
  let user: any = {}
  try { user = JSON.parse(localStorage.getItem('pharma_user') || '{}') } catch { /* ignore */ }
  const cash = payload.payment_method === 'cash' ? Number(payload.cash_amount ?? net) : payload.cash_amount ?? null
  const invoice = {
    id: -seq, invoice_number: number, type: payload.type, payment_method: payload.payment_method,
    digital_type: payload.digital_type || null, subtotal: +subtotal.toFixed(2), discount: Number(payload.discount || 0),
    net_total: net, cash_amount: cash, visa_amount: payload.visa_amount ?? null,
    change_amount: payload.payment_method === 'cash' ? Math.max(0, +(Number(cash) - net).toFixed(2)) : 0,
    seller_id: user.id ?? null, customer_id: payload.customer_id ?? null, seller_name_en: user.name_en || '',
    seller_name_ar: user.name_ar || '', customer_name: '', status: 'offline', notes: payload.notes || '',
    created_at: now.toISOString(), delivery_address: payload.delivery_address ?? null, delivery_fee: fee || null,
    offer_savings: payload.offer_savings || 0, offer_names: payload.offer_names || null, offline: true,
  }
  return { invoice, items }
}

let flushing = false
/** Upload queued sales. Safe to call often; the server de-duplicates by client_uuid. */
export async function flushQueue(api: AxiosInstance): Promise<void> {
  if (flushing || !localStorage.getItem('pharma_token')) return
  flushing = true
  try {
    let q = await readQueue()
    for (const sale of q.filter((s) => !s.error)) {
      try {
        await api.post('/sales', { ...sale.payload, client_uuid: sale.client_uuid, offline_created_at: sale.created_at }, {
          headers: { 'X-Offline-Skip': '1', ...(sale.branch ? { 'X-Active-Branch': sale.branch } : {}) },
        })
        q = (await readQueue()).filter((s) => s.client_uuid !== sale.client_uuid)
        await writeQueue(q)
        setOnline(true)
      } catch (e: any) {
        if (isNetworkError(e)) { setOnline(false); break }
        if (e?.response?.status === 401) break // logged out — retry after login
        // Rejected by the server (e.g. product deleted): keep it, flagged for review.
        q = (await readQueue()).map((s) => s.client_uuid === sale.client_uuid
          ? { ...s, error: String(e?.response?.data?.detail || e?.message || 'Rejected') } : s)
        await writeQueue(q)
      }
    }
  } finally {
    flushing = false
  }
}

/** Put a sale the server rejected back in line (after fixing the cause). */
export async function retryFailed(api: AxiosInstance): Promise<void> {
  await writeQueue((await readQueue()).map(({ error: _e, ...s }) => s))
  await flushQueue(api)
}

// ─── axios wiring ──────────────────────────────────────────────────────────
function cacheKey(cfg: InternalAxiosRequestConfig): string {
  const params = cfg.params ? JSON.stringify(cfg.params) : ''
  return `get|${scope()}|${cfg.url}|${params}`
}

function fakeResponse(cfg: InternalAxiosRequestConfig, data: any): AxiosResponse {
  return { data, status: 200, statusText: 'OK (offline)', headers: { 'x-fps-offline': '1' }, config: cfg, request: null }
}

const MAX_CACHE_BYTES = 2_000_000
const POS_PATHS = /^\/(sales$|products$|shifts\/current|customers|offers\/active|settings\/profile|digital-platforms|employees|pos\b|pos-|pos_)/

export function installOffline(api: AxiosInstance): void {
  api.interceptors.request.use((cfg) => {
    // Give every sale its id up front: if the answer is lost (timeout) and the sale
    // is queued and re-sent, the server recognises it instead of saving it twice.
    if ((cfg.method || '').toLowerCase() === 'post' && cfg.url === '/sales' && cfg.data && typeof cfg.data === 'object' && !cfg.data.client_uuid) {
      cfg.data = { ...cfg.data, client_uuid: uuid() }
    }
    // A dead connection should fail fast into offline mode, not hang the till
    // (POS requests only — exports and reports may legitimately take longer).
    if (!cfg.timeout && POS_PATHS.test(cfg.url || '')) {
      cfg.timeout = (cfg.method || 'get').toLowerCase() === 'get' ? 15_000 : 30_000
    }
    return cfg
  })
  api.interceptors.response.use(
    (res) => {
      const cfg = res.config
      setOnline(true)
      if ((cfg.method || 'get').toLowerCase() === 'get' && !cfg.headers?.['X-Offline-Skip'] && cfg.responseType !== 'blob') {
        try {
          const body = JSON.stringify(res.data)
          if (body.length < MAX_CACHE_BYTES) void idbSet(cacheKey(cfg), res.data)
        } catch { /* not JSON */ }
      }
      return res
    },
    async (err) => {
      const cfg: InternalAxiosRequestConfig | undefined = err?.config
      if (!cfg || !isNetworkError(err) || cfg.headers?.['X-Offline-Skip']) return Promise.reject(err)
      setOnline(false)
      const method = (cfg.method || 'get').toLowerCase()
      const url = cfg.url || ''
      if (method === 'get') {
        if (url === '/products' && cfg.params?.q != null) {
          return fakeResponse(cfg, await searchOfflineProducts(String(cfg.params.q)))
        }
        const cached = await idbGet(cacheKey(cfg))
        if (cached !== undefined) return fakeResponse(cfg, cached)
      }
      if (method === 'post' && url === '/sales') {
        const payload = typeof cfg.data === 'string' ? JSON.parse(cfg.data) : cfg.data
        if (payload?.type !== 'return') return fakeResponse(cfg, await queueSale(payload))
      }
      return Promise.reject(err)
    },
  )

  const kick = () => { void flushQueue(api); void syncOfflinePack(api) }
  window.addEventListener('online', () => { setOnline(true); kick() })
  window.addEventListener('offline', () => setOnline(false))
  setInterval(() => { void flushQueue(api) }, 30_000)
  setInterval(() => { void syncOfflinePack(api) }, 30 * 60_000)
  void readQueue().then(writeQueue)
  void loadPack()
  setTimeout(kick, 3000)
}
