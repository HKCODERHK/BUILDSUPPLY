import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listInvoices, listAllInvoiceItems, type InvoiceWithCustomer, type InvoiceItemWithInvoice } from '@/services/invoices'
import { listCustomers } from '@/services/customers'
import { listPayments, type PaymentWithInvoice } from '@/services/payments'
import { listMaterials } from '@/services/materials'
import type { Customer, Material } from '@/lib/database.types'
import { downloadReportPdf } from '@/lib/reportPdf'
import { downloadCustomerLedgerPdf } from '@/lib/customerLedgerPdf'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

function isLowStock(m: Material) {
  const threshold = m.low_stock_threshold ?? 5
  return m.stock_qty <= threshold
}

function dateOnly(iso: string) {
  return iso.slice(0, 10)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface ReportCardProps {
  title: string
  hint: string
  // Passed in rather than translated here so ReportCard stays a dumb
  // presentational component with no dependency on the language context.
  label: string
  disabled?: boolean
  onDownload: () => void
}

function ReportCard({ title, hint, label, disabled, onDownload }: ReportCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-muted">{hint}</p>
      <Button variant="outline" disabled={disabled} onClick={onDownload}>
        <Download size={15} /> {label}
      </Button>
    </Card>
  )
}

export default function Reports() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([])
  const [items, setItems] = useState<InvoiceItemWithInvoice[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [site, setSite] = useState('')

  useEffect(() => {
    Promise.all([listInvoices(), listCustomers(), listPayments(), listAllInvoiceItems(), listMaterials()]).then(
      ([inv, cust, pay, itms, mats]) => {
        setInvoices(inv)
        setCustomers(cust)
        setPayments(pay)
        setItems(itms)
        setMaterials(mats)
        setLoading(false)
      },
    )
  }, [])

  // Sites come off the bills themselves now, not off customers — one
  // contractor can run several sites at once. Once a customer is chosen the
  // list narrows to just their sites, so the ledger's site picker only ever
  // offers sites that customer actually has bills against.
  const sites = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .filter((inv) => !customerId || inv.customer_id === customerId)
            .map((inv) => inv.site)
            .filter((s): s is string => !!s),
        ),
      ).sort(),
    [invoices, customerId],
  )

  // Switching customer can strand a site that belongs to someone else.
  useEffect(() => {
    if (site && !sites.includes(site)) setSite('')
  }, [sites, site])
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])

  function inDateRange(iso: string) {
    const d = dateOnly(iso)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    return true
  }

  function matchesCustomerAndSite(invCustomerId: string | null, invSite: string | null) {
    if (customerId && invCustomerId !== customerId) return false
    if (site && invSite !== site) return false
    return true
  }

  const filteredInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status !== 'Cancelled' && inDateRange(inv.created_at) && matchesCustomerAndSite(inv.customer_id, inv.site),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, dateFrom, dateTo, customerId, site],
  )

  function salesReportRows(): (string | number)[][] {
    return filteredInvoices.map((inv) => [
      inv.invoice_no,
      formatDate(inv.created_at),
      inv.customers?.name ?? '—',
      inv.site ?? '—',
      inv.total,
      inv.paid,
      inv.status,
    ])
  }

  // Derived from the filtered invoices rather than the customer_balances
  // view, so "who owes me on this site" actually works — the view can only
  // total a customer across every site at once.
  function pendingAmountRows(): (string | number)[][] {
    const owed = new Map<string, { pending: number; sites: Set<string> }>()
    filteredInvoices.forEach((inv) => {
      if (!inv.customer_id) return
      const due = Number(inv.total) - Number(inv.paid)
      if (due <= 0) return
      const cur = owed.get(inv.customer_id) ?? { pending: 0, sites: new Set<string>() }
      cur.pending += due
      if (inv.site) cur.sites.add(inv.site)
      owed.set(inv.customer_id, cur)
    })
    return Array.from(owed.entries())
      .sort((a, b) => b[1].pending - a[1].pending)
      .map(([id, v]) => {
        const c = customerMap.get(id)
        return [c?.name ?? '—', c?.phone ?? '—', Array.from(v.sites).join(', ') || '—', v.pending]
      })
  }

  const selectedCustomer = customerId ? customerMap.get(customerId) ?? null : null

  function customerLedgerData() {
    if (!customerId) return { openingBalance: 0, entries: [] }
    return buildCustomerLedger({
      customerId,
      invoices,
      payments,
      site: site || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
  }

  function materialWiseSalesRows(): (string | number)[][] {
    const totals = new Map<string, { qty: number; amount: number }>()
    items
      .filter(
        (it) =>
          it.invoices && inDateRange(it.invoices.created_at) && matchesCustomerAndSite(it.invoices.customer_id, it.invoices.site),
      )
      .forEach((it) => {
        const key = it.description || '—'
        const cur = totals.get(key) ?? { qty: 0, amount: 0 }
        cur.qty += Number(it.qty)
        cur.amount += Number(it.amount)
        totals.set(key, cur)
      })
    return Array.from(totals.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, t]) => [name, t.qty, t.amount])
  }

  // Category is dropped — the material name already carries the type
  // ("Cement — UltraTech — PPC • 50 KG"), so it only added a column.
  function stockReportRows(): (string | number)[][] {
    return materials.map((m) => [
      m.name,
      `${m.stock_qty} ${m.stock_unit ?? ''}`.trim(),
      m.low_stock_threshold != null ? `${m.low_stock_threshold} ${m.stock_unit ?? ''}`.trim() : '—',
      isLowStock(m) ? 'Low stock' : 'Healthy',
    ])
  }

  function runReport(
    title: string,
    head: string[],
    rows: (string | number)[][],
    fileName: string,
    moneyColumns?: number[],
  ) {
    if (!supplier) return
    void downloadReportPdf({
      supplier,
      title,
      head,
      rows,
      moneyColumns,
      fileName,
      filters: {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        customerName: selectedCustomer?.name,
        site: site || undefined,
      },
    })
    void logActivity('supplier', 'report_exported', { details: { report: title, format: 'pdf', rows: rows.length } })
  }

  return (
    <div>
      <PageHeader title={t('rep.title')} subtitle={t('rep.subtitle')} />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="date-from">{t('rep.from')}</Label>
            <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="date-to">{t('rep.to')}</Label>
            <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="filter-customer">{t('common.customer')}</Label>
            <select
              id="filter-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">{t('rep.allCustomers')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="filter-site">{t('common.site')}</Label>
            <select
              id="filter-site"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">
                {selectedCustomer ? t('rep.allSitesOf', { name: selectedCustomer.name }) : t('rep.allSites')}
              </option>
              {sites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(dateFrom || dateTo || customerId || site) && (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-soft"
            onClick={() => {
              setDateFrom('')
              setDateTo('')
              setCustomerId('')
              setSite('')
            }}
          >
            {t('rep.clearFilters')}
          </button>
        )}
      </Card>

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReportCard
            title={t('rep.dailySales')}
            hint={t('rep.dailyHint', { count: filteredInvoices.length })}
            label={t('inv.download')}
            onDownload={() =>
              runReport(
                'Daily Sales Report',
                ['Invoice', 'Date', 'Customer', 'Site', 'Total', 'Paid', 'Status'],
                salesReportRows(),
                'daily-sales.pdf',
                [4, 5],
              )
            }
          />

          <ReportCard
            title={t('rep.monthlySales')}
            hint={t('rep.monthlyHint', { count: filteredInvoices.length })}
            label={t('inv.download')}
            onDownload={() =>
              runReport(
                'Monthly Sales Report',
                ['Invoice', 'Date', 'Customer', 'Site', 'Total', 'Paid', 'Status'],
                salesReportRows(),
                'monthly-sales.pdf',
                [4, 5],
              )
            }
          />

          <ReportCard
            title={t('rep.pendingAmount')}
            hint={t('rep.pendingHint', { count: pendingAmountRows().length })}
            label={t('inv.download')}
            onDownload={() =>
              runReport('Pending Amount Report', ['Name', 'Phone', 'Site', 'Pending'], pendingAmountRows(), 'pending-amount.pdf', [3])
            }
          />

          <ReportCard
            title={t('rep.customerLedger')}
            label={t('inv.download')}
            hint={
              selectedCustomer
                ? t('rep.ledgerHint', {
                    name: selectedCustomer.name,
                    scope: site
                      ? t('rep.scopeOneSite', { site })
                      : sites.length > 1
                        ? t('rep.scopeManySites', { count: sites.length })
                        : t('rep.scopeAllSites'),
                  })
                : t('rep.ledgerPick')
            }
            disabled={!customerId}
            onDownload={() => {
              if (!supplier || !selectedCustomer) return
              const { openingBalance, entries } = customerLedgerData()
              void downloadCustomerLedgerPdf(supplier, selectedCustomer, {
                entries,
                openingBalance,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                site: site || undefined,
              })
              void logActivity('supplier', 'report_exported', {
                details: { report: 'Customer Ledger', format: 'pdf', rows: entries.length },
              })
            }}
          />

          <ReportCard
            title={t('rep.materialWise')}
            hint={t('rep.materialHint', { count: materialWiseSalesRows().length })}
            label={t('inv.download')}
            onDownload={() =>
              runReport(
                'Material Wise Sales',
                ['Material', 'Qty Sold', 'Sales Amount'],
                materialWiseSalesRows(),
                'material-wise-sales.pdf',
                [2],
              )
            }
          />

          <ReportCard
            title={t('rep.stockReport')}
            hint={t('rep.stockHint', { count: materials.length })}
            label={t('inv.download')}
            onDownload={() =>
              runReport('Stock Report', ['Material', 'Current', 'Min', 'Status'], stockReportRows(), 'stock-report.pdf')
            }
          />
        </div>
      )}
    </div>
  )
}
