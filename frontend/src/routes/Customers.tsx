import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { EmptyState } from '@/components/EmptyState'
import { listCustomers, listCustomerBalances } from '@/services/customers'
import { listInvoices } from '@/services/invoices'
import { oldestPendingDays, overdueTextClass, type AgeableInvoice } from '@/lib/overdue'
import type { Customer, CustomerBalance } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useFlash, flashId } from '@/lib/useFlash'
import { TruckLoader } from '@/components/TruckLoader'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Customers() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [balances, setBalances] = useState<Record<string, CustomerBalance>>({})
  // Bills per customer, kept only to work out how long money has been owed.
  const [invoicesByCustomer, setInvoicesByCustomer] = useState<Record<string, AgeableInvoice[]>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  // The customer just added, lit for a moment at the top of the list.
  const [added, setAdded] = useFlash<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setModalOpen(true)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    const [customerList, balanceList, invoiceList] = await Promise.all([
      listCustomers(),
      listCustomerBalances(),
      listInvoices(),
    ])
    setCustomers(customerList)
    setBalances(Object.fromEntries(balanceList.map((b) => [b.customer_id, b])))
    const grouped: Record<string, AgeableInvoice[]> = {}
    for (const inv of invoiceList) {
      if (!inv.customer_id) continue
      ;(grouped[inv.customer_id] ??= []).push(inv)
    }
    setInvoicesByCustomer(grouped)
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
        title={t('cust.title')}
        subtitle={t('cust.subtitle')}
        // Hidden while the list is empty — the empty state below carries the
        // same button, and two identical "Add customer" buttons on one screen
        // just looks unfinished.
        action={
          customers.length > 0 ? (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> {t('cust.add')}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <TruckLoader />
      ) : customers.length === 0 ? (
        <EmptyState
          art="customers"
          title={t('empty.customersTitle')}
          hint={t('empty.customersHint')}
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> {t('cust.add')}
            </Button>
          }
        />
      ) : (
        <>
          {/* The search box only exists once there is something to search. */}
          <Input
            placeholder={t('cust.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-4 max-w-xs"
          />

          {/* Outside the grid, so a no-match line spans the page rather than
              sitting in the first of three columns. */}
          {filtered.length === 0 && <p className="text-sm text-muted">{t('empty.customersNoMatch')}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const bal = balances[c.id]
            const pendingDays = oldestPendingDays(invoicesByCustomer[c.id] ?? [])
            return (
              // The name rides along, so the customer page's top bar shows it
              // while the rest loads (AppShell).
              <Link key={c.id} to={`/customers/${c.id}`} state={{ customerName: c.name }}>
                <Card
                  id={flashId(c.id)}
                  className={`h-full transition-shadow hover:shadow-sm ${added?.id === c.id ? 'flash-success' : ''}`}
                >
                  {/* Initials in a coloured circle beside the name, Telegram-
                      style: a regular is spotted by colour before the name is
                      read. */}
                  <div className="flex items-start gap-3">
                    <CustomerAvatar id={c.id} name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="font-semibold text-ink">{c.name}</div>
                        <Badge tone={c.status === 'Active' ? 'success' : 'neutral'}>
                          {t(c.status === 'Active' ? 'status.Active' : 'status.Inactive')}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted">{c.site ?? '—'}</div>
                      {/* Plain text here on purpose: the whole card is already a
                          link to the profile, and an <a> inside an <a> is invalid
                          HTML. The number is tappable on the profile itself. */}
                      <div className="text-xs text-muted">{c.phone ?? '—'}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <div>
                      <span className="text-muted">{t('common.pending')}</span>
                      {/* How long it's been owed, which is what actually
                          decides whether this customer gets a phone call. */}
                      {pendingDays !== null && (
                        <div className={`text-[11px] font-medium ${overdueTextClass(pendingDays)}`}>
                          {pendingDays === 0
                            ? t('overdue.today')
                            : pendingDays === 1
                              ? t('overdue.oneDay')
                              : t('overdue.days', { days: pendingDays })}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-red-600">{formatINR(bal?.pending ?? 0)}</span>
                      {/* Paid ahead — used up by their next bill. */}
                      {Number(bal?.advance ?? 0) > 0 && (
                        <div className="text-[11px] font-medium text-accent">
                          {t('cust.advanceAmount', { amount: formatINR(Number(bal?.advance)) })}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
          </div>
        </>
      )}

      {modalOpen && supplier && (
        <AddCustomerModal
          supplierId={supplier.id}
          onClose={() => setModalOpen(false)}
          onCreated={(customer) => {
            setModalOpen(false)
            // A search still typed in could hide the very card being lit.
            setQuery('')
            void refresh().then(() => setAdded({ id: customer.id }))
          }}
          // Several picked from the phone's contacts at once: the first is lit.
          onCreatedMany={(list) => {
            setModalOpen(false)
            setQuery('')
            void refresh().then(() => {
              if (list[0]) setAdded({ id: list[0].id })
            })
          }}
        />
      )}
    </div>
  )
}
