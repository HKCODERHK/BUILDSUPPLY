import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, AlertTriangle, ChevronRight, ClipboardList, Inbox, BadgeCheck, Tags } from 'lucide-react'
import { localDateKey } from '@/lib/localDate'
import { UpdateRatesModal } from '@/components/UpdateRatesModal'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  dashboardTotals,
  hasAnyBill,
  listBillsSince,
  listRecentBills,
  type InvoiceWithCustomer,
} from '@/services/invoices'
import { listRecentCustomers } from '@/services/customers'
import { listPaymentsSince } from '@/services/payments'
import { listMaterials } from '@/services/materials'
import { acceptedEstimates, countPendingOrders, orderPageUrl, unpricedOrders } from '@/services/orders'
import type { Customer, DashboardTotals, Invoice, Material, Payment } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { AdminDashboardView } from '@/routes/admin/AdminDashboardView'
import { StartHereCard } from '@/components/StartHereCard'
import { DraftBanners } from '@/components/Drafts'
import { TruckLoader } from '@/components/TruckLoader'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { SendRatesModal } from '@/components/SendRatesModal'

// Jump straight into the create flow for each — no extra click on the
// destination page. Customers/Payments/Stock read `?new=1` to auto-open
// their add modal on load; Bill already has a dedicated create page.
const QUICK_ACTIONS: { labelKey: TranslationKey; to: string }[] = [
  { labelKey: 'dash.quickBill', to: '/invoices/new' },
  { labelKey: 'dash.quickCustomer', to: '/customers?new=1' },
  { labelKey: 'dash.quickPayment', to: '/payments?new=1' },
  { labelKey: 'dash.quickStock', to: '/materials?stock=1' },
]

/**
 * The logo on the welcome card: a tap opens Profile; a long press (half a
 * second, a small buzz) brings up the order QR at once, for a customer at the
 * counter — or Settings → Online orders while there is no link to show. No
 * logo: the business's initials, so every supplier has the same shortcut.
 * Moving the finger (a scroll) cancels the press, the release after a long
 * press is not also a tap, and the phone's own long-press menu (save image
 * and so on) is kept away — the picture doesn't take the press at all.
 */
function WelcomeLogo() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [qrOpen, setQrOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const pressedAt = useRef<{ x: number; y: number } | null>(null)
  const longPressed = useRef(false)

  if (!supplier) return null
  const orderUrl = supplier.order_link && supplier.ordering_enabled ? orderPageUrl(supplier.order_link) : null

  function cancelPress() {
    window.clearTimeout(timer.current)
    timer.current = undefined
    pressedAt.current = null
  }

  function onLongPress() {
    longPressed.current = true
    // A phone allows a buzz only once the page has had a real tap; a hold
    // that is the very first touch doesn't count until the finger lifts.
    // Asking anyway just logs a warning, so ask only when it's allowed.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(15)
    if (orderUrl) setQrOpen(true)
    else navigate('/settings?s=orders')
  }

  return (
    <>
      <button
        type="button"
        aria-label={t('nav.profile')}
        title={t('dash.logoHint')}
        onPointerDown={(e) => {
          longPressed.current = false
          pressedAt.current = { x: e.clientX, y: e.clientY }
          timer.current = window.setTimeout(onLongPress, 500)
        }}
        onPointerMove={(e) => {
          const from = pressedAt.current
          if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) cancelPress()
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false
            return
          }
          navigate('/settings')
        }}
        className="shrink-0 select-none rounded-lg transition-transform [-webkit-touch-callout:none] active:scale-95"
      >
        {supplier.logo_url ? (
          <img
            src={supplier.logo_url}
            alt=""
            draggable={false}
            className="pointer-events-none h-14 w-14 rounded-lg border border-border object-cover"
          />
        ) : (
          <CustomerAvatar id={supplier.id} name={supplier.business_name} size={56} />
        )}
      </button>
      {qrOpen && orderUrl && <OrderLinkShareModal url={orderUrl} initialStep="qr" onClose={() => setQrOpen(false)} />}
    </>
  )
}

