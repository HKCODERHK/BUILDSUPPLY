import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, LoaderCircle, Phone } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/LanguageToggle'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { downloadCustomerLedgerPdf, type LedgerEntry } from '@/lib/customerLedgerPdf'
import type { Customer, Supplier } from '@/lib/database.types'
import type { InvoiceWithCustomer } from '@/services/invoices'
import type { PaymentWithInvoice } from '@/services/payments'
import { getKhata, type KhataView } from '@/services/khata'
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
 */
export default function KhataPage() {
  const { token = '' } = useParams()
  const { t } = useLanguage()
  const [view, setView] = useState<KhataView | null>(null)
  const [failed, setFailed] = useState(false)
  const [showOlder, setShowOlder] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // Fixed when the page opens, so a re-render never moves the line.
  const [cutoff] = useState(() => Date.now() - RECENT_MS)

  useEffect(() => {
    getKhata(token)
      .then(setView)
      .catch(() => setFailed(true))
  }, [token])

  const found = view && view.found ? view : null

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
  // "Pay by UPI" (migration 029): only when the supplier switched it on, and
  // only for money actually due. Nothing is recorded until the supplier does.
  const upiUrl =
    found?.upi_id && found.pending > 0.005
      ? upiPayUrl({ upiId: found.upi_id, payee: found.supplier.business_name, amount: Math.round(Number(found.pending) * 100) / 100, note: found.customer.name })
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

  function describe(e: LedgerEntry) {
    if (e.type === 'Opening') return { title: t('khata.opening'), sub: null }
    if (e.type === 'Invoice') return { title: t('khata.bill', { no: e.ref }), sub: null }
    const refs = e.ref.replace('opening balance', t('khata.opening'))
    return {
      title: e.mode ? t('khata.payment', { mode: t(`mode.${e.mode}`) }) : t('khata.payment', { mode: '' }),
      sub: refs ? t('khata.paidFor', { refs }) : t('khata.advanceReceived'),
    }
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
              <div className="text-sm text-muted">{t('khata.for', { name: found.customer.name })}</div>
              {found.pending > 0.005 && (
                <div>
                  <div className="text-xs text-muted">{t('khata.due')}</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{formatINR(Number(found.pending))}</div>
                </div>
              )}
              {found.advance > 0.005 && (
                <div>
                  <div className="text-xs text-muted">{t('khata.advance')}</div>
                  <div className="text-xl font-bold text-accent">{formatINR(Number(found.advance))}</div>
                </div>
              )}
              {found.pending <= 0.005 && found.advance <= 0.005 && (
                <div className="text-sm font-semibold text-accent">{t('khata.settled')}</div>
              )}
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
            </Card>

            {upiUrl && found.upi_id && (
              <Card className="flex flex-col items-center gap-3 text-center">
                <div className="self-start text-sm font-semibold text-ink">{t('upi.payTitle')}</div>
                <div className="rounded-xl bg-white p-2">
                  <QrCode text={upiUrl} size={200} label={t('upi.payTitle')} />
                </div>
                <div className="text-xs text-muted">{found.upi_id}</div>
                {/* On the customer's own phone there is nothing to scan: this opens their UPI app instead. */}
                <a href={upiUrl} className="w-full">
                  <Button className="w-full">{t('upi.openApp', { amount: formatINR(Number(found.pending)) })}</Button>
                </a>
                <p className="text-xs text-muted">{t('upi.payHint', { business: found.supplier.business_name })}</p>
              </Card>
            )}

            <Card>
              <div className="mb-2 text-sm font-semibold text-ink">{t('khata.history')}</div>
              {newestFirst.length === 0 ? (
                <p className="text-sm text-muted">{t('khata.none')}</p>
              ) : (
                <div className="flex flex-col divide-y divide-border text-sm">
                  {shown.map((e, i) => {
                    const d = describe(e)
                    return (
                      <div key={i} className="flex items-start justify-between gap-3 py-2.5">
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
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setShowOlder(true)}>
                  {t('khata.showOlder', { count: olderCount })}
                </Button>
              )}
            </Card>

            <p className="px-1 text-center text-xs text-muted">{t('khata.readOnly', { business: found.supplier.business_name })}</p>
          </>
        )}
      </main>
    </div>
  )
}
