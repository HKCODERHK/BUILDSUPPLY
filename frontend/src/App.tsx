import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
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
import Quotations from '@/routes/Quotations'
import Stock from '@/routes/Stock'
import Payments from '@/routes/Payments'
import Deliveries from '@/routes/Deliveries'
import Reminders from '@/routes/Reminders'
import Reports from '@/routes/Reports'
import Settings from '@/routes/Settings'
import AdminSuppliers from '@/routes/admin/Suppliers'
import AdminSupplierProfile from '@/routes/admin/SupplierProfile'
import AdminMaterialCatalog from '@/routes/admin/MaterialCatalog'
import AdminPlatformSettings from '@/routes/admin/PlatformSettings'

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <ProtectedRoute requireAdmin={admin}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/customers" element={<Protected><Customers /></Protected>} />
          <Route path="/customers/:id" element={<Protected><CustomerProfile /></Protected>} />
          <Route path="/materials" element={<Protected><Materials /></Protected>} />
          <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
          <Route path="/invoices/new" element={<Protected><NewInvoice /></Protected>} />
          <Route path="/quotations" element={<Protected><Quotations /></Protected>} />
          <Route path="/stock" element={<Protected><Stock /></Protected>} />
          <Route path="/payments" element={<Protected><Payments /></Protected>} />
          <Route path="/deliveries" element={<Protected><Deliveries /></Protected>} />
          <Route path="/reminders" element={<Protected><Reminders /></Protected>} />
          <Route path="/reports" element={<Protected><Reports /></Protected>} />
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
  )
}
