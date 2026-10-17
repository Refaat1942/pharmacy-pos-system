/**
 * Offline POS.
 *
 * - Every successful GET answer is kept in IndexedDB; when the network is down the
 *   last good answer is served instead (customers, offers, open shift, profile …).
 * - Product search uses the branch's "offline pack" (all sellable products),
 *   downloaded while online from GET /api/pos/offline-pack.
 * - A sale that cannot reach the server is queued on this PC with a client_uuid and
 *   the receipt still prints (temporary number OFF-…).
 * - Opening and closing a cash shift work the same way: the shift opens/closes on this
 *   PC at once and is queued.
 * - The last days' invoices (with items) are kept too, so a receipt can be found and a
 *   return made offline; the return is queued like a sale.
 * - Delivery status changes are queued too, and so is any other change saved offline
 *   (back office: prices, stock edits, purchases, customers, settings …). Every write
 *   carries an X-Idempotency-Key, so the server applies it once however often it is
 *   sent. Changes that depend on something created offline (e.g. editing a purchase
 *   order made offline) can't be replayed and are flagged for review.
 * - A cashier who logged in on this PC before can log in / unlock offline (password
 *   checked against a salted PBKDF2 hash kept on the PC). Each queued item is uploaded
 *   with the login of the cashier who made it, while that login is still valid.
 * - One queue, uploaded in order (open shift → sales → close shift) when the network
 *   returns; the server de-duplicates every upload by client_uuid.
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
    const inv = await api.get<InvoicePack>('/pos/offline-invoices', { headers: { 'X-Offline-Skip': '1' } })
    await idbSet(invoicesKey(), inv.data)
  } catch {
    /* keep the previous pack */
  } finally {
    packSyncing = false
  }
}

// ─── recent invoices (for offline receipt lookup + returns) ────────────────
interface InvoicePack { generated_at: string; invoices: any[]; items: any[] }
const invoicesKey = () => `invoices|${scope()}`

async function offlineInvoice(id: number): Promise<{ invoice: any; items: any[] } | null> {
  const pack = await idbGet<InvoicePack>(invoicesKey())
  const invoice = pack?.invoices.find((i) => i.id === id)
  if (!pack || !invoice) return null
  // Returns made offline and not uploaded yet count as returned already.
  const queued = (await readQueue()).filter((q) => q.kind === 'return' && q.payload?.invoice_id === id)
  const extra = new Map<number, number>()
  queued.forEach((q) => (q.payload.items || []).forEach((it: any) =>
    extra.set(it.invoice_item_id, (extra.get(it.invoice_item_id) || 0) + Number(it.sub_quantity ?? it.quantity ?? 0))))
  const items = pack.items.filter((it) => it.invoice_id === id)
    .map((it) => ({ ...it, returned_sub: Number(it.returned_sub || 0) + (extra.get(it.id) || 0) }))
  return { invoice, items }
}

async function searchOfflineInvoices(q: string): Promise<any[]> {
  const pack = await idbGet<InvoicePack>(invoicesKey())
  const query = normalize(q)
  if (!pack || !query) return []
  const hit = new Set<number>()
  pack.items.forEach((it) => {
    if (String(it.barcode || '').toLowerCase().includes(query)
      || normalize(`${it.product_name_en || ''} ${it.product_name_ar || ''}`).includes(query)) hit.add(it.invoice_id)
  })
  return pack.invoices.filter((i) => hit.has(i.id) || String(i.invoice_number || '').toLowerCase().includes(query)).slice(0, 50)
}

