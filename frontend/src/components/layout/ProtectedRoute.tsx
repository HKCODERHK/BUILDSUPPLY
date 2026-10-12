import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { TruckLoader } from '@/components/TruckLoader'
import { AccountLoadError } from '@/components/AccountLoadError'
import { getMyCompliance } from '@/services/compliance'

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
    return <TruckLoader inline className="min-h-app" />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Signed in, but the profile didn't load. Not /login: Login sends anyone
  // with a session back here, and the two redirected each other forever.
  if (!supplier) {
    return <NoSupplierRow userId={session.user.id} />
  }

  // Belt-and-suspenders alongside the Supabase Auth-level ban: a session
  // opened before a suspend/deactivate action could otherwise linger until
  // its token naturally expires.
  if (supplier.status !== 'active') {
    return (
      <div className="flex min-h-app flex-col items-center justify-center gap-4 bg-shell p-4 text-center">
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

/**
 * Signed in with no supplier row. Either a shop that has applied and not
 * been accepted yet (migration 045) — their place is the application screen
 * — or the profile simply did not load, which keeps its old screen.
 */
function NoSupplierRow({ userId }: { userId: string }) {
  const [applicant, setApplicant] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    getMyCompliance(userId)
      .then((r) => live && setApplicant(!!r?.is_applicant))
      .catch(() => live && setApplicant(false))
    return () => {
      live = false
    }
  }, [userId])
  if (applicant === null) return <TruckLoader inline className="min-h-app" />
  if (applicant) return <Navigate to="/application" replace />
  return <AccountLoadError />
}
