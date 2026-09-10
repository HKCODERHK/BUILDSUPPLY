import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { EmptyState } from '@/components/EmptyState'
import { listInvoices, listInvoiceItems, markInvoiceDelivered, type InvoiceWithCustomer } from '@/services/invoices'
import { getCustomer } from '@/services/customers'
import { invoicePdfFile } from '@/lib/invoicePdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { ShowMore } from '@/components/ShowMore'
import { TruckLoader } from '@/components/TruckLoader'

const PAGE_SIZE = 25

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Invoices() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // These pages grow with the business. At 17 bills the phone list is already
  // 3,700px tall; search is how you find an older one, not scrolling.
  const [shown, setShown] = useState(PAGE_SIZE)

  async function refresh() {
    // Bills only — a customer's opening balance is not a bill to list.
    setInvoices(await listInvoices({ billsOnly: true }))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleMarkDelivered(id: string) {
    setMarkingId(id)
    try {
      await markInvoiceDelivered(id)
      await refresh()
    } finally {
      setMarkingId(null)
    }
  }

  // The bill itself goes, not just its total — the same PDF the bill's own
  // page sends. See shareDocument.
  async function shareInvoice(inv: InvoiceWithCustomer) {
    if (!supplier || sharingId) return
    setSharingId(inv.id)
    try {
      const [customer, items] = await Promise.all([
        inv.customer_id ? getCustomer(inv.customer_id) : Promise.resolve(null),
        listInvoiceItems(inv.id),
      ])
      const file = await invoicePdfFile(supplier, customer, inv, items)
      const outcome = await shareDocumentOnWhatsApp({
        file,
        message:
          `Hi ${customer?.name ?? ''}, here is your bill ${inv.invoice_no} for ${formatINR(inv.total)}. ` +
          `${inv.paid < inv.total ? `Pending: ${formatINR(inv.total - inv.paid)}.` : 'Fully paid — thank you!'}`,
        title: inv.invoice_no,
      })
      if (outcome === 'shared') {
        void logActivity('supplier', 'invoice_generated', { details: { invoice_no: inv.invoice_no, format: 'pdf_share' } })
      }
    } finally {
      setSharingId(null)
    }
  }

  const allMatching = invoices.filter((inv) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const c = inv.customers
    return (
      inv.invoice_no.toLowerCase().includes(q) ||
      (inv.site ?? '').toLowerCase().includes(q) ||
      (c?.name ?? '').toLowerCase().includes(q) ||
      (c?.address ?? '').toLowerCase().includes(q) ||
      (c?.phone ?? '').toLowerCase().includes(q)
    )
  })
  const filtered = allMatching.slice(0, shown)

  return (
    <div>
      <PageHeader
        title={t('inv.listTitle')}
        subtitle={t('inv.listSubtitle')}
        // Dropped while the list is empty: the empty state below offers the
        // same button, larger, and two of them would just look unfinished.
        action={
          invoices.length > 0 ? (
            <Link to="/invoices/new">
              <Button>
                <Plus size={16} /> {t('inv.new')}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <TruckLoader />
      ) : invoices.length === 0 ? (
        <EmptyState
          art="invoices"
          title={t('empty.invoicesTitle')}
          hint={t('empty.invoicesHint')}
          action={
            <Link to="/invoices/new">
              <Button>
                <Plus size={16} /> {t('inv.new')}
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <Input
            placeholder={t('inv.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(PAGE_SIZE)
            }}
            className="mb-4 max-w-sm"
          />
          {/* Cards on a phone, table on a desktop. Eight columns is right at
              a counter with a laptop and unreadable on the phone the supplier
              actually carries, so each breakpoint gets the shape that fits
              rather than one shape scrolling sideways. */}
          <div className="flex flex-col gap-3 lg:hidden">
            {filtered.length === 0 && (
              <Card>
                <p className="text-sm text-muted">{t('inv.noMatch')}</p>
              </Card>
            )}
            {filtered.map((inv) => {
              const remaining = Number(inv.total) - Number(inv.paid)
              return (
                <Card key={inv.id}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    {/* The whole block is the link, not just the number — a
                        22px line of text is a poor target for a thumb. */}
                    <Link to={`/invoices/${inv.id}`} className="-m-1 min-w-0 p-1 hover:text-accent">
                      <div className="font-semibold text-ink">{inv.invoice_no}</div>
                      <div className="truncate text-sm text-muted">{inv.customers?.name ?? '—'}</div>
                      {inv.site && <div className="truncate text-xs text-muted">{inv.site}</div>}
                    </Link>
                    <Badge
                      tone={
                        inv.status === 'Cancelled'
                          ? 'neutral'
                          : inv.status === 'Paid'
                            ? 'success'
                            : inv.status === 'Partial'
                              ? 'warning'
                              : 'danger'
                      }
                    >
                      {t(`status.${inv.status}`)}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between border-t border-border pt-2.5 text-sm">
                    <span className="text-lg font-bold text-ink">{formatINR(inv.total)}</span>
                    {inv.status !== 'Cancelled' && remaining > 0 && (
                      <span className="text-xs text-muted">
                        {t('common.paid')} {formatINR(inv.paid)} · {t('inv.remaining')}{' '}
                        <span className="font-semibold text-red-600">{formatINR(remaining)}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                    {inv.status === 'Cancelled' ? (
                      <span className="text-xs text-muted">—</span>
                    ) : inv.delivered ? (
                      <Badge tone="success">{t('inv.deliveredBadge')}</Badge>
                    ) : (
                      <button
                        onClick={() => handleMarkDelivered(inv.id)}
                        disabled={markingId === inv.id}
                        className="p-2 text-xs font-semibold text-accent-text hover:text-accent disabled:opacity-50"
                      >
                        {markingId === inv.id ? t('inv.marking') : t('inv.markDelivered')}
                      </button>
                    )}
                    <button
                      onClick={() => shareInvoice(inv)}
                      disabled={sharingId === inv.id}
                      className="flex items-center gap-1.5 p-2.5 text-xs font-semibold text-accent-text hover:text-accent disabled:opacity-50"
                    >
                      <WhatsAppIcon size={15} /> {sharingId === inv.id ? t('common.preparing') : t('common.sendWhatsApp')}
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>

          <ShowMore shown={filtered.length} total={allMatching.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />

          <Card className="hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">{t('inv.colInvoice')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.customer')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.site')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.total')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.paid')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.status')}</th>
                  <th className="py-2 pr-3 font-medium">{t('inv.colDelivery')}</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-muted">
                      {t('inv.noMatch')}
                    </td>
                  </tr>
                )}
                {filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">
                      <Link to={`/invoices/${inv.id}`} className="hover:text-accent">
                        {inv.invoice_no}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{inv.customers?.name ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-muted">{inv.site ?? '—'}</td>
                    <td className="py-2.5 pr-3">{formatINR(inv.total)}</td>
                    <td className="py-2.5 pr-3">{formatINR(inv.paid)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        tone={
                          inv.status === 'Cancelled'
                            ? 'neutral'
                            : inv.status === 'Paid'
                              ? 'success'
                              : inv.status === 'Partial'
                                ? 'warning'
                                : 'danger'
                        }
                      >
                        {t(`status.${inv.status}`)}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      {inv.status === 'Cancelled' ? (
                        <span className="text-xs text-muted">—</span>
                      ) : inv.delivered ? (
                        <Badge tone="success">{t('inv.deliveredBadge')}</Badge>
                      ) : (
                        <button
                          onClick={() => handleMarkDelivered(inv.id)}
                          disabled={markingId === inv.id}
                          className="text-xs font-semibold text-accent-text hover:text-accent disabled:opacity-50"
                        >
                          {markingId === inv.id ? t('inv.marking') : t('inv.markDelivered')}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <button
                        onClick={() => shareInvoice(inv)}
                        disabled={sharingId === inv.id}
                        className="text-accent hover:text-accent-soft disabled:opacity-50"
                        aria-label="Share on WhatsApp"
                      >
                        <WhatsAppIcon size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>

          <div className="hidden lg:block">
            <ShowMore shown={filtered.length} total={allMatching.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />
          </div>
        </>
      )}
    </div>
  )
}