/**
 * Once a day: "Update today's rates?" Sand, gitti and cement rates move
 * often, and bills, estimates, the rate list and (if shown) the order page
 * all start from them. Same as yesterday puts it away until tomorrow; Update
 * rates opens every material's rate in a popup right here (UpdateRatesModal),
 * and saving puts it away too — closing the popup without saving leaves the
 * card. Remembered on this phone (localStorage, per business); a phone that
 * won't store it just shows the card again, which does no harm. A card among
 * the Dashboard's other notices — the popup opens only when asked for.
 */
function RatesReminder({ supplierId }: { supplierId: string }) {
  const { t } = useLanguage()
  const storageKey = `buildsupply-rates-checked:${supplierId}`
  const today = localDateKey(new Date().toISOString())
  const [answered, setAnswered] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === today
    } catch {
      return false
    }
  })
  const [editing, setEditing] = useState(false)
  // "12 rates updated", for a moment where the card was.
  const [savedCount, setSavedCount] = useState<number | null>(null)
  useEffect(() => {
    if (savedCount === null) return
    const timer = setTimeout(() => setSavedCount(null), 2400)
    return () => clearTimeout(timer)
  }, [savedCount])

  function answer() {
    try {
      localStorage.setItem(storageKey, today)
    } catch {
      // Not remembered on this phone; the card comes back next visit.
    }
    setAnswered(true)
  }

  if (savedCount !== null) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-accent-bg px-4 py-3 text-sm font-semibold text-accent-text">
        <BadgeCheck size={18} className="shrink-0" /> {t('rates.saved', { count: savedCount })}
      </div>
    )
  }
  if (answered) return null

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-start gap-2.5">
        <Tags size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t('rates.title')}</div>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{t('rates.hint')}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        <Button size="sm" onClick={() => setEditing(true)}>
          {t('rates.update')}
        </Button>
        <Button size="sm" variant="outline" onClick={answer}>
          {t('rates.same')}
        </Button>
      </div>
      {editing && (
        <UpdateRatesModal
          onClose={() => setEditing(false)}
          onSaved={(count) => {
            setEditing(false)
            answer()
            setSavedCount(count)
          }}
        />
      )}
    </div>
  )
}

