import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { getDashboardStats, listSuppliersOverview } from '@/services/adminSuppliers'
import { openWhatsAppShare } from '@/lib/whatsapp'
import {
  describeExpiry,
  subscriptionState,
  daysUntilExpiry,
  SUBSCRIPTION_LABEL,
  SUBSCRIPTION_TONE,
  type SubscriptionState,
} from '@/lib/subscription'
import type { AdminDashboardStats, SupplierOverview } from '@/lib/database.types'

// The whole point of this screen: who needs attention, who needs renewing,
// who do I contact — answered without clicking into anything, with the action
// sitting right next to the name. Everything else is a number that can wait.
const NEEDS_ATTENTION: SubscriptionState[] = ['expired', 'expiring', 'none']

function renewalMessage(s: SupplierOverview) {
  const state = subscriptionState(s.subscription_expiry)
  const owner = s.owner_name?.trim() || s.business_name
  if (state === 'expired') {
    return `Hi ${owner}, your BuildSupply subscription for ${s.business_name} has expired. Reply here and I will renew it for you right away.`
  }
  if (state === 'expiring') {
    const days = daysUntilExpiry(s.subscription_expiry) ?? 0
    const when = days === 0 ? 'expires today' : `expires in ${days} day${days === 1 ? '' : 's'}`
    return `Hi ${owner}, your BuildSupply subscription for ${s.business_name} ${when}. Shall I renew it?`
  }
  return `Hi ${owner}, checking in about your BuildSupply subscription for ${s.business_name}.`
}

export function AdminDashboardView() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierOverview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDashboardStats(), listSuppliersOverview()])
      .then(([statsData, list]) => {
        setStats(statsData)
        setSuppliers(list.filter((s) => s.role === 'supplier'))
      })
      .finally(() => setLoading(false))
  }, [])

  // Worst first: an expired account is losing money right now, one with no
  // expiry date at all has been running unnoticed, and "expiring" is the one
  // still worth getting ahead of.
  const attention = useMemo(() => {
    const rank: Record<SubscriptionState, number> = { expired: 0, none: 1, expiring: 2, active: 3 }
    return suppliers
      .map((s) => ({ supplier: s, state: subscriptionState(s.subscription_expiry) }))
      .filter((row) => NEEDS_ATTENTION.includes(row.state))
      .sort(
        (a, b) =>
          rank[a.state] - rank[b.state] ||
          (daysUntilExpiry(a.supplier.subscription_expiry) ?? 0) - (daysUntilExpiry(b.supplier.subscription_expiry) ?? 0),
      )
  }, [suppliers])

  const planSplit = useMemo(() => {
    const pro = suppliers.filter((s) => s.plan === 'pro').length
    return { pro, starter: suppliers.length - pro }
  }, [suppliers])

  // Every tile lands on the supplier list already filtered — a count you
  // cannot act on just sends you looking for the rows behind it.
  const tiles: { label: string; value: number | undefined; to: string; tone?: string }[] = [
    { label: 'Total Suppliers', value: stats?.total_suppliers, to: '/admin/suppliers' },
    { label: 'Active Suppliers', value: stats?.active_suppliers, to: '/admin/suppliers?filter=active', tone: 'text-accent' },
    { label: 'Suspended', value: stats?.suspended_suppliers, to: '/admin/suppliers?filter=suspended', tone: 'text-amber-600' },
    { label: 'Inactive', value: stats?.inactive_suppliers, to: '/admin/suppliers?filter=inactive', tone: 'text-muted' },
    {
      label: 'Expired Subscriptions',
      value: stats?.expired_subscriptions,
      to: '/admin/suppliers?filter=expired',
      tone: 'text-red-600',
    },
    {
      label: 'Expiring Within 7 Days',
      value: stats?.expiring_soon,
      to: '/admin/suppliers?filter=expiring',
      tone: 'text-amber-600',
    },
    { label: 'No Expiry Set', value: undefined, to: '/admin/suppliers?filter=no-expiry', tone: 'text-muted' },
    { label: 'Pro / Starter', value: undefined, to: '/admin/suppliers' },
  ]

  const noExpiryCount = suppliers.filter((s) => subscriptionState(s.subscription_expiry) === 'none').length

  function tileValue(label: string, value: number | undefined) {
    if (label === 'Pro / Starter') return `${planSplit.pro} / ${planSplit.starter}`
    if (label === 'No Expiry Set') return noExpiryCount
    return value ?? 0
  }

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
        <>
          {attention.length > 0 && (
            <Card className="mb-6 border-amber-200 dark:border-amber-900">
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <span className="text-xs text-muted">
                  {attention.length} supplier{attention.length === 1 ? '' : 's'}
                </span>
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {attention.map(({ supplier, state }) => (
                  <div key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <Link to={`/admin/suppliers/${supplier.id}`} className="font-medium text-ink hover:text-accent">
                        {supplier.business_name}
                      </Link>
                      <div className="text-xs text-muted">{describeExpiry(supplier.subscription_expiry)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={SUBSCRIPTION_TONE[state]}>{SUBSCRIPTION_LABEL[state]}</Badge>
                      {supplier.phone && (
                        <>
                          <a
                            href={`tel:${supplier.phone}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-ink"
                            aria-label={`Call ${supplier.business_name}`}
                          >
                            <Phone size={14} />
                          </a>
                          <button
                            onClick={() => openWhatsAppShare(supplier.phone, renewalMessage(supplier))}
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-accent hover:bg-accent-bg"
                          >
                            <WhatsAppIcon size={14} /> Remind
                          </button>
                        </>
                      )}
                      <Link
                        to={`/admin/suppliers/${supplier.id}`}
                        className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white"
                      >
                        Renew
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.label} to={t.to}>
                <Card className="h-full transition-shadow hover:shadow-sm">
                  <div className="text-xs font-medium text-muted">{t.label}</div>
                  <div className={`mt-1 text-2xl font-bold text-ink ${t.tone ?? ''}`}>{tileValue(t.label, t.value)}</div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
