import type { ReactNode } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { PinProvider } from '@/context/PinContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import Login from '@/routes/Login'
import ForgotPassword from '@/routes/ForgotPassword'
import ResetPassword from '@/routes/ResetPassword'
import Dashboard from '@/routes/Dashboard'
import Customers from '@/routes/Customers'
import CustomerProfile from '@/routes/CustomerProfile'
import Materials from '@/routes/Materials'
import NewInvoice from '@/routes/NewInvoice'
import Invoices from '@/routes/Invoices'
import InvoiceDetail from '@/routes/InvoiceDetail'
import Quotations from '@/routes/Quotations'
import NewQuotation from '@/routes/NewQuotation'
import QuotationDetail from '@/routes/QuotationDetail'
import Payments from '@/routes/Payments'
import Deliveries from '@/routes/Deliveries'
import Reminders from '@/routes/Reminders'
import Reports from '@/routes/Reports'
import Settings from '@/routes/Settings'
import AdminSuppliers from '@/routes/admin/Suppliers'
import AdminSupplierProfile from '@/routes/admin/SupplierProfile'
import AdminMaterialCatalog from '@/routes/admin/MaterialCatalog'
import AdminPlatformSettings from '@/routes/admin/PlatformSettings'

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
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

// A data router rather than <BrowserRouter>, because useBlocker only exists
// on this one — and that is what lets New Invoice stop the Android back
// button from throwing away a bill the supplier has half-typed.
const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
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

export default function App() {
  // The providers sit outside the router: none of them use router hooks, and
  // keeping them here means a navigation never remounts the auth session or
  // the PIN prompt.
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <PinProvider>
            <RouterProvider router={router} />
          </PinProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
