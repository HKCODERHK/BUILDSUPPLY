import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  House,
  IndianRupee,
  LoaderCircle,
  Package,
  Phone,
  Receipt,
  ScrollText,
  Share2,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { formatRate, gstSlabs } from '@/lib/gst'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
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
  type KhataDocument,
  type KhataDocumentLine,
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
import { receivedState } from '@/lib/received'
import {
  CustomerTabBar,
  DeliveryStrip,
  QuickActions,
  SectionHeading,
  SoftCard,
  SoftTile,
  type QuickAction,
} from '@/components/CustomerHome'
import { TINTS, greetingKey } from '@/lib/customerHome'
import {
  accountsAvailable,
  connectKhata,
  khataConnected,
  myConfirmReceived,
  myKhata,
  myKhataDocument,
} from '@/services/customerAccount'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The last three months show straight away; older lines wait behind "Show older". */
const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_MS = 90 * DAY_MS

/**
 * The page answers one question at a time. A customer arriving on this link
 * wants one of a few things — what do I owe, which bills, did my payment
 * land, where is my order — and the old page put all of them on one scroll,
 * so every answer had to be hunted for. Now the link opens on the figure and
 * a short menu, and each row opens only itself (`?s=`, so the phone's back
 * button returns to the menu).
 */
type LiveItem =
  | { kind: 'arrived'; bill: KhataInvoice }
  | { kind: 'pending'; bill: KhataInvoice }
  | { kind: 'order'; order: KhataOrder }

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

/**
 * /khata/<code> — a customer's own account, from the link their supplier
 * shared (migration 028). Read-only: every live bill and payment, the balance
 * the supplier sees, and the same ledger PDF the supplier sends. Built by the
 * supplier's own buildCustomerLedger, so the two agree. Since 031 also each
 * bill's own PDF, their estimates (with PDFs) and their online orders — shown
 * only once the database has 031, so the page works either way.
 */
