import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search,
  ShoppingCart,
  X,
  Plus,
  Minus,
  Tag,
  ScanLine,
  User,
  UserCircle2,
  Trash2,
  CornerDownLeft,
  RotateCcw,
  Pause,
  ClipboardList,
  ExternalLink,
  Pill,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../lib/auth'
import PaymentModal from '../components/PaymentModal'
import ReceiptModal from '../components/ReceiptModal'
import PrescriptionBell from '../components/PrescriptionBell'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { productsAPI, employeesAPI, customersAPI } from '../lib/api'
import api from '../lib/api'
import type { Product, CartItem, Employee, Customer, SaleResponse, Prescription } from '../lib/api'
import i18n from '../lib/i18n'
import { formatMoney } from '../lib/formatNumber'
import {
  barcodeSearchQueries,
  looksLikeScannerInput,
  matchProductByBarcode,
} from '../lib/barcodeSearch'
import { applyOffersToCart, type PromoOffer } from '../lib/offerEngine'
import OffersPosButton from '../components/OffersPosButton'
import DoseLabelPrint, { type DoseLabelItem } from '../components/DoseLabelPrint'

interface HeldCart {
  id: string
  ts: number
  items: CartItem[]
  invoiceDiscount: number
  invoiceDiscountMode: 'amount' | 'percent'
  customer: Customer | null
  seller: Employee | null
  clinic?: { id: number; name: string } | null
  rxId?: number | null
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const calcLineDiscount = (gross: number, mode: 'amount' | 'percent' | undefined, value: number | undefined): number => {
  const v = Math.max(0, value || 0)
  const d = mode === 'percent' ? (gross * v) / 100 : v
  return Math.min(gross, Math.max(0, +d.toFixed(2)))
}

const normalizeItem = (i: CartItem): CartItem =>
  i.discount_value == null && i.discount > 0
    ? { ...i, discount_mode: 'amount', discount_value: i.discount }
    : i

/** EGP / % toggle — shared by line-item and invoice discount rows */
function DiscountModeToggle({
  mode,
  onAmount,
  onPercent,
  size = 'md',
}: {
  mode: 'amount' | 'percent'
  onAmount: () => void
  onPercent: () => void
  size?: 'sm' | 'md'
}) {
  const { t } = useTranslation()
  const large = size === 'md'
  const wrap = large
    ? 'inline-flex gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-100 p-1'
    : 'inline-flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5'
  const btn = (active: boolean) =>
    large
      ? `min-h-[44px] min-w-[4.5rem] px-4 py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
          active
            ? 'bg-pharma-600 text-white border-pharma-600 shadow-md'
            : 'bg-white text-slate-600 border-slate-200 hover:border-pharma-400 hover:bg-pharma-50'
        }`
      : `min-h-[36px] min-w-[3.25rem] px-3 py-2 rounded-md border-2 text-xs font-bold transition-all ${
          active
            ? 'bg-pharma-600 text-white border-pharma-600 shadow-sm'
            : 'bg-white text-slate-600 border-slate-200 hover:border-pharma-300'
        }`
  return (
    <div className={wrap} role="group" aria-label={t('pos.discount') as string}>
      <button
        type="button"
        onClick={onAmount}
        className={btn(mode === 'amount')}
        title={t('pos.by_amount') as string}
      >
        {large ? t('pos.by_amount') : t('pos.egp')}
      </button>
      <button
        type="button"
        onClick={onPercent}
        className={btn(mode === 'percent')}
        title={t('pos.by_percent') as string}
      >
        {large ? t('pos.by_percent') : '%'}
      </button>
    </div>
  )
}

const normalizeItems = (items: CartItem[]): CartItem[] => items.map(normalizeItem)

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

const POS_HEARTBEAT_KEY = 'pharma_pos_heartbeat'

function getPosWindowId(): string {
  try {
    let id = sessionStorage.getItem('pos_window_id')
    if (!id) {
      id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem('pos_window_id', id)
    }
    return id
  } catch {
    return 'w0'
  }
}

export default function POS() {
  const { t } = useTranslation()
  const lang = i18n.language
  const { user, tenant, hasFeature } = useAuth()

  const posWindowId = useMemo(() => getPosWindowId(), [])
  const scope = `${tenant?.slug || 't'}_${user?.id || 'u'}_${localStorage.getItem('pharma_active_branch') || '0'}_${posWindowId}`
  const CART_KEY = `pos_cart_${scope}`
  const DISCOUNT_KEY = `pos_discount_${scope}`
  const DISCMODE_KEY = `pos_discmode_${scope}`
  const SELLER_KEY = `pos_seller_${scope}`
  const CUSTOMER_KEY = `pos_customer_${scope}`
  const RXCLINIC_KEY = `pos_rxclinic_${scope}`
  const RXID_KEY = `pos_rxid_${scope}`
  const HELD_KEY = `pos_held_${scope}`
  const recallLock = useRef(false)

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [showResults, setShowResults] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const sellerScanRef = useRef<HTMLInputElement>(null)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [sellerScanCode, setSellerScanCode] = useState('')
  const [sellerScanFeedback, setSellerScanFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedSeller, setSelectedSeller] = useState<Employee | null>(() => loadJSON<Employee | null>(SELLER_KEY, null))
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => loadJSON<Customer | null>(CUSTOMER_KEY, null))
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerList, setShowCustomerList] = useState(false)

  const [cartItems, setCartItems] = useState<CartItem[]>(() => normalizeItems(loadJSON<CartItem[]>(CART_KEY, [])))
  const [rxClinic, setRxClinic] = useState<{ id: number; name: string } | null>(() => loadJSON<{ id: number; name: string } | null>(RXCLINIC_KEY, null))
  const [rxId, setRxId] = useState<number | null>(() => loadJSON<number | null>(RXID_KEY, null))
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(() => loadJSON<number>(DISCOUNT_KEY, 0))
  const [invoiceDiscountMode, setInvoiceDiscountMode] = useState<'amount' | 'percent'>(() => loadJSON<'amount' | 'percent'>(DISCMODE_KEY, 'amount'))

  const [held, setHeld] = useState<HeldCart[]>(() => loadJSON<HeldCart[]>(HELD_KEY, []))
  const [showHeld, setShowHeld] = useState(false)

  const [doseLabelItems, setDoseLabelItems] = useState<DoseLabelItem[] | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [lastSale, setLastSale] = useState<SaleResponse | null>(null)
  const [openShift, setOpenShift] = useState<{ id: number } | null>(null)
  const [shiftLoading, setShiftLoading] = useState(true)

  const [pharmacyName, setPharmacyName] = useState<string>('')
  const [activeOffers, setActiveOffers] = useState<PromoOffer[]>([])
  const offersEnabled = hasFeature('offers')

  const pricedCart = useMemo(() => {
    if (!offersEnabled || !activeOffers.length) {
      return {
        items: cartItems,
        offerIds: [] as number[],
        offerSavings: 0,
        offerNames: '',
      }
    }
    return applyOffersToCart(cartItems, activeOffers)
  }, [cartItems, activeOffers, offersEnabled])

  const displayCart = pricedCart.items

  const refreshShift = useCallback(() => {
    setShiftLoading(true)
    api.get('/shifts/current')
      .then((r) => setOpenShift(r.data ? { id: r.data.id } : null))
      .catch(() => setOpenShift(null))
      .finally(() => setShiftLoading(false))
  }, [])

  useEffect(() => { refreshShift() }, [refreshShift])

  // Keep terminal unlocked while this POS window is open (shared across tabs via localStorage).
  useEffect(() => {
    const beat = () => {
      try { localStorage.setItem(POS_HEARTBEAT_KEY, String(Date.now())) } catch { /* ignore */ }
    }
    beat()
    const id = setInterval(beat, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    api.get<{ name_en?: string | null; name_ar?: string | null }>('/settings/profile')
      .then((r) => {
        const n = lang === 'ar'
          ? (r.data.name_ar || r.data.name_en || '')
          : (r.data.name_en || r.data.name_ar || '')
        setPharmacyName(n || '')
      })
      .catch(() => setPharmacyName(''))
  }, [lang])

  useEffect(() => {
    if (!offersEnabled) return
    api.get<PromoOffer[]>('/offers/active')
      .then((r) => setActiveOffers(r.data))
      .catch(() => setActiveOffers([]))
  }, [offersEnabled])

  const subtotal = useMemo(
    () => displayCart.reduce((sum, item) => sum + item.quantity * item.unit_price - item.discount, 0),
    [displayCart]
  )
  const effectiveInvoiceDiscount = Math.min(
    subtotal,
    Math.max(0, +(invoiceDiscountMode === 'percent' ? (subtotal * invoiceDiscount) / 100 : invoiceDiscount).toFixed(2))
  )
  const netTotal = Math.max(0, subtotal - effectiveInvoiceDiscount)
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0)

  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cartItems)) } catch { /* ignore */ } }, [cartItems, CART_KEY])
  useEffect(() => { try { localStorage.setItem(DISCOUNT_KEY, JSON.stringify(invoiceDiscount)) } catch { /* ignore */ } }, [invoiceDiscount, DISCOUNT_KEY])
  useEffect(() => { try { localStorage.setItem(DISCMODE_KEY, JSON.stringify(invoiceDiscountMode)) } catch { /* ignore */ } }, [invoiceDiscountMode, DISCMODE_KEY])
  useEffect(() => { try { localStorage.setItem(SELLER_KEY, JSON.stringify(selectedSeller)) } catch { /* ignore */ } }, [selectedSeller, SELLER_KEY])
  useEffect(() => { try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(selectedCustomer)) } catch { /* ignore */ } }, [selectedCustomer, CUSTOMER_KEY])
  useEffect(() => { try { localStorage.setItem(RXCLINIC_KEY, JSON.stringify(rxClinic)) } catch { /* ignore */ } }, [rxClinic, RXCLINIC_KEY])
  useEffect(() => { try { localStorage.setItem(RXID_KEY, JSON.stringify(rxId)) } catch { /* ignore */ } }, [rxId, RXID_KEY])
  useEffect(() => { try { localStorage.setItem(HELD_KEY, JSON.stringify(held)) } catch { /* ignore */ } }, [held, HELD_KEY])

  const suspendCurrent = useCallback(() => {
    if (cartItems.length === 0) { alert(t('pos.suspend_none')); return }
    const h: HeldCart = { id: makeId(), ts: Date.now(), items: cartItems, invoiceDiscount, invoiceDiscountMode, customer: selectedCustomer, seller: selectedSeller, clinic: rxClinic, rxId }
    setHeld((prev) => [h, ...prev])
    setCartItems([]); setInvoiceDiscount(0); setSelectedCustomer(null); setSelectedSeller(null); setRxClinic(null); setRxId(null)
    searchRef.current?.focus()
  }, [cartItems, invoiceDiscount, invoiceDiscountMode, selectedCustomer, selectedSeller, rxClinic, rxId, t])

  const recallHeld = useCallback((id: string) => {
    if (recallLock.current) return
    const h = held.find((x) => x.id === id)
    if (!h) return
    recallLock.current = true
    setTimeout(() => { recallLock.current = false }, 500)
    setHeld((prev) => {
      let next = prev.filter((x) => x.id !== id)
      if (cartItems.length > 0) {
        next = [{ id: makeId(), ts: Date.now(), items: cartItems, invoiceDiscount, invoiceDiscountMode, customer: selectedCustomer, seller: selectedSeller, clinic: rxClinic, rxId }, ...next]
      }
      return next
    })
    setCartItems(normalizeItems(h.items)); setInvoiceDiscount(h.invoiceDiscount); setInvoiceDiscountMode(h.invoiceDiscountMode || 'amount'); setSelectedCustomer(h.customer); setSelectedSeller(h.seller); setRxClinic(h.clinic ?? null); setRxId(h.rxId ?? null)
    setShowHeld(false)
    searchRef.current?.focus()
  }, [held, cartItems, invoiceDiscount, invoiceDiscountMode, selectedCustomer, selectedSeller, rxClinic, rxId])

  const deleteHeld = useCallback((id: string) => {
    setHeld((prev) => prev.filter((x) => x.id !== id))
  }, [])

  useEffect(() => {
    employeesAPI.list().then((r) => setEmployees(r.data))
  }, [])

  const applySellerScan = useCallback(async () => {
    const code = sellerScanCode.trim()
    if (!code) return
    try {
      const { data } = await employeesAPI.lookupByCode(code)
      setSelectedSeller(data)
      setEmployees((prev) => (prev.some((e) => e.id === data.id) ? prev : [...prev, data]))
      setSellerScanCode('')
      setSellerScanFeedback({ type: 'ok', text: t('pos.seller_scan_ok') as string })
      sellerScanRef.current?.focus()
      window.setTimeout(() => setSellerScanFeedback(null), 2500)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSellerScanFeedback({
        type: 'err',
        text: typeof detail === 'string' ? detail : (t('pos.seller_scan_fail') as string),
      })
      sellerScanRef.current?.select()
    }
  }, [sellerScanCode, t])

  const selectSelfAsSeller = useCallback(() => {
    if (!user) return
    const me = employees.find((e) => e.id === user.id)
    if (me) {
      setSelectedSeller(me)
      setSellerScanFeedback({ type: 'ok', text: t('pos.seller_scan_ok') as string })
      window.setTimeout(() => setSellerScanFeedback(null), 2000)
    }
  }, [user, employees, t])

  useEffect(() => {
    customersAPI.listV2({}).then((r) => setCustomers(r.data)).catch(() => setCustomers([]))
    searchRef.current?.focus()
  }, [])

  const clearSearch = useCallback(() => {
    setSearch('')
    setResults([])
    setShowResults(false)
  }, [])

  // Selling is allowed even when stock is zero or negative; replenishment nets it out.
  const maxQty = useCallback((_p: Product, _unit_type: 'pack' | 'sub') => {
    return 999999
  }, [])

  const addToCart = useCallback((product: Product) => {
    if (product.expiry_date) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const exp = new Date(product.expiry_date)
      const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000)
      if (diffDays < 0) {
        alert(`${product.name_en} — expired on ${product.expiry_date}. Cannot sell expired products.`)
        return
      }
      if (diffDays <= 30) {
        const ok = confirm(`⚠️ ${product.name_en} expires in ${diffDays} day(s) (${product.expiry_date}). Add anyway?`)
        if (!ok) return
      }
    }
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        if (existing.quantity >= maxQty(product, existing.unit_type || 'pack')) return prev
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1, discount: calcLineDiscount((i.quantity + 1) * i.unit_price, i.discount_mode, i.discount_value) }
            : i
        )
      }
      return [...prev, { product, quantity: 1, unit_price: product.price, discount: 0, discount_mode: 'amount', discount_value: 0, unit_type: 'pack' }]
    })
    setSearch('')
    setResults([])
    setShowResults(false)
    searchRef.current?.focus()
  }, [t, maxQty])

  // Debounced search — strips wedge noise (C85947-13C) and matches DB code (85947).
  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      setShowResults(false)
      return
    }
    setSearching(true)
    const raw = search.trim()
    const queries = barcodeSearchQueries(raw)
    const timer = setTimeout(() => {
      const run = async () => {
        const merged = new Map<number, Product>()
        for (const q of queries) {
          const r = await productsAPI.search(q)
          for (const p of r.data) merged.set(p.id, p)
          const hit = matchProductByBarcode(r.data, raw)
          if (hit) {
            if (looksLikeScannerInput(raw)) {
              addToCart(hit)
              clearSearch()
              searchRef.current?.focus()
              return
            }
            setResults([hit])
            setShowResults(true)
            setHighlight(0)
            return
          }
        }
        const list = [...merged.values()].slice(0, 12)
        setResults(list)
        setShowResults(true)
        setHighlight(0)
      }
      run().finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [search, addToCart, clearSearch])

  const loadPrescription = useCallback(async (rx: Prescription): Promise<string[]> => {
    setRxClinic({ id: rx.clinic_id, name: rx.clinic_name })
    setRxId(rx.id)
    const unmatched: string[] = []
    for (const it of rx.items) {
      const name = (it.medicine_name || '').trim()
      if (!name) continue
      let product: Product | undefined
      try {
        const r = await productsAPI.search(name)
        const items = r.data || []
        product = matchProductByBarcode(items, name) || items.find((p) =>
          p.name_en?.toLowerCase() === name.toLowerCase() ||
          p.name_ar === name ||
          p.barcode === name,
        ) || (items.length === 1 ? items[0] : undefined)
      } catch { /* ignore */ }
      if (!product) { unmatched.push(`${it.quantity}× ${name}`); continue }
      const qty = Math.max(1, it.quantity || 1)
      const found = product
      setCartItems((prev) => {
        const existing = prev.find((i) => i.product.id === found.id)
        if (existing) {
          const q = existing.quantity + qty
          return prev.map((i) =>
            i.product.id === found.id
              ? { ...i, quantity: q, discount: calcLineDiscount(q * i.unit_price, i.discount_mode, i.discount_value) }
              : i,
          )
        }
        return [...prev, { product: found, quantity: qty, unit_price: found.price, discount: 0, discount_mode: 'amount', discount_value: 0, unit_type: 'pack' }]
      })
    }
    return unmatched
  }, [])

  // Toggle a cart line between "pack" and "sub" units.
  const setUnitType = useCallback((productId: number, ut: 'pack' | 'sub') => {
    setCartItems((prev) => prev.map((i) => {
      if (i.product.id !== productId) return i
      const pack = Math.max(1, i.product.pack_size || 1)
      const price = ut === 'sub'
        ? (i.product.sub_price != null ? Number(i.product.sub_price) : i.product.price / pack)
        : i.product.price
      const q = Math.max(1, i.quantity)
      return { ...i, unit_type: ut, unit_price: price, quantity: q, discount: calcLineDiscount(q * price, i.discount_mode, i.discount_value) }
    }))
  }, [])

  const removeFromCart = useCallback((productId: number) => {
    setCartItems((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  const updateQty = useCallback((productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId)
      return
    }
    setCartItems((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, quantity: qty, discount: calcLineDiscount(qty * i.unit_price, i.discount_mode, i.discount_value) }
          : i
      )
    )
  }, [removeFromCart])

  const setItemDiscount = useCallback((productId: number, mode: 'amount' | 'percent', value: number) => {
    setCartItems((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i
        const gross = i.quantity * i.unit_price
        return { ...i, discount_mode: mode, discount_value: value, discount: calcLineDiscount(gross, mode, value) }
      })
    )
  }, [])

  const resolveScanToProduct = useCallback(async (code: string) => {
    const raw = code.trim()
    if (!raw) return
    const tried = new Set<string>()
    for (const q of barcodeSearchQueries(raw)) {
      const key = q.toUpperCase()
      if (tried.has(key)) continue
      tried.add(key)
      const r = await productsAPI.search(q)
      const matched = matchProductByBarcode(r.data, raw)
      if (matched) {
        addToCart(matched)
        return
      }
    }
  }, [addToCart])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) {
      if (e.key === 'Enter' && search.trim()) {
        e.preventDefault()
        void resolveScanToProduct(search)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const scanned = matchProductByBarcode(results, search)
      if (scanned) {
        addToCart(scanned)
        return
      }
      const p = results[highlight]
      if (p) addToCart(p)
    } else if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  const handleSaleSuccess = (sale: SaleResponse) => {
    setLastSale(sale)
    setShowPaymentModal(false)
    setShowReceiptModal(true)
    refreshShift()
    setCartItems([])
    setInvoiceDiscount(0)
    setSelectedCustomer(null)
    setSelectedSeller(null)
    setRxClinic(null)
    setRxId(null)
  }

  const handleNewSale = () => {
    setShowReceiptModal(false)
    setLastSale(null)
    searchRef.current?.focus()
  }

  const canCheckout = !!openShift && !shiftLoading

  const tryCheckout = () => {
    if (!canCheckout) return
    setShowPaymentModal(true)
  }

  return (
    <Layout>
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {!shiftLoading && !openShift && (
        <div className="mx-4 mt-3 flex-shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{t('pos.shift_required')}</span>
          <Link to="/shifts" className="font-semibold text-pharma-700 hover:underline whitespace-nowrap">
            {t('pos.open_shift')} →
          </Link>
        </div>
      )}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ──────────── Main work area: scan + cart ──────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header strip: title + refund-receipt shortcut */}
          <div className="px-6 pt-5 pb-2 bg-white">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <div className="min-w-0">
                {pharmacyName ? (
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="pharmacy-dot" aria-hidden="true" />
                    <h1
                      key={pharmacyName + lang}
                      className="pharmacy-name-anim shine text-xl sm:text-2xl font-extrabold leading-tight tracking-tight truncate"
                      title={pharmacyName}
                    >
                      {pharmacyName}
                    </h1>
                  </div>
                ) : (
                  <h1 className="text-lg font-bold text-slate-800 leading-tight">{t('nav.pos')}</h1>
                )}
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {pharmacyName ? `${t('nav.pos')} • ${t('pos.header_hint')}` : t('pos.header_hint')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {offersEnabled && activeOffers.length > 0 && (
                  <OffersPosButton
                    offers={activeOffers}
                    onSelectProduct={async (productId) => {
                      try {
                        const r = await productsAPI.search(String(productId))
                        const p = r.data.find((x) => x.id === productId)
                        if (p) addToCart(p)
                      } catch { /* ignore */ }
                    }}
                  />
                )}
                {hasFeature('clinics') && <PrescriptionBell onLoad={loadPrescription} />}
                <button
                  type="button"
                  onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 transition-colors"
                  title={t('pos.new_window_hint') as string}
                >
                  <ExternalLink size={14} />
                  {t('pos.new_window')}
                </button>
                <Link
                  to="/sales?refund=1"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-3 py-2 transition-colors"
                  title={t('pos.refund_receipt_hint')}
                >
                  <RotateCcw size={14} /> {t('pos.refund_receipt')}
                </Link>
              </div>
            </div>
          </div>

          {/* Scan / search bar */}
          <div className="px-6 pb-4 bg-white border-b border-slate-200">
            <div className="max-w-3xl mx-auto relative">
              <div className="relative">
                <ScanLine
                  size={22}
                  className="absolute start-4 top-1/2 -translate-y-1/2 text-pharma-600"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  placeholder={t('pos.search_placeholder')}
                  className="w-full ps-14 pe-12 py-4 border-2 border-slate-200 rounded-2xl text-base bg-slate-50 focus:outline-none focus:border-pharma-500 focus:bg-white focus:shadow-lg focus:shadow-pharma-100 transition-all placeholder:text-slate-400"
                  autoComplete="off"
                  spellCheck={false}
                />
                {search ? (
                  <button
                    onClick={() => { setSearch(''); setResults([]); searchRef.current?.focus() }}
                    className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                    tabIndex={-1}
                  >
                    <X size={18} />
                  </button>
                ) : (
                  <kbd className="hidden sm:flex absolute end-4 top-1/2 -translate-y-1/2 items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-md font-mono">
                    <Search size={10} /> Scan or type
                  </kbd>
                )}
              </div>

              {/* Search results dropdown */}
              {showResults && (
                <div className="absolute z-20 inset-x-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[55vh] overflow-y-auto">
                  {searching && results.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                      <LoadingSpinner size={16} />
                      {t('common.loading')}
                    </div>
                  ) : results.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-400">{t('pos.no_products')}</div>
                  ) : (
                    results.map((p, idx) => {
                      const name = lang === 'ar' ? p.name_ar : p.name_en
                      const isOut = p.stock <= 0
                      const isLow = !isOut && p.stock <= p.min_stock
                      return (
                        <button
                          key={p.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addToCart(p)}
                          className={`w-full flex items-center gap-4 px-5 py-3 text-start border-b border-slate-50 last:border-0 transition-colors ${
                            idx === highlight ? 'bg-pharma-50' : 'hover:bg-slate-50'
                          }`}
                          onMouseEnter={() => setHighlight(idx)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{name}</p>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px]">
                              {p.category && (
                                <span className="text-pharma-600 font-medium">{p.category}</span>
                              )}
                              {p.barcode && (
                                <span className="text-slate-400 font-mono">{p.barcode}</span>
                              )}
                              <span
                                className={`font-medium ${
                                  isOut ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-slate-400'
                                }`}
                              >
                                {isOut
                                  ? t('pos.out_of_stock')
                                  : `${p.stock} ${t('pos.in_stock')}`}
                              </span>
                            </div>
                          </div>
                          <div className="text-end flex-shrink-0">
                            <p className="text-pharma-700 font-bold tabular-nums">
                              {t('pos.egp')} {formatMoney(p.price)}
                            </p>
                          </div>
                          {idx === highlight && (
                            <CornerDownLeft size={14} className="text-pharma-500 flex-shrink-0" />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cart items list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="max-w-3xl mx-auto">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-24 text-slate-300">
                  <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <ShoppingCart size={42} strokeWidth={1.5} />
                  </div>
                  <p className="text-slate-500 font-medium mb-1">{t('pos.empty_cart')}</p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    {t('pos.search_placeholder')}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={16} className="text-pharma-600" />
                      <h2 className="font-bold text-slate-800 text-sm">{t('pos.cart')}</h2>
                      <span className="bg-pharma-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                        {cartCount}
                      </span>
                    </div>
                    <button
                      onClick={() => { setCartItems([]); setInvoiceDiscount(0); setRxClinic(null); setRxId(null) }}
                      className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                  </div>
                  {rxClinic && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 mx-3 mt-2 rounded-lg bg-pharma-50 border border-pharma-100">
                      <span className="text-[11px] font-semibold text-pharma-700 truncate">
                        {t('pos.from_clinic')}: {rxClinic.name}
                      </span>
                      <button onClick={() => { setRxClinic(null); setRxId(null) }}
                        className="text-pharma-400 hover:text-red-500 shrink-0" title={t('pos.clear_clinic') as string}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  <div className="divide-y divide-slate-100">
                    {displayCart.map((item) => {
                      const name = lang === 'ar' ? item.product.name_ar : item.product.name_en
                      const itemTotal = item.quantity * item.unit_price - item.discount
                      const pack = Math.max(1, item.product.pack_size || 1)
                      const hasSub = pack > 1 && !!item.product.sub_unit
                      const ut = item.unit_type || 'pack'
                      const max = maxQty(item.product, ut)
                      const unitLabel = ut === 'sub' ? item.product.sub_unit : item.product.unit
                      return (
                        <div key={item.product.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{name}</p>
                            <p className="text-[11px] text-slate-400 tabular-nums">
                              {t('pos.egp')} {formatMoney(item.unit_price)} × {item.quantity} {unitLabel}
                            </p>
                            {(item.offer_discount || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wide text-pharma-700 bg-pharma-100 px-2 py-0.5 rounded-full">
                                <Tag size={10} /> {t('pos.offer_applied')} −{formatMoney(item.offer_discount || 0)}
                              </span>
                            )}
                            {hasSub && (
                              <div className="mt-1 inline-flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
                                <button
                                  onClick={() => setUnitType(item.product.id, 'pack')}
                                  className={`px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide ${
                                    ut === 'pack' ? 'bg-white text-pharma-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  {item.product.unit}
                                </button>
                                <button
                                  onClick={() => setUnitType(item.product.id, 'sub')}
                                  className={`px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide ${
                                    ut === 'sub' ? 'bg-white text-pharma-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  {item.product.sub_unit}
                                </button>
                              </div>
                            )}
                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-1.5">
                                {t('pos.item_discount')}
                              </p>
                              <div className="flex flex-wrap items-stretch gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={item.discount_value || ''}
                                  onChange={(e) =>
                                    setItemDiscount(
                                      item.product.id,
                                      item.discount_mode || 'amount',
                                      Math.max(0, parseFloat(e.target.value) || 0),
                                    )
                                  }
                                  placeholder={item.discount_mode === 'percent' ? '0' : '0.00'}
                                  className="w-24 min-h-[36px] text-sm text-end font-semibold border-2 border-emerald-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-pharma-500 focus:ring-2 focus:ring-pharma-100 bg-white tabular-nums"
                                />
                                <DiscountModeToggle
                                  size="sm"
                                  mode={item.discount_mode || 'amount'}
                                  onAmount={() =>
                                    setItemDiscount(item.product.id, 'amount', item.discount_value || 0)
                                  }
                                  onPercent={() =>
                                    setItemDiscount(item.product.id, 'percent', item.discount_value || 0)
                                  }
                                />
                                {item.discount > 0 && (
                                  <span className="self-center text-xs text-emerald-700 font-bold tabular-nums px-1">
                                    − {formatMoney(item.discount)} {t('pos.egp')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
                            <button
                              onClick={() => updateQty(item.product.id, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={max}
                              value={item.quantity}
                              onChange={(e) => {
                                const v = parseInt(e.target.value || '0', 10)
                                if (!isNaN(v) && v > 0) updateQty(item.product.id, Math.min(v, max))
                              }}
                              className="w-12 text-center text-sm font-bold text-slate-800 tabular-nums bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-pharma-200 rounded"
                            />
                            <button
                              onClick={() => updateQty(item.product.id, item.quantity + 1)}
                              disabled={item.quantity >= max}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-600 disabled:opacity-30 transition-all"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div className="w-24 text-end font-bold text-pharma-700 tabular-nums text-sm">
                            {t('pos.egp')} {formatMoney(itemTotal)}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDoseLabelItems([{
                              id: item.product.id,
                              name: name || item.product.name_en,
                              doseText: '',
                              defaultQty: 1,
                              patientName: selectedCustomer?.name || '',
                            }])}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                            title={t('dose_labels.pos_btn') as string}
                          >
                            <Pill size={15} />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.product.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ──────────── Summary sidebar ──────────── */}
        <aside className="w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden border-s border-slate-200 bg-white shadow-xl">
          <div className="shrink-0 px-5 py-4 border-b border-slate-100">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              {t('payment.summary')}
            </h3>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Seller / Customer */}
          <div className="px-5 py-4 space-y-3 border-b border-slate-100">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                <UserCircle2 size={13} /> {t('pos.seller')}
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSeller?.id ?? ''}
                  onChange={(e) => {
                    const emp = employees.find((em) => em.id === parseInt(e.target.value))
                    setSelectedSeller(emp || null)
                    setSellerScanFeedback(null)
                  }}
                  className={`flex-1 min-w-0 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pharma-100 ${
                    selectedSeller
                      ? 'border border-slate-200 bg-slate-50 text-slate-700 focus:border-pharma-400'
                      : 'border-2 border-red-300 bg-red-50 text-red-800 font-semibold focus:border-red-400'
                  }`}
                >
                  <option value="">{t('pos.select_seller')}</option>
                  {employees.map((e) => {
                    const display = lang === 'ar'
                      ? (e.name_ar || e.name_en || `#${e.id}`)
                      : (e.name_en || e.name_ar || `#${e.id}`)
                    return (
                      <option key={e.id} value={e.id}>
                        {display}
                      </option>
                    )
                  })}
                </select>
                {user && employees.some((e) => e.id === user.id) && (
                  <button
                    type="button"
                    onClick={selectSelfAsSeller}
                    className="flex-shrink-0 text-xs font-semibold px-2.5 py-2.5 rounded-xl border border-pharma-200 bg-pharma-50 text-pharma-700 hover:bg-pharma-100"
                    title={t('pos.seller_me') as string}
                  >
                    {t('pos.seller_me')}
                  </button>
                )}
                {selectedSeller && (
                  <button
                    type="button"
                    onClick={() => { setSelectedSeller(null); setSellerScanFeedback(null) }}
                    className="flex-shrink-0 text-slate-400 hover:text-red-500 p-2"
                    title={t('pos.clear_seller') as string}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 mb-1">{t('pos.scan_seller_or')}</p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <ScanLine size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={sellerScanRef}
                    type="text"
                    value={sellerScanCode}
                    onChange={(e) => { setSellerScanCode(e.target.value); setSellerScanFeedback(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void applySellerScan()
                      }
                    }}
                    placeholder={t('pos.scan_seller_placeholder') as string}
                    aria-label={t('pos.scan_seller') as string}
                    className="w-full text-sm border border-slate-200 rounded-xl ps-9 pe-3 py-2 focus:outline-none focus:border-pharma-400 focus:ring-2 focus:ring-pharma-100 bg-white text-slate-700 font-mono"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void applySellerScan()}
                  disabled={!sellerScanCode.trim()}
                  className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  {t('pos.scan_seller_apply')}
                </button>
              </div>
              {sellerScanFeedback && (
                <p
                  className={`text-xs mt-1.5 ${sellerScanFeedback.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
                  role="status"
                >
                  {sellerScanFeedback.text}
                </p>
              )}
            </div>

            <div className="relative">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                <User size={13} /> {t('pos.customer')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ' · ' + selectedCustomer.phone : ''}` : customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setSelectedCustomer(null)
                    setShowCustomerList(true)
                  }}
                  onFocus={() => setShowCustomerList(true)}
                  onBlur={() => setTimeout(() => setShowCustomerList(false), 200)}
                  placeholder={t('pos.walk_in') as string}
                  className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pharma-400 focus:ring-2 focus:ring-pharma-100 bg-slate-50 text-slate-700"
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                    className="text-slate-400 hover:text-red-500 p-1"
                    title={t('pos.walk_in') as string}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {showCustomerList && !selectedCustomer && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {customers
                    .filter((c) => {
                      const q = customerSearch.trim().toLowerCase()
                      if (!q) return true
                      return (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
                    })
                    .slice(0, 30)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setShowCustomerList(false) }}
                        className="w-full text-start px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <div className="font-medium text-slate-800">{c.name}</div>
                        {c.phone && <div className="text-xs text-slate-500 font-mono">{c.phone}</div>}
                      </button>
                    ))}
                  {customers.filter((c) => {
                    const q = customerSearch.trim().toLowerCase()
                    if (!q) return false
                    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
                  }).length === 0 && customerSearch.trim() && (
                    <div className="px-3 py-3 text-xs text-slate-400 text-center">{t('customers.empty')}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('pos.subtotal')}</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {t('pos.egp')} {formatMoney(subtotal)}
              </span>
            </div>
            {pricedCart.offerSavings > 0 && (
              <div className="flex justify-between text-sm text-pharma-700 bg-pharma-50 rounded-lg px-3 py-2 border border-pharma-100">
                <span className="font-medium">{t('pos.offer_savings')}</span>
                <span className="font-bold tabular-nums">− {t('pos.egp')} {formatMoney(pricedCart.offerSavings)}</span>
              </div>
            )}

            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <Tag size={16} className="text-amber-600 shrink-0" />
                {t('pos.discount')}
              </label>
              <div className="flex flex-wrap items-stretch gap-2">
                <input
                  type="number"
                  value={invoiceDiscount || ''}
                  onChange={(e) =>
                    setInvoiceDiscount(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className="flex-1 min-w-[5rem] min-h-[44px] text-end text-lg font-bold border-2 border-amber-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pharma-500 focus:ring-2 focus:ring-pharma-100 bg-white tabular-nums"
                  placeholder={invoiceDiscountMode === 'percent' ? '0' : '0.00'}
                  min={0}
                />
                <DiscountModeToggle
                  size="md"
                  mode={invoiceDiscountMode}
                  onAmount={() => setInvoiceDiscountMode('amount')}
                  onPercent={() => setInvoiceDiscountMode('percent')}
                />
              </div>
            </div>
            {invoiceDiscountMode === 'percent' && effectiveInvoiceDiscount > 0 && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>{t('pos.discount')} ({invoiceDiscount}%)</span>
                <span className="tabular-nums">- {t('pos.egp')} {formatMoney(effectiveInvoiceDiscount)}</span>
              </div>
            )}

            <div className="border-t border-dashed border-slate-200 pt-3 mt-3" />

            <div className="flex justify-between items-baseline">
              <span className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                {t('pos.total')}
              </span>
              <span className="text-pharma-700 font-extrabold text-3xl tabular-nums leading-none">
                {formatMoney(netTotal)}
              </span>
            </div>
            <p className="text-end text-[10px] text-slate-400 uppercase tracking-wider -mt-1">
              {t('pos.egp')}
            </p>
          </div>
          </div>

          {/* Checkout — pinned so it is never clipped below the viewport */}
          <div className="shrink-0 px-5 pt-3 pb-5 space-y-2 border-t border-slate-100 bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={suspendCurrent}
                disabled={cartItems.length === 0}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm transition-all"
              >
                <Pause size={15} /> {t('pos.suspend')}
              </button>
              <button
                onClick={() => setShowHeld(true)}
                className="relative flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-semibold text-sm transition-all"
              >
                <ClipboardList size={15} /> {t('pos.held')}
                {held.length > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 bg-pharma-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px]">
                    {held.length}
                  </span>
                )}
              </button>
            </div>
            <button
              onClick={tryCheckout}
              disabled={cartItems.length === 0 || !canCheckout}
              title={!canCheckout ? (t('pos.shift_required') as string) : undefined}
              className="w-full bg-gradient-to-br from-pharma-600 to-pharma-700 hover:from-pharma-700 hover:to-pharma-800 active:scale-[0.98] disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-pharma-500/30 text-base tracking-wide"
            >
              {t('pos.checkout')} →
            </button>
          </div>
        </aside>
      </div>
      </div>

      {doseLabelItems && (
        <DoseLabelPrint
          items={doseLabelItems}
          onClose={() => setDoseLabelItems(null)}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          cartItems={displayCart}
          subtotal={subtotal}
          invoiceDiscount={effectiveInvoiceDiscount}
          netTotal={netTotal}
          offerIds={pricedCart.offerIds}
          offerSavings={pricedCart.offerSavings}
          offerNames={pricedCart.offerNames}
          selectedSeller={selectedSeller}
          selectedCustomer={selectedCustomer}
          clinicId={rxClinic?.id ?? null}
          prescriptionId={rxId}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handleSaleSuccess}
        />
      )}

      {showReceiptModal && lastSale && (
        <ReceiptModal sale={lastSale} onNewSale={handleNewSale} onClose={handleNewSale} />
      )}

      {showHeld && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowHeld(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList size={18} className="text-pharma-600" /> {t('pos.held_title')}
              </h3>
              <button onClick={() => setShowHeld(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {held.length === 0 ? (
                <div className="text-center text-slate-400 py-12 text-sm">{t('pos.held_empty')}</div>
              ) : (
                held.map((h) => {
                  const hSub = h.items.reduce((s, i) => s + i.quantity * i.unit_price - i.discount, 0)
                  const hDisc = h.invoiceDiscountMode === 'percent' ? (hSub * h.invoiceDiscount) / 100 : h.invoiceDiscount
                  const total = Math.max(0, hSub - Math.min(hSub, Math.max(0, hDisc)))
                  const count = h.items.reduce((s, i) => s + i.quantity, 0)
                  return (
                    <div key={h.id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate">
                          {h.customer ? h.customer.name : t('pos.walk_in')}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {count} {t('pos.items_n')} · {t('pos.egp')} {formatMoney(total)} · {new Date(h.ts).toLocaleTimeString()}
                        </div>
                      </div>
                      <button
                        onClick={() => recallHeld(h.id)}
                        className="px-3 py-1.5 rounded-lg bg-pharma-600 text-white text-xs font-semibold hover:bg-pharma-700"
                      >
                        {t('pos.recall')}
                      </button>
                      <button onClick={() => deleteHeld(h.id)} className="text-slate-300 hover:text-red-500 p-1">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
