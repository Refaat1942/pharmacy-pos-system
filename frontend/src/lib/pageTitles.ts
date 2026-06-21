/** Map routes to nav label keys for the top bar page title. */
const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.pos',
  '/dashboard': 'nav.dashboard',
  '/sales': 'nav.sales',
  '/deliveries': 'nav.deliveries',
  '/inventory': 'nav.inventory',
  '/transfers': 'nav.transfers',
  '/branches-stock': 'nav.branches_stock',
  '/expiry': 'nav.expiry',
  '/purchases': 'nav.purchases',
  '/suppliers': 'nav.suppliers',
  '/stock-reallocation': 'nav.stock_reallocation',
  '/customers': 'nav.customers',
  '/loyalty': 'nav.loyalty',
  '/insurance': 'nav.insurance',
  '/discount-cards': 'nav.discount_cards',
  '/offers': 'nav.offers',
  '/clinics': 'nav.clinics',
  '/reports': 'nav.reports',
  '/fraud': 'nav.fraud',
  '/shifts': 'nav.shifts',
  '/clock': 'nav.clock',
  '/hr': 'nav.hr',
  '/settings': 'nav.settings',
  '/hr/cards': 'hr.print_cards',
  '/settings/login-cards': 'settings.login_cards',
}

export function pageTitleKey(pathname: string): string | null {
  if (ROUTE_TITLE_KEYS[pathname]) return ROUTE_TITLE_KEYS[pathname]
  const base = pathname.split('/').filter(Boolean)[0]
  if (!base) return 'nav.pos'
  const guess = `/${base}`
  return ROUTE_TITLE_KEYS[guess] ?? null
}
