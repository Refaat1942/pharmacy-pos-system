/**
 * Capture numbered POS screenshots (EN + AR) for customer documentation.
 * Usage: node scripts/capture-pos-screenshots.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'screenshots')
const BASE_URL = process.env.POS_URL || 'http://localhost:5000'
const API_URL = process.env.API_URL || 'http://127.0.0.1:8000'

const TENANT = 'fratelanza'
const USER = 'admin'
const PASS = 'admin123'

const LABELS = {
  en: {
    checkout: 'Checkout',
    addItem: 'Add Item',
    openShift: 'Open Shift',
    newTransfer: 'New Transfer',
    newCustomer: 'New Customer',
    newClinic: 'New clinic',
    profitLoss: 'Profit & Loss',
    employees: 'Employees',
    attendance: 'Attendance',
    payroll: 'Payroll',
    performance: 'Performance',
    users: 'Users',
    branches: 'Branches',
    pharmacy: 'Pharmacy',
    manual: 'User Manual',
    items: 'Items',
    branchStock: 'Branch Stock',
    stocktake: 'Stocktake',
    movements: 'Movements',
    velocity: 'Fast / Slow / Dead',
    alerts: 'Consumption Alerts',
    cashSale: 'Cash',
    deliverySale: 'Delivery',
    digitalSale: 'Digital',
    view: 'View',
    replenishment: 'Replenishment',
  },
  ar: {
    checkout: 'إتمام البيع',
    addItem: 'إضافة صنف',
    openShift: 'فتح وردية',
    newTransfer: 'تحويل جديد',
    newCustomer: 'عميل جديد',
    newClinic: 'عيادة جديدة',
    profitLoss: 'الأرباح والخسائر',
    employees: 'الموظفون',
    attendance: 'الحضور',
    payroll: 'الرواتب',
    performance: 'الأداء',
    users: 'المستخدمون',
    branches: 'الفروع',
    pharmacy: 'الصيدلية',
    manual: 'دليل المستخدم',
    items: 'الأصناف',
    branchStock: 'أرصدة الفروع',
    stocktake: 'الجرد',
    movements: 'حركات المخزون',
    velocity: 'سريع / بطيء / راكد',
    alerts: 'تنبيهات الاستهلاك',
    cashSale: 'نقدي',
    deliverySale: 'توصيل',
    digitalSale: 'رقمي',
    view: 'عرض',
    replenishment: 'إعادة التموين',
  },
}

async function apiLogin() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_slug: TENANT, username: USER, password: PASS }),
  })
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`)
  return res.json()
}

async function apiOpenShift(token, branchId) {
  const res = await fetch(`${API_URL}/api/shifts/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Active-Branch': String(branchId),
    },
    body: JSON.stringify({ opening_cash: 500 }),
  })
  if (!res.ok && !String(await res.text()).includes('already have an open shift')) {
    // ignore if already open
  }
}

async function shot(page, lang, num, name) {
  const file = `${String(num).padStart(2, '0')}-${name}.png`
  const dir = path.join(OUT, lang)
  fs.mkdirSync(dir, { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({
    path: path.join(dir, file),
    fullPage: false,
  })
  console.log(`  ✓ ${lang}/${file}`)
  return file
}

async function goto(page, route) {
  // Vite serves legacy dashboard.html at /dashboard — use SPA client routing instead.
  if (page.url() === 'about:blank' || !page.url().includes(BASE_URL)) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  }
  await page.evaluate((r) => {
    window.history.pushState({}, '', r)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
}

async function gotoLogin(page, lang) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

async function clickTab(page, text) {
  const tab = page.getByRole('button', { name: text, exact: true }).first()
  if (await tab.isVisible().catch(() => false)) {
    await tab.click()
    await page.waitForTimeout(500)
  }
}

async function clickIfVisible(page, locator) {
  try {
    if (await locator.first().isVisible({ timeout: 2000 })) {
      await locator.first().click()
      await page.waitForTimeout(500)
      return true
    }
  } catch { /* ignore */ }
  return false
}

async function closeModal(page) {
  const overlay = page.locator('.fixed.inset-0.z-50')
  if (!(await overlay.isVisible().catch(() => false))) return
  const cancel = page.getByRole('button', { name: /^(Cancel|Close|إلغاء|إغلاق)$/ })
  if (await cancel.first().isVisible().catch(() => false)) {
    await cancel.first().click()
  } else {
    await overlay.click({ position: { x: 8, y: 8 }, force: true })
  }
  await page.waitForTimeout(500)
}

