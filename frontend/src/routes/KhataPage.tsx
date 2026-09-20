import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Download, LoaderCircle, Phone } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/LanguageToggle'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { downloadCustomerLedgerPdf, type LedgerEntry } from '@/lib/customerLedgerPdf'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { downloadQuotationPdf } from '@/lib/quotationPdf'
import type { Customer, Invoice, InvoiceItem, Quotation, QuotationItem, Supplier } from '@/lib/database.types'
import type { InvoiceWithCustomer } from '@/services/invoices'
import type { PaymentWithInvoice } from '@/services/payments'
import { confirmReceived, getKhata, getKhataDocument, type KhataView } from '@/services/khata'
import { forgetKhataCode, rememberKhataCode } from '@/lib/customerLinks'
import { warmPdfKit } from '@/lib/pdfKit'
import { QrCode } from '@/components/QrCode'
import { upiPayUrl } from '@/lib/upi'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The last three months show straight away; older lines wait behind "Show older". */
const RECENT_MS = 90 * 24 * 60 * 60 * 1000

/**
 * /khata/<code> — a customer's own account, from the link their supplier
 * shared (migration 028). Read-only: every live bill and payment, newest
 * first, the balance the supplier sees, and the same ledger PDF the supplier
 * sends. Built by the supplier's own buildCustomerLedger, so the two agree.
 * Since 031 also each bill's own PDF, their estimates (with PDFs) and their
 * online orders — shown only once the database has 031, so the page works
 * either way.
 */
