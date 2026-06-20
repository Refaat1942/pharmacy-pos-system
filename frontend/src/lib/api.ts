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
  // Let the browser set multipart boundary — never force bare multipart/form-data
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
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

/** Turn FastAPI / axios errors into a user-visible string. */
export function formatApiError(err: unknown, fallback = 'Error'): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string }
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'string' ? item : (item as { msg?: string })?.msg || JSON.stringify(item)))
      .join('; ')
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail)
  if (e?.message) return e.message
  return fallback
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Product {
  id: number
  barcode: string
  international_barcode?: string | null
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
  pack_size?: number
  sub_unit?: string | null
  sub_price?: number | null
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
  code?: string | null
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
  loyalty_points?: number
}

export interface LoyaltySettings {
  loyalty_enabled: boolean
  loyalty_points_per_egp: number
  loyalty_egp_per_point: number
  loyalty_min_redeem: number
  loyalty_min_sale_egp: number
  loyalty_earn_on_account: boolean
  loyalty_max_redeem_pct: number
}

export interface LoyaltyMember {
  id: number
  code?: string | null
  name: string
  phone?: string | null
  loyalty_points: number
  total_sales: number
  sale_count: number
  lifetime_earned: number
  last_sale_at?: string | null
}

export interface LoyaltyTransaction {
  id: number
  customer_id: number
  customer_name?: string
  customer_code?: string | null
  customer_phone?: string | null
  invoice_id?: number | null
  invoice_number?: string | null
  kind: string
  points: number
  balance_after: number
  sale_amount?: number | null
  notes?: string | null
  created_at: string
}

export interface LoyaltyCalculateResult {
  active: boolean
  net_total?: number
  points_balance?: number
  max_redeem_points?: number
  points_redeem?: number
  loyalty_discount?: number
  net_after_loyalty?: number
  points_earn?: number
  points_balance_after?: number
}

export interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount: number
  discount_mode?: 'amount' | 'percent'
  discount_value?: number
  offer_id?: number
  offer_discount?: number
  // 'pack' = sell as main unit (Box), 'sub' = sell as inner unit (Strip).
  // When pack_size <= 1 this is always 'pack'.
  unit_type?: 'pack' | 'sub'
  dose_text?: string
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
  offer_id?: number | null
  offer_discount?: number
  unit_label?: string | null
  pack_size?: number
  prod_unit?: string | null
  prod_sub_unit?: string | null
  returned_sub?: number
  dose_text?: string | null
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
  clinic_id?: number | null
  clinic_name?: string | null
  seller_name_en: string
  seller_name_ar: string
  customer_name: string
  status: string
  notes: string
  created_at: string
  branch_name_en?: string | null
  branch_name_ar?: string | null
  branch_address?: string | null
  branch_phone?: string | null
  delivery_person_id?: number | null
  delivery_person_name?: string | null
  delivery_address?: string | null
  delivery_fee?: number | null
  delivery_customer_name?: string | null
  delivery_customer_phone?: string | null
  delivery_status?: string | null
  offer_ids?: number[] | null
  offer_savings?: number
  offer_names?: string | null
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

