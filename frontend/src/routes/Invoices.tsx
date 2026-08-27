import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { getCustomer } from '@/services/customers'
import { openWhatsAppShare } from '@/lib/whatsapp'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listInvoices()
      .then(setInvoices)
      .finally(() => setLoading(false))
  }, [])

  async function shareInvoice(inv: InvoiceWithCustomer) {
    if (!inv.customer_id) return
    const customer = await getCustomer(inv.customer_id)
    openWhatsAppShare(
      customer.phone,
      `Hi ${customer.name}, here is your bill ${inv.invoice_no} for ${formatINR(inv.total)}. ` +
        `${inv.paid < inv.total ? `Pending: ${formatINR(inv.total - inv.paid)}.` : 'Fully paid — thank you!'}`,
    )
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Bills, PDF preview and WhatsApp delivery"
        action={
          <Link to="/invoices/new">
            <Button>
              <Plus size={16} /> New invoice
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Invoice</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Total</th>
                  <th className="py-2 pr-3 font-medium">Paid</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-muted">
                      No invoices yet.
                    </td>
                  </tr>
                )}
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">{inv.invoice_no}</td>
                    <td className="py-2.5 pr-3">{inv.customers?.name ?? '—'}</td>
                    <td className="py-2.5 pr-3">{formatINR(inv.total)}</td>
                    <td className="py-2.5 pr-3">{formatINR(inv.paid)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <button onClick={() => shareInvoice(inv)} className="text-accent hover:text-accent-soft" aria-label="Share on WhatsApp">
                        <MessageCircle size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
