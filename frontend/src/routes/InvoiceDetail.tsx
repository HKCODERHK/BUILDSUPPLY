import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Download, Printer, Ban, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { getInvoice, listInvoiceItems, cancelInvoice } from '@/services/invoices'
import { Modal } from '@/components/ui/modal'
import { getCustomer } from '@/services/customers'
import { downloadInvoicePdf, printInvoicePdf, invoicePdfFile } from '@/lib/invoicePdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import type { Invoice, InvoiceItem, Customer } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const { confirmWithPin } = usePin()
  const navigate = useNavigate()
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
        <PageHeader title={t('pay.invoice')} subtitle={t('common.loading')} />
      </div>
    )
  }

  const remaining = Math.max(0, invoice.total - invoice.paid)

  const message =
    `Hi ${customer?.name ?? ''}, here is your bill ${invoice.invoice_no} for ${formatINR(invoice.total)}. ` +
    `${remaining > 0 ? `Pending: ${formatINR(remaining)}.` : 'Fully paid — thank you!'}`

  // Sends the bill as a real PDF attachment where the device supports it,
  // and falls back to download + wa.me everywhere else — see shareDocument.
  async function shareOnWhatsApp() {
    if (!invoice || !supplier) return
    setSharing(true)
    try {
      const file = await invoicePdfFile(supplier, customer, invoice, items)
      const outcome = await shareDocumentOnWhatsApp({
        file,
        message,
        title: invoice.invoice_no,
        phone: customer?.phone,
      })
      if (outcome !== 'cancelled') {
        void logActivity('supplier', 'invoice_generated', {
          details: { invoice_no: invoice.invoice_no, format: outcome === 'shared' ? 'pdf_share' : 'text_fallback' },
        })
      }
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
    // Cancelling wipes the payments recorded against the bill and puts stock
    // back — worth confirming it is the owner doing it.
    if (!(await confirmWithPin(t('pin.reasonCancelBill')))) return
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
              <Download size={14} /> {t('inv.download')}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer size={14} /> {t('inv.print')}
            </Button>
            <Button size="sm" onClick={shareOnWhatsApp} disabled={sharing}>
              <WhatsAppIcon size={14} /> {sharing ? t('common.preparing') : t('common.sendWhatsApp')}
            </Button>
            {invoice.status !== 'Cancelled' && (
              <>
                {/* Fixing a bill beats cancelling and retyping it: the number,
                    the date and any payment already taken all survive. */}
                <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
                  <Pencil size={14} /> {t('inv.editBill')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)} className="text-red-600">
                  <Ban size={14} /> {t('inv.cancelBill')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {invoice.status === 'Cancelled' && (
        <Card className="mb-4 border-red-300 bg-red-50 dark:bg-red-950">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t('inv.cancelledBanner')}</p>
          <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">{t('inv.cancelledDetail')}</p>
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
                t('inv.walkIn')
              )}
            </div>
            {customer?.address && <div className="text-sm text-muted">{customer.address}</div>}
            {invoice.site && <div className="text-sm text-muted">{t('common.site')}: {invoice.site}</div>}
            {customer?.phone && <div className="text-sm text-muted">{customer.phone}</div>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">{t('inv.particulars')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('common.qty')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('common.rate')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, i) => (
                <tr key={item.id}>
                  <td className="py-2.5 pr-3 text-muted">{i + 1}</td>
                  <td className="py-2.5 pr-3 text-ink">{mt(item.description)}</td>
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
              <span>{t('inv.subtotal')}</span>
              <span>{formatINR(invoice.subtotal)}</span>
            </div>
            {invoice.gst_amount > 0 && (
              <div className="flex justify-between text-muted">
                <span>{t('inv.gst')}</span>
                <span>{formatINR(invoice.gst_amount)}</span>
              </div>
            )}
            {invoice.transport_labour_charge > 0 && (
              <div className="flex justify-between text-muted">
                <span>{t('inv.transportLabourShort')}</span>
                <span>{formatINR(invoice.transport_labour_charge)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-ink">
              <span>{t('inv.grandTotal')}</span>
              <span>{formatINR(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-accent">
              <span>{t('common.paid')}</span>
              <span>{formatINR(invoice.paid)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between font-semibold text-red-600">
                <span>{t('inv.remaining')}</span>
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
            {t(`status.${invoice.status}`)}
          </Badge>
          <p className="text-sm italic text-muted">{t('inv.thankYou')}</p>
        </div>
      </Card>

      {confirmCancel && (
        <Modal title={t('inv.cancelTitle')} onClose={() => setConfirmCancel(false)}>
          <p className="mb-3 text-sm text-ink">
            {t('inv.cancelIntro', { no: invoice.invoice_no, customer: customer?.name ?? t('inv.cancelTheCustomer') })}
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-muted">
            {invoice.delivered && <li>{t('inv.cancelStock')}</li>}
            {invoice.paid > 0 && (
              <li className="text-red-600">{t('inv.cancelPayment', { amount: formatINR(invoice.paid) })}</li>
            )}
            <li>{t('inv.cancelKept')}</li>
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={cancelling} onClick={() => setConfirmCancel(false)}>
              {t('inv.keepBill')}
            </Button>
            <Button variant="danger" className="flex-1" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? t('inv.cancelling') : t('inv.confirmCancel')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