export interface PnlSummary {
  date_from: string
  date_to: string
  gross_revenue: number
  total_discount: number
  returns_value: number
  net_revenue: number
  cogs: number
  gross_profit: number
  margin_pct: number
  invoice_count: number
  returns_count: number
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

export interface CounselingSuggestion {
  active: boolean
  matched?: boolean
  product_id?: number
  product_name?: string
  advice?: string
  suggest?: string
  related_products?: Product[]
}

export const posCounselingAPI = {
  suggest: (data: { product_id: number; cart_product_ids?: number[]; lang?: string }) =>
    api.post<CounselingSuggestion>('/pos/counseling/suggest', data),
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
  lookupByCode: (code: string) =>
    api.get<Employee>('/employees/by-code', { params: { code: code.trim() } }),
  deliveryRoster: () => api.get<{ id: number; name: string }[]>('/hr/delivery-roster'),
}

export const salesAPI = {
  create: (data: {
    type: string
    payment_method: string
    digital_type?: string
    items: {
      product_id: number
      quantity: number
      unit_price: number
      discount: number
      offer_id?: number
      offer_discount?: number
      unit_type?: string
      dose_text?: string
    }[]
    discount: number
    offer_ids?: number[]
    offer_savings?: number
    offer_names?: string
    cash_amount?: number
    visa_amount?: number
    customer_id?: number
    seller_id?: number
    clinic_id?: number
    prescription_id?: number
    notes?: string
    delivery_address?: string
    delivery_fee?: number
    delivery_customer_name?: string
    delivery_customer_phone?: string
    delivery_person_id?: number
    delivery_person_name?: string
    account_paid_amount?: number
    account_paid_method?: string
    loyalty_points_redeemed?: number
  }) => api.post<SaleResponse>('/sales', data),
  list: (params: {
    limit?: number; offset?: number;
    date_from?: string; date_to?: string;
    type?: string;
    delivery_queue?: boolean;
    seller_id?: number; clinic_id?: number;
    delivery_status?: string;
    delivery_person_id?: number;
    payment_method?: string;
    digital_type?: string;
  } = {}) => api.get<Invoice[]>('/sales', { params }),
  setDeliveryStatus: (invoiceId: number, status: string) =>
    api.post<Invoice>(`/sales/${invoiceId}/delivery-status`, { status }),
  byClinic: (params: { date_from?: string; date_to?: string } = {}) =>
    api.get<{ clinic_id: number; clinic_name: string; invoice_count: number; gross: number; discount: number; net: number }[]>(
      '/sales/by-clinic', { params }),
  aggregate: (params: {
    date_from?: string; date_to?: string;
    type?: string; seller_id?: number;
  } = {}) => api.get<{ count: number; gross: number; discount: number; net: number }>(
    '/sales/aggregate', { params }),
  get: (id: number) => api.get<SaleResponse>(`/sales/${id}`),
  search: (q: string, limit = 50) => api.get<Invoice[]>('/sales/search', { params: { q, limit } }),
  processReturn: (
    invoiceId: number,
    items: { invoice_item_id: number; sub_quantity: number }[],
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

type DashboardRequestConfig = { headers?: Record<string, string> }

export const dashboardAPI = {
  summary: (config: DashboardRequestConfig = {}) =>
    api.get<DashboardSummary>('/dashboard/summary', config),
  series: (days = 7, config: DashboardRequestConfig = {}) =>
    api.get<SalesSeriesPoint[]>('/dashboard/sales-series', { params: { days }, ...config }),
  topProducts: (limit = 5, days = 30, config: DashboardRequestConfig = {}) =>
    api.get<TopProduct[]>('/dashboard/top-products', { params: { limit, days }, ...config }),
  topSellers: (limit = 3, days = 30, config: DashboardRequestConfig = {}) =>
    api.get<TopSeller[]>('/dashboard/top-sellers', { params: { limit, days }, ...config }),
  alerts: (config: DashboardRequestConfig = {}) =>
    api.get<DashboardAlerts>('/dashboard/alerts', config),
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

export interface Clinic {
  id: number
  name: string
  phone?: string | null
  notes?: string | null
  portal_token: string
  active: boolean
  pending_count?: number
  created_at?: string
}

export interface PrescriptionItem {
  id: number
  medicine_name: string
  quantity: number
  dose?: string | null
  note?: string | null
}

export interface Prescription {
  id: number
  clinic_id: number
  clinic_name: string
  branch_id: number | null
  branch_name_en?: string | null
  branch_name_ar?: string | null
  patient_name?: string | null
  patient_phone?: string | null
  doctor_name?: string | null
  notes?: string | null
  status: string
  created_at: string
  handled_at?: string | null
  handled_by_name?: string | null
  items: PrescriptionItem[]
}

export const clinicsAPI = {
  list: () => api.get<Clinic[]>('/clinics'),
  create: (data: { name: string; phone?: string; notes?: string; active?: boolean }) =>
    api.post<Clinic>('/clinics', data),
  update: (id: number, data: { name: string; phone?: string; notes?: string; active?: boolean }) =>
    api.put<Clinic>(`/clinics/${id}`, data),
  regenerate: (id: number) => api.post<Clinic>(`/clinics/${id}/regenerate-token`, {}),
}

export const prescriptionsAPI = {
  list: (status = 'active') => api.get<Prescription[]>('/prescriptions', { params: { status } }),
  count: () => api.get<{ count: number; new: number }>('/prescriptions/count'),
  setStatus: (id: number, status: 'pending' | 'loaded' | 'dismissed' | 'fulfilled') =>
    api.patch<{ ok: boolean; status: string }>(`/prescriptions/${id}`, null, { params: { status } }),
}

export interface ClinicPortalInfo {
  clinic: { id: number; name: string }
  branches: { id: number; name_ar: string; name_en: string }[]
}

export const clinicPortalAPI = {
  info: (slug: string, token: string) =>
    api.get<ClinicPortalInfo>(`/clinic/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  products: (slug: string, token: string, q: string) =>
    api.get<{ name_en: string; name_ar: string }[]>(
      `/clinic/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/products`, { params: { q } },
    ),
  submit: (
    slug: string,
    token: string,
    data: {
      branch_id: number
      patient_name?: string
      patient_phone?: string
      doctor_name?: string
      notes?: string
      items: { medicine_name: string; quantity: number; dose?: string; note?: string }[]
    },
  ) => api.post<{ ok: boolean; id: number }>(
    `/clinic/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/prescriptions`, data,
  ),
}

export interface TransferItem {
  id: number
  source_product_id: number
  dest_product_id: number | null
  barcode: string | null
  product_name_ar: string | null
  product_name_en: string | null
  quantity: number
  unit_label?: string | null
  pack_size?: number | null
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
  sub_unit?: string | null
  pack_size?: number | null
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
  bonus_qty?: number
  unit_cost: number
  discount_pct?: number
  vat_pct?: number
  sales_tax?: number
  public_price?: number | null
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
    receive_immediately?: boolean
    items: POItem[]
  }) => api.post<{ ok: boolean; po_id: number; po_number: string; total: number; status: string }>('/purchase-orders', data),
  receive: (id: number) => api.post(`/purchase-orders/${id}/receive`),
  cancel: (id: number) => api.post(`/purchase-orders/${id}/cancel`),
  replenishment: (params: { branch_id?: number; supplier_id?: number; only_zero?: boolean; include_all?: boolean; q?: string } = {}) =>
    api.get<ReplenishmentItem[]>('/purchase-orders/replenishment', { params }),
  exportReplenishment: (data: {
    supplier_id?: number
    branch_id?: number
    notes?: string
    items: { product_id: number; quantity: number; unit_cost: number }[]
  }) => api.post('/purchase-orders/replenishment/export', data, { responseType: 'blob' }),
}

export interface ReplenishmentItem {
  id: number
  barcode: string | null
  name_ar: string
  name_en: string
  unit: string | null
  sub_unit: string | null
  pack_size: number | null
  unit_label: string
  stock: number
  min_stock: number
  cost: number
  branch_id: number
  supplier_id: number | null
  supplier_name: string | null
  branch_name_en: string | null
  branch_name_ar: string | null
  suggested_quantity: number
  needs_replenish?: boolean
}

export type ExpiryListResponse = {
  items: ExpiryItem[]
  total_count: number
  shown_count: number
}

export const expiryAPI = {
  list: (params: { status: 'near' | 'expired' | 'all'; days?: number; branch_id?: number }) =>
    api.get<ExpiryListResponse>('/inventory/expiry', { params }),
  summary: (params: { days?: number; branch_id?: number } = {}) =>
    api.get<ExpirySummary>('/inventory/expiry/summary', { params }),
}

export const transfersAPI = {
  list: (status?: string) => api.get<Transfer[]>('/inventory/transfers', { params: { status } }),
  get: (id: number) => api.get<Transfer>(`/inventory/transfers/${id}`),
  create: (data: {
    from_branch_id: number
    to_branch_id: number
    items: { product_id: number; quantity: number; unit_type?: 'pack' | 'sub' }[]
    notes?: string
  }) => api.post<{ ok: boolean; transfer_id: number; transfer_number: string }>(
    '/inventory/transfers', data,
  ),
  receive: (id: number) => api.post(`/inventory/transfers/${id}/receive`),
  cancel: (id: number) => api.post(`/inventory/transfers/${id}/cancel`),
}

export const loyaltyAPI = {
  status: () => api.get<{ operational: boolean; feature_enabled: boolean; settings: LoyaltySettings }>('/loyalty/status'),
  getSettings: () => api.get<LoyaltySettings>('/loyalty/settings'),
  updateSettings: (data: Partial<LoyaltySettings>) => api.put('/loyalty/settings', data),
  calculate: (data: {
    customer_id?: number
    net_total: number
    redeem_points?: number
    payment_method?: string
    credit_portion?: number
  }) => api.post<LoyaltyCalculateResult>('/loyalty/calculate', data),
  members: (params: { q?: string; min_points?: number; max_points?: number } = {}) =>
    api.get<LoyaltyMember[]>('/loyalty/members', { params }),
  transactions: (params: {
    q?: string
    kind?: string
    customer_id?: number
    date_from?: string
    date_to?: string
  } = {}) => api.get<LoyaltyTransaction[]>('/loyalty/transactions', { params }),
  customerSummary: (customerId: number) =>
    api.get(`/loyalty/customers/${customerId}/summary`),
  adjust: (customerId: number, data: { points: number; notes?: string }) =>
    api.post(`/loyalty/customers/${customerId}/adjust`, data),
}
