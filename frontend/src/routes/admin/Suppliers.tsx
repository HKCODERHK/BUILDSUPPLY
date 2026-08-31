import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, ArrowUp, ArrowDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listSuppliersOverview } from '@/services/adminSuppliers'
import {
  describeExpiry,
  subscriptionState,
  SUBSCRIPTION_LABEL,
  SUBSCRIPTION_TONE,
} from '@/lib/subscription'
import type { SupplierAccountStatus, SupplierOverview } from '@/lib/database.types'
import { AddSupplierModal } from './AddSupplierModal'

type FilterId = SupplierAccountStatus | 'all' | 'expired' | 'expiring' | 'no-expiry'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'expired', label: 'Expired subscription' },
  { id: 'expiring', label: 'Expiring soon' },
  // A supplier with no expiry date appears in neither of the two above and
  // would otherwise run unnoticed forever.
  { id: 'no-expiry', label: 'No expiry set' },
]

const FILTER_IDS = FILTERS.map((f) => f.id)

function statusTone(status: SupplierAccountStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'suspended') return 'warning' as const
  return 'neutral' as const
}

type SortKey =
  | 'business_name'
  | 'owner_name'
  | 'phone'
  | 'status'
  | 'plan'
  | 'subscription_expiry'
  | 'last_sign_in_at'
  | 'created_at'

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'business_name', label: 'Business' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'plan', label: 'Plan' },
  { key: 'subscription_expiry', label: 'Subscription' },
  { key: 'last_sign_in_at', label: 'Last login' },
  { key: 'created_at', label: 'Joined' },
]

export default function AdminSuppliers() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<SupplierOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const urlFilter = searchParams.get('filter')
  const [filter, setFilter] = useState<FilterId>(
    FILTER_IDS.includes(urlFilter as FilterId) ? (urlFilter as FilterId) : 'all',
  )
  const [modalOpen, setModalOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  async function refresh() {
    const data = await listSuppliersOverview()
    setSuppliers(data.filter((s) => s.role === 'supplier'))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

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
    if (filter === 'expired') return subscriptionState(s.subscription_expiry) === 'expired'
    if (filter === 'expiring') return subscriptionState(s.subscription_expiry) === 'expiring'
    if (filter === 'no-expiry') return subscriptionState(s.subscription_expiry) === 'none'
    return s.status === filter
  })

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortAsc])

  function chooseFilter(next: FilterId) {
    setFilter(next)
    // Keep the URL honest so the view survives a refresh or a shared link.
    if (next === 'all') setSearchParams({}, { replace: true })
    else setSearchParams({ filter: next }, { replace: true })
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

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
              onClick={() => chooseFilter(f.id)}
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
                  {SORT_COLUMNS.map((col) => (
                    <th key={col.key} className="py-2 pr-3 font-medium">
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 font-medium hover:text-ink"
                      >
                        {col.label}
                        {sortKey === col.key &&
                          (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-muted">
                      No suppliers match.
                    </td>
                  </tr>
                )}
                {sorted.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer hover:bg-surface"
                    onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                  >
                    <td className="py-2.5 pr-3 font-medium text-ink">{s.business_name}</td>
                    <td className="py-2.5 pr-3">{s.owner_name ?? '—'}</td>
                    <td className="py-2.5 pr-3">{s.phone ?? '—'}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 capitalize">{s.plan}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={SUBSCRIPTION_TONE[subscriptionState(s.subscription_expiry)]}>
                        {SUBSCRIPTION_LABEL[subscriptionState(s.subscription_expiry)]}
                      </Badge>
                      <div className="mt-0.5 text-xs text-muted">{describeExpiry(s.subscription_expiry)}</div>
                    </td>
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
