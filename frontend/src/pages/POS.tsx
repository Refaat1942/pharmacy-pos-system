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
} from 'lucide-react'
import Header from '../components/Header'
import PaymentModal from '../components/PaymentModal'
import ReceiptModal from '../components/ReceiptModal'
import { productsAPI, employeesAPI, customersAPI } from '../lib/api'
import type { Product, CartItem, Employee, Customer, SaleResponse } from '../lib/api'
import i18n from '../lib/i18n'

export default function POS() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [showResults, setShowResults] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedSeller, setSelectedSeller] = useState<Employee | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [invoiceDiscount, setInvoiceDiscount] = useState(0)

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [lastSale, setLastSale] = useState<SaleResponse | null>(null)

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price - item.discount, 0),
    [cartItems]
  )
  const netTotal = Math.max(0, subtotal - invoiceDiscount)
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0)

  useEffect(() => {
    employeesAPI.list().then((r) => setEmployees(r.data))
    customersAPI.listV2({}).then((r) => setCustomers(r.data)).catch(() => setCustomers([]))
    searchRef.current?.focus()
  }, [])

  // Debounced search
  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      setShowResults(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      productsAPI
        .search(search.trim())
        .then((r) => {
          setResults(r.data.slice(0, 12))
          setShowResults(true)
          setHighlight(0)
        })
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) {
      alert(`${product.name_en} — ${t('pos.out_of_stock')}`)
      return
    }
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
        if (existing.quantity >= product.stock) return prev
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { product, quantity: 1, unit_price: product.price, discount: 0 }]
    })
    setSearch('')
    setResults([])
    setShowResults(false)
    searchRef.current?.focus()
  }, [t])

  const removeFromCart = useCallback((productId: number) => {
    setCartItems((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  const updateQty = useCallback((productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId)
      return
    }
    setCartItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
    )
  }, [removeFromCart])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) {
      if (e.key === 'Enter' && search.trim()) {
        // Possible barcode scan: if a single exact-barcode match, add it
        productsAPI.search(search.trim()).then((r) => {
          const exact = r.data.find((p) => p.barcode === search.trim())
          if (exact) addToCart(exact)
        })
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
    setCartItems([])
    setInvoiceDiscount(0)
    setSelectedCustomer(null)
  }

  const handleNewSale = () => {
    setShowReceiptModal(false)
    setLastSale(null)
    searchRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* ──────────── Main work area: scan + cart ──────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Scan / search bar */}
          <div className="px-6 pt-6 pb-4 bg-white border-b border-slate-200">
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
                    <div className="p-6 text-center text-sm text-slate-400">{t('common.loading')}</div>
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
                          disabled={isOut}
                          className={`w-full flex items-center gap-4 px-5 py-3 text-start border-b border-slate-50 last:border-0 transition-colors ${
                            idx === highlight ? 'bg-pharma-50' : 'hover:bg-slate-50'
                          } ${isOut ? 'opacity-40 cursor-not-allowed' : ''}`}
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
                              {t('pos.egp')} {p.price.toFixed(2)}
                            </p>
                          </div>
                          {idx === highlight && !isOut && (
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
                      onClick={() => { setCartItems([]); setInvoiceDiscount(0) }}
                      className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {cartItems.map((item) => {
                      const name = lang === 'ar' ? item.product.name_ar : item.product.name_en
                      const itemTotal = item.quantity * item.unit_price - item.discount
                      return (
                        <div key={item.product.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{name}</p>
                            <p className="text-[11px] text-slate-400 tabular-nums">
                              {t('pos.egp')} {item.unit_price.toFixed(2)} × {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
                            <button
                              onClick={() => updateQty(item.product.id, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-8 text-center text-sm font-bold text-slate-800 tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(item.product.id, item.quantity + 1)}
                              disabled={item.quantity >= item.product.stock}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-600 disabled:opacity-30 transition-all"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div className="w-24 text-end font-bold text-pharma-700 tabular-nums text-sm">
                            {t('pos.egp')} {itemTotal.toFixed(2)}
                          </div>
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
        <aside className="w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col border-s border-slate-200 bg-white shadow-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              {t('payment.summary')}
            </h3>
          </div>

          {/* Seller / Customer */}
          <div className="px-5 py-4 space-y-3 border-b border-slate-100">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                <UserCircle2 size={13} /> {t('pos.seller')}
              </label>
              <select
                value={selectedSeller?.id ?? ''}
                onChange={(e) => {
                  const emp = employees.find((em) => em.id === parseInt(e.target.value))
                  setSelectedSeller(emp || null)
                }}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pharma-400 focus:ring-2 focus:ring-pharma-100 bg-slate-50 text-slate-700"
              >
                <option value="">{t('pos.select_seller')}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {lang === 'ar' ? e.name_ar : e.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                <User size={13} /> {t('pos.customer')}
              </label>
              <select
                value={selectedCustomer?.id ?? ''}
                onChange={(e) => {
                  const cust = customers.find((c) => c.id === parseInt(e.target.value))
                  setSelectedCustomer(cust || null)
                }}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pharma-400 focus:ring-2 focus:ring-pharma-100 bg-slate-50 text-slate-700"
              >
                <option value="">{t('pos.walk_in')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Totals */}
          <div className="flex-1 px-5 py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('pos.subtotal')}</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {t('pos.egp')} {subtotal.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-sm text-slate-500">
                <Tag size={13} /> {t('pos.discount')}
              </label>
              <input
                type="number"
                value={invoiceDiscount || ''}
                onChange={(e) =>
                  setInvoiceDiscount(Math.max(0, parseFloat(e.target.value) || 0))
                }
                className="w-28 text-end text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-pharma-400 focus:ring-2 focus:ring-pharma-100 bg-white"
                placeholder="0.00"
                min={0}
              />
            </div>

            <div className="border-t border-dashed border-slate-200 pt-3 mt-3" />

            <div className="flex justify-between items-baseline">
              <span className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                {t('pos.total')}
              </span>
              <span className="text-pharma-700 font-extrabold text-3xl tabular-nums leading-none">
                {netTotal.toFixed(2)}
              </span>
            </div>
            <p className="text-end text-[10px] text-slate-400 uppercase tracking-wider -mt-1">
              {t('pos.egp')}
            </p>
          </div>

          {/* Checkout */}
          <div className="px-5 pb-5">
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={cartItems.length === 0}
              className="w-full bg-gradient-to-br from-pharma-600 to-pharma-700 hover:from-pharma-700 hover:to-pharma-800 active:scale-[0.98] disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-pharma-500/30 text-base tracking-wide"
            >
              {t('pos.checkout')} →
            </button>
          </div>
        </aside>
      </div>

      {showPaymentModal && (
        <PaymentModal
          cartItems={cartItems}
          subtotal={subtotal}
          invoiceDiscount={invoiceDiscount}
          netTotal={netTotal}
          selectedSeller={selectedSeller}
          selectedCustomer={selectedCustomer}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handleSaleSuccess}
        />
      )}

      {showReceiptModal && lastSale && (
        <ReceiptModal sale={lastSale} onNewSale={handleNewSale} onClose={handleNewSale} />
      )}
    </div>
  )
}
