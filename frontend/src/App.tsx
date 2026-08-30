import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { LanguageProvider } from '@/context/LanguageContext'
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

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/customers" element={<Protected supplierOnly><Customers /></Protected>} />
              <Route path="/customers/:id" element={<Protected supplierOnly><CustomerProfile /></Protected>} />
              <Route path="/materials" element={<Protected supplierOnly><Materials /></Protected>} />
              <Route path="/invoices" element={<Protected supplierOnly><Invoices /></Protected>} />
              <Route path="/invoices/new" element={<Protected supplierOnly><NewInvoice /></Protected>} />
              {/* Same screen as billing, prefilled — see NewInvoice's edit mode. */}
              <Route path="/invoices/:id/edit" element={<Protected supplierOnly><NewInvoice /></Protected>} />
              <Route path="/invoices/:id" element={<Protected supplierOnly><InvoiceDetail /></Protected>} />
              <Route path="/quotations" element={<Protected supplierOnly><Quotations /></Protected>} />
              <Route path="/quotations/new" element={<Protected supplierOnly><NewQuotation /></Protected>} />
              <Route path="/quotations/:id" element={<Protected supplierOnly><QuotationDetail /></Protected>} />
              {/* Stock merged into Materials — keep the old path working. */}
              <Route path="/stock" element={<Navigate to="/materials" replace />} />
              <Route path="/payments" element={<Protected supplierOnly><Payments /></Protected>} />
              <Route path="/deliveries" element={<Protected supplierOnly><Deliveries /></Protected>} />
              <Route path="/reminders" element={<Protected supplierOnly><Reminders /></Protected>} />
              <Route path="/reports" element={<Protected supplierOnly><Reports /></Protected>} />
              {/* Not supplier-only: this edits the signed-in account's own
                  profile, which the admin also has. */}
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/admin/suppliers" element={<Protected admin><AdminSuppliers /></Protected>} />
              <Route path="/admin/suppliers/:id" element={<Protected admin><AdminSupplierProfile /></Protected>} />
              <Route path="/admin/materials" element={<Protected admin><AdminMaterialCatalog /></Protected>} />
              <Route path="/admin/settings" element={<Protected admin><AdminPlatformSettings /></Protected>} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  )
}
