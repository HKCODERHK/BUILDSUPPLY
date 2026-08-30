import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listInvoices, markInvoiceDelivered, type InvoiceWithCustomer } from '@/services/invoices'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Deliveries() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)

  async function refresh() {
    setInvoices(await listInvoices())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const pending = invoices.filter((inv) => !inv.delivered && inv.status !== 'Cancelled')

  async function handleMarkDelivered(invoiceId: string) {
    setMarkingId(invoiceId)
    try {
      await markInvoiceDelivered(invoiceId)
      await refresh()
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Bills that still have to go out — marking one delivered reduces your stock"
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {pending.length === 0 && (
              <p className="py-3 text-sm text-muted">Nothing pending — everything billed has been delivered.</p>
            )}
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <Link to={`/invoices/${inv.id}`} className="font-medium text-ink hover:text-accent">
                    {inv.invoice_no}
                  </Link>
                  <div className="truncate text-xs text-muted">
                    {inv.customers?.name ?? '—'}
                    {inv.site ? ` · ${inv.site}` : ''} · {formatINR(inv.total)}
                  </div>
                </div>
                <Button size="sm" onClick={() => handleMarkDelivered(inv.id)} disabled={markingId === inv.id}>
                  {markingId === inv.id ? 'Marking…' : 'Mark delivered'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
