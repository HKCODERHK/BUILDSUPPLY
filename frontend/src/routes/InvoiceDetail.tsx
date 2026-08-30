import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, Printer, Ban } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { getInvoice, listInvoiceItems, cancelInvoice } from '@/services/invoices'
import { Modal } from '@/components/ui/modal'
import { getCustomer } from '@/services/customers'
import { downloadInvoicePdf, printInvoicePdf, invoicePdfFile } from '@/lib/invoicePdf'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { downloadFile } from '@/lib/downloadFile'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import type { Invoice, InvoiceItem, Customer } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { supplier } = useAuth()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function refresh() {
    if (!id) return
    const inv = await getInvoice(id)
    const [invItems, cust] = await Promise.all([
      listInvoiceItems(inv.id),
      inv.customer_id ? getCustomer(inv.customer_id) : Promise.resolve(null),
    ])
    setInvoice(inv)
    setItems(invItems)
    setCustomer(cust)
  }

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading || !invoice) {
    return (
      <div>
        <PageHeader title="Invoice" subtitle="Loading…" />
      </div>
    )
  }

  const remaining = Math.max(0, invoice.total - invoice.paid)

  const message =
    `Hi ${customer?.name ?? ''}, here is your bill ${invoice.invoice_no} for ${formatINR(invoice.total)}. ` +
    `${remaining > 0 ? `Pending: ${formatINR(remaining)}.` : 'Fully paid — thank you!'}`

  // Shares the actual PDF file (with logo) via the device's native share
  // sheet, where WhatsApp appears as a target — this is the only free way
  // to attach a file to WhatsApp; a wa.me link can only pre-fill text.
  // Only mobile Chrome/Safari and some desktop browsers support sharing
  // files this way, so anything else falls back to the old text-only link
  // plus an automatic PDF download the supplier can attach by hand.
  async function shareOnWhatsApp() {
    if (!invoice || !supplier) return
    setSharing(true)
    try {
      const file = await invoicePdfFile(supplier, customer, invoice, items)
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: message, title: invoice.invoice_no })
          void logActivity('supplier', 'invoice_generated', { details: { invoice_no: invoice.invoice_no, format: 'pdf_share' } })
          return
        } catch (err) {
          if ((err as Error).name === 'AbortError') return // supplier cancelled the share sheet
        }
      }
      downloadFile(file)
      openWhatsAppShare(customer?.phone, message)
      void logActivity('supplier', 'invoice_generated', { details: { invoice_no: invoice.invoice_no, format: 'text_fallback' } })
    } finally {
      setSharing(false)
    }
  }

  async function handleDownload() {
    if (!supplier || !invoice) return
    await downloadInvoicePdf(supplier, customer, invoice, items)
  }

  async function handlePrint() {
    if (!supplier || !invoice) return
    await printInvoicePdf(supplier, customer, invoice, items)
  }

  async function handleCancel() {
    if (!invoice) return
    setCancelling(true)
    try {
      await cancelInvoice(invoice.id)
      setConfirmCancel(false)
      await refresh()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={invoice.invoice_no}
        subtitle={new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download size={14} /> Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer size={14} /> Print
            </Button>
            <Button size="sm" onClick={shareOnWhatsApp} disabled={sharing}>
              <WhatsAppIcon size={14} /> {sharing ? 'Preparing…' : 'Send on WhatsApp'}
            </Button>
            {invoice.status !== 'Cancelled' && (
              <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)} className="text-red-600">
                <Ban size={14} /> Cancel bill
              </Button>
            )}
          </div>
        }
      />

      {invoice.status === 'Cancelled' && (
        <Card className="mb-4 border-red-300 bg-red-50 dark:bg-red-950">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">This bill was cancelled.</p>
          <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
            It is not counted in your sales, this customer's khata, or any report. Any stock it used has been put back.
          </p>
        </Card>
      )}

      <Card>
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            {supplier?.logo_url && (
              <img
                src={supplier.logo_url}
                alt={`${supplier.business_name} logo`}
                className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
              />
            )}
            <div>
              <div className="text-xs font-semibold tracking-wide text-muted">FROM</div>
              <div className="mt-1 font-bold text-ink">{supplier?.business_name}</div>
              {supplier?.address && <div className="text-sm text-muted">{supplier.address}</div>}
              {supplier?.gst_number && <div className="text-sm text-muted">GST: {supplier.gst_number}</div>}
              {supplier?.phone && <div className="text-sm text-muted">{supplier.phone}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold tracking-wide text-muted">TO</div>
            <div className="mt-1 font-bold text-ink">
              {customer ? (
                <Link to={`/customers/${customer.id}`} className="hover:text-accent">
                  {customer.name}
                </Link>
              ) : (
                'Walk-in customer'
              )}
            </div>
            {customer?.address && <div className="text-sm text-muted">{customer.address}</div>}
            {invoice.site && <div className="text-sm text-muted">Site: {invoice.site}</div>}
            {customer?.phone && <div className="text-sm text-muted">{customer.phone}</div>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Particulars</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Rate</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, i) => (
                <tr key={item.id}>
                  <td className="py-2.5 pr-3 text-muted">{i + 1}</td>
                  <td className="py-2.5 pr-3 text-ink">{item.description}</td>
                  <td className="py-2.5 pr-3 text-right">{item.qty}</td>
                  <td className="py-2.5 pr-3 text-right">{formatINR(item.rate)}</td>
                  <td className="py-2.5 pr-3 text-right font-medium">{formatINR(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span>{formatINR(invoice.subtotal)}</span>
            </div>
            {invoice.gst_amount > 0 && (
              <div className="flex justify-between text-muted">
                <span>GST</span>
                <span>{formatINR(invoice.gst_amount)}</span>
              </div>
            )}
            {invoice.transport_labour_charge > 0 && (
              <div className="flex justify-between text-muted">
                <span>Transport + Labour</span>
                <span>{formatINR(invoice.transport_labour_charge)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-ink">
              <span>Grand Total</span>
              <span>{formatINR(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-accent">
              <span>Paid</span>
              <span>{formatINR(invoice.paid)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between font-semibold text-red-600">
                <span>Remaining</span>
                <span>{formatINR(remaining)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Badge
            tone={
              invoice.status === 'Cancelled'
                ? 'neutral'
                : invoice.status === 'Paid'
                  ? 'success'
                  : invoice.status === 'Partial'
                    ? 'warning'
                    : 'danger'
            }
          >
            {invoice.status}
          </Badge>
          <p className="text-sm italic text-muted">Thank you for your business!</p>
        </div>
      </Card>

      {confirmCancel && (
        <Modal title="Cancel this bill?" onClose={() => setConfirmCancel(false)}>
          <p className="mb-3 text-sm text-ink">
            {invoice.invoice_no} will stop counting in your sales and in {customer?.name ?? 'the customer'}'s khata.
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-muted">
            {invoice.delivered && <li>The stock it used will be added back.</li>}
            {invoice.paid > 0 && (
              <li className="text-red-600">
                The {formatINR(invoice.paid)} recorded against it will be removed.
              </li>
            )}
            <li>The bill stays in your records, marked cancelled.</li>
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={cancelling} onClick={() => setConfirmCancel(false)}>
              Keep bill
            </Button>
            <Button variant="danger" className="flex-1" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