/** Queue a return of an invoice the server already has; answer like the server would. */
async function queueReturn(url: string, invoiceId: number, payload: any): Promise<any> {
  const local = await offlineInvoice(invoiceId)
  if (!local) throw new Error('This receipt is not saved on this PC — the return needs internet.')
  let total = 0
  for (const r of payload?.items || []) {
    const it = local.items.find((x) => x.id === r.invoice_item_id)
    if (!it) throw new Error('Item not found on this receipt.')
    const pack = Math.max(1, Number(it.pack_size || 1))
    const sub = Number(r.sub_quantity ?? Number(r.quantity || 0) * pack)
    const left = Number(it.quantity) * pack - Number(it.returned_sub || 0)
    if (sub <= 0 || sub > left) throw new Error(`Return qty ${sub} exceeds remaining ${left}`)
    total += (Number(it.unit_price) / pack) * sub
  }
  const seq = Number(localStorage.getItem('fps_offline_ret_seq') || '0') + 1
  localStorage.setItem('fps_offline_ret_seq', String(seq))
  const number = `OFF-R-${terminalId()}-${String(seq).padStart(4, '0')}`
  const createdAt = await queueEntry('return', url, { ...payload, invoice_id: invoiceId, total_returned: +total.toFixed(2) }, number)
  return {
    id: -seq, original_invoice_id: invoiceId, return_invoice_number: number, type: 'partial',
    total_returned: +total.toFixed(2), reason: payload?.reason ?? null, created_at: createdAt, offline: true,
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

// ─── offline queue (sales + shift open/close) ─────────────────────────────
type QueueKind = 'sale' | 'shift_open' | 'shift_close' | 'return' | 'delivery' | 'generic'
interface QueuedSale {
  client_uuid: string
  created_at: string
  number: string
  scope: string
  branch: string | null
  payload: any
  error?: string
  /** Missing on entries saved before shifts could be queued → 'sale'. */
  kind?: QueueKind
  url?: string
  /** Login of the cashier who made it, so the upload is credited to them. */
  token?: string | null
  /** 'generic' entries: HTTP method (post/put/patch/delete). */
  method?: string
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
    branch: localStorage.getItem('pharma_active_branch'), payload, token: localStorage.getItem('pharma_token'),
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

// ─── offline cash shift ────────────────────────────────────────────────────
const currentShiftKey = () => `get|${scope()}|/shifts/current|`

async function queueEntry(kind: QueueKind, url: string, payload: any, number: string, extra: Partial<QueuedSale> = {}): Promise<string> {
  const now = new Date().toISOString()
  const q = await readQueue()
  q.push({
    ...extra,
    client_uuid: extra.client_uuid || uuid(), created_at: now, number, scope: scope(),
    branch: localStorage.getItem('pharma_active_branch'), payload, kind, url,
    token: localStorage.getItem('pharma_token'),
  })
  await writeQueue(q)
  return now
}

/** Open the shift on this PC; the POS sees it as open straight away. */
async function queueShiftOpen(payload: any): Promise<any> {
  let user: any = {}
  try { user = JSON.parse(localStorage.getItem('pharma_user') || '{}') } catch { /* ignore */ }
  const seq = Number(localStorage.getItem('fps_offline_shift_seq') || '0') + 1
  localStorage.setItem('fps_offline_shift_seq', String(seq))
  const openedAt = await queueEntry('shift_open', '/shifts/open', payload, `SHIFT-OPEN-${seq}`)
  const shift = {
    id: -seq, user_id: user.id ?? null, branch_id: Number(localStorage.getItem('pharma_active_branch')) || null,
    opened_at: openedAt, opening_cash: Number(payload?.opening_cash || 0), notes: payload?.notes ?? null,
    shift_type: payload?.shift_type ?? null, status: 'open', closed_at: null, offline: true,
  }
  await idbSet(currentShiftKey(), shift)
  return shift
}

/** Takings recorded on this PC for the shift (queued sales since it opened). */
async function localBreakdown(shift: any): Promise<any> {
  const since = shift?.opened_at ? new Date(shift.opened_at).getTime() : 0
  const sales = (await readQueue()).filter((s) => (s.kind ?? 'sale') === 'sale' && new Date(s.created_at).getTime() >= since)
  const returns = (await readQueue()).filter((s) => s.kind === 'return' && new Date(s.created_at).getTime() >= since)
  const returnsValue = returns.reduce((t, s) => t + Number(s.payload?.total_returned || 0), 0)
  let cash = 0, visa = 0, account = 0, other = 0, total = 0, collected = 0, change = 0
  for (const s of sales) {
    const p = s.payload || {}
    const items = (p.items || []) as any[]
    const sub = items.reduce((t, i) => t + Number(i.quantity) * Number(i.unit_price), 0)
    const fee = p.type === 'delivery' || p.type === 'digital' ? Number(p.delivery_fee || 0) : 0
    const net = Math.max(0, sub - Number(p.discount || 0) + fee)
    total += net
    if (p.payment_method === 'cash') {
      cash += net
      const given = Number(p.cash_amount ?? net)
      collected += given
      change += Math.max(0, given - net)
    } else if (p.payment_method === 'visa') visa += net
    else if (p.payment_method === 'account') account += net
    else other += net
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    cash_sales: r(cash), visa_sales: r(visa), account_sales: r(account), other_sales: r(other), total_sales: r(total),
    invoice_count: sales.length, cash_collected: r(collected), cash_change: r(change),
    returns_value: r(returnsValue), returns_count: returns.length,
    expected_cash: r(Number(shift?.opening_cash || 0) + collected - change - returnsValue), offline: true,
  }
}

async function queueShiftClose(url: string, payload: any): Promise<any> {
  const shift: any = (await idbGet(currentShiftKey())) || {}
  const closedAt = await queueEntry('shift_close', url, payload, 'SHIFT-CLOSE')
  const breakdown = await localBreakdown(shift)
  await idbSet(currentShiftKey(), null)
  const counted = Number(payload?.counted_cash || 0)
  return {
    ...shift, status: 'closed', closed_at: closedAt, closing_cash: counted, counted_visa: Number(payload?.counted_visa || 0),
    expected_cash: breakdown.expected_cash, variance: Math.round((counted - breakdown.expected_cash) * 100) / 100,
    breakdown, offline: true,
  }
}

async function hasQueuedShiftChange(): Promise<boolean> {
  return (await readQueue()).some((s) => !s.error && (s.kind === 'shift_open' || s.kind === 'shift_close'))
}

let flushing: Promise<void> | null = null
/** Upload the queue in order. Safe to call often; the server de-duplicates by client_uuid. */
export function flushQueue(api: AxiosInstance): Promise<void> {
  if (!localStorage.getItem('pharma_token')) return Promise.resolve()
  // A second caller waits for the upload already running (e.g. close shift after sales).
  if (!flushing) flushing = doFlush(api).finally(() => { flushing = null })
  return flushing
}

async function doFlush(api: AxiosInstance): Promise<void> {
  {
    let q = await readQueue()
    for (const sale of q.filter((s) => !s.error)) {
      try {
        const own = sale.token && tokenValid(sale.token) ? { Authorization: `Bearer ${sale.token}` } : {}
        if (sale.kind === 'generic') {
          await api.request({
            method: sale.method || 'post', url: sale.url, data: sale.payload,
            headers: { 'X-Offline-Skip': '1', 'X-Idempotency-Key': sale.client_uuid, ...(sale.branch ? { 'X-Active-Branch': sale.branch } : {}), ...own },
          })
        } else await api.post(sale.url || '/sales', { ...sale.payload, client_uuid: sale.client_uuid, offline_created_at: sale.created_at }, {
          headers: { 'X-Offline-Skip': '1', ...(sale.branch ? { 'X-Active-Branch': sale.branch } : {}), ...own },
        })
        q = (await readQueue()).filter((s) => s.client_uuid !== sale.client_uuid)
        await writeQueue(q)
        setOnline(true)
      } catch (e: any) {
        if (isNetworkError(e)) { setOnline(false); break }
        if (e?.response?.status === 409 && e.response.headers?.['x-idempotency-pending']) break // being saved — retry later
        if (e?.response?.status === 401) break // logged out — retry after login
        // Rejected by the server (e.g. product deleted): keep it, flagged for review.
        q = (await readQueue()).map((s) => s.client_uuid === sale.client_uuid
          ? { ...s, error: String(e?.response?.data?.detail || e?.message || 'Rejected') } : s)
        await writeQueue(q)
      }
    }
  }
}

/** Put a sale the server rejected back in line (after fixing the cause). */
export async function retryFailed(api: AxiosInstance): Promise<void> {
  await writeQueue((await readQueue()).map(({ error: _e, ...s }) => s))
  await flushQueue(api)
}

// ─── offline login ─────────────────────────────────────────────────────────
interface SavedLogin { salt: string; hash: string; token: string; user: any; tenant: any; saved_at: string }
const loginKey = (slug: string, username: string) => `login|${slug.trim().toLowerCase()}|${username.trim().toLowerCase()}`

function tokenValid(token: string): boolean {
  try {
    const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp
    return !exp || exp * 1000 > Date.now() + 60_000
  } catch {
    return false
  }
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256)
  return b64(bits)
}

/** After a successful online login: keep what is needed to log this cashier in offline. */
export async function rememberLogin(slug: string, username: string, password: string, data: { token: string; user: any; tenant?: any }) {
  try {
    if (!crypto?.subtle) return
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const saved: SavedLogin = {
      salt: b64(salt), hash: await pbkdf2(password, salt), token: data.token, user: data.user,
      tenant: data.tenant ?? null, saved_at: new Date().toISOString(),
    }
    await idbSet(loginKey(slug, username), saved)
  } catch { /* offline login is a convenience */ }
}

/** Log in with no internet: only cashiers who logged in on this PC before, with the same password. */
export async function offlineLogin(slug: string, username: string, password: string): Promise<SavedLogin | null> {
  try {
    const saved = await idbGet<SavedLogin>(loginKey(slug, username))
    if (!saved || !crypto?.subtle) return null
    const salt = new Uint8Array(Uint8Array.from(atob(saved.salt), (c) => c.charCodeAt(0)))
    return (await pbkdf2(password, salt)) === saved.hash ? saved : null
  } catch {
    return null
  }
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
const POS_PATHS = /^\/(sales$|products$|shifts\b|customers|offers\/active|settings\/profile|digital-platforms|employees|pos\b|pos-|pos_)/
const SHIFT_CLOSE = /^\/shifts\/-?\d+\/close$/
const SALE_RETURN = /^\/sales\/(-?\d+)\/return$/
const SALE_GET = /^\/sales\/(-?\d+)$/
const DELIVERY_STATUS = /^\/sales\/(\d+)\/delivery-status$/
const SHIFT_REPORT = /^\/shifts\/(-?\d+)\/report$/
/** Writes that depend on queued ones (a sale needs its shift): upload the queue first. */
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete'])
/** Never queued: logins, the offline machinery itself, AI, file transfers, exports. */
const NOT_QUEUED = /^\/(auth|platform|pos\/offline|ai|assistant)|import|upload|export|download|whatsapp|\/eta\b/
/** POSTs that only read or calculate (an answer is needed now, nothing is saved). */
const READ_LIKE = /(calculate|preview|suggest|search|validate|check|quote|simulate|lookup|counsel|parse|analy|estimate|report|chat)/

export function installOffline(api: AxiosInstance): void {
  api.interceptors.request.use(async (cfg) => {
    const method = (cfg.method || 'get').toLowerCase()
    const isWrite = WRITE_METHODS.has(method) && !cfg.headers?.['X-Offline-Skip']
    // Every write gets an id: if the answer is lost and it is queued and re-sent,
    // the server returns the first answer instead of applying it twice.
    // (Sales, returns and shifts carry their own client_uuid instead.)
    const ownDedup = cfg.url === '/sales' || SALE_RETURN.test(cfg.url || '') || /^\/shifts\//.test(cfg.url || '')
    if (isWrite && !ownDedup && !NOT_QUEUED.test(cfg.url || '') && !cfg.headers?.['X-Idempotency-Key']) {
      cfg.headers.set('X-Idempotency-Key', uuid())
    }
    // Changes queued offline go first, so the server sees everything in order.
    if (isWrite && !NOT_QUEUED.test(cfg.url || '') && status.pending > 0 && navigator.onLine) {
      await flushQueue(api)
    }
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
    async (res) => {
      const cfg = res.config
      setOnline(true)
      // Until a shift opened/closed offline is uploaded, the server's answer is out of
      // date — show the shift as this PC knows it.
      if (cfg.url === '/shifts/current' && (cfg.method || 'get').toLowerCase() === 'get' && await hasQueuedShiftChange()) {
        const local = await idbGet(currentShiftKey())
        if (local !== undefined) return { ...res, data: local }
      }
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
        const rep = SHIFT_REPORT.exec(url)
        if (rep) {
          const cur: any = await idbGet(currentShiftKey())
          if (cur && String(cur.id) === rep[1]) {
            return fakeResponse(cfg, { report_type: 'X', shift: cur, breakdown: await localBreakdown(cur), pending_deliveries: 0 })
          }
        }
        const sale = SALE_GET.exec(url)
        if (sale) {
          const cachedSale = await idbGet(cacheKey(cfg))
          const fromPack = await offlineInvoice(Number(sale[1]))
          // Prefer the recent-invoices copy: it includes returns queued on this PC.
          if (fromPack) return fakeResponse(cfg, fromPack)
          if (cachedSale !== undefined) return fakeResponse(cfg, cachedSale)
        }
        if (url === '/sales/search' && cfg.params?.q != null) {
          const cachedSearch = await idbGet(cacheKey(cfg))
          return fakeResponse(cfg, cachedSearch ?? await searchOfflineInvoices(String(cfg.params.q)))
        }
        if (url === '/products' && cfg.params?.q != null) {
          return fakeResponse(cfg, await searchOfflineProducts(String(cfg.params.q)))
        }
        const cached = await idbGet(cacheKey(cfg))
        if (cached !== undefined) return fakeResponse(cfg, cached)
      }
      if (WRITE_METHODS.has(method)) {
        let payload: any = cfg.data
        try { if (typeof payload === 'string') payload = JSON.parse(payload) } catch { /* not JSON */ }
        if (url === '/sales' && payload?.type !== 'return') return fakeResponse(cfg, await queueSale(payload))
        if (url === '/shifts/open') return fakeResponse(cfg, await queueShiftOpen(payload))
        if (SHIFT_CLOSE.test(url)) return fakeResponse(cfg, await queueShiftClose(url, payload))
        const dlv = DELIVERY_STATUS.exec(url)
        if (dlv) {
          await queueEntry('delivery', url, payload, `DELIVERY-${dlv[1]}`)
          return fakeResponse(cfg, { id: Number(dlv[1]), delivery_status: payload?.status, offline: true })
        }
        const ret = SALE_RETURN.exec(url)
        if (!ret && url !== '/sales' && !NOT_QUEUED.test(url) && !READ_LIKE.test(url) && !(cfg.data instanceof FormData)
          && !SHIFT_CLOSE.test(url) && url !== '/shifts/open') {
          await queueEntry('generic', url, payload, `${method.toUpperCase()} ${url}`, {
            method, client_uuid: String(cfg.headers?.['X-Idempotency-Key'] || uuid()),
          })
          window.dispatchEvent(new CustomEvent('fps-offline-queued'))
          return { ...fakeResponse(cfg, { ...(payload && typeof payload === 'object' ? payload : {}), offline: true, queued: true }), status: 202 }
        }
        if (ret) {
          if (Number(ret[1]) < 0) {
            return Promise.reject(Object.assign(new Error('This sale is still waiting to upload — make the return after it uploads.'), {
              response: { status: 400, data: { detail: 'This sale is still waiting to upload — make the return after it uploads.' } },
            }))
          }
          try {
            return fakeResponse(cfg, await queueReturn(url, Number(ret[1]), payload))
          } catch (e: any) {
            return Promise.reject(Object.assign(e, { response: { status: 400, data: { detail: e.message } } }))
          }
        }
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
