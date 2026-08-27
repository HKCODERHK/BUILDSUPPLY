import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listSuppliersOverview } from '@/services/adminSuppliers'
import type { SupplierAccountStatus, SupplierOverview } from '@/lib/database.types'
import { AddSupplierModal } from './AddSupplierModal'

const FILTERS: { id: SupplierAccountStatus | 'all' | 'expired' | 'expiring'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'expired', label: 'Expired subscription' },
  { id: 'expiring', label: 'Expiring soon' },
]

function statusTone(status: SupplierAccountStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'suspended') return 'warning' as const
  return 'neutral' as const
}

export default function AdminSuppliers() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<SupplierOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [modalOpen, setModalOpen] = useState(false)

  async function refresh() {
    const data = await listSuppliersOverview()
    setSuppliers(data.filter((s) => s.role === 'supplier'))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const filtered = suppliers.filter((s) => {
    const q = query.toLowerCase()
    const matchesQuery =
      !q ||
      s.business_name.toLowerCase().includes(q) ||
      (s.owner_name ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q)
    if (!matchesQuery) return false

    if (filter === 'all') return true
    if (filter === 'expired') return !!s.subscription_expiry && new Date(s.subscription_expiry) < now
    if (filter === 'expiring')
      return !!s.subscription_expiry && new Date(s.subscription_expiry) >= now && new Date(s.subscription_expiry) < in7days
    return s.status === filter
  })

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Manage every business account on BuildSupply"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Add supplier
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by business, owner, email or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === f.id ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Business</th>
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Phone</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Last login</th>
                  <th className="py-2 pr-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-muted">
                      No suppliers match.
                    </td>
                  </tr>
                )}
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer hover:bg-surface"
                    onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                  >
                    <td className="py-2.5 pr-3 font-medium text-ink">{s.business_name}</td>
                    <td className="py-2.5 pr-3">{s.owner_name ?? '—'}</td>
                    <td className="py-2.5 pr-3">{s.email ?? '—'}</td>
                    <td className="py-2.5 pr-3">{s.phone ?? '—'}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 capitalize">{s.plan}</td>
                    <td className="py-2.5 pr-3 text-muted">
                      {s.last_sign_in_at ? new Date(s.last_sign_in_at).toLocaleDateString('en-IN') : 'Never'}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && <AddSupplierModal onClose={() => setModalOpen(false)} onCreated={refresh} />}
    </div>
  )
}