export default function KhataPage() {
  const { token = '' } = useParams()
  const { t } = useLanguage()
  const [view, setView] = useState<KhataView | null>(null)
  const [failed, setFailed] = useState(false)
  const [showOlder, setShowOlder] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // One bill's or estimate's PDF being made: "bill:INV-1024" or "estimate:QT-1003".
  const [docBusy, setDocBusy] = useState<string | null>(null)
  const [docFailed, setDocFailed] = useState(false)
  // "Material received" (migration 030): asked, then confirmed — two taps, so a
  // stray one can't record it.
  const [asking, setAsking] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmFailed, setConfirmFailed] = useState(false)
  // Fixed when the page opens, so a re-render never moves the line.
  const [cutoff] = useState(() => Date.now() - RECENT_MS)

  useEffect(() => {
    getKhata(token)
      .then((v) => {
        setView(v)
        // Kept on the customer's phone so the supplier's order page can offer
        // "My khata"; a link the supplier has stopped is forgotten.
        if (v.found && v.order_link) rememberKhataCode(v.order_link, token)
        if (!v.found) forgetKhataCode(token)
        // Every button on this page makes a PDF: have the PDF tools ready.
        if (v.found) void warmPdfKit()
      })
      .catch(() => setFailed(true))
  }, [token])

  const found = view && view.found ? view : null
  // The per-document PDFs need khata_document, which came with the estimates list.
  const hasDocuments = Array.isArray(found?.estimates)

  // The statement exactly as the supplier's Ledger builds it: one customer's
  // rows, so every row is "this customer".
  const ledger = found
    ? buildCustomerLedger({
        customerId: 'self',
        invoices: found.invoices.map((i) => ({ ...i, customer_id: 'self' })) as unknown as InvoiceWithCustomer[],
        payments: found.payments.map((p) => ({ ...p, customer_id: 'self' })) as unknown as PaymentWithInvoice[],
      })
    : null
  const newestFirst = ledger ? [...ledger.entries].reverse() : []
  const recent = newestFirst.filter((e) => new Date(e.date).getTime() >= cutoff)
  // Nothing in three months: still show the latest few rather than an empty list.
  const shown = showOlder ? newestFirst : recent.length > 0 ? recent : newestFirst.slice(0, 5)
  const olderCount = newestFirst.length - shown.length
  // What the customer actually owes: the bills' dues less any advance the
  // shop is holding — the figure the statement's last line already shows.
  const net = found ? Number(found.pending) - Number(found.advance) : 0
  // "Pay by UPI" (migration 029): only when the supplier switched it on, and
  // only for money actually due. Nothing is recorded until the supplier does.
  // The amount asked for is the netted one, not the bills' total: a customer
  // holding an advance must not be shown a QR for more than they owe.
  const upiUrl =
    found?.upi_id && net > 0.005
      ? upiPayUrl({ upiId: found.upi_id, payee: found.supplier.business_name, amount: Math.round(net * 100) / 100, note: found.customer.name })
      : null

  async function download() {
    if (!found || !ledger || downloading) return
    setDownloading(true)
    try {
      // Only the fields the PDF prints came back from the database.
      await downloadCustomerLedgerPdf(found.supplier as unknown as Supplier, found.customer as unknown as Customer, ledger)
    } finally {
      setDownloading(false)
    }
  }

  // One bill or estimate, as the very PDF the supplier sends — the same
  // builder, from that document's own lines (khata_document).
  async function downloadDocument(kind: 'bill' | 'estimate', no: string) {
    if (!found || docBusy) return
    setDocBusy(`${kind}:${no}`)
    setDocFailed(false)
    try {
      const doc = await getKhataDocument(token, kind, no)
      if (!doc.found) throw new Error('not found')
      const supplier = found.supplier as unknown as Supplier
      const customer = found.customer as unknown as Customer
      if (doc.kind === 'bill') {
        await downloadInvoicePdf(supplier, customer, doc as unknown as Invoice, doc.items as unknown as InvoiceItem[])
      } else {
        await downloadQuotationPdf(supplier, customer, doc as unknown as Quotation, doc.items as unknown as QuotationItem[])
      }
    } catch {
      setDocFailed(true)
    } finally {
      setDocBusy(null)
    }
  }

  async function received(invoiceNo: string) {
    if (confirming) return
    setConfirming(true)
    setConfirmFailed(false)
    try {
      await confirmReceived(token, invoiceNo)
      setAsking(null)
      setView(await getKhata(token))
    } catch {
      setConfirmFailed(true)
    } finally {
      setConfirming(false)
    }
  }

  function describe(e: LedgerEntry) {
    if (e.type === 'Opening') return { title: t('khata.opening'), sub: null }
    if (e.type === 'Invoice') return { title: t('khata.bill', { no: e.ref }), sub: null }
    const refs = e.ref.replace('opening balance', t('khata.opening'))
    return {
      title: e.mode ? t('khata.payment', { mode: t(`mode.${e.mode}`) }) : t('khata.payment', { mode: '' }),
      sub: refs ? t('khata.paidFor', { refs }) : t('khata.advanceReceived'),
    }
  }

  function pdfButton(kind: 'bill' | 'estimate', no: string, label: string) {
    return (
      <button
        type="button"
        onClick={() => downloadDocument(kind, no)}
        disabled={docBusy !== null}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent disabled:opacity-60"
      >
        {docBusy === `${kind}:${no}` ? <LoaderCircle size={12} className="animate-spin" /> : <Download size={12} />} {label}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-shell px-4 pb-4 pt-[calc(1rem_+_var(--safe-top))] text-white">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{found?.supplier.business_name ?? 'BuildSupply'}</div>
            <div className="text-xs text-sidebar-text">{t('khata.pageTitle')}</div>
          </div>
          <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        {!view && !failed ? (
          <TruckLoader />
        ) : !found ? (
          <Card className="text-center text-sm text-ink">{failed ? t('error.generic') : t('khata.notFound')}</Card>
        ) : (
          <>
            <Card className="flex flex-col gap-3">
              {/* One figure, not three. The bills owe one amount and any
                  advance sits against it, and the statement's own running
                  balance already nets the two — so showing both at the top
                  and a third number at the bottom of the list was the most
                  confusing thing on this page. The parts are spelled out
                  underneath when there is an advance to explain. */}
              <div>
                <div className="text-sm text-muted">{t('khata.for', { name: found.customer.name })}</div>
                <div className="mt-2 text-xs font-medium text-muted">
                  {net > 0.005 ? t('khata.youOwe') : net < -0.005 ? t('khata.advance') : ''}
                </div>
                {net > 0.005 ? (
                  <div className="text-4xl font-bold leading-none text-red-600 dark:text-red-400">{formatINR(net)}</div>
                ) : net < -0.005 ? (
                  <div className="text-4xl font-bold leading-none text-accent">{formatINR(-net)}</div>
                ) : (
                  <div className="text-lg font-bold text-accent">{t('khata.settled')}</div>
                )}
                {found.pending > 0.005 && found.advance > 0.005 && (
                  <p className="mt-2 text-xs text-muted">
                    {t('khata.netNote', {
                      bills: formatINR(Number(found.pending)),
                      advance: formatINR(Number(found.advance)),
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={download} disabled={downloading}>
                  {downloading ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} {t('khata.download')}
                </Button>
                {found.supplier.phone && (
                  <a href={`tel:${found.supplier.phone}`}>
                    <Button size="sm" variant="outline">
                      <Phone size={14} /> {t('khata.call')}
                    </Button>
                  </a>
                )}
              </div>
              {/* Only while the supplier takes online orders (migration 031). */}
              {found.order_link && (
                <Link to={`/order/${found.order_link}`}>
                  <Button size="sm" className="w-full">
                    {t('khata.orderMaterials')}
                  </Button>
                </Link>
              )}
            </Card>

            {docFailed && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>
            )}

            {upiUrl && found.upi_id && (
              <Card className="flex flex-col items-center gap-3 text-center">
                <div className="self-start text-sm font-semibold text-ink">{t('upi.payTitle')}</div>
                <div className="rounded-xl bg-white p-2">
                  <QrCode text={upiUrl} size={200} label={t('upi.payTitle')} />
                </div>
                <div className="text-xs text-muted">{found.upi_id}</div>
                {/* On the customer's own phone there is nothing to scan: this opens their UPI app instead. */}
                <a href={upiUrl} className="w-full">
                  <Button className="w-full">{t('upi.openApp', { amount: formatINR(net) })}</Button>
                </a>
                <p className="text-xs text-muted">{t('upi.payHint', { business: found.supplier.business_name })}</p>
              </Card>
            )}

            <Card>
              <div className="mb-2 text-sm font-semibold text-ink">{t('khata.history')}</div>
              {confirmFailed && (
                <p className="mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>
              )}
              {newestFirst.length === 0 ? (
                <p className="text-sm text-muted">{t('khata.none')}</p>
              ) : (
                <div className="flex flex-col divide-y divide-border text-sm">
                  {shown.map((e, i) => {
                    const d = describe(e)
                    const bill = e.type === 'Invoice' ? found.invoices.find((i) => i.kind === 'bill' && i.invoice_no === e.ref) : undefined
                    return (
                      <div key={i} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{d.title}</div>
                          <div className="text-xs text-muted">
                            {formatDate(e.date)}
                            {d.sub ? ` · ${d.sub}` : ''}
                          </div>
                          {bill && asking === bill.invoice_no ? (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => received(bill.invoice_no)} disabled={confirming}>
                                {confirming ? t('common.saving') : t('khata.receivedYes')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setAsking(null)} disabled={confirming}>
                                {t('ord.cancel')}
                              </Button>
                            </div>
                          ) : bill && (bill.received_at || bill.delivered || hasDocuments) ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              {bill.received_at ? (
                                <span className="font-medium text-accent">{t('khata.receivedOn', { date: formatDate(bill.received_at) })}</span>
                              ) : bill.delivered ? (
                                <button type="button" className="font-semibold text-accent" onClick={() => setAsking(bill.invoice_no)}>
                                  {t('khata.receivedAsk')}
                                </button>
                              ) : null}
                              {hasDocuments && pdfButton('bill', bill.invoice_no, t('khata.billPdf'))}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={e.credit > 0 ? 'font-semibold text-accent' : 'font-semibold text-ink'}>
                            {e.credit > 0 ? `− ${formatINR(e.credit)}` : formatINR(e.debit)}
                          </div>
                          <div className="text-[11px] text-muted">
                            {e.balance >= 0
                              ? t('khata.runningDue', { amount: formatINR(e.balance) })
                              : t('khata.runningAdvance', { amount: formatINR(-e.balance) })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {olderCount > 0 && (
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setShowOlder(true)}>
                  {t('khata.showOlder', { count: olderCount })}
                </Button>
              )}
            </Card>

            {/* Their online orders — each opens its own status link. */}
            {found.orders && found.orders.length > 0 && (
              <Card>
                <div className="mb-1 text-sm font-semibold text-ink">{t('khata.orders')}</div>
                <div className="flex flex-col divide-y divide-border text-sm">
                  {found.orders.map((o) => (
                    <Link key={o.code} to={`/order-status/${o.code}`} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{formatDate(o.created_at)}</div>
                        <div className="text-xs text-muted">
                          {t('khata.orderItems', { count: o.item_count })}
                          {o.delivery_date ? ` · ${t('order.deliveryOn', { date: formatDate(o.delivery_date) })}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge tone={o.status === 'approved' ? 'success' : o.status === 'rejected' ? 'neutral' : 'warning'}>
                          {t(`order.status.${o.status}`)}
                        </Badge>
                        <ChevronRight size={16} className="text-muted" />
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Their estimates, each with its PDF. */}
            {found.estimates && found.estimates.length > 0 && (
              <Card>
                <div className="mb-1 text-sm font-semibold text-ink">{t('khata.estimates')}</div>
                <div className="flex flex-col divide-y divide-border text-sm">
                  {found.estimates.map((q) => (
                    <div key={q.quote_no} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{t('khata.estimate', { no: q.quote_no })}</div>
                        <div className="text-xs text-muted">
                          {formatDate(q.created_at)}
                          {q.site ? ` · ${q.site}` : ''}
                        </div>
                        <div className="mt-1">{pdfButton('estimate', q.quote_no, t('khata.estimatePdf'))}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold text-ink">{formatINR(Number(q.total))}</div>
                        {q.status === 'Converted' ? (
                          <div className="text-[11px] font-medium text-accent">{t('khata.estBilled')}</div>
                        ) : q.status === 'Expired' ? (
                          <div className="text-[11px] text-muted">{t('status.Expired')}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <p className="px-1 text-center text-xs text-muted">{t('khata.readOnly', { business: found.supplier.business_name })}</p>
          </>
        )}
      </main>
    </div>
  )
}
