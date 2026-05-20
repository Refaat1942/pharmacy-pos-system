import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ShoppingCart, X, Plus, Minus, Tag, AlertTriangle, Package } from 'lucide-react'
import Header from '../components/Header'
import PaymentModal from '../components/PaymentModal'
import ReceiptModal from '../components/ReceiptModal'
import { productsAPI, employeesAPI, customersAPI } from '../lib/api'
import type { Product, CartItem, Employee, Customer, SaleResponse } from '../lib/api'
import i18n from '../lib/i18n'

export default function POS() {
  const { t } = useTranslation()
  const lang = i18n.language

  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedSeller, setSelectedSeller] = useState<Employee | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [invoiceDiscount, setInvoiceDiscount] = useState(0)

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [lastSale, setLastSale] = useState<SaleResponse | null>(null)

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category).filter(Boolean))]
    return cats.sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase()
      const matchesSearch =
        !search ||
        p.name_ar.toLowerCase().includes(q) ||
        p.name_en.toLowerCase().includes(q) ||
        (p.barcode && p.barcode === search)
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory
      return matchesSearch && matchesCat
    })
  }, [products, search, selectedCategory])

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price - item.discount, 0),
    [cartItems]
  )
  const netTotal = Math.max(0, subtotal - invoiceDiscount)
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0)

  const reloadProducts = useCallback(() => {
    productsAPI.search('').then((r) => setProducts(r.data))
  }, [])

  useEffect(() => {
    productsAPI
      .search('')
      .then((r) => {
        setProducts(r.data)
        setLoadingProducts(false)
      })
      .catch(() => setLoadingProducts(false))
    employeesAPI.list().then((r) => setEmployees(r.data))
    customersAPI.listV2({}).then((r) => setCustomers(r.data)).catch(() => setCustomers([]))
  }, [])

  useEffect(() => {
    if (!search) {
      reloadProducts()
      return
    }
    const timer = setTimeout(() => {
      productsAPI.search(search).then((r) => setProducts(r.data))
    }, 250)
    return () => clearTimeout(timer)
  }, [search, reloadProducts])

  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return
    // Expiry guard: block expired, confirm near-expiry (<=30 days)
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
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
    )
  }, [removeFromCart])

  const handleSaleSuccess = (sale: SaleResponse) => {
    setLastSale(sale)
    setShowPaymentModal(false)
    setShowReceiptModal(true)
    setCartItems([])
    setInvoiceDiscount(0)
    setSelectedCustomer(null)
    reloadProducts()
  }

  const handleNewSale = () => {
    setShowReceiptModal(false)
    setLastSale(null)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* ──────────── Products Panel ──────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-200 shadow-sm">
            <div className="relative">
              <Search
                size={17}
                className="absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('pos.search_placeholder')}
                className="w-full ps-10 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pharma-400 focus:bg-white transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0 bg-white border-b border-gray-100 shadow-sm">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'bg-pharma-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t('pos.all_categories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-pharma-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {loadingProducts ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                {t('common.loading')}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                <Package size={48} className="opacity-20" />
                <p className="text-sm">{t('pos.no_products')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                {filteredProducts.map((product) => {
                  const name = lang === 'ar' ? product.name_ar : product.name_en
                  const inCart = cartItems.find((i) => i.product.id === product.id)
                  const isOut = product.stock <= 0
                  const isLow = !isOut && product.stock <= product.min_stock

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={isOut}
                      className={`relative flex flex-col p-3 bg-white rounded-xl border text-start transition-all duration-150 ${
                        isOut
                          ? 'opacity-50 cursor-not-allowed border-gray-100'
                          : inCart
                          ? 'border-pharma-400 ring-2 ring-pharma-200 shadow-md'
                          : 'border-gray-100 hover:border-pharma-300 hover:shadow-md active:scale-95'
                      }`}
                    >
                      {inCart && (
                        <span className="absolute top-2 end-2 bg-pharma-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                          {inCart.quantity}
                        </span>
                      )}
                      {isLow && (
                        <span className="absolute top-2 start-2">
                          <AlertTriangle size={11} className="text-amber-400" />
                        </span>
                      )}

                      <p className="text-[11px] font-bold text-gray-800 leading-tight line-clamp-2 mb-1.5 min-h-[2.2rem]">
                        {name}
                      </p>

                      {product.category && (
                        <span className="inline-block text-[9px] text-pharma-600 bg-pharma-50 px-1.5 py-0.5 rounded-full mb-2 self-start font-medium">
                          {product.category}
                        </span>
                      )}

                      <div className="mt-auto">
                        <p className="text-pharma-600 font-extrabold text-sm tabular-nums">
                          {t('pos.egp')} {product.price.toFixed(2)}
                        </p>
                        <p
                          className={`text-[9px] mt-0.5 font-medium ${
                            isOut
                              ? 'text-red-500'
                              : isLow
                              ? 'text-amber-500'
                              : 'text-gray-300'
                          }`}
                        >
                          {isOut
                            ? t('pos.out_of_stock')
                            : `${product.stock} ${t('pos.in_stock')}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ──────────── Cart Panel ──────────── */}
        <div className="w-[340px] xl:w-[360px] flex-shrink-0 flex flex-col border-s border-gray-200 bg-white shadow-xl">
          {/* Cart header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart size={17} className="text-pharma-600" />
              <h2 className="font-bold text-gray-800 text-sm">{t('pos.cart')}</h2>
              {cartCount > 0 && (
                <span className="bg-pharma-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm">
                  {cartCount}
                </span>
              )}
            </div>
            {cartItems.length > 0 && (
              <button
                onClick={() => {
                  setCartItems([])
                  setInvoiceDiscount(0)
                }}
                className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-200 gap-3 p-8">
                <ShoppingCart size={52} />
                <p className="text-sm text-gray-400">{t('pos.empty_cart')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {cartItems.map((item) => {
                  const name = lang === 'ar' ? item.product.name_ar : item.product.name_en
                  const itemTotal = item.quantity * item.unit_price - item.discount
                  return (
                    <div key={item.product.id} className="px-4 py-3 cart-item-enter">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-800 leading-tight flex-1 line-clamp-2">
                          {name}
                        </p>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQty(item.product.id, item.quantity - 1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-600 transition-all"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-gray-800 tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQty(item.product.id, item.quantity + 1)}
                            disabled={item.quantity >= item.product.stock}
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-pharma-100 hover:text-pharma-700 disabled:opacity-30 text-gray-600 transition-all"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                        <div className="text-end">
                          <p className="text-sm font-bold text-pharma-700 tabular-nums">
                            {t('pos.egp')} {itemTotal.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-gray-400 tabular-nums">
                            × {item.unit_price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Seller / Customer selectors */}
          <div className="px-4 py-3 border-t border-gray-100 space-y-2">
            <select
              value={selectedSeller?.id ?? ''}
              onChange={(e) => {
                const emp = employees.find((em) => em.id === parseInt(e.target.value))
                setSelectedSeller(emp || null)
              }}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-pharma-400 bg-gray-50 text-gray-700"
            >
              <option value="">{t('pos.select_seller')}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {lang === 'ar' ? e.name_ar : e.name_en}
                </option>
              ))}
            </select>

            <select
              value={selectedCustomer?.id ?? ''}
              onChange={(e) => {
                const cust = customers.find((c) => c.id === parseInt(e.target.value))
                setSelectedCustomer(cust || null)
              }}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-pharma-400 bg-gray-50 text-gray-700"
            >
              <option value="">{t('pos.select_customer')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Totals & checkout */}
          <div className="px-4 pt-3 pb-4 border-t border-gray-200 bg-gray-50 space-y-2.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t('pos.subtotal')}</span>
              <span className="font-semibold text-gray-700 tabular-nums">
                {t('pos.egp')} {subtotal.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium flex-shrink-0">
                <Tag size={12} />
                {t('pos.discount')}
              </label>
              <input
                type="number"
                value={invoiceDiscount || ''}
                onChange={(e) =>
                  setInvoiceDiscount(Math.max(0, parseFloat(e.target.value) || 0))
                }
                className="w-28 text-end text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-pharma-400 bg-white"
                placeholder="0.00"
                min={0}
              />
            </div>

            <div className="flex justify-between items-baseline border-t border-gray-200 pt-2">
              <span className="font-bold text-gray-800 text-sm">{t('pos.total')}</span>
              <span className="text-pharma-700 font-extrabold text-xl tabular-nums">
                {t('pos.egp')} {netTotal.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={cartItems.length === 0}
              className="w-full bg-pharma-600 hover:bg-pharma-700 active:bg-pharma-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-pharma-300/40 text-sm tracking-wide"
            >
              {t('pos.checkout')} →
            </button>
          </div>
        </div>
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
