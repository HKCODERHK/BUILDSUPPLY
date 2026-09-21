import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Download, Printer, ArrowRightLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ActionMenu } from '@/components/ui/action-menu'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { getQuotation, listQuotationItems, markQuotationSent } from '@/services/quotations'
import { getOrderForQuotation } from '@/services/orders'
import { newRequestId } from '@/services/db'
import { getCustomer } from '@/services/customers'
import { createInvoice, markInvoiceDelivered } from '@/services/invoices'
import { downloadQuotationPdf, printQuotationPdf, quotationPdfFile } from '@/lib/quotationPdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { QUOTATION_STATUS_TONE } from '@/lib/quotationStatus'
import type { Quotation, QuotationItem, Customer, OrderRequest } from '@/lib/database.types'
import { formatRate, gstSlabs } from '@/lib/gst'
import { TruckLoader } from '@/components/TruckLoader'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function QuotationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [items, setItems] = useState<QuotationItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [deliveryPrompt, setDeliveryPrompt] = useState<{ id: string; invoice_no: string } | null>(null)
  const [confirmingDelivery, setConfirmingDelivery] = useState(false)
  // The customer's answer from their order status link, when this estimate came from an online order (migration 030).
  const [answer, setAnswer] = useState<Pick<OrderRequest, 'customer_response' | 'responded_at'> | null>(null)

  async function refresh() {
    if (!id) return
    const q = await getQuotation(id)
    const [qItems, cust, order] = await Promise.all([
      listQuotationItems(q.id),
      q.customer_id ? getCustomer(q.customer_id) : Promise.resolve(null),
      // Never allowed to stop the estimate itself from showing.
      getOrderForQuotation(q.id).catch(() => null),
    ])
    setQuotation(q)
    setItems(qItems)
    setCustomer(cust)
    setAnswer(order)
  }

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading || !quotation) {
    return (
      <div>
        <PageHeader title={t('quo.detailTitle')} />
        <TruckLoader />
      </div>
    )
  }

  const message = `Hi ${customer?.name ?? ''}, here is your estimate ${quotation.quote_no} for ${formatINR(quotation.total)}. Let us know if you'd like to proceed.`
  const canConvert = quotation.status === 'Draft' || quotation.status === 'Sent'

  // Sent the same way as a bill — a real PDF through the share sheet. See
  // shareDocument.
  async function shareOnWhatsApp() {
    if (!quotation || !supplier) return
    setSharing(true)
    try {
      const file = await quotationPdfFile(supplier, customer, quotation, items)
      const outcome = await shareDocumentOnWhatsApp({
        file,
        message,
        title: quotation.quote_no,
      })
      if (outcome !== 'shared') return
      void logActivity('supplier', 'quotation_shared', {
        details: { quote_no: quotation.quote_no, format: 'pdf_share' },
      })
      if (quotation.status === 'Draft') {
        await markQuotationSent(quotation.id)
        await refresh()
      }
    } finally {
      setSharing(false)
    }
  }

  async function handleDownload() {
    if (!supplier || !quotation) return
    await downloadQuotationPdf(supplier, customer, quotation, items)
  }

  async function handlePrint() {
    if (!supplier || !quotation) return
    await printQuotationPdf(supplier, customer, quotation, items)
  }

  // Converting hands the exact same items/GST/transport-labour across to a
  // real invoice — nothing gets re-entered. Stock and the customer ledger
  // are only ever touched from here on, never by the estimate itself.
  async function handleConvert() {
    if (!supplier || !quotation || !quotation.customer_id || converting) return
    setConverting(true)
    setConvertError(null)
    try {
      // The bill and "Converted" in one step — the database refuses a second
      // conversion, so an estimate can never become two bills.
      const { invoice } = await createInvoice({
        requestId: newRequestId(),
        customer_id: quotation.customer_id,
        site: quotation.site,
        items: items.map((item) => ({ material_id: item.material_id, description: item.description, qty: item.qty, rate: item.rate })),
        gstApplicable: quotation.gst_amount > 0,
        transportLabourCharge: quotation.transport_labour_charge,
        quotationId: quotation.id,
      })
      setDeliveryPrompt({ id: invoice.id, invoice_no: invoice.invoice_no })
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setConverting(false)
    }
  }

  async function respondToDeliveryPrompt(delivered: boolean) {
    if (!deliveryPrompt) return
    setConfirmingDelivery(true)
    try {
      if (delivered) await markInvoiceDelivered(deliveryPrompt.id)
      navigate(`/invoices/${deliveryPrompt.id}`)
    } finally {
      setConfirmingDelivery(false)
    }
  }

  // Empty on an estimate saved before 035 recorded a rate per line.
  const slabs = gstSlabs(items)

  return (
    <div>
      <PageHeader
        title={quotation.quote_no}
        subtitle={new Date(quotation.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        action={
          // Turning the estimate into a bill is the point of this screen, and
          // sending it is how it gets there. Saving or printing a copy is not.
          //
          // Wraps because it genuinely does not fit: "Convert to Invoice" and
          // "Send on WhatsApp" together need 355px against the 328px a 360px
          // phone leaves, and both buttons are already at the smaller size.
          // Without wrapping the ⋯ — download, print, edit — is pushed off the
          // right edge and only reachable by scrolling the row sideways, which
          // nobody thinks to try.
          <div className="flex flex-wrap items-center gap-2">
            {canConvert && (
              <Button size="sm" onClick={handleConvert} disabled={converting}>
                <ArrowRightLeft size={14} /> {converting ? t('quo.converting') : t('quo.convert')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={shareOnWhatsApp} disabled={sharing}>
              <WhatsAppIcon size={14} /> {sharing ? t('common.preparing') : t('common.sendWhatsApp')}
            </Button>
            <ActionMenu
              items={[
                { label: t('inv.download'), icon: <Download size={15} />, onSelect: handleDownload },
                { label: t('inv.print'), icon: <Printer size={15} />, onSelect: handlePrint },
              ]}
            />
          </div>
        }
      />

      {convertError && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{convertError}</p>
      )}

      <Card>
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
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
          <div className="min-[420px]:text-right">
            <div className="text-xs font-semibold tracking-wide text-muted">TO</div>
            <div className="mt-1 font-bold text-ink">
              {customer ? (
                <Link to={`/customers/${customer.id}`} state={{ customerName: customer.name }} className="hover:text-accent">
                  {customer.name}
                </Link>
              ) : (
                t('inv.walkIn')
              )}
            </div>
            {customer?.address && <div className="text-sm text-muted">{customer.address}</div>}
            {quotation.site && <div className="text-sm text-muted">{t('common.site')}: {quotation.site}</div>}
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
              <span>{formatINR(quotation.subtotal)}</span>
            </div>
            {/* Per rate once the lines carry one (035); an estimate written
                before that keeps the single figure it recorded. */}
            {slabs.length > 0 ? (
              slabs.map((slab) => (
                <div key={slab.rate} className="flex justify-between text-muted">
                  <span>
                    {t('inv.gst')} {formatRate(slab.rate)}
                  </span>
                  <span>{formatINR(slab.amount)}</span>
                </div>
              ))
            ) : quotation.gst_amount > 0 ? (
              <div className="flex justify-between text-muted">
                <span>{t('inv.gst')}</span>
                <span>{formatINR(quotation.gst_amount)}</span>
              </div>
            ) : null}
            {quotation.transport_labour_charge > 0 && (
              <div className="flex justify-between text-muted">
                <span>{t('inv.transportLabourShort')}</span>
                <span>{formatINR(quotation.transport_labour_charge)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-ink">
              <span>{t('inv.grandTotal')}</span>
              <span>{formatINR(quotation.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={QUOTATION_STATUS_TONE[quotation.status]}>{t(`status.${quotation.status}`)}</Badge>
            {answer?.customer_response && (
              <Badge tone={answer.customer_response === 'accepted' ? 'success' : 'warning'}>
                {t(answer.customer_response === 'accepted' ? 'est.customerAccepted' : 'est.customerCallMe')}
              </Badge>
            )}
          </div>
          <p className="text-sm italic text-muted">{t('quo.notTaxInvoice')}</p>
        </div>
      </Card>

      {deliveryPrompt && (
        <Modal title={t('inv.delivery')} onClose={() => respondToDeliveryPrompt(false)}>
          <p className="mb-4 text-sm text-ink">
            {t('quo.convertedAsk', { quote: quotation.quote_no, no: deliveryPrompt.invoice_no })}
          </p>
          <p className="mb-4 text-xs text-muted">{t('inv.deliveryHint')}</p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={confirmingDelivery} onClick={() => respondToDeliveryPrompt(true)}>
              {t('inv.deliveredYes')}
            </Button>
            <Button variant="outline" className="flex-1" disabled={confirmingDelivery} onClick={() => respondToDeliveryPrompt(false)}>
              {t('inv.deliveredNot')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
