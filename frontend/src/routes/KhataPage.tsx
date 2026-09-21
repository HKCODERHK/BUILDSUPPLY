import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  IndianRupee,
  LoaderCircle,
  Package,
  Phone,
  Receipt,
  ScrollText,
  Truck,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { downloadCustomerLedgerPdf, type LedgerEntry } from '@/lib/customerLedgerPdf'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { downloadQuotationPdf } from '@/lib/quotationPdf'
import type { Customer, Invoice, InvoiceItem, Quotation, QuotationItem, Supplier } from '@/lib/database.types'
import type { InvoiceWithCustomer } from '@/services/invoices'
import type { PaymentWithInvoice } from '@/services/payments'
import {
  confirmReceived,
  getKhata,
  getKhataDocument,
  type KhataEstimate,
  type KhataInvoice,
  type KhataOrder,
  type KhataPayment,
  type KhataView,
} from '@/services/khata'
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
 * The page answers one question at a time. A customer arriving on this link
 * wants one of a few things — what do I owe, which bills, did my payment
 * land, where is my order — and the old page put all of them on one scroll,
 * so every answer had to be hunted for. Now the link opens on the figure and
 * a short menu, and each row opens only itself (`?s=`, so the phone's back
 * button returns to the menu).
 */
const SECTIONS = ['pay', 'bills', 'payments', 'estimates', 'orders', 'statement'] as const
type Section = (typeof SECTIONS)[number]

/**
 * A titled group of rows — bills, estimates or orders. The heading can carry
 * a total on the right and a line of explanation under it; the rows themselves
 * are whatever the caller passes.
 */
function Group({
  heading,
  total,
  note,
  children,
}: {
  heading: string
  /** Shown in red beside the heading — what this group still wants. */
  total?: number | null
  note?: string | null
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{heading}</span>
        {total != null && <span className="shrink-0 text-sm font-bold text-red-600 dark:text-red-400">{formatINR(total)}</span>}
      </div>
      {note && <p className="mb-1.5 px-1 text-xs text-muted">{note}</p>}
      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">{children}</div>
      </Card>
    </div>
  )
}

/** One row of the menu. Plain outline icon, a title and a line saying what is inside. */
function MenuRow({
  icon: Icon,
  title,
  detail,
  onClick,
  to,
  href,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  title: string
  detail?: string | null
  onClick?: () => void
  to?: string
  href?: string
}) {
  const className = 'flex w-full items-start gap-4 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-surface active:bg-surface'
  const inner = (
    <>
      <Icon size={24} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        {detail && <span className="mt-0.5 block break-words text-sm text-muted">{detail}</span>}
      </span>
      <ChevronRight size={18} className="mt-1 shrink-0 text-muted" />
    </>
  )
  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}

/**
 * /khata/<code> — a customer's own account, from the link their supplier
 * shared (migration 028). Read-only: every live bill and payment, the balance
 * the supplier sees, and the same ledger PDF the supplier sends. Built by the
 * supplier's own buildCustomerLedger, so the two agree. Since 031 also each
 * bill's own PDF, their estimates (with PDFs) and their online orders — shown
 * only once the database has 031, so the page works either way.
 */
