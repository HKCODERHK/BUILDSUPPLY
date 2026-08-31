import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dashboardTotals, listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { listCustomers } from '@/services/customers'
import { listPayments, type PaymentWithInvoice } from '@/services/payments'
import { listMaterials } from '@/services/materials'
import type { Customer, DashboardTotals, Material } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { AdminDashboardView } from '@/routes/admin/AdminDashboardView'

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
    <div className="mb-6 grid max-w-lg grid-cols-4 gap-2">
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

// "How did today go" — the question a supplier has when they shut the shop.
// Collected counts money taken in today whichever bill it was against, so a
// payment on last week's invoice still shows in today's takings.
function summariseToday(invoices: InvoiceWithCustomer[], payments: PaymentWithInvoice[]) {
  const todayKey = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
  const isToday = (iso: string) => new Date(iso).toLocaleDateString('en-CA') === todayKey

  const bills = invoices.filter((i) => i.status !== 'Cancelled' && isToday(i.created_at))
  return {
    bills: bills.length,
    sold: bills.reduce((sum, i) => sum + Number(i.total), 0),
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

  useEffect(() => {
    let active = true
    Promise.all([dashboardTotals(), listInvoices(), listCustomers(), listPayments(), listMaterials()])
      .then(([totalsData, invoices, customers, payments, materials]) => {
        if (!active) return
        setTotals(totalsData)
        setRecentInvoices(invoices.filter((i) => i.status !== 'Cancelled').slice(0, 5))
        setRecentCustomers(customers.slice(0, 5))
        setToday(summariseToday(invoices, payments))
        setLowStock(materials.filter((m) => m.stock_qty <= (m.low_stock_threshold ?? 5)))
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {supplier?.logo_url && (
          <img
            src={supplier.logo_url}
            alt={`${supplier.business_name} logo`}
            className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {t('dash.welcome', { name: supplier?.business_name ?? '' })}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t('dash.subtitle')}</p>
        </div>
      </div>

      <QuickActions />

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
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
            <div className="grid grid-cols-3 gap-2">
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
                <Link to="/invoices" className="-m-2.5 p-2.5 text-xs font-semibold text-accent">
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
                <Link to="/customers" className="-m-2.5 p-2.5 text-xs font-semibold text-accent">
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
