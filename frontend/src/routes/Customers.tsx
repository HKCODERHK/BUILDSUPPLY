import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import { listCustomers, listCustomerBalances } from '@/services/customers'
import type { Customer, CustomerBalance } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Customers() {
  const { supplier } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [balances, setBalances] = useState<Record<string, CustomerBalance>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setModalOpen(true)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    const [customerList, balanceList] = await Promise.all([listCustomers(), listCustomerBalances()])
    setCustomers(customerList)
    setBalances(Object.fromEntries(balanceList.map((b) => [b.customer_id, b])))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const filtered = customers.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.site ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage customers, sites, invoices and pending payments"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Add customer
          </Button>
        }
      />

      <Input
        placeholder="Search by name, phone or site…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 max-w-xs"
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 && <p className="text-sm text-muted">No customers found.</p>}
          {filtered.map((c) => {
            const bal = balances[c.id]
            return (
              <Link key={c.id} to={`/customers/${c.id}`}>
                <Card className="h-full transition-shadow hover:shadow-sm">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="font-semibold text-ink">{c.name}</div>
                    <Badge tone={c.status === 'Active' ? 'success' : 'neutral'}>{c.status}</Badge>
                  </div>
                  <div className="text-xs text-muted">{c.site ?? '—'}</div>
                  {/* Plain text here on purpose: the whole card is already a
                      link to the profile, and an <a> inside an <a> is invalid
                      HTML. The number is tappable on the profile itself. */}
                  <div className="text-xs text-muted">{c.phone ?? '—'}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted">Pending</span>
                    <span className="font-semibold text-red-600">{formatINR(bal?.pending ?? 0)}</span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {modalOpen && supplier && (
        <AddCustomerModal
          supplierId={supplier.id}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false)
            void refresh()
          }}
        />
      )}
    </div>
  )
}
