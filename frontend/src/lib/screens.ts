import { warmPdfKit } from './pdfKit'

// Every screen, each its own file (App.tsx loads them with React.lazy), so a
// phone downloads and runs only what it opens. That matters most for a
// customer: opening an order QR or a khata link fetches that one page, not the
// supplier's whole app.
export const screens = {
  Login: () => import('@/routes/Login'),
  ForgotPassword: () => import('@/routes/ForgotPassword'),
  ResetPassword: () => import('@/routes/ResetPassword'),
  OrderPage: () => import('@/routes/OrderPage'),
  OrderStatus: () => import('@/routes/OrderStatus'),
  KhataPage: () => import('@/routes/KhataPage'),
  MyAccount: () => import('@/routes/MyAccount'),
  Dashboard: () => import('@/routes/Dashboard'),
  Customers: () => import('@/routes/Customers'),
  CustomerProfile: () => import('@/routes/CustomerProfile'),
  Materials: () => import('@/routes/Materials'),
  NewInvoice: () => import('@/routes/NewInvoice'),
  Invoices: () => import('@/routes/Invoices'),
  InvoiceDetail: () => import('@/routes/InvoiceDetail'),
  Quotations: () => import('@/routes/Quotations'),
  NewQuotation: () => import('@/routes/NewQuotation'),
  QuotationDetail: () => import('@/routes/QuotationDetail'),
  Payments: () => import('@/routes/Payments'),
  Deliveries: () => import('@/routes/Deliveries'),
  Reminders: () => import('@/routes/Reminders'),
  Reports: () => import('@/routes/Reports'),
  Settings: () => import('@/routes/Settings'),
  Orders: () => import('@/routes/Orders'),
  OrderDetail: () => import('@/routes/OrderDetail'),
  AdminSuppliers: () => import('@/routes/admin/Suppliers'),
  AdminSupplierProfile: () => import('@/routes/admin/SupplierProfile'),
  AdminMaterialCatalog: () => import('@/routes/admin/MaterialCatalog'),
  AdminPlatformSettings: () => import('@/routes/admin/PlatformSettings'),
}

type Screen = keyof typeof screens

// What each kind of account can open — the order they are most likely needed.
const SUPPLIER_SCREENS: Screen[] = [
  'Dashboard', 'NewInvoice', 'Customers', 'CustomerProfile', 'Invoices', 'InvoiceDetail', 'Materials',
  'Payments', 'Orders', 'OrderDetail', 'Settings', 'Quotations', 'NewQuotation', 'QuotationDetail',
  'Deliveries', 'Reminders', 'Reports',
]
const ADMIN_SCREENS: Screen[] = ['Dashboard', 'AdminSuppliers', 'AdminSupplierProfile', 'AdminMaterialCatalog', 'AdminPlatformSettings', 'Settings']

let started = false

/**
 * A couple of seconds after a signed-in app opens, once the phone is idle:
 * fetch every other screen this account can open — one after another, so a
 * slow connection isn't swamped while the supplier is working — and then the
 * PDF tools. Moving between screens then never waits, and the service worker
 * keeps it all for when the shop's signal drops. Runs once per app open.
 */
export function prefetchScreens(role: 'admin' | 'supplier') {
  if (started) return
  started = true
  const run = () => {
    const list = role === 'admin' ? ADMIN_SCREENS : SUPPLIER_SCREENS
    void list
      .reduce<Promise<unknown>>((prev, key) => prev.then(() => screens[key]().catch(() => undefined)), Promise.resolve())
      .then(() => (role === 'supplier' ? warmPdfKit() : undefined))
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 5000 }) : run()), 2500)
}
