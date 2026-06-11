/** Maps UI areas to tenant feature_options keys (mirrors backend FEATURE_OPTIONS_CATALOG). */

import type { HrTab } from './hrAccess'

export const REPORT_OPTION_KEY: Record<string, string> = {
  pnl: 'financial',
  trend: 'financial',
  category: 'financial',
  branch: 'financial',
  sales_by_item: 'sales',
  top_products: 'sales',
  sales_by_seller: 'sales',
  sales_report: 'sales',
  offer_sales: 'sales',
  delivery_summary: 'delivery',
  delivery_zones: 'delivery',
  digital: 'digital',
  clinic: 'clinic',
  customer_analysis: 'customer',
  payment: 'payment',
}

export const INVENTORY_TAB_OPTION: Record<string, string> = {
  items: 'items',
  barcodes: 'barcodes',
  dose_labels: 'dose_labels',
  branch_stock: 'branch_stock',
  stocktake: 'stocktake',
  movements: 'movements',
  velocity: 'velocity',
  alerts: 'alerts',
}

export const HR_TAB_OPTION: Record<HrTab, string> = {
  employees: 'employees',
  attendance: 'attendance',
  payroll: 'payroll',
  performance: 'performance',
}

export const SETTINGS_TAB_OPTION = {
  users: 'users',
  branches: 'branches',
  pharmacy: 'pharmacy',
  platforms: 'digital_platforms',
  manual: 'manual',
} as const

export type FeatureOptionCheck = (feature: string, option: string) => boolean

export function reportOptionEnabled(reportId: string, check: FeatureOptionCheck): boolean {
  const opt = REPORT_OPTION_KEY[reportId]
  if (!opt) return true
  return check('reports', opt)
}

export function inventoryTabEnabled(tab: string, check: FeatureOptionCheck): boolean {
  const opt = INVENTORY_TAB_OPTION[tab]
  if (!opt) return true
  return check('inventory', opt)
}

export function hrTabEnabled(tab: HrTab, check: FeatureOptionCheck): boolean {
  return check('hr', HR_TAB_OPTION[tab])
}
