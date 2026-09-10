import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { EmptyState } from '@/components/EmptyState'
import { DeliveryPrompt, type SavedBill } from '@/components/DeliveryPrompt'
import {
  listQuotations,
  listQuotationItems,
  markQuotationConverted,
  markQuotationSent,
  type QuotationWithCustomer,
} from '@/services/quotations'
import { createInvoice, markInvoiceDelivered } from '@/services/invoices'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { logActivity } from '@/services/activityLog'
import { QUOTATION_STATUS_TONE } from '@/lib/quotationStatus'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Quotations() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [quotations, setQuotations] = useState<QuotationWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [deliveryPrompt, setDeliveryPrompt] = useState<SavedBill | null>(null)
  const [confirmingDelivery, setConfirmingDelivery] = useState(false)

  async function refresh() {
    setQuotations(await listQuotations())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  // Hands the exact same items/GST/transport-labour across to a real
  // invoice — nothing gets re-entered, and stock/the customer ledger are
  // only ever touched from here on, never by the estimate itself.
  async function handleConvert(q: QuotationWithCustomer) {
    if (!supplier || !q.customer_id) return
    setConvertingId(q.id)
    try {
      const items = await listQuotationItems(q.id)
      const invoice = await createInvoice(supplier.id, {
        customer_id: q.customer_id,
        items: items.map((item) => ({ material_id: item.material_id, description: item.description, qty: item.qty, rate: item.rate })),
        gstApplicable: q.gst_amount > 0,
        transportLabourCharge: q.transport_labour_charge,
      })
      await markQuotationConverted(q.id, invoice.id)
      await refresh()
      setDeliveryPrompt({
        id: invoice.id,
        invoice_no: invoice.invoice_no,
        total: Number(invoice.total),
        customerName: q.customers?.name ?? '',
      })
    } finally {
      setConvertingId(null)
    }
  }

  async function handleShare(q: QuotationWithCustomer) {
    setSharingId(q.id)
    try {
      openWhatsAppShare(
        q.customers?.phone,
        `Hi ${q.customers?.name ?? ''}, here is your estimate ${q.quote_no} for ${formatINR(q.total)}. Let us know if you'd like to proceed.`,
      )
      void logActivity('supplier', 'quotation_shared', { details: { quote_no: q.quote_no } })
      if (q.status === 'Draft') {
        await markQuotationSent(q.id)
        await refresh()
      }
    } finally {
      setSharingId(null)
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

  return (
    <div>
      <PageHeader
        title={t('quo.title')}
        subtitle={t('quo.subtitle')}
        // Dropped while the list is empty — the empty state below carries the
        // same button, and two of them on one screen looks unfinished.
        action={
          quotations.length > 0 ? (
            <Link to="/quotations/new">
              <Button>
                <Plus size={16} /> {t('quo.new')}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : quotations.length === 0 ? (
        <EmptyState
          art="quotations"
          title={t('empty.quotationsTitle')}
          hint={t('empty.quotationsHint')}
          action={
            <Link to="/quotations/new">
              <Button>
                <Plus size={16} /> {t('quo.new')}
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Cards on a phone, table on a desktop. In a 360px window the table
              was 562px wide with 276px of it off-screen — and Convert to
              Invoice, the whole point of this screen, sat in the hidden half. */}
          <div className="flex flex-col gap-3 lg:hidden">
            {quotations.map((q) => (
              <Card key={q.id}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <Link to={`/quotations/${q.id}`} className="-m-1 min-w-0 p-1 hover:text-accent">
                    <div className="font-semibold text-ink">{q.quote_no}</div>
                    <div className="truncate text-sm text-muted">{q.customers?.name ?? '—'}</div>
                    {q.site && <div className="truncate text-xs text-muted">{q.site}</div>}
                  </Link>
                  <Badge tone={QUOTATION_STATUS_TONE[q.status]}>{t(`status.${q.status}`)}</Badge>
                </div>

                <div className="border-t border-border pt-2.5 text-lg font-bold text-ink">{formatINR(q.total)}</div>

                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  <button
                    onClick={() => handleShare(q)}
                    disabled={sharingId === q.id}
                    className="flex items-center gap-1.5 p-2.5 text-xs font-semibold text-accent-text hover:text-accent disabled:opacity-50"
                  >
                    <WhatsAppIcon size={15} /> WhatsApp
                  </button>
                  {(q.status === 'Draft' || q.status === 'Sent') && (
                    <Button size="sm" onClick={() => handleConvert(q)} disabled={convertingId === q.id}>
                      {convertingId === q.id ? t('quo.converting') : t('quo.convert')}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Card className="hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">{t('quo.colNo')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.customer')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.site')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.total')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.status')}</th>
                  <th className="py-2 pr-3 font-medium"></th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quotations.map((q) => (
                  <tr key={q.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">
                      <Link to={`/quotations/${q.id}`} className="hover:text-accent">
                        {q.quote_no}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{q.customers?.name ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-muted">{q.site ?? '—'}</td>
                    <td className="py-2.5 pr-3 font-semibold">{formatINR(q.total)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={QUOTATION_STATUS_TONE[q.status]}>{t(`status.${q.status}`)}</Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <button
                        onClick={() => handleShare(q)}
                        disabled={sharingId === q.id}
                        className="flex items-center gap-1.5 p-2 text-xs font-semibold text-accent-text hover:text-accent disabled:opacity-50"
                      >
                        <WhatsAppIcon size={14} /> WhatsApp
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      {(q.status === 'Draft' || q.status === 'Sent') && (
                        <Button size="sm" onClick={() => handleConvert(q)} disabled={convertingId === q.id}>
                          {convertingId === q.id ? t('quo.converting') : t('quo.convert')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>
        </>
      )}

      {deliveryPrompt && (
        <DeliveryPrompt bill={deliveryPrompt} busy={confirmingDelivery} onAnswer={respondToDeliveryPrompt} />
      )}
    </div>
  )
}
