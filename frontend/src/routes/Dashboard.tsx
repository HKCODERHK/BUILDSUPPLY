import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, AlertTriangle } from 'lucide-react'
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
import type { Customer, DashboardTotals, Invoice, Material, Payment } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { AdminDashboardView } from '@/routes/admin/AdminDashboardView'
import { StartHereCard } from '@/components/StartHereCard'
import { DraftBanners } from '@/components/Drafts'
import { TruckLoader } from '@/components/TruckLoader'

// Jump straight into the create flow for each — no extra click on the
// destination page. Customers/Payments/Stock read `?new=1` to auto-open
// their add modal on load; Bill already has a dedicated create page.
const QUICK_ACTIONS: { labelKey: TranslationKey; to: string }[] = [
  { labelKey: 'dash.quickBill', to: '/invoices/new' },
  { labelKey: 'dash.quickCustomer', to: '/customers?new=1' },
  { labelKey: 'dash.quickPayment', to: '/payments?new=1' },
  { labelKey: 'dash.quickStock', to: '/materials?stock=1' },
]

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
        {supplier?.logo_url && (
          <img
            src={supplier.logo_url}
            alt={`${supplier.business_name} logo`}
            className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
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
    </div>
  )
}
