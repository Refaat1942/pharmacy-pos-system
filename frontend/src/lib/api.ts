import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pharma_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pharma_token')
      localStorage.removeItem('pharma_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Product {
  id: number
  barcode: string
  name_ar: string
  name_en: string
  category: string
  unit: string
  price: number
  cost: number
  stock: number
  min_stock: number
  expiry_date: string
  active: boolean
}

export interface Employee {
  id: number
  name_ar: string
  name_en: string
  role: string
  status: string
}

export interface Customer {
  id: number
  name: string
  phone: string
  notes: string
  balance: number
}

export interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount: number
}

export interface InvoiceItem {
  id: number
  product_id: number
  product_name_ar: string
  product_name_en: string
  barcode: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

export interface Invoice {
  id: number
  invoice_number: string
  type: string
  payment_method: string
  digital_type: string
  subtotal: number
  discount: number
  net_total: number
  cash_amount: number
  visa_amount: number
  change_amount: number
  seller_id: number
  customer_id: number
  seller_name_en: string
  seller_name_ar: string
  customer_name: string
  status: string
  notes: string
  created_at: string
}

export interface SaleResponse {
  invoice: Invoice
  items: InvoiceItem[]
}

export interface DashboardSummary {
  date: string
  today_sales: number
  invoice_count: number
  returns_total: number
  net_sales: number
  low_stock_count: number
}

// ─── API calls ──────────────────────────────────────────────────────────────

export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
}

export const productsAPI = {
  search: (q: string) => api.get<Product[]>('/products', { params: { q } }),
  get: (id: number) => api.get<Product>(`/products/${id}`),
  create: (data: Partial<Product>) => api.post<Product>('/products', data),
}

export const customersAPI = {
  list: (q: string = '') => api.get<Customer[]>('/customers', { params: { q } }),
  create: (data: { name: string; phone?: string; notes?: string }) =>
    api.post<Customer>('/customers', data),
}

export const employeesAPI = {
  list: () => api.get<Employee[]>('/employees'),
}

export const salesAPI = {
  create: (data: {
    type: string
    payment_method: string
    digital_type?: string
    items: { product_id: number; quantity: number; unit_price: number; discount: number }[]
    discount: number
    cash_amount?: number
    visa_amount?: number
    customer_id?: number
    seller_id?: number
    notes?: string
  }) => api.post<SaleResponse>('/sales', data),
  list: (limit?: number, offset?: number) =>
    api.get<Invoice[]>('/sales', { params: { limit, offset } }),
  get: (id: number) => api.get<SaleResponse>(`/sales/${id}`),
  processReturn: (
    invoiceId: number,
    items: { invoice_item_id: number; quantity: number }[],
    reason?: string
  ) => api.post(`/sales/${invoiceId}/return`, { items, reason }),
}

export const dashboardAPI = {
  summary: () => api.get<DashboardSummary>('/dashboard/summary'),
}
