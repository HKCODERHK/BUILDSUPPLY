import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { getDashboardStats } from '@/services/adminSuppliers'
import type { AdminDashboardStats } from '@/lib/database.types'

export function AdminDashboardView() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .finally(() => setLoading(false))
  }, [])

  const tiles: { label: string; value: number | undefined; tone?: string }[] = [
    { label: 'Total Suppliers', value: stats?.total_suppliers },
    { label: 'Active Suppliers', value: stats?.active_suppliers, tone: 'text-accent' },
    { label: 'Suspended Suppliers', value: stats?.suspended_suppliers, tone: 'text-amber-600' },
    { label: 'Inactive Suppliers', value: stats?.inactive_suppliers, tone: 'text-muted' },
    { label: 'Expired Subscriptions', value: stats?.expired_subscriptions, tone: 'text-red-600' },
    { label: 'Expiring Within 7 Days', value: stats?.expiring_soon, tone: 'text-amber-600' },
    { label: 'Never Logged In', value: stats?.never_logged_in, tone: 'text-muted' },
  ]

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform-wide overview of every supplier on BuildSupply"
        action={
          <Link to="/admin/suppliers" className="text-sm font-semibold text-accent">
            Manage suppliers →
          </Link>
        }
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label}>
              <div className="text-xs font-medium text-muted">{t.label}</div>
              <div className={`mt-1 text-2xl font-bold text-ink ${t.tone ?? ''}`}>{t.value ?? 0}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