export default function KhataPage() {
  const { token = '' } = useParams()
  const { t } = useLanguage()
  const [params, setParams] = useSearchParams()
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
        if (v.found && v.order_link) rememberKhataCode(v.order_link, token, v.customer)
        if (!v.found) forgetKhataCode(token)
        // Every button on this page makes a PDF: have the PDF tools ready.
        if (v.found) void warmPdfKit()
      })
      .catch(() => setFailed(true))
  }, [token])

  // The shop's band rising into the bar (the supplier's own Profile screen
  // does the same with their name). A frame is asked for per scroll burst
  // rather than measuring on every event.
  const barRef = useRef<HTMLElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const [shopUp, setShopUp] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const band = bandRef.current?.getBoundingClientRect()
      const bar = barRef.current?.getBoundingClientRect()
      // No band yet (still loading, or the link is dead): keep BuildSupply up.
      setShopUp(!!band && !!bar && band.bottom <= bar.bottom)
    }
    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    window.addEventListener('scroll', onChange, { passive: true })
    window.addEventListener('resize', onChange)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [view, params])

  const found = view && view.found ? view : null
  // The per-document PDFs need khata_document, which came with the estimates list.
  const hasDocuments = Array.isArray(found?.estimates)

  const asked = params.get('s')
  const section = (SECTIONS as readonly string[]).includes(asked ?? '') ? (asked as Section) : null
  function openSection(s: Section) {
    setParams({ s })
  }
  function closeSection() {
    setParams({})
  }

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

  // Bills newest first. An opening balance is a row here too (it is money owed
  // like any other), titled "Old balance" rather than given a bill number.
  const billRows = found ? [...found.invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)) : []
  const billCount = billRows.filter((b) => b.kind === 'bill').length
  const leftToPay = billRows.reduce((sum, b) => sum + Math.max(0, Number(b.total) - Number(b.paid)), 0)
  const unpaidBills = billRows.filter((b) => Number(b.total) - Number(b.paid) > 0.005)
  const paidBills = billRows.filter((b) => Number(b.total) - Number(b.paid) <= 0.005)
  const payments = found ? [...found.payments].sort((a, b) => b.created_at.localeCompare(a.created_at)) : []
  const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const estimates = found?.estimates ?? []
  const openEstimates = estimates.filter((q) => q.status !== 'Converted' && q.status !== 'Expired')
  const closedEstimates = estimates.filter((q) => q.status === 'Converted' || q.status === 'Expired')
  const orders = found?.orders ?? []
  const waitingOrders = orders.filter((o) => o.status === 'pending')
  const answeredOrders = orders.filter((o) => o.status !== 'pending')
  const ordersWaiting = waitingOrders.length

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

  /** The "Material received?" line and the bill's own PDF, under a bill. */
  function billActions(bill: KhataInvoice) {
    if (bill.kind !== 'bill') return null
    if (asking === bill.invoice_no) {
      return (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => received(bill.invoice_no)} disabled={confirming}>
            {confirming ? t('common.saving') : t('khata.receivedYes')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAsking(null)} disabled={confirming}>
            {t('ord.cancel')}
          </Button>
        </div>
      )
    }
    if (!bill.received_at && !bill.delivered && !hasDocuments) return null
    return (
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
    )
  }

  /** What a payment or a bill row is called: a bill's number, or "Old balance". */
  function refLabel(kind: KhataInvoice['kind'], no: string) {
    return kind === 'opening' ? t('khata.opening') : t('khata.bill', { no })
  }

  /**
   * What one payment was put into: each bill with its share, and then whatever
   * was left over, which the shop keeps as advance (money released by a
   * cancelled bill comes back the same way). Used for the line under a single
   * payment and for the box under a split one, so the two cannot drift.
   */
  function paymentParts(p: KhataPayment) {
    const allocated = p.payment_allocations.reduce((sum, a) => sum + Number(a.amount), 0)
    const kept = Math.max(0, Number(p.amount) - allocated)
    return [
      ...p.payment_allocations.map((a) => ({
        label: refLabel(a.invoices.kind, a.invoices.invoice_no),
        amount: Number(a.amount),
      })),
      ...(kept > 0.005 ? [{ label: t('khata.keptAdvance'), amount: kept }] : []),
    ]
  }

  /** One bill, in either group. */
  function billRow(b: KhataInvoice) {
    const paid = Number(b.paid)
    const left = Math.max(0, Number(b.total) - paid)
    return (
      <div key={`${b.kind}-${b.invoice_no}`} className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{refLabel(b.kind, b.invoice_no)}</div>
          <div className="text-xs text-muted">
            {formatDate(b.created_at)}
            {b.site ? ` · ${b.site}` : ''}
          </div>
          {/* Part paid: say what has gone in, so the smaller "left"
              figure beside the bill's total makes sense. */}
          {left > 0.005 && paid > 0.005 && (
            <div className="text-xs text-accent">{t('khata.billPaidPart', { amount: formatINR(paid) })}</div>
          )}
          {billActions(b)}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-ink">{formatINR(Number(b.total))}</div>
          <div className={cn('text-[11px] font-medium', left > 0.005 ? 'text-red-600 dark:text-red-400' : 'text-accent')}>
            {left > 0.005 ? t('khata.billLeft', { amount: formatINR(left) }) : `${t('status.Paid')} ✓`}
          </div>
        </div>
      </div>
    )
  }

  /** One estimate. */
  function estimateRow(q: KhataEstimate) {
    return (
      <div key={q.quote_no} className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{t('khata.estimate', { no: q.quote_no })}</div>
          <div className="text-xs text-muted">
            {formatDate(q.created_at)}
            {q.site ? ` · ${q.site}` : ''}
          </div>
          <div className="mt-1">{pdfButton('estimate', q.quote_no, t('khata.estimatePdf'))}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-ink">{formatINR(Number(q.total))}</div>
          {q.status === 'Converted' ? (
            <div className="text-[11px] font-medium text-accent">{t('khata.estBilled')}</div>
          ) : q.status === 'Expired' ? (
            <div className="text-[11px] text-muted">{t('status.Expired')}</div>
          ) : (
            <div className="text-[11px] text-muted">{t('khata.estOpenOne')}</div>
          )}
        </div>
      </div>
    )
  }

  /** One online order, opening its own status link. */
  function orderRow(o: KhataOrder) {
    return (
      <Link key={o.code} to={`/order-status/${o.code}`} className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{formatDate(o.created_at)}</div>
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
    )
  }

  const sectionTitle: Record<Section, string> = {
    pay: t('khata.menuPay'),
    bills: t('khata.menuBills'),
    payments: t('khata.menuPayments'),
    estimates: t('khata.menuEstimates'),
    orders: t('khata.menuOrders'),
    statement: t('khata.menuStatement'),
  }

  const problem = (message: string) => (
    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{message}</p>
  )

  return (
    <div className="min-h-screen bg-surface">
      {/* Two brands, one bar. At the top of a page it says BuildSupply, with
          the language and day/night buttons, and the shop's own logo and name
          sit under it on the page. Scroll, and the shop rises into the bar as
          BuildSupply and the buttons step aside — so the platform is named
          where a customer first lands, and the shop owns the bar while they
          read their account. Scrolling back brings BuildSupply back. */}
      <header
        ref={barRef}
        className="sticky top-0 z-30 bg-shell px-4 pb-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white"
      >
        <div className="relative mx-auto flex h-11 max-w-lg items-center">
          <div
            className={cn(
              'absolute inset-0 flex items-center gap-3 transition-opacity duration-200 motion-reduce:transition-none',
              shopUp && 'pointer-events-none opacity-0',
            )}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#35A85D"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M3 21h18" />
              <path d="M5 21V8l5-4v17" />
              <path d="M10 21V11l6 3v7" />
              <path d="M16 21v-4l3 1.5V21" />
            </svg>
            <span className="text-lg font-bold">BuildSupply</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
              <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
            </div>
          </div>
          <div
            className={cn(
              'absolute inset-0 flex items-center gap-2.5 transition-opacity duration-200 motion-reduce:transition-none',
              !shopUp && 'pointer-events-none opacity-0',
            )}
          >
            {found?.supplier.logo_url ? (
              <img src={found.supplier.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-cover" />
            ) : null}
            <span className="min-w-0 truncate text-base font-bold">{found?.supplier.business_name ?? 'BuildSupply'}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        {/* The shop, large, where the page begins — this is what rises into
            the bar. Measured, not guessed: `shopUp` turns on the moment this
            block's last pixel passes under the bar. */}
        {found && (
          <div ref={bandRef} className="flex items-center gap-3">
            {found.supplier.logo_url ? (
              <img src={found.supplier.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-cover" />
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-xl font-bold leading-tight text-ink">{found.supplier.business_name}</div>
              <div className="text-xs text-muted">{t('khata.pageTitle')}</div>
            </div>
          </div>
        )}
        {!view && !failed ? (
          <TruckLoader />
        ) : !found ? (
          <Card className="text-center text-sm text-ink">{failed ? t('error.generic') : t('khata.notFound')}</Card>
        ) : section ? (
          <>
            <button type="button" onClick={closeSection} className="-mx-1 flex items-center gap-2 px-1 py-1 text-left">
              <ArrowLeft size={20} className="shrink-0 text-muted" />
              <span className="text-base font-bold text-ink">{sectionTitle[section]}</span>
            </button>

            {section === 'pay' && !(upiUrl && found.upi_id) && (
              <Card className="text-sm text-muted">{t('khata.nothingToPay')}</Card>
            )}
            {section === 'pay' && upiUrl && found.upi_id && (
              <Card className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-xl bg-white p-2">
                  <QrCode text={upiUrl} size={200} label={t('upi.payTitle')} />
                </div>
                <div className="text-xs text-muted">{found.upi_id}</div>
                {/* On the customer's own phone there is nothing to scan: this opens their UPI app instead. */}
                <a href={upiUrl} className="w-full">
                  <Button className="w-full">{t('upi.openApp', { amount: formatINR(net) })}</Button>
                </a>
                <p className="text-xs text-muted">{t('upi.payHint')}</p>
              </Card>
            )}

            {section === 'bills' && (
              <>
                {confirmFailed && problem(t('error.generic'))}
                {docFailed && problem(t('error.generic'))}
                {billRows.length === 0 ? (
                  <Card className="text-sm text-muted">{t('khata.noBills')}</Card>
                ) : (
                  <>
                    {/* The bills still wanting money come first, under their own
                        total. What is settled stays on the page — a customer
                        checks old bills too — but below, and not in red. */}
                    {unpaidBills.length > 0 && (
                      <Group
                        heading={t('khata.billsUnpaid', { count: unpaidBills.length })}
                        total={leftToPay}
                        note={found.advance > 0.005 ? t('khata.advanceGoesTo', { amount: formatINR(Number(found.advance)) }) : null}
                      >
                        {unpaidBills.map(billRow)}
                      </Group>
                    )}
                    {paidBills.length > 0 && (
                      <Group heading={t('khata.billsPaidGroup', { count: paidBills.length })}>{paidBills.map(billRow)}</Group>
                    )}
                  </>
                )}
              </>
            )}

            {section === 'payments' &&
              (payments.length === 0 ? (
                <Card className="text-sm text-muted">{t('khata.noPayments')}</Card>
              ) : (
                <div>
                  {/* The one group whose total is money in, so it is green
                      rather than the red the Group heading uses. */}
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {t('khata.paymentsGroup', { count: payments.length })}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-accent">{formatINR(paidTotal)}</span>
                  </div>
                  <Card className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      {payments.map((p, i) => {
                        const parts = paymentParts(p)
                        return (
                          <div key={i} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-ink">{formatDate(p.created_at)}</div>
                                <div className="text-xs text-muted">{t(`mode.${p.mode}`)}</div>
                              </div>
                              <div className="shrink-0 text-base font-bold text-accent">− {formatINR(Number(p.amount))}</div>
                            </div>
                            {/* One bill: a line is enough. Several: every bill
                                and its share, so a customer can check their
                                money landed where they meant it to. */}
                            {parts.length === 1 ? (
                              <div className="mt-1 text-xs text-muted">{t('khata.paidInto', { ref: parts[0].label })}</div>
                            ) : parts.length > 1 ? (
                              <div className="mt-2 flex flex-col gap-1 rounded-lg bg-surface p-2.5">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('khata.paymentSplit')}</div>
                                {parts.map((part, j) => (
                                  <div key={j} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="min-w-0 truncate text-muted">{part.label}</span>
                                    <span className="shrink-0 font-semibold text-ink">{formatINR(part.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </div>
              ))}

            {section === 'estimates' && (
              <>
                {docFailed && problem(t('error.generic'))}
                {estimates.length === 0 && <Card className="text-sm text-muted">{t('khata.noEstimates')}</Card>}
                {/* An estimate a customer can still act on is the one they
                    came to look at; the ones already billed, or past their
                    date, sit below as a record. */}
                {openEstimates.length > 0 && (
                  <Group heading={t('khata.estOpen', { count: openEstimates.length })}>{openEstimates.map(estimateRow)}</Group>
                )}
                {closedEstimates.length > 0 && (
                  <Group heading={t('khata.estClosed', { count: closedEstimates.length })}>{closedEstimates.map(estimateRow)}</Group>
                )}
              </>
            )}

            {section === 'orders' && (
              <>
                {orders.length === 0 && <Card className="text-sm text-muted">{t('khata.noOrders')}</Card>}
                {/* Orders the shop has not answered yet are the ones a
                    customer is waiting on, so they come first. */}
                {waitingOrders.length > 0 && (
                  <Group heading={t('khata.ordWaiting', { count: waitingOrders.length })}>{waitingOrders.map(orderRow)}</Group>
                )}
                {answeredOrders.length > 0 && (
                  <Group heading={t('khata.ordAnswered', { count: answeredOrders.length })}>{answeredOrders.map(orderRow)}</Group>
                )}
              </>
            )}

            {section === 'statement' && (
              <>
                <p className="px-1 text-xs text-muted">{t('khata.statementIntro')}</p>
                <Button variant="outline" onClick={download} disabled={downloading} className="w-full">
                  {downloading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {t('khata.download')}
                </Button>
                <Card className="p-0">
                  {newestFirst.length === 0 ? (
                    <p className="p-4 text-sm text-muted">{t('khata.none')}</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-border text-sm">
                      {shown.map((e, i) => {
                        const d = describe(e)
                        return (
                          <div key={i} className="flex items-start justify-between gap-3 p-4">
                            <div className="min-w-0">
                              <div className="font-medium text-ink">{d.title}</div>
                              <div className="text-xs text-muted">
                                {formatDate(e.date)}
                                {d.sub ? ` · ${d.sub}` : ''}
                              </div>
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
                    <div className="p-4 pt-0">
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setShowOlder(true)}>
                        {t('khata.showOlder', { count: olderCount })}
                      </Button>
                    </div>
                  )}
                </Card>
              </>
            )}
          </>
        ) : (
          <>
            <Card className="flex flex-col gap-3">
              {/* One figure, not three. The bills owe one amount and any
                  advance sits against it, and the statement's own running
                  balance already nets the two — so showing both at the top
                  and a third number at the bottom of the list was the most
                  confusing thing on this page. The parts are spelled out
                  underneath when there is an advance to explain. */}
              {/* Their name, their initials and their own details: the page
                  belongs to the customer, under the shop's roof above. */}
              <div className="flex items-center gap-3">
                <CustomerAvatar id={token} name={found.customer.name} size={52} />
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold leading-tight text-ink">{found.customer.name}</div>
                  <div className="truncate text-xs text-muted">
                    {[found.customer.phone, found.customer.site].filter(Boolean).join(' · ') ||
                      t('khata.yourAccountWith', { business: found.supplier.business_name })}
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                {/* Paying sits against the figure it settles, not down among
                    the lists. It wraps to its own line only where the two
                    cannot share a row — a 320px phone in Hindi or Marathi. */}
                <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted">
                      {net > 0.005 ? t('khata.youOwe') : net < -0.005 ? t('khata.advance') : ''}
                    </div>
                    {net > 0.005 ? (
                      <div className="text-4xl font-bold leading-none text-red-600 dark:text-red-400">{formatINR(net)}</div>
                    ) : net < -0.005 ? (
                      <div className="text-4xl font-bold leading-none text-accent">{formatINR(-net)}</div>
                    ) : (
                      <div className="text-lg font-bold text-accent">{t('khata.settled')}</div>
                    )}
                  </div>
                  {upiUrl && (
                    <Button size="sm" className="ml-auto shrink-0" onClick={() => openSection('pay')}>
                      <CreditCard size={15} /> {t('khata.menuPay')}
                    </Button>
                  )}
                </div>
                {found.pending > 0.005 && found.advance > 0.005 && (
                  <p className="mt-2 text-xs text-muted">
                    {t('khata.netNote', {
                      bills: formatINR(Number(found.pending)),
                      advance: formatINR(Number(found.advance)),
                    })}
                  </p>
                )}
              </div>
            </Card>

            {/* One row per thing a customer might have come here for. A row a
                customer has nothing behind — no estimates, no orders, a shop
                with no UPI — is not shown at all. */}
            <Card className="divide-y divide-border p-2">
              {billRows.length > 0 && (
                <MenuRow
                  icon={Receipt}
                  title={t('khata.menuBills')}
                  detail={
                    leftToPay > 0.005
                      ? t(billCount === 1 ? 'khata.billsDetailOne' : 'khata.billsDetail', {
                          count: billCount,
                          amount: formatINR(leftToPay),
                        })
                      : t(billCount === 1 ? 'khata.billsDetailOnePaid' : 'khata.billsDetailPaid', { count: billCount })
                  }
                  onClick={() => openSection('bills')}
                />
              )}
              {payments.length > 0 && (
                <MenuRow
                  icon={IndianRupee}
                  title={t('khata.menuPayments')}
                  detail={t(payments.length === 1 ? 'khata.paymentsDetailOne' : 'khata.paymentsDetail', {
                    count: payments.length,
                    date: formatDate(payments[0].created_at),
                  })}
                  onClick={() => openSection('payments')}
                />
              )}
              {estimates.length > 0 && (
                <MenuRow
                  icon={FileText}
                  title={t('khata.menuEstimates')}
                  detail={t(estimates.length === 1 ? 'khata.estimatesDetailOne' : 'khata.estimatesDetail', { count: estimates.length })}
                  onClick={() => openSection('estimates')}
                />
              )}
              {orders.length > 0 && (
                <MenuRow
                  icon={Package}
                  title={t('khata.menuOrders')}
                  detail={
                    ordersWaiting > 0
                      ? t('khata.ordersDetailWaiting', { count: orders.length, waiting: ordersWaiting })
                      : t(orders.length === 1 ? 'khata.ordersDetailOne' : 'khata.ordersDetail', { count: orders.length })
                  }
                  onClick={() => openSection('orders')}
                />
              )}
              <MenuRow
                icon={ScrollText}
                title={t('khata.menuStatement')}
                detail={t('khata.statementDetail')}
                onClick={() => openSection('statement')}
              />
              {found.supplier.phone && (
                <MenuRow icon={Phone} title={t('khata.menuCall')} detail={found.supplier.phone} href={`tel:${found.supplier.phone}`} />
              )}
            </Card>

            {/* The page ends on the one thing a customer might want to DO
                rather than look up. A green button, not a menu row, and the
                same words the order page's own button carries. Only while the
                supplier takes online orders (migration 031). */}
            {found.order_link && (
              <Link to={`/order/${found.order_link}`} className="block">
                <span className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-accent px-4 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-accent-soft">
                  <Truck size={20} className="shrink-0" />
                  {t('order.startNow')}
                </span>
              </Link>
            )}
          </>
        )}
      </main>
    </div>
  )
}
