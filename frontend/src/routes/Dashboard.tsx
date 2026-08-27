import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { dashboardTotals, listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { listCustomers } from '@/services/customers'
import type { Customer, DashboardTotals } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { AdminDashboardView } from '@/routes/admin/AdminDashboardView'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Dashboard() {
  const { supplier } = useAuth()
  if (supplier?.role === 'admin') return <AdminDashboardView />
  return <SupplierDashboardView />
}

function SupplierDashboardView() {
  const { supplier } = useAuth()
  const [totals, setTotals] = useState<DashboardTotals | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<InvoiceWithCustomer[]>([])
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([dashboardTotals(), listInvoices(), listCustomers()])
      .then(([totalsData, invoices, customers]) => {
        if (!active) return
        setTotals(totalsData)
        setRecentInvoices(invoices.slice(0, 5))
        setRecentCustomers(customers.slice(0, 5))
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <PageHeader title={`Welcome back, ${supplier?.business_name ?? ''}`} subtitle="Here's how your business is doing." />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs font-medium text-muted">Total Sales</div>
              <div className="mt-1 text-2xl font-bold text-ink">{formatINR(totals?.total_sales ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs font-medium text-muted">Collected</div>
              <div className="mt-1 text-2xl font-bold text-accent">{formatINR(totals?.total_collected ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs font-medium text-muted">Pending</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{formatINR(totals?.total_pending ?? 0)}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Invoices</CardTitle>
                <Link to="/invoices" className="text-xs font-semibold text-accent">
                  View all
                </Link>
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {recentInvoices.length === 0 && <p className="py-3 text-sm text-muted">No invoices yet.</p>}
                {recentInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <div className="font-medium text-ink">{inv.invoice_no}</div>
                      <div className="text-xs text-muted">{inv.customers?.name ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatINR(inv.total)}</div>
                      <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Customers</CardTitle>
                <Link to="/customers" className="text-xs font-semibold text-accent">
                  View all
                </Link>
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {recentCustomers.length === 0 && <p className="py-3 text-sm text-muted">No customers yet.</p>}
                {recentCustomers.map((c) => (
                  <Link
                    key={c.id}
                    to={`/customers/${c.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-accent"
                  >
                    <div>
                      <div className="font-medium text-ink">{c.name}</div>
                      <div className="text-xs text-muted">{c.site ?? '—'}</div>
                    </div>
                    <Badge tone={c.status === 'Active' ? 'success' : 'neutral'}>{c.status}</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
