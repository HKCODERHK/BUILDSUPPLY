import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { TruckLoader } from '@/components/TruckLoader'

export function ProtectedRoute({
  children,
  requireAdmin = false,
  supplierOnly = false,
}: {
  children: ReactNode
  requireAdmin?: boolean
  // Screens that show a supplier's own trade data — customers, bills,
  // stock, payments. The admin runs the platform, not a building-material
  // business, so these are not theirs to open. RLS already returns nothing
  // for them (migration 019); this just keeps the admin from landing on a
  // stack of empty pages that look broken.
  supplierOnly?: boolean
}) {
  const { session, supplier, loading, signOut } = useAuth()
  const { t } = useLanguage()

  if (loading) {
    return <TruckLoader inline className="min-h-screen" />
  }

  if (!session || !supplier) {
    return <Navigate to="/login" replace />
  }

  // Belt-and-suspenders alongside the Supabase Auth-level ban: a session
  // opened before a suspend/deactivate action could otherwise linger until
  // its token naturally expires.
  if (supplier.status !== 'active') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-shell p-4 text-center">
        <p className="text-lg font-semibold text-white">
          {t(supplier.status === 'suspended' ? 'account.suspended' : 'account.deactivated')}
        </p>
        <p className="max-w-sm text-sm text-sidebar-text">
          {supplier.suspension_reason || t('account.contactAdmin')}
        </p>
        <button
          onClick={() => signOut()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {t('nav.signOut')}
        </button>
      </div>
    )
  }

  if (requireAdmin && supplier.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  if (supplierOnly && supplier.role === 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
