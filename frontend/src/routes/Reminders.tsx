import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { listCustomers } from '@/services/customers'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { listPayments, type PaymentWithInvoice } from '@/services/payments'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { customerLedgerPdfFile } from '@/lib/customerLedgerPdf'
import { downloadFile } from '@/lib/downloadFile'
import { logActivity } from '@/services/activityLog'
import { useAuth } from '@/context/AuthContext'
import type { Customer } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

interface PendingCustomer extends Customer {
  pending: number
}

export default function Reminders() {
  const { supplier } = useAuth()
  const [pending, setPending] = useState<PendingCustomer[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listCustomers(), listInvoices(), listPayments()]).then(([customers, invs, pays]) => {
      const owed = new Map<string, number>()
      invs.forEach((inv) => {
        if (!inv.customer_id || inv.status === 'Cancelled') return
        owed.set(inv.customer_id, (owed.get(inv.customer_id) ?? 0) + (Number(inv.total) - Number(inv.paid)))
      })
      setPending(
        customers
          .map((c) => ({ ...c, pending: owed.get(c.id) ?? 0 }))
          .filter((c) => c.pending > 0)
          .sort((a, b) => b.pending - a.pending),
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
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: message, title: `Statement — ${c.name}` })
          void logActivity('supplier', 'reminder_sent', { details: { customer: c.name, format: 'pdf_share' } })
          return
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
        }
      }
      // No native file sharing here — download the statement so it can be
      // attached by hand, and open WhatsApp with the message ready.
      downloadFile(file)
      openWhatsAppShare(c.phone, message)
      void logActivity('supplier', 'reminder_sent', { details: { customer: c.name, format: 'text_fallback' } })
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Pending Reminders"
        subtitle="Sends the customer their full statement PDF — nothing goes out automatically"
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {pending.length === 0 && <p className="py-3 text-sm text-muted">No pending balances — everyone's paid up.</p>}
            {pending.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{c.name}</div>
                  {c.phone ? (
                    <a href={`tel:${c.phone}`} className="text-xs text-muted hover:text-accent hover:underline">
                      {c.phone}
                    </a>
                  ) : (
                    <div className="text-xs text-muted">No phone on file</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-red-600">{formatINR(c.pending)}</span>
                  <Button size="sm" variant="outline" disabled={!c.phone || sendingId === c.id} onClick={() => sendReminder(c)}>
                    <WhatsAppIcon size={14} /> {sendingId === c.id ? 'Preparing…' : 'Remind'}
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
