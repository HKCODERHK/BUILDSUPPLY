import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { listCustomers, listCustomerBalances, createCustomer } from '@/services/customers'
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
  const [form, setForm] = useState({ name: '', phone: '', site: '' })
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const [customerList, balanceList] = await Promise.all([listCustomers(), listCustomerBalances()])
    setCustomers(customerList)
    setBalances(Object.fromEntries(balanceList.map((b) => [b.customer_id, b])))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    try {
      await createCustomer(supplier.id, form)
      setForm({ name: '', phone: '', site: '' })
      setModalOpen(false)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

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
        placeholder="Search customers…"
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

      {modalOpen && (
        <Modal title="Add customer" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="site">Site</Label>
              <Input id="site" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save customer'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
