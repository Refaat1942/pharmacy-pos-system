import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pharma_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const activeBranch = localStorage.getItem('pharma_active_branch')
  if (activeBranch) config.headers['X-Active-Branch'] = activeBranch
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

export interface Branch {
  id: number
  name_ar: string
  name_en: string
  address?: string
  phone?: string
}

export const branchesAPI = {
  list: () => api.get<Branch[]>('/branches'),
}

export interface TransferItem {
  id: number
  source_product_id: number
  dest_product_id: number | null
  barcode: string | null
  product_name_ar: string | null
  product_name_en: string | null
  quantity: number
}

export interface Transfer {
  id: number
  transfer_number: string
  from_branch_id: number
  to_branch_id: number
  status: 'in_transit' | 'completed' | 'cancelled'
  notes: string | null
  created_by: number | null
  received_by: number | null
  created_at: string
  received_at: string | null
  cancelled_at: string | null
  from_name_en: string
  from_name_ar: string
  to_name_en: string
  to_name_ar: string
  created_by_name_en?: string
  created_by_name_ar?: string
  items?: TransferItem[]
}

export interface ExpiryItem {
  id: number
  barcode: string | null
  name_ar: string
  name_en: string
  category: string | null
  unit: string | null
  stock: number
  price: number
  cost: number | null
  expiry_date: string
  branch_id: number | null
  branch_name_en: string | null
  branch_name_ar: string | null
  days_left: number
  loss_value: number
}

export interface ExpirySummary {
  expired_count: number
  expired_value: number
  near_count: number
  near_value: number
}

export const expiryAPI = {
  list: (params: { status: 'near' | 'expired' | 'all'; days?: number; branch_id?: number }) =>
    api.get<ExpiryItem[]>('/inventory/expiry', { params }),
  summary: (params: { days?: number; branch_id?: number } = {}) =>
    api.get<ExpirySummary>('/inventory/expiry/summary', { params }),
}

export const transfersAPI = {
  list: (status?: string) => api.get<Transfer[]>('/inventory/transfers', { params: { status } }),
  get: (id: number) => api.get<Transfer>(`/inventory/transfers/${id}`),
  create: (data: {
    from_branch_id: number
    to_branch_id: number
    items: { product_id: number; quantity: number }[]
    notes?: string
  }) => api.post<{ ok: boolean; transfer_id: number; transfer_number: string }>(
    '/inventory/transfers', data,
  ),
  receive: (id: number) => api.post(`/inventory/transfers/${id}/receive`),
  cancel: (id: number) => api.post(`/inventory/transfers/${id}/cancel`),
}
