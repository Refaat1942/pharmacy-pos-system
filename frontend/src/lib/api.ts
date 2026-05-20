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
  phone: string | null
  email?: string | null
  region?: string | null
  address_details?: string | null
  tax_number?: string | null
  credit_limit?: number
  active?: boolean
  notes: string | null
  balance: number
  total_charged?: number
  total_paid?: number
  branch_ids?: number[]
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
  login: (tenant_slug: string, username: string, password: string) =>
    api.post('/auth/login', { tenant_slug, username, password }),
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
  // Extended v2 endpoints (Phase 6)
  listV2: (params: { q?: string; active_only?: boolean } = {}) =>
    api.get<Customer[]>('/customers/v2', { params }),
  createV2: (data: Partial<Customer>) => api.post<Customer>('/customers/v2', data),
  updateV2: (id: number, data: Partial<Customer>) => api.put<Customer>(`/customers/v2/${id}`, data),
  removeV2: (id: number) => api.delete(`/customers/v2/${id}`),
  statement: (id: number) => api.get(`/customers/v2/${id}/statement`),
  pay: (id: number, data: { amount: number; payment_method?: string; invoice_id?: number; reference?: string; notes?: string }) =>
    api.post(`/customers/v2/${id}/payments`, data),
  branches: (id: number) => api.get<{ branch_id: number; name_en: string; name_ar: string }[]>(`/customers/v2/${id}/branches`),
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
  list: (params: {
    limit?: number; offset?: number;
    date_from?: string; date_to?: string;
    type?: string; seller_id?: number;
  } = {}) => api.get<Invoice[]>('/sales', { params }),
  aggregate: (params: {
    date_from?: string; date_to?: string;
    type?: string; seller_id?: number;
  } = {}) => api.get<{ count: number; gross: number; discount: number; net: number }>(
    '/sales/aggregate', { params }),
  get: (id: number) => api.get<SaleResponse>(`/sales/${id}`),
  processReturn: (
    invoiceId: number,
    items: { invoice_item_id: number; quantity: number }[],
    reason?: string
  ) => api.post(`/sales/${invoiceId}/return`, { items, reason }),
}

export interface ReturnRow {
  id: number
  original_invoice_id: number
  return_invoice_number: string
  type: string
  total_returned: number
  reason: string | null
  seller_id: number | null
  branch_id: number | null
  created_at: string
  invoice_number: string | null
  sale_type: string | null
  sale_net: number | null
  seller_name_en: string | null
  seller_name_ar: string | null
}

export const returnsAPI = {
  list: (params: { date_from?: string; date_to?: string; limit?: number; offset?: number } = {}) =>
    api.get<ReturnRow[]>('/returns', { params }),
}

export interface SalesSeriesPoint { date: string; sales: number; invoices: number }
export interface TopProduct { id: number; name_en: string; name_ar: string; qty: number; revenue: number }
export interface TopSeller { id: number; name_en: string; name_ar: string; sales: number; invoices: number }
export interface DashboardAlerts {
  near_expiry_count: number
  expired_count: number
  low_stock_count: number
  returns_today: number
  sales_today: number
  returns_ratio: number
  returns_high: boolean
}

export const dashboardAPI = {
  summary: () => api.get<DashboardSummary>('/dashboard/summary'),
  series: (days = 7) => api.get<SalesSeriesPoint[]>('/dashboard/sales-series', { params: { days } }),
  topProducts: (limit = 5, days = 30) =>
    api.get<TopProduct[]>('/dashboard/top-products', { params: { limit, days } }),
  topSellers: (limit = 3, days = 30) =>
    api.get<TopSeller[]>('/dashboard/top-sellers', { params: { limit, days } }),
  alerts: () => api.get<DashboardAlerts>('/dashboard/alerts'),
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

export interface Supplier {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  region?: string | null
  address_details?: string | null
  tax_number: string | null
  notes: string | null
  active: boolean
  total_charged: number
  total_paid: number
  balance: number
}

export interface POItem {
  id?: number
  product_id?: number | null
  barcode?: string | null
  product_name_ar?: string | null
  product_name_en?: string | null
  quantity: number
  unit_cost: number
  expiry_date?: string | null
  total?: number
}

export interface PurchaseOrder {
  id: number
  po_number: string
  supplier_id: number
  supplier_name: string
  branch_id: number
  branch_name_en?: string
  branch_name_ar?: string
  status: 'draft' | 'received' | 'cancelled'
  supplier_invoice_number: string | null
  supplier_invoice_date: string | null
  subtotal: number
  discount: number
  tax: number
  total: number
  notes: string | null
  created_at: string
  received_at: string | null
  cancelled_at: string | null
  items?: POItem[]
}

export const suppliersAPI = {
  list: (params: { q?: string; active_only?: boolean } = {}) =>
    api.get<Supplier[]>('/suppliers', { params }),
  create: (data: Partial<Supplier>) => api.post<Supplier>('/suppliers', data),
  update: (id: number, data: Partial<Supplier>) => api.put<Supplier>(`/suppliers/${id}`, data),
  remove: (id: number) => api.delete(`/suppliers/${id}`),
  statement: (id: number) => api.get(`/suppliers/${id}/statement`),
  pay: (id: number, data: { amount: number; payment_method?: string; po_id?: number; reference?: string; notes?: string }) =>
    api.post(`/suppliers/${id}/payments`, data),
}

export const purchasesAPI = {
  list: (params: { status?: string; supplier_id?: number } = {}) =>
    api.get<PurchaseOrder[]>('/purchase-orders', { params }),
  get: (id: number) => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
  create: (data: {
    supplier_id: number
    branch_id: number
    supplier_invoice_number?: string
    supplier_invoice_date?: string
    discount?: number
    tax?: number
    notes?: string
    items: POItem[]
  }) => api.post<{ ok: boolean; po_id: number; po_number: string; total: number }>('/purchase-orders', data),
  receive: (id: number) => api.post(`/purchase-orders/${id}/receive`),
  cancel: (id: number) => api.post(`/purchase-orders/${id}/cancel`),
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