export default function KhataPage({
  connection,
  accountTop,
  accountFooter,
  onGone,
}: {
  /**
   * Set on /me: the khata is read through the customer's own account
   * (migration 038) instead of the link's code. Everything else is the same.
   */
  connection?: string
  /** The shop switcher, above the page, on /me. */
  accountTop?: ReactNode
  /** Remove this shop / sign out, at the foot of the home screen, on /me. */
  accountFooter?: ReactNode
  /** The account's connection stopped answering (the shop stopped the link). */
  onGone?: () => void
} = {}) {
  const { token = '' } = useParams()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<KhataView | null>(null)
  const [failed, setFailed] = useState(false)
  const [showOlder, setShowOlder] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // One bill's or estimate's PDF being made: "bill:INV-1024" or "estimate:QT-1003".
  const [docBusy, setDocBusy] = useState<string | null>(null)
  const [viewing, setViewing] = useState<KhataDocument | null>(null)
  const [sharingShop, setSharingShop] = useState(false)
  const [docFailed, setDocFailed] = useState(false)
  // "Material received" (migration 030): asked, then confirmed — two taps, so a
  // stray one can't record it.
  const [asking, setAsking] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmFailed, setConfirmFailed] = useState(false)
  // Fixed when the page opens, so a re-render never moves the line.
  const [cutoff] = useState(() => Date.now() - RECENT_MS)

  // Saving this khata to the customer's account (migration 038): only on the
  // link, never on /me, where it is already the account.
  const [saved, setSaved] = useState<'unknown' | 'no' | 'saving' | 'yes'>('unknown')
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => {
    if (connection || !token) return
    let live = true
    accountsAvailable()
      .then((ok) => (ok ? khataConnected(token) : null))
      .then((r) => live && r && setSaved(r.connected ? 'yes' : 'no'))
      .catch(() => live && setSaved('no'))
    return () => {
      live = false
    }
  }, [token, connection])
  async function saveToAccount() {
    if (saved === 'saving') return
    setSaved('saving')
    setSaveFailed(false)
    try {
      const r = await connectKhata(token)
      setSaved(r.ok ? 'yes' : 'no')
      if (!r.ok) setSaveFailed(true)
    } catch {
      setSaved('no')
      setSaveFailed(true)
    }
  }

  const load = () => (connection ? myKhata(connection) : getKhata(token))

  useEffect(() => {
    if (connection) {
      setView(null)
      myKhata(connection)
        .then((v) => {
          setView(v)
          if (!v.found) onGone?.()
          if (v.found) void warmPdfKit()
        })
        .catch(() => setFailed(true))
      return
    }
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
    // onGone is the parent's callback; a new function each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, connection])

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
  // An order the shop took by phone or at the counter: a bill that no online
  // order produced. `from_order` is only false once migration 033 is in —
  // before that it is absent, and none of these are claimed, so the list is
  // exactly what it was.
  const offlineOrders = billRows.filter((b) => b.kind === 'bill' && b.from_order === false)
  const orderCount = orders.length + offlineOrders.length

  // The delivery card: the one thing in motion, most urgent first — a
  // delivery waiting for "did it arrive?", then a recent bill not delivered
  // yet, then an online order waiting, or accepted and not billed. Old bills
  // a supplier never marked delivered are not "pending": only the last week
  // counts, and orders only the last month.
  const opened = cutoff + RECENT_MS
  const liveItems: LiveItem[] = [
    ...billRows
      .filter((b) => b.kind === 'bill' && receivedState(b) === 'waiting')
      .map((bill) => ({ kind: 'arrived' as const, bill })),
    ...billRows
      .filter((b) => b.kind === 'bill' && !b.delivered && opened - new Date(b.created_at).getTime() <= 7 * DAY_MS)
      .map((bill) => ({ kind: 'pending' as const, bill })),
    ...[...waitingOrders, ...answeredOrders.filter((o) => o.status === 'approved' && !o.bill)]
      .filter((o) => opened - new Date(o.created_at).getTime() <= 30 * DAY_MS)
      .map((order) => ({ kind: 'order' as const, order })),
  ]
  const live = liveItems[0] ?? null
  const liveMore = liveItems.length - (live ? 1 : 0)

  const quickActions: QuickAction[] = [
    ...(found?.order_link
      ? [{ key: 'order', icon: Truck, label: t('khata.tileOrder'), to: `/order/${found.order_link}` }]
      : []),
    ...(upiUrl ? [{ key: 'pay', icon: CreditCard, label: t('khata.tilePay'), onClick: () => openSection('pay') }] : []),
    { key: 'statement', icon: ScrollText, label: t('khata.tileStatement'), onClick: () => openSection('statement') },
    ...(found?.order_link
      ? [{ key: 'share', icon: Share2, label: t('khata.tileShare'), onClick: () => setSharingShop(true) }]
      : []),
  ]

  const tabs = [
    { key: 'home', icon: House, label: t('khata.tabHome'), active: section === null, onClick: closeSection },
    ...(found?.order_link
      ? [
          {
            key: 'materials',
            icon: ShoppingBag,
            label: t('khata.tabMaterials'),
            active: false,
            onClick: () => navigate(`/order/${found.order_link}`),
          },
        ]
      : []),
    { key: 'bills', icon: Receipt, label: t('khata.tabBills'), active: section === 'bills', onClick: () => openSection('bills') },
    ...(orderCount > 0 || found?.order_link
      ? [
          {
            key: 'orders',
            icon: Package,
            label: t('khata.tabOrders'),
            active: section === 'orders',
            onClick: () => openSection('orders'),
          },
        ]
      : []),
    ...(found?.order_link
      ? []
      : [
          {
            key: 'payments',
            icon: IndianRupee,
            label: t('khata.tabPayments'),
            active: section === 'payments',
            onClick: () => openSection('payments'),
          },
        ]),
  ]

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
      const doc = connection ? await myKhataDocument(connection, kind, no) : await getKhataDocument(token, kind, no)
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
      if (connection) await myConfirmReceived(connection, invoiceNo)
      else await confirmReceived(token, invoiceNo)
      setAsking(null)
      setView(await load())
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

  /**
   * The document's own lines, shown in the page (2026-09-22). The PDF is
   * still there beside it — this is for a customer on a phone who only wants
   * to see what they were charged for, and would rather not download an A4
   * sheet and pinch at it.
   */
  async function openDocument(kind: 'bill' | 'estimate', no: string) {
    if (!found || docBusy) return
    setDocBusy(`view:${kind}:${no}`)
    setDocFailed(false)
    try {
      const doc = connection ? await myKhataDocument(connection, kind, no) : await getKhataDocument(token, kind, no)
      if (!doc.found) throw new Error('not found')
      setViewing(doc)
    } catch {
      setDocFailed(true)
    } finally {
      setDocBusy(null)
    }
  }

  function viewButton(kind: 'bill' | 'estimate', no: string, label: string) {
    return (
      <button
        type="button"
        onClick={() => openDocument(kind, no)}
        disabled={docBusy !== null}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent disabled:opacity-60"
      >
        {docBusy === `view:${kind}:${no}` ? <LoaderCircle size={12} className="animate-spin" /> : <FileText size={12} />} {label}
      </button>
    )
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
    const state = receivedState(bill)
    if (state === 'none' && !hasDocuments) return null
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {/* Asked only while the answer still means something: a day after
            delivery it counts as received either way (lib/received), so the
            question goes and the line simply says it arrived. */}
        {state === 'confirmed' && bill.received_at ? (
          <span className="font-medium text-accent">{t('khata.receivedOn', { date: formatDate(bill.received_at) })}</span>
        ) : state === 'waiting' ? (
          <button type="button" className="font-semibold text-accent" onClick={() => setAsking(bill.invoice_no)}>
            {t('khata.receivedAsk')}
          </button>
        ) : state === 'assumed' ? (
          <span className="font-medium text-accent">{t('khata.ordDelivered')}</span>
        ) : null}
        {hasDocuments && viewButton('bill', bill.invoice_no, t('khata.billView'))}
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
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {viewButton('estimate', q.quote_no, t('khata.estimateView'))}
            {pdfButton('estimate', q.quote_no, t('khata.estimatePdf'))}
          </div>
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
          {o.bill && <div className="text-xs text-muted">{t('khata.bill', { no: o.bill })}</div>}
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

  /**
   * An order the shop took by phone or at the counter. There is no order to
   * open — the bill is the whole record of it — so the row says what was
   * billed and where it has got to, and does not pretend to be tappable.
   */
  function offlineOrderRow(b: KhataInvoice) {
    return (
      <div key={`offline-${b.invoice_no}`} className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{formatDate(b.created_at)}</div>
          <div className="text-xs text-muted">
            {t('khata.bill', { no: b.invoice_no })}
            {b.site ? ` · ${b.site}` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-ink">{formatINR(Number(b.total))}</div>
          {b.received_at ? (
            <div className="text-[11px] font-medium text-accent">{t('khata.receivedOn', { date: formatDate(b.received_at) })}</div>
          ) : b.delivered ? (
            <div className="text-[11px] font-medium text-accent">{t('khata.ordDelivered')}</div>
          ) : null}
        </div>
      </div>
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
      <main className={cn('mx-auto flex max-w-lg flex-col gap-4 p-4', found && 'pb-28')}>
        {/* The shop, large, where the page begins — this is what rises into
            the bar. Measured, not guessed: `shopUp` turns on the moment this
            block's last pixel passes under the bar. */}
        {accountTop}
        {found && section && (
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
                {orderCount === 0 && <Card className="text-sm text-muted">{t('khata.noOrders')}</Card>}
                {/* Two sections, by how the order reached the shop — the ones
                    the customer sent themselves, and the ones the shop wrote
                    down for them. Each heading says which, so the rows
                    underneath do not have to repeat it. Within the online
                    ones, anything still waiting for an answer sits first. */}
                {orders.length > 0 && (
                  <Group heading={t('khata.ordOnline', { count: orders.length })}>
                    {[...waitingOrders, ...answeredOrders].map(orderRow)}
                  </Group>
                )}
                {offlineOrders.length > 0 && (
                  <Group heading={t('khata.ordOffline', { count: offlineOrders.length })}>
                    {offlineOrders.map(offlineOrderRow)}
                  </Group>
                )}
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
            {/* The greeting, the way an app greets its user — and what rises
                into the bar as the page scrolls. The round button is the
                shop's phone, where the reference keeps its bell. */}
            <div ref={bandRef} className="flex items-center gap-3 pt-1">
              <CustomerAvatar id={token || connection || ''} name={found.customer.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">{t(greetingKey())}</div>
                <div className="line-clamp-2 break-words text-xl font-bold leading-tight text-ink">
                  {t('khata.hello', { name: found.customer.name })}
                </div>
                <div className="truncate text-xs text-muted">
                  {t('khata.yourAccountWith', { business: found.supplier.business_name })}
                </div>
              </div>
              {found.supplier.phone && (
                <a
                  href={`tel:${found.supplier.phone}`}
                  aria-label={t('khata.menuCall')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-accent shadow-sm"
                >
                  <Phone size={18} />
                </a>
              )}
            </div>

            {/* One figure, not three (Phase 23): the bills' dues less any
                advance, with the parts spelled out when there is an advance. */}
            <SoftCard className="p-5">
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
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
                  <Button size="sm" className="ml-auto shrink-0 rounded-full px-4" onClick={() => openSection('pay')}>
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
            </SoftCard>

            {live && (
              <SoftCard className="overflow-hidden">
                <DeliveryStrip at={live.kind === 'arrived' ? 'site' : 'shop'} />
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-muted">
                      {live.kind === 'order' ? t('khata.liveOrder') : t('khata.liveDelivery')}
                    </div>
                    <div className="text-base font-bold leading-snug text-ink">
                      {live.kind === 'arrived'
                        ? t('khata.liveArrived')
                        : live.kind === 'pending'
                          ? t('khata.livePending')
                          : t(`order.status.${live.order.status}`)}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {live.kind === 'order'
                        ? `${formatDate(live.order.created_at)} · ${t('khata.orderItems', { count: live.order.item_count })}`
                        : `${t('khata.bill', { no: live.bill.invoice_no })}${live.bill.site ? ` · ${live.bill.site}` : ''}`}
                    </div>
                  </div>
                  {live.kind === 'order' ? (
                    <Link
                      to={`/order-status/${live.order.code}`}
                      aria-label={t(`order.status.${live.order.status}`)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow"
                    >
                      <ChevronRight size={20} />
                    </Link>
                  ) : found.supplier.phone ? (
                    <a
                      href={`tel:${found.supplier.phone}`}
                      aria-label={t('khata.menuCall')}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow"
                    >
                      <Phone size={18} />
                    </a>
                  ) : null}
                </div>
                {/* The one thing this card can settle: "did it arrive?" —
                    still two taps, so a stray one can't record it. */}
                {live.kind === 'arrived' && (
                  <div className="flex flex-wrap gap-2 px-4 pb-4">
                    {asking === live.bill.invoice_no ? (
                      <>
                        <Button size="sm" onClick={() => received(live.bill.invoice_no)} disabled={confirming}>
                          {confirming ? t('common.saving') : t('khata.receivedYes')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAsking(null)} disabled={confirming}>
                          {t('ord.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setAsking(live.bill.invoice_no)}>
                        {t('khata.receivedAsk')}
                      </Button>
                    )}
                  </div>
                )}
                {confirmFailed && <div className="px-4 pb-4">{problem(t('error.generic'))}</div>}
                {liveMore > 0 && (
                  <button
                    type="button"
                    onClick={() => openSection(live.kind === 'order' ? 'orders' : 'bills')}
                    className="w-full border-t border-border px-4 py-2.5 text-left text-xs font-semibold text-accent"
                  >
                    {t('khata.liveMore', { count: liveMore })}
                  </button>
                )}
              </SoftCard>
            )}

            {/* The one-time connection (migration 038): save this shop to
                the customer's own BuildSupply, and next time they open it
                straight — no link to find. The link itself keeps working. */}
            {!connection && saved !== 'unknown' && (
              <SoftCard className="flex items-center gap-3 p-4">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    saved === 'yes' ? TINTS.green : 'bg-accent-bg text-accent-text',
                  )}
                >
                  {saved === 'yes' ? <BookmarkCheck size={19} /> : <BookmarkPlus size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">
                    {saved === 'yes' ? t('acct.savedTitle') : t('acct.saveTitle')}
                  </div>
                  <div className="text-xs text-muted">{saved === 'yes' ? t('acct.savedHint') : t('acct.saveHint')}</div>
                  {saveFailed && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{t('error.generic')}</div>}
                </div>
                {saved === 'yes' ? (
                  <Link to="/me" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-accent">
                    {t('acct.open')}
                  </Link>
                ) : (
                  <Button size="sm" className="shrink-0 rounded-full px-4" onClick={saveToAccount} disabled={saved === 'saving'}>
                    {saved === 'saving' ? <LoaderCircle size={14} className="animate-spin" /> : t('acct.save')}
                  </Button>
                )}
              </SoftCard>
            )}

            <QuickActions actions={quickActions} />

            {/* The account, as tiles. A tile with nothing behind it is left out. */}
            {(billRows.length > 0 || payments.length > 0 || estimates.length > 0 || orderCount > 0) && (
              <>
                <SectionHeading title={t('khata.accountHeading')} />
                <div className="grid grid-cols-2 gap-3">
                  {billRows.length > 0 && (
                    <SoftTile
                      icon={Receipt}
                      tint="amber"
                      title={t('khata.tabBills')}
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
                    <SoftTile
                      icon={IndianRupee}
                      tint="green"
                      title={t('khata.tabPayments')}
                      detail={t(payments.length === 1 ? 'khata.paymentsDetailOne' : 'khata.paymentsDetail', {
                        count: payments.length,
                        date: formatDate(payments[0].created_at),
                      })}
                      onClick={() => openSection('payments')}
                    />
                  )}
                  {estimates.length > 0 && (
                    <SoftTile
                      icon={FileText}
                      tint="sky"
                      title={t('khata.tileEstimates')}
                      detail={t(estimates.length === 1 ? 'khata.estimatesDetailOne' : 'khata.estimatesDetail', {
                        count: estimates.length,
                      })}
                      onClick={() => openSection('estimates')}
                    />
                  )}
                  {orderCount > 0 && (
                    <SoftTile
                      icon={Package}
                      tint="violet"
                      title={t('khata.tabOrders')}
                      detail={
                        ordersWaiting > 0
                          ? t('khata.ordersDetailWaiting', { count: orderCount, waiting: ordersWaiting })
                          : t(orderCount === 1 ? 'khata.ordersDetailOne' : 'khata.ordersDetail', { count: orderCount })
                      }
                      onClick={() => openSection('orders')}
                    />
                  )}
                </div>
              </>
            )}

            {/* The last few lines of the statement, newest first. */}
            {newestFirst.length > 0 && (
              <>
                <SectionHeading
                  title={t('khata.recentHeading')}
                  action={t('khata.seeAll')}
                  onAction={() => openSection('statement')}
                />
                <SoftCard className="p-2">
                  <div className="flex flex-col divide-y divide-border">
                    {newestFirst.slice(0, 3).map((e, i) => {
                      const d = describe(e)
                      const Icon = e.type === 'Invoice' ? Receipt : e.type === 'Opening' ? ScrollText : IndianRupee
                      return (
                        <div key={i} className="flex items-center gap-3 px-2 py-3">
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                              e.credit > 0 ? TINTS.green : e.type === 'Opening' ? TINTS.slate : TINTS.amber,
                            )}
                          >
                            <Icon size={17} strokeWidth={1.9} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink">{d.title}</div>
                            <div className="truncate text-xs text-muted">
                              {formatDate(e.date)}
                              {d.sub ? ` · ${d.sub}` : ''}
                            </div>
                          </div>
                          <div className={cn('shrink-0 text-sm font-semibold', e.credit > 0 ? 'text-accent' : 'text-ink')}>
                            {e.credit > 0 ? `− ${formatINR(e.credit)}` : formatINR(e.debit)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </SoftCard>
              </>
            )}
            {accountFooter}
          </>
        )}
      </main>

      {found && <CustomerTabBar tabs={tabs} />}

      {/* Link or QR, the same two steps the supplier's own Share order link
          offers — a customer standing in the shop may want to photograph the
          code, and one going home may want the link. Nobody is signed in
          here, so the shop's own name and logo are handed in. */}
      {sharingShop && found && found.order_link && (
        <OrderLinkShareModal
          url={`${window.location.origin}/order/${found.order_link}`}
          business={found.supplier.business_name}
          logoUrl={found.supplier.logo_url}
          message={t('order.shareText', {
            business: found.supplier.business_name,
            url: `${window.location.origin}/order/${found.order_link}`,
          })}
          onClose={() => setSharingShop(false)}
        />
      )}

      {/* The bill or estimate itself, read in the page. The same figures the
          PDF carries, laid out for a phone rather than for A4. */}
      {viewing && viewing.found && (
        <Modal
          title={viewing.kind === 'bill' ? t('khata.bill', { no: viewing.invoice_no }) : t('khata.estimateNo', { no: viewing.quote_no })}
          onClose={() => setViewing(null)}
        >
          <div className="flex flex-col gap-3 text-sm">
            <div className="text-xs text-muted">
              {formatDate(viewing.created_at)}
              {viewing.site ? ` · ${viewing.site}` : ''}
            </div>
            <div className="flex flex-col divide-y divide-border border-y border-border">
              {viewing.items.map((line: KhataDocumentLine, i: number) => (
                <div key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-ink">{line.description}</div>
                    <div className="text-xs text-muted">
                      {Number(line.qty).toLocaleString('en-IN')} × {formatINR(Number(line.rate))}
                      {line.gst_rate != null && Number(line.gst_rate) > 0
                        ? ` · ${t('inv.gst')} ${formatRate(Number(line.gst_rate))}`
                        : ''}
                    </div>
                  </div>
                  <div className="shrink-0 font-medium text-ink">{formatINR(Number(line.amount))}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-muted">
                <span>{t('inv.subtotal')}</span>
                <span>{formatINR(Number(viewing.subtotal))}</span>
              </div>
              {gstSlabs(viewing.items).length > 0 ? (
                gstSlabs(viewing.items).map((slab) => (
                  <div key={slab.rate} className="flex justify-between text-muted">
                    <span>
                      {t('inv.gst')} {formatRate(slab.rate)}
                    </span>
                    <span>{formatINR(slab.amount)}</span>
                  </div>
                ))
              ) : Number(viewing.gst_amount) > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>{t('inv.gst')}</span>
                  <span>{formatINR(Number(viewing.gst_amount))}</span>
                </div>
              ) : null}
              {Number(viewing.transport_labour_charge) > 0 && (
                <div className="flex justify-between text-muted">
                  <span>{t('inv.transportLabourShort')}</span>
                  <span>{formatINR(Number(viewing.transport_labour_charge))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-ink">
                <span>{t('inv.grandTotal')}</span>
                <span>{formatINR(Number(viewing.total))}</span>
              </div>
              {viewing.kind === 'bill' && (
                <>
                  <div className="flex justify-between text-accent">
                    <span>{t('common.paid')}</span>
                    <span>{formatINR(Number(viewing.paid))}</span>
                  </div>
                  {Number(viewing.total) - Number(viewing.paid) > 0.005 && (
                    <div className="flex justify-between font-semibold text-red-600 dark:text-red-400">
                      <span>{t('inv.remaining')}</span>
                      <span>{formatINR(Number(viewing.total) - Number(viewing.paid))}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                downloadDocument(viewing.kind, viewing.kind === 'bill' ? viewing.invoice_no : viewing.quote_no)
              }
              disabled={docBusy !== null}
            >
              <Download size={15} /> {t('khata.billPdf')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