async function setupAuth(context, auth, lang) {
  await context.addInitScript(
    ({ authData, language }) => {
      localStorage.setItem('pharma_token', authData.token)
      localStorage.setItem('pharma_user', JSON.stringify(authData.user))
      localStorage.setItem('pharma_tenant', JSON.stringify(authData.tenant))
      localStorage.setItem('pharma_tenant_slug', authData.tenant.slug)
      localStorage.setItem('pharma_lang', language)
      localStorage.setItem('pharma_last_activity', String(Date.now()))
      localStorage.setItem('pharma_pos_heartbeat', String(Date.now()))
    },
    { authData: auth, language: lang },
  )
}

async function captureLanguage(browser, lang, auth) {
  const L = LABELS[lang]
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: lang === 'ar' ? 'ar-EG' : 'en-US',
  })
  await setupAuth(context, auth, lang)
  const page = await context.newPage()

  console.log(`\n=== Capturing ${lang.toUpperCase()} ===`)

  // 01 — Login (fresh context without auth)
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === 'ar' ? 'ar-EG' : 'en-US' })
  await loginCtx.addInitScript((language) => {
    localStorage.setItem('pharma_lang', language)
    localStorage.setItem('pharma_tenant_slug', 'fratelanza')
  }, lang)
  const loginPage = await loginCtx.newPage()
  await gotoLogin(loginPage, lang)
  await shot(loginPage, lang, 1, 'login')
  await loginCtx.close()

  // Bootstrap SPA from home route
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForSelector('aside', { timeout: 15000 })

  // 02 — Dashboard
  await goto(page, '/dashboard')
  await page.waitForSelector('aside', { timeout: 15000 })
  await shot(page, lang, 2, 'dashboard')

  // 03 — Sidebar (scroll to show full menu)
  const nav = page.locator('aside nav').first()
  if (await nav.count()) await nav.evaluate((el) => { el.scrollTop = 0 })
  await shot(page, lang, 3, 'sidebar-menu')

  // 04-09 — POS workflows
  await goto(page, '/')
  await shot(page, lang, 4, 'pos-empty')

  // Add products to cart
  const search = page.locator('input[placeholder]').first()
  await search.fill('para')
  await page.waitForTimeout(700)
  await shot(page, lang, 5, 'pos-search-results')
  await page.locator('button').filter({ hasText: /Paracetamol|باراسيتامول/ }).first().click()
  await page.waitForTimeout(400)
  await search.fill('amox')
  await page.waitForTimeout(500)
  await page.locator('button').filter({ hasText: /Amoxicillin|أموكسيسيلين/ }).first().click()
  await page.waitForTimeout(400)
  await search.fill('')

  // Select seller
  const sellerSelect = page.locator('select').first()
  if (await sellerSelect.isVisible()) {
    const opts = await sellerSelect.locator('option').all()
    if (opts.length > 1) await sellerSelect.selectOption({ index: 1 })
  }
  await shot(page, lang, 6, 'pos-cart-with-items')

  // Payment modal — cash
  await page.getByRole('button', { name: L.checkout }).click()
  await page.waitForTimeout(600)
  await shot(page, lang, 7, 'pos-payment-cash')
  await clickTab(page, L.deliverySale)
  await page.waitForTimeout(400)
  await shot(page, lang, 8, 'pos-payment-delivery')
  await clickTab(page, L.digitalSale)
  await page.waitForTimeout(400)
  await shot(page, lang, 9, 'pos-payment-digital')
  await closeModal(page)

  // 10 — Sales History
  await goto(page, '/sales')
  await shot(page, lang, 10, 'sales-history')

  // Open first invoice detail if any
  const viewBtn = page.getByRole('button', { name: L.view }).first()
  if (await viewBtn.isVisible().catch(() => false)) {
    await viewBtn.click()
    await page.waitForTimeout(600)
    await shot(page, lang, 11, 'sales-invoice-detail')
    await closeModal(page)
  } else {
    await shot(page, lang, 11, 'sales-invoice-detail-placeholder')
  }

  // 12 — Deliveries
  await goto(page, '/deliveries')
  await shot(page, lang, 12, 'deliveries')

  // 13 — Returns
  await goto(page, '/returns')
  await shot(page, lang, 13, 'returns')

  // 14-19 — Inventory tabs
  await goto(page, '/inventory')
  await shot(page, lang, 14, 'inventory-items')
  await clickIfVisible(page, page.getByRole('button', { name: L.addItem }))
  await page.waitForTimeout(500)
  await shot(page, lang, 15, 'inventory-add-product-modal')
  await closeModal(page)
  await clickTab(page, L.branchStock)
  await shot(page, lang, 16, 'inventory-branch-stock')
  await clickTab(page, L.stocktake)
  await shot(page, lang, 17, 'inventory-stocktake')
  await clickTab(page, L.movements)
  await shot(page, lang, 18, 'inventory-movements')
  await clickTab(page, L.velocity)
  await shot(page, lang, 19, 'inventory-velocity')
  await clickTab(page, L.alerts)
  await shot(page, lang, 20, 'inventory-alerts')

  // 21 — Transfers
  await goto(page, '/transfers')
  await shot(page, lang, 21, 'transfers')
  await clickIfVisible(page, page.getByRole('button', { name: L.newTransfer }))
  await page.waitForTimeout(500)
  await shot(page, lang, 22, 'transfers-create-modal')
  await closeModal(page)

  // 23 — Branches Stock
  await goto(page, '/branches-stock')
  await shot(page, lang, 23, 'branches-stock')

  // 24 — Expiry
  await goto(page, '/expiry')
  await shot(page, lang, 24, 'expiry')

  // 25-26 — Purchases
  await goto(page, '/purchases')
  await shot(page, lang, 25, 'purchases')
  await clickIfVisible(page, page.getByRole('button', { name: L.replenishment }))
  await page.waitForTimeout(500)
  await shot(page, lang, 26, 'purchases-replenishment-modal')
  await closeModal(page)

  // 27-28 — Customers
  await goto(page, '/customers')
  await shot(page, lang, 27, 'customers')
  await clickIfVisible(page, page.getByRole('button', { name: L.newCustomer }))
  await page.waitForTimeout(500)
  await shot(page, lang, 28, 'customers-add-modal')
  await closeModal(page)

  // 29-30 — Clinics
  await goto(page, '/clinics')
  await shot(page, lang, 29, 'clinics')
  await clickIfVisible(page, page.getByRole('button', { name: L.newClinic }))
  await page.waitForTimeout(500)
  await shot(page, lang, 30, 'clinics-add-modal')
  await closeModal(page)

  // 31-32 — Suppliers
  await goto(page, '/suppliers')
  await shot(page, lang, 31, 'suppliers')

  // 33-34 — Reports
  await goto(page, '/reports')
  await shot(page, lang, 33, 'reports-hub')
  await clickIfVisible(page, page.getByText(L.profitLoss, { exact: false }))
  await page.waitForTimeout(800)
  await shot(page, lang, 34, 'reports-profit-loss')

  // 35-36 — Shifts
  await goto(page, '/shifts')
  await shot(page, lang, 35, 'shifts')
  await clickIfVisible(page, page.getByRole('button', { name: L.openShift }))
  await page.waitForTimeout(500)
  await shot(page, lang, 36, 'shifts-open-modal')
  await closeModal(page)

  // 37-40 — HR tabs
  await goto(page, '/hr')
  await shot(page, lang, 37, 'hr-employees')
  await clickTab(page, L.attendance)
  await shot(page, lang, 38, 'hr-attendance')
  await clickTab(page, L.payroll)
  await shot(page, lang, 39, 'hr-payroll')
  await clickTab(page, L.performance)
  await shot(page, lang, 40, 'hr-performance')

  // 41 — Fraud
  await goto(page, '/fraud')
  await shot(page, lang, 41, 'fraud-surveillance')

  // 42 — Stock Reallocation
  await goto(page, '/stock-reallocation')
  await shot(page, lang, 42, 'stock-reallocation')

  // 43 — Time Clock
  await goto(page, '/clock')
  await shot(page, lang, 43, 'time-clock')

  // 44-47 — Settings tabs
  await goto(page, '/settings')
  await shot(page, lang, 44, 'settings-users')
  await clickTab(page, L.branches)
  await shot(page, lang, 45, 'settings-branches')
  await clickTab(page, L.pharmacy)
  await shot(page, lang, 46, 'settings-pharmacy')
  await clickTab(page, L.manual)
  await shot(page, lang, 47, 'settings-manual')

  await context.close()
}

async function main() {
  console.log('Logging in via API...')
  const auth = await apiLogin()
  await apiOpenShift(auth.token, auth.user.branch_id)

  const browser = await chromium.launch({ headless: true })
  try {
    await captureLanguage(browser, 'en', auth)
    await captureLanguage(browser, 'ar', auth)
  } finally {
    await browser.close()
  }
  console.log('\nDone! Screenshots saved to docs/screenshots/{en,ar}/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
