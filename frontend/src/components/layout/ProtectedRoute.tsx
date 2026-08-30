import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: ReactNode
  requireAdmin?: boolean
}) {
  const { session, supplier, loading, signOut } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>
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
          Your account is {supplier.status === 'suspended' ? 'suspended' : 'deactivated'}.
        </p>
        <p className="max-w-sm text-sm text-sidebar-text">
          {supplier.suspension_reason || 'Contact the BuildSupply admin to restore access.'}
        </p>
        <button
          onClick={() => signOut()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Sign out
        </button>
      </div>
    )
  }

  if (requireAdmin && supplier.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
