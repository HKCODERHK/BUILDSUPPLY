import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { EmptyState } from '@/components/EmptyState'
import { listCustomers } from '@/services/customers'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { listPayments, type PaymentWithInvoice } from '@/services/payments'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { customerLedgerPdfFile } from '@/lib/customerLedgerPdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { oldestPendingDays, overdueTextClass } from '@/lib/overdue'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { Customer } from '@/lib/database.types'
import { TruckLoader } from '@/components/TruckLoader'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

interface PendingCustomer extends Customer {
  pending: number
  days: number | null
}

export default function Reminders() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [pending, setPending] = useState<PendingCustomer[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listCustomers(), listInvoices(), listPayments()]).then(([customers, invs, pays]) => {
      const owed = new Map<string, number>()
      const byCustomer = new Map<string, InvoiceWithCustomer[]>()
      invs.forEach((inv) => {
        if (!inv.customer_id || inv.status === 'Cancelled') return
        owed.set(inv.customer_id, (owed.get(inv.customer_id) ?? 0) + (Number(inv.total) - Number(inv.paid)))
        const list = byCustomer.get(inv.customer_id) ?? []
        list.push(inv)
        byCustomer.set(inv.customer_id, list)
      })
      setPending(
        customers
          .map((c) => ({ ...c, pending: owed.get(c.id) ?? 0, days: oldestPendingDays(byCustomer.get(c.id) ?? []) }))
          .filter((c) => c.pending > 0)
          // Oldest debt first. Chasing by age beats chasing by size — a small
          // amount owed for four months is the one that turns into a bad debt.
          .sort((a, b) => (b.days ?? 0) - (a.days ?? 0) || b.pending - a.pending),
      )
      setInvoices(invs)
      setPayments(pays)
      setLoading(false)
    })
  }, [])

  // Sends the same full statement PDF the Reports page produces — the
  // customer gets the whole record (every bill, every payment and its mode,
  // the balance) rather than just a number in a chat message.
  async function sendReminder(c: PendingCustomer) {
    if (!supplier) return
    setSendingId(c.id)
    try {
      const { openingBalance, entries } = buildCustomerLedger({ customerId: c.id, invoices, payments })
      const message =
        `Hi ${c.name}, a gentle reminder that your pending balance with us is ${formatINR(c.pending)}. ` +
        `The attached statement shows every bill and payment. Please clear it at your earliest convenience.`

      const file = await customerLedgerPdfFile(supplier, c, { entries, openingBalance })
      const outcome = await shareDocumentOnWhatsApp({
        file,
        message,
        title: `Statement — ${c.name}`,
      })
      if (outcome === 'shared') {
        void logActivity('supplier', 'reminder_sent', {
          details: { customer: c.name, format: 'pdf_share' },
        })
      }
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div>
      <PageHeader title={t('rem.title')} subtitle={t('rem.subtitle')} />

      {loading ? (
        <TruckLoader />
      ) : pending.length === 0 ? (
        // The one empty state that is good news, so it gets a tick rather than
        // an object, and no button — there is deliberately nothing to do here.
        <EmptyState
          art="allClear"
          title={t('empty.remindersTitle')}
          hint={t('empty.remindersHint')}
        />
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {pending.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{c.name}</div>
                  {c.phone ? (
                    <a href={`tel:${c.phone}`} className="-m-2 inline-block p-2 text-xs text-muted hover:text-accent hover:underline">
                      {c.phone}
                    </a>
                  ) : (
                    <div className="text-xs text-muted">{t('rem.noPhone')}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="font-semibold text-red-600">{formatINR(c.pending)}</div>
                    {c.days !== null && (
                      <div className={`text-[11px] font-medium ${overdueTextClass(c.days)}`}>
                        {c.days === 0
                          ? t('overdue.today')
                          : c.days === 1
                            ? t('overdue.oneDay')
                            : t('overdue.days', { days: c.days })}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" disabled={!c.phone || sendingId === c.id} onClick={() => sendReminder(c)}>
                    <WhatsAppIcon size={14} /> {sendingId === c.id ? t('common.preparing') : t('rem.remind')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
