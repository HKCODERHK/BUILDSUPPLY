import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { PinProvider } from '@/context/PinContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { Splash } from '@/components/Splash'
import { TruckLoader } from '@/components/TruckLoader'
import { screens } from '@/lib/screens'

// Each screen is its own file, fetched the first time it is needed — and, for
// a signed-in account, in the background soon after the app opens (see
// lib/screens). A customer opening an order or khata link gets that one page,
// not the supplier's whole app.
const Login = lazy(screens.Login)
const ForgotPassword = lazy(screens.ForgotPassword)
const ResetPassword = lazy(screens.ResetPassword)
const Dashboard = lazy(screens.Dashboard)
const Customers = lazy(screens.Customers)
const CustomerProfile = lazy(screens.CustomerProfile)
const Materials = lazy(screens.Materials)
const NewInvoice = lazy(screens.NewInvoice)
const Invoices = lazy(screens.Invoices)
const InvoiceDetail = lazy(screens.InvoiceDetail)
const Quotations = lazy(screens.Quotations)
const NewQuotation = lazy(screens.NewQuotation)
const QuotationDetail = lazy(screens.QuotationDetail)
const Payments = lazy(screens.Payments)
const Deliveries = lazy(screens.Deliveries)
const Reminders = lazy(screens.Reminders)
const Reports = lazy(screens.Reports)
const Settings = lazy(screens.Settings)
const AdminSuppliers = lazy(screens.AdminSuppliers)
const AdminSupplierProfile = lazy(screens.AdminSupplierProfile)
const AdminMaterialCatalog = lazy(screens.AdminMaterialCatalog)
const AdminPlatformSettings = lazy(screens.AdminPlatformSettings)
const OrderPage = lazy(screens.OrderPage)
const OrderStatus = lazy(screens.OrderStatus)
const KhataPage = lazy(screens.KhataPage)
const MyAccount = lazy(screens.MyAccount)
const Orders = lazy(screens.Orders)
const OrderDetail = lazy(screens.OrderDetail)

// A supplier's public order page and a customer's status link: open to
// anyone, no sign-in, and no BuildSupply splash in front of them.
function isPublicOrderPath(path: string) {
  return (
    path.startsWith('/order/') ||
    path.startsWith('/order-status/') ||
    path.startsWith('/khata/') ||
    path === '/me'
  )
}

function Protected({
  children,
  admin = false,
  supplierOnly = false,
}: {
  children: ReactNode
  admin?: boolean
  // `supplierOnly` marks the screens that show a supplier's own trade data.
  // The admin is bounced to their own dashboard — see ProtectedRoute.
  supplierOnly?: boolean
}) {
  return (
    <ProtectedRoute requireAdmin={admin} supplierOnly={supplierOnly}>
      <AppShell>
        {/* The top bar and tab bar stay put while a screen's file arrives. */}
        <Suspense fallback={<TruckLoader />}>{children}</Suspense>
      </AppShell>
    </ProtectedRoute>
  )
}

// Sign-in and the customer's public pages, which have no app shell around them.
function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen">
          <TruckLoader />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

// A data router rather than <BrowserRouter>, because useBlocker only exists
// on this one — and that is what lets New Invoice stop the Android back
// button from throwing away a bill the supplier has half-typed.
const router = createBrowserRouter([
  { path: '/login', element: <Page><Login /></Page> },
  { path: '/forgot-password', element: <Page><ForgotPassword /></Page> },
  { path: '/reset-password', element: <Page><ResetPassword /></Page> },
  { path: '/order/:link', element: <Page><OrderPage /></Page> },
  { path: '/order-status/:token', element: <Page><OrderStatus /></Page> },
  { path: '/khata/:token', element: <Page><KhataPage /></Page> },
  // The customer's own account (migration 041) — never the supplier's session.
  { path: '/me', element: <Page><MyAccount /></Page> },
  { path: '/dashboard', element: <Protected><Dashboard /></Protected> },
  { path: '/customers', element: <Protected supplierOnly><Customers /></Protected> },
  { path: '/customers/:id', element: <Protected supplierOnly><CustomerProfile /></Protected> },
  { path: '/materials', element: <Protected supplierOnly><Materials /></Protected> },
  { path: '/invoices', element: <Protected supplierOnly><Invoices /></Protected> },
  { path: '/invoices/new', element: <Protected supplierOnly><NewInvoice /></Protected> },
  // Same screen as billing, prefilled — see NewInvoice's edit mode.
  { path: '/invoices/:id/edit', element: <Protected supplierOnly><NewInvoice /></Protected> },
  { path: '/invoices/:id', element: <Protected supplierOnly><InvoiceDetail /></Protected> },
  { path: '/quotations', element: <Protected supplierOnly><Quotations /></Protected> },
  { path: '/quotations/new', element: <Protected supplierOnly><NewQuotation /></Protected> },
  { path: '/quotations/:id', element: <Protected supplierOnly><QuotationDetail /></Protected> },
  { path: '/orders', element: <Protected supplierOnly><Orders /></Protected> },
  { path: '/orders/:id', element: <Protected supplierOnly><OrderDetail /></Protected> },
  // Stock merged into Materials — keep the old path working.
  { path: '/stock', element: <Navigate to="/materials" replace /> },
  { path: '/payments', element: <Protected supplierOnly><Payments /></Protected> },
  { path: '/deliveries', element: <Protected supplierOnly><Deliveries /></Protected> },
  { path: '/reminders', element: <Protected supplierOnly><Reminders /></Protected> },
  { path: '/reports', element: <Protected supplierOnly><Reports /></Protected> },
  // Not supplier-only: this edits the signed-in account's own profile, which
  // the admin also has.
  { path: '/settings', element: <Protected><Settings /></Protected> },
  { path: '/admin/suppliers', element: <Protected admin><AdminSuppliers /></Protected> },
  { path: '/admin/suppliers/:id', element: <Protected admin><AdminSupplierProfile /></Protected> },
  { path: '/admin/materials', element: <Protected admin><AdminMaterialCatalog /></Protected> },
  { path: '/admin/settings', element: <Protected admin><AdminPlatformSettings /></Protected> },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])

// Needs to be inside AuthProvider to read the splash phase, so it cannot live
// in App's own body.
function SplashGate() {
  const { splash } = useAuth()
  // A customer opening an order link is not opening BuildSupply.
  if (isPublicOrderPath(window.location.pathname)) return null
  return splash ? <Splash phase={splash} /> : null
}

export default function App() {
  // The providers sit outside the router: none of them use router hooks, and
  // keeping them here means a navigation never remounts the auth session or
  // the PIN prompt.
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <PinProvider>
            {/* Over the router, not instead of it: the app carries on loading
                underneath, so the splash is covering real work rather than
                adding a wait in front of it. */}
            <SplashGate />
            <RouterProvider router={router} />
          </PinProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
