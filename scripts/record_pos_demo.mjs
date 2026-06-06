#!/usr/bin/env node
/**
 * Automated screen recording of the Arabic POS (tenant: test).
 * Excludes superadmin (/platform). Output: scripts/output/test_pos_demo.webm
 *
 * Prerequisites:
 *   - Backend on :8000, frontend on :5000
 *   - Run: node scripts/record_pos_demo.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.DEMO_URL || 'http://localhost:5000'
const OUTPUT_DIR = path.join(__dirname, 'output')
const PAUSE = Number(process.env.DEMO_PAUSE_MS || 3500)

const TENANT = 'test'
const USER = 'admin'
const PASS = 'test123'

/** Customer-facing routes only — no /platform */
const ROUTES = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/shifts', label: 'Shifts' },
  { path: '/', label: 'POS' },
  { path: '/sales', label: 'Sales' },
  { path: '/deliveries', label: 'Deliveries' },
  { path: '/returns', label: 'Returns' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/transfers', label: 'Transfers' },
  { path: '/branches-stock', label: 'Branches Stock' },
  { path: '/expiry', label: 'Expiry' },
  { path: '/purchases', label: 'Purchases' },
  { path: '/customers', label: 'Customers' },
  { path: '/suppliers', label: 'Suppliers' },
  { path: '/clinics', label: 'Clinics' },
  { path: '/reports', label: 'Reports' },
  { path: '/fraud', label: 'Fraud' },
  { path: '/stock-reallocation', label: 'Stock Reallocation' },
  { path: '/clock', label: 'Clock' },
  { path: '/hr', label: 'HR' },
  { path: '/settings', label: 'Settings' },
]

async function pause(ms = PAUSE) {
  await new Promise((r) => setTimeout(r, ms))
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem('pharma_lang', 'ar')
  })
  await page.reload({ waitUntil: 'networkidle' })

  const inputs = page.locator('input')
  await inputs.nth(0).fill(TENANT)
  await inputs.nth(1).fill(USER)
  await inputs.nth(2).fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
  await pause(2000)
}

async function demoPosSale(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await pause(1500)

  const search = page.locator('input').first()
  await search.click()
  await search.fill('6223001001')
  await page.keyboard.press('Enter')
  await pause(2500)

  const payBtn = page.getByRole('button', { name: /دفع|pay/i }).first()
  if (await payBtn.isVisible().catch(() => false)) {
    await payBtn.click()
    await pause(2000)
    const cashBtn = page.getByRole('button', { name: /نقدي|cash/i }).first()
    if (await cashBtn.isVisible().catch(() => false)) {
      await cashBtn.click()
      await pause(1000)
    }
    const confirm = page.getByRole('button', { name: /تأكيد|confirm/i }).first()
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click()
      await pause(2500)
    }
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ar-EG',
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1440, height: 900 },
    },
  })

  const page = await context.newPage()
  console.log('Logging in as test/admin...')
  await login(page)

  console.log('POS barcode demo...')
  await demoPosSale(page)

  for (const route of ROUTES) {
    console.log(`Visiting ${route.label} (${route.path})...`)
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' })
    await pause()
    await page.mouse.wheel(0, 400)
    await pause(1500)
  }

  // Brief English toggle
  const langBtn = page.getByRole('button', { name: /English|عربي/i }).first()
  if (await langBtn.isVisible().catch(() => false)) {
    await langBtn.click()
    await pause(2500)
    await langBtn.click()
    await pause(1500)
  }

  const video = page.video()
  const webmPath = path.join(OUTPUT_DIR, 'test_pos_demo.webm')
  await page.close()
  if (video) {
    await video.saveAs(webmPath)
    console.log(`\nVideo saved: ${webmPath}`)
  }
  await context.close()
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