function QuickActions() {
  const { t } = useLanguage()
  return (
    // Four equal columns rather than free-flowing buttons, so they always sit
    // on one row — even on the narrowest phone.
    //
    // mb-4 to match the low-stock banner and the Today card stacked under it;
    // at mb-6 this row was the only 24px gap in that run and read as detached
    // from the alert it sits directly above.
    <div className="mb-4 grid max-w-lg grid-cols-4 gap-2">
      {QUICK_ACTIONS.map(({ labelKey, to }, i) => (
        <Link key={labelKey} to={to} className="block">
          <Button
            variant={i === 0 ? 'primary' : 'outline'}
            size="sm"
            className="h-10 w-full gap-1 px-1.5 text-[11px] sm:gap-2 sm:px-3 sm:text-xs"
          >
            <Plus size={13} className="shrink-0" /> {t(labelKey)}
          </Button>
        </Link>
      ))}
    </div>
  )
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// Midnight on the phone's own clock — the supplier's "today".
function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// "How did today go" — the question a supplier has when they shut the shop.
// Collected counts money taken in today whichever bill it was against, so a
// payment on last week's invoice still shows in today's takings. Both lists
// arrive already limited to today (since local midnight); the date check is
// kept as a guard.
function summariseToday(bills: Invoice[], payments: Payment[]) {
  const todayKey = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
  const isToday = (iso: string) => new Date(iso).toLocaleDateString('en-CA') === todayKey

  const live = bills.filter((i) => i.status !== 'Cancelled' && isToday(i.created_at))
  return {
    bills: live.length,
    sold: live.reduce((sum, i) => sum + Number(i.total), 0),
    collected: payments.filter((p) => isToday(p.created_at)).reduce((sum, p) => sum + Number(p.amount), 0),
  }
}

export default function Dashboard() {
  const { supplier } = useAuth()
  if (supplier?.role === 'admin') return <AdminDashboardView />
  return <SupplierDashboardView />
}

function SupplierDashboardView() {
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const [totals, setTotals] = useState<DashboardTotals | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<InvoiceWithCustomer[]>([])
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([])
  const [today, setToday] = useState({ bills: 0, sold: 0, collected: 0 })
  const [lowStock, setLowStock] = useState<Material[]>([])
  // The priced ones, for "Send rate list" — out of the same read as the rest,
  // so the card costs no extra query.
  const [priced, setPriced] = useState<Material[]>([])
  const [sendingRates, setSendingRates] = useState(false)
  // Any material with a rate — the daily "update today's rates?" card only
  // makes sense once there are rates to update.
  const [hasRates, setHasRates] = useState(false)
  // Online orders waiting to be reviewed (migration 026). Read on its own, so
  // a problem here never holds up the rest of the dashboard.
  const [pendingOrders, setPendingOrders] = useState(0)
  // Estimates a customer accepted from their status link, waiting for a bill (migration 030).
  // With just one, the banner opens that estimate straight away.
  const [accepted, setAccepted] = useState<{ count: number; quotationId: string | null }>({ count: 0, quotationId: null })
  // Orders approved on the spot and not yet priced (037): the supplier said
  // yes and stopped there, and the customer is waiting on a figure.
  const [unpriced, setUnpriced] = useState<{ count: number; orderId: string | null }>({ count: 0, orderId: null })
  useEffect(() => {
    let active = true
    countPendingOrders()
      .then((n) => active && setPendingOrders(n))
      .catch(() => {})
    acceptedEstimates()
      .then((a) => active && setAccepted(a))
      .catch(() => {})
    unpricedOrders()
      .then((u) => active && setUnpriced(u))
      // Before 037 there is nothing to count; the notice simply stays away.
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const [loading, setLoading] = useState(true)
  // What the Start-here card ticks off. Flags rather than the recent lists
  // above, which are trimmed to five and drop cancelled bills — a supplier
  // whose only bill was cancelled has still made their first bill.
  const [setup, setSetup] = useState({ materials: false, customers: false, invoices: false })
  // "Skip for now" on the Start-here card lasts for this visit only. Session
  // storage, so the card is back the next time the app is opened: it stays
  // useful until the first bill, and a supplier who skipped it with a customer
  // waiting has not decided they never want it. Keyed by supplier so a shared
  // phone does not carry one supplier's choice over to another. Guarded,
  // because storage throws in some privacy modes and that must not take the
  // dashboard down with it.
  const skipKey = `buildsupply-start-skipped:${supplier?.id ?? ''}`
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem(skipKey) === '1'
    } catch {
      return false
    }
  })
  function skipStart() {
    try {
      sessionStorage.setItem(skipKey, '1')
    } catch {
      // Still hidden for the rest of this visit via state; it just won't
      // survive a reload.
    }
    setSkipped(true)
  }

  useEffect(() => {
    let active = true
    // Only what this screen shows — the latest five, and today — rather than
    // every bill and payment ever made. It is the screen the app opens on,
    // on a budget phone, and the full lists only ever grow.
    const since = startOfToday()
    Promise.all([
      dashboardTotals(),
      listRecentBills(5),
      listRecentCustomers(5),
      listBillsSince(since),
      listPaymentsSince(since),
      listMaterials(),
      hasAnyBill(),
    ])
      .then(([totalsData, recent, customers, todaysBills, todaysPayments, materials, anyBill]) => {
        if (!active) return
        setTotals(totalsData)
        setRecentInvoices(recent)
        setRecentCustomers(customers)
        setToday(summariseToday(todaysBills, todaysPayments))
        setLowStock(materials.filter((m) => m.stock_qty <= (m.low_stock_threshold ?? 5)))
        setHasRates(materials.some((m) => Number(m.rate) > 0))
        setPriced(materials.filter((m) => Number(m.rate) > 0))
        setSetup({ materials: materials.length > 0, customers: customers.length > 0, invoices: anyBill })
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  // Decided only once the data is in. Until then an existing supplier keeps
  // their quick actions exactly as before; only a genuinely new one sees the
  // row give way to the card, and on a cold start that happens under the
  // splash.
  //
  // firstRun is the fact (no bill yet); showStart is whether the card is up.
  // They differ only after a skip — the greeting still says "Welcome" rather
  // than "Welcome back" to someone who has never billed, but everything else
  // is the ordinary dashboard they asked for.
  const firstRun = !loading && !setup.invoices
  const showStart = firstRun && !skipped

  return (
    <div>
      {/* accent-bg rather than a literal green: it is the same token the app
          uses for every other soft-green surface, and it already has a dark
          counterpart, so this stays readable when the theme flips. */}
      <div className="mb-6 flex items-center gap-4 rounded-xl bg-accent-bg p-4">
        {/* Tap: Profile. Hold: the order QR. */}
        <WelcomeLogo />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {t(firstRun ? 'dash.welcomeNew' : 'dash.welcome', { name: supplier?.business_name ?? '' })}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t(showStart ? 'dash.subtitleNew' : 'dash.subtitle')}</p>
        </div>
      </div>

      {/* An unfinished bill or estimate — most often because the phone closed
          the app. First on the screen, because the app reopens here rather
          than where the supplier left off. */}
      <DraftBanners />

      {/* Hidden while the card is up: before a first bill, Payment and Stock
          open modals whose only dropdown is empty, and Bill opens a bill with
          no materials to put on it. The card covers the same ground in the
          order that actually works. */}
      {!showStart && <QuickActions />}

      {loading ? (
        <TruckLoader />
      ) : showStart ? (
        // Replaces the low-stock banner too, not just the ₹0 figures. Every
        // material added from the catalog starts at zero stock, so the moment
        // step one is done they would all be "running low" — a red alarm on
        // a new supplier's first morning for something that is not wrong.
        <StartHereCard
          hasMaterials={setup.materials}
          hasCustomers={setup.customers}
          supplier={supplier}
          onSkip={skipStart}
        />
      ) : (
        <>
          {pendingOrders > 0 && (
            <Link
              to="/orders"
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-bg px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <Inbox size={18} className="shrink-0 text-accent" />
                <span className="text-sm font-medium text-accent-text">
                  {pendingOrders === 1 ? t('dash.newOrdersOne') : t('dash.newOrdersMany', { count: pendingOrders })}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-accent-text">{t('dash.reviewOrders')}</span>
            </Link>
          )}

          {/* Finish what was started: approved, still no price. */}
          {unpriced.count > 0 && (
            <Link
              to={unpriced.count === 1 && unpriced.orderId ? `/quotations/new?order=${unpriced.orderId}` : '/orders?tab=approved'}
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950"
            >
              <div className="flex items-center gap-2.5">
                <ClipboardList size={18} className="shrink-0 text-amber-700 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {unpriced.count === 1 ? t('dash.unpricedOne') : t('dash.unpricedMany', { count: unpriced.count })}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-300">{t('ord.makeEstimate')}</span>
            </Link>
          )}

          {accepted.count > 0 && (
            <Link
              to={accepted.count === 1 && accepted.quotationId ? `/quotations/${accepted.quotationId}` : '/orders?tab=approved'}
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-bg px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <BadgeCheck size={18} className="shrink-0 text-accent" />
                <span className="text-sm font-medium text-accent-text">
                  {accepted.count === 1 ? t('dash.acceptedOne') : t('dash.acceptedMany', { count: accepted.count })}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-accent-text">{t('dash.convertNow')}</span>
            </Link>
          )}

          {lowStock.length > 0 && (
            <Link
              to="/materials"
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={18} className="shrink-0 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  {lowStock.length === 1
                    ? t('dash.lowStockOne', { name: mt(lowStock[0].name) })
                    : t('dash.lowStockMany', { count: lowStock.length })}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-red-700 dark:text-red-300">{t('dash.topUp')}</span>
            </Link>
          )}

          {hasRates && supplier && <RatesReminder supplierId={supplier.id} />}

          {/* A customer rings to ask today's rates — the most-asked question
              in this trade. This sends the list to their number while the
              call is still in mind. Only once something has a rate. */}
          {hasRates && supplier && (
            <button
              type="button"
              onClick={() => setSendingRates(true)}
              className="mb-4 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-surface"
            >
              <Tags size={20} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{t('dash.sendRates')}</span>
                <span className="block text-xs text-muted">{t('dash.sendRatesHint')}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </button>
          )}

          <Card className="mb-4">
            <div className="mb-2 text-xs font-semibold tracking-wide text-muted">{t('dash.today')}</div>
            {/* Content-width columns, not equal thirds. A bill count is two
                or three characters against nine for a rupee figure, so an
                even split left most of the first column empty and pushed sold
                and collected off to the right with a hole beside the count.
                Measured at 360px: 253px of the card's 296px today, 289px even
                with lakh figures, and it wraps rather than overflows past
                that. */}
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div>
                <div className="text-xl font-bold text-ink">{today.bills}</div>
                <div className="text-xs text-muted">{t(today.bills === 1 ? 'dash.bill' : 'dash.bills')}</div>
              </div>
              <div>
                <div className="text-xl font-bold text-ink">{formatINR(today.sold)}</div>
                <div className="text-xs text-muted">{t('dash.sold')}</div>
              </div>
              <div>
                <div className="text-xl font-bold text-accent">{formatINR(today.collected)}</div>
                <div className="text-xs text-muted">{t('dash.collected')}</div>
              </div>
            </div>
          </Card>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs font-medium text-muted">{t('dash.totalSales')}</div>
              <div className="mt-1 text-2xl font-bold text-ink">{formatINR(totals?.total_sales ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs font-medium text-muted">{t('dash.totalCollected')}</div>
              <div className="mt-1 text-2xl font-bold text-accent">{formatINR(totals?.total_collected ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs font-medium text-muted">{t('dash.totalPending')}</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{formatINR(totals?.total_pending ?? 0)}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('dash.recentInvoices')}</CardTitle>
                <Link to="/invoices" className="-m-2.5 p-2.5 text-xs font-semibold text-accent-text">
                  {t('common.viewAll')}
                </Link>
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {recentInvoices.length === 0 && <p className="py-3 text-sm text-muted">{t('dash.noInvoices')}</p>}
                {recentInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <div className="font-medium text-ink">{inv.invoice_no}</div>
                      <div className="text-xs text-muted">{inv.customers?.name ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatINR(inv.total)}</div>
                      <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                        {t(`status.${inv.status}`)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dash.recentCustomers')}</CardTitle>
                <Link to="/customers" className="-m-2.5 p-2.5 text-xs font-semibold text-accent-text">
                  {t('common.viewAll')}
                </Link>
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {recentCustomers.length === 0 && <p className="py-3 text-sm text-muted">{t('dash.noCustomers')}</p>}
                {recentCustomers.map((c) => (
                  <Link
                    key={c.id}
                    to={`/customers/${c.id}`}
                    state={{ customerName: c.name }}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-accent"
                  >
                    <div>
                      <div className="font-medium text-ink">{c.name}</div>
                      <div className="text-xs text-muted">{c.site ?? '—'}</div>
                    </div>
                    <Badge tone={c.status === 'Active' ? 'success' : 'neutral'}>
                      {t(c.status === 'Active' ? 'status.Active' : 'status.Inactive')}
                    </Badge>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {sendingRates && supplier && (
        <SendRatesModal supplier={supplier} materials={priced} onClose={() => setSendingRates(false)} />
      )}
    </div>
  )
}
