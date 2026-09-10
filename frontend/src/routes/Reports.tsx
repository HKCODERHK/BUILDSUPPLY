import { useEffect, useMemo, useState } from 'react'
import { Download, ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import {
  isBill,
  listInvoices,
  listAllInvoiceItems,
  type InvoiceWithCustomer,
  type InvoiceItemWithInvoice,
} from '@/services/invoices'
import { listCustomers } from '@/services/customers'
import { listPayments, type PaymentWithInvoice } from '@/services/payments'
import { listMaterials } from '@/services/materials'
import type { Customer, Material } from '@/lib/database.types'
import { downloadReportPdf, reportPdfFile, type ReportSpec } from '@/lib/reportPdf'
import { customerLedgerPdfFile, downloadCustomerLedgerPdf } from '@/lib/customerLedgerPdf'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { localDateKey } from '@/lib/localDate'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { TruckLoader } from '@/components/TruckLoader'

function isLowStock(m: Material) {
  const threshold = m.low_stock_threshold ?? 5
  return m.stock_qty <= threshold
}

// The day the supplier would say this happened on, which is their local day
// and not UTC's — the date pickers below are local too, so both sides have to
// agree. See lib/localDate.
const dateOnly = localDateKey

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// A date picker's YYYY-MM-DD, read as the supplier's own day.
function formatDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

type ReportRows = (string | number)[][]

interface ReportCardProps {
  title: string
  hint: string
  // Passed in rather than translated here so ReportCard stays a dumb
  // presentational component with no dependency on the language context.
  label: string
  disabled?: boolean
  onDownload: () => void
  /** Sends the same PDF on WhatsApp, as a real file — see shareDocument. */
  onShare: () => void
  shareLabel: string
  sharing?: boolean
}

function ReportCard({ title, hint, label, disabled, onDownload, onShare, shareLabel, sharing }: ReportCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-muted">{hint}</p>
      {/* A size down on phones, the way the customer page's header buttons
          are: at full size "पीडीएफ डाउनलोड" + "WhatsApp" is 303px against the
          296px a card has on a 360px phone, so Hindi and Marathi wrapped.
          flex-wrap stays as the backstop if a label ever grows. */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="sm:h-10 sm:px-4 sm:text-sm" disabled={disabled} onClick={onDownload}>
          <Download size={15} /> {label}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="sm:h-10 sm:px-4 sm:text-sm"
          disabled={disabled || sharing}
          onClick={onShare}
        >
          <WhatsAppIcon size={15} /> {shareLabel}
        </Button>
      </div>
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
  // The ledger is the one a supplier actually sends to a customer; the rest
  // are occasional. Folding them away keeps this screen to one decision.
  const [showOtherReports, setShowOtherReports] = useState(false)
  // The report being turned into a PDF for WhatsApp, so only its button says so.
  const [sharingId, setSharingId] = useState<string | null>(null)

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

  // Sales are bills only; an opening balance is money owed, not a sale. It
  // still counts in the pending report and the ledger, which use every row.
  const filteredBills = filteredInvoices.filter(isBill)

  function salesReportRows(): ReportRows {
    return filteredBills.map((inv) => [
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
  function pendingAmountRows(): ReportRows {
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

  // What both ledger buttons print, so Download and WhatsApp can never differ.
  function ledgerInput() {
    const { openingBalance, entries } = customerLedgerData()
    return {
      entries,
      openingBalance,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      site: site || undefined,
    }
  }

  function materialWiseSalesRows(): ReportRows {
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
  function stockReportRows(): ReportRows {
    return materials.map((m) => [
      m.name,
      `${m.stock_qty} ${m.stock_unit ?? ''}`.trim(),
      m.low_stock_threshold != null ? `${m.low_stock_threshold} ${m.stock_unit ?? ''}`.trim() : '—',
      isLowStock(m) ? 'Low stock' : 'Healthy',
    ])
  }

  function shareLabel(id: string) {
    return sharingId === id ? t('common.preparing') : 'WhatsApp'
  }

  // Every WhatsApp button on this screen: a real PDF through the phone's
  // share sheet, where the supplier picks the recipient and presses Send.
  async function sharePdf(
    id: string,
    makeFile: () => Promise<File>,
    message: string,
    title: string,
    details: Record<string, unknown>,
  ) {
    if (sharingId) return
    setSharingId(id)
    try {
      const file = await makeFile()
      const outcome = await shareDocumentOnWhatsApp({ file, message, title })
      if (outcome === 'shared') {
        void logActivity('supplier', 'report_shared', { details: { ...details, format: 'pdf_share' } })
      }
    } finally {
      setSharingId(null)
    }
  }

  // The one report here that leaves the business: it goes to the customer it
  // belongs to, so it reads like the other messages a customer gets.
  function shareLedger() {
    const s = supplier
    const c = selectedCustomer
    if (!s || !c) return
    const input = ledgerInput()
    // The statement's own last line — as of the "To" date when one is set.
    const closing = input.entries.length ? input.entries[input.entries.length - 1].balance : input.openingBalance
    const message =
      `Hi ${c.name}, here is your account statement${site ? ` for ${site}` : ''}. ` +
      (closing > 0 ? `Closing balance: ${formatINR(closing)}.` : 'Your account is fully settled. Thank you!')
    void sharePdf('ledger', () => customerLedgerPdfFile(s, c, input), message, `Statement — ${c.name}`, {
      report: 'Customer Ledger',
      rows: input.entries.length,
    })
  }

  function reportSpec(
    title: string,
    head: string[],
    rows: ReportRows,
    fileName: string,
    moneyColumns?: number[],
  ): ReportSpec | null {
    if (!supplier) return null
    return {
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
    }
  }

  // The other reports usually go to an accountant or a partner, not a
  // customer, so the message just says what the report is and what it covers.
  function reportMessage(title: string) {
    const period =
      dateFrom || dateTo
        ? `${dateFrom ? formatDay(dateFrom) : 'the beginning'} to ${dateTo ? formatDay(dateTo) : 'today'}`
        : 'all dates'
    const scope = [selectedCustomer?.name, site].filter(Boolean).join(', ')
    return `${supplier?.business_name ?? ''} — ${title}, ${period}${scope ? ` (${scope})` : ''}.`
  }

  // Both buttons of one report from a single description of it, so Download
  // and WhatsApp can never produce different documents.
  function reportActions(
    id: string,
    title: string,
    head: string[],
    rows: () => ReportRows,
    fileName: string,
    moneyColumns?: number[],
  ) {
    return {
      onDownload: () => {
        const spec = reportSpec(title, head, rows(), fileName, moneyColumns)
        if (!spec) return
        void downloadReportPdf(spec)
        void logActivity('supplier', 'report_exported', { details: { report: title, format: 'pdf', rows: spec.rows.length } })
      },
      onShare: () => {
        const spec = reportSpec(title, head, rows(), fileName, moneyColumns)
        if (!spec) return
        void sharePdf(id, () => reportPdfFile(spec), reportMessage(title), title, { report: title, rows: spec.rows.length })
      },
      shareLabel: shareLabel(id),
      sharing: sharingId === id,
    }
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
            className="mt-3 text-xs font-semibold text-accent-text hover:text-accent"
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
        <TruckLoader />
      ) : (
        <>
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
            const input = ledgerInput()
            void downloadCustomerLedgerPdf(supplier, selectedCustomer, input)
            void logActivity('supplier', 'report_exported', {
              details: { report: 'Customer Ledger', format: 'pdf', rows: input.entries.length },
            })
          }}
          onShare={shareLedger}
          shareLabel={shareLabel('ledger')}
          sharing={sharingId === 'ledger'}
        />

        <button
            onClick={() => setShowOtherReports((prev) => !prev)}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left hover:bg-surface"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">{t('rep.otherReports')}</span>
              <span className="block text-xs text-muted">{t('rep.otherReportsHint', { count: 5 })}</span>
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-muted transition-transform ${showOtherReports ? 'rotate-180' : ''}`}
            />
          </button>

          {showOtherReports && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReportCard
            title={t('rep.dailySales')}
            hint={t('rep.dailyHint', { count: filteredBills.length })}
            label={t('inv.download')}
            {...reportActions(
              'daily',
              'Daily Sales Report',
              ['Invoice', 'Date', 'Customer', 'Site', 'Total', 'Paid', 'Status'],
              salesReportRows,
              'daily-sales.pdf',
              [4, 5],
            )}
          />

          <ReportCard
            title={t('rep.monthlySales')}
            hint={t('rep.monthlyHint', { count: filteredBills.length })}
            label={t('inv.download')}
            {...reportActions(
              'monthly',
              'Monthly Sales Report',
              ['Invoice', 'Date', 'Customer', 'Site', 'Total', 'Paid', 'Status'],
              salesReportRows,
              'monthly-sales.pdf',
              [4, 5],
            )}
          />

          <ReportCard
            title={t('rep.pendingAmount')}
            hint={t('rep.pendingHint', { count: pendingAmountRows().length })}
            label={t('inv.download')}
            {...reportActions(
              'pending',
              'Pending Amount Report',
              ['Name', 'Phone', 'Site', 'Pending'],
              pendingAmountRows,
              'pending-amount.pdf',
              [3],
            )}
          />

          <ReportCard
            title={t('rep.materialWise')}
            hint={t('rep.materialHint', { count: materialWiseSalesRows().length })}
            label={t('inv.download')}
            {...reportActions(
              'material',
              'Material Wise Sales',
              ['Material', 'Qty Sold', 'Sales Amount'],
              materialWiseSalesRows,
              'material-wise-sales.pdf',
              [2],
            )}
          />

          <ReportCard
            title={t('rep.stockReport')}
            hint={t('rep.stockHint', { count: materials.length })}
            label={t('inv.download')}
            {...reportActions('stock', 'Stock Report', ['Material', 'Current', 'Min', 'Status'], stockReportRows, 'stock-report.pdf')}
          />
          </div>
          )}
        </>
      )}
    </div>
  )
}
