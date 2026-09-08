import type { InvoiceWithCustomer } from '@/services/invoices'
import type { PaymentWithInvoice } from '@/services/payments'
import type { LedgerEntry } from './customerLedgerPdf'
import { localDateKey } from './localDate'

// Bills and payments merged into one date-ordered account statement.
// Shared by the Reports page (where it can be filtered) and the Reminders
// page (where the full history is attached to a payment reminder), so both
// produce an identical statement.
export function buildCustomerLedger(opts: {
  customerId: string
  invoices: InvoiceWithCustomer[]
  payments: PaymentWithInvoice[]
  site?: string
  dateFrom?: string
  dateTo?: string
}): { openingBalance: number; entries: LedgerEntry[] } {
  const { customerId, invoices, payments, site, dateFrom, dateTo } = opts

  const invoiceCustomer = new Map(invoices.map((inv) => [inv.id, inv.customer_id]))
  const invoiceSite = new Map(invoices.map((inv) => [inv.id, inv.site]))

  const all: Omit<LedgerEntry, 'balance'>[] = []
  invoices
    .filter((inv) => inv.customer_id === customerId && inv.status !== 'Cancelled' && (!site || inv.site === site))
    .forEach((inv) =>
      all.push({ date: inv.created_at, type: 'Invoice', ref: inv.invoice_no, mode: null, debit: inv.total, credit: 0 }),
    )
  payments
    .filter((p) => invoiceCustomer.get(p.invoice_id) === customerId && (!site || invoiceSite.get(p.invoice_id) === site))
    .forEach((p) =>
      all.push({
        date: p.created_at,
        type: 'Payment',
        ref: p.invoices?.invoice_no ?? '—',
        mode: p.mode,
        debit: 0,
        credit: p.amount,
      }),
    )
  all.sort((a, b) => a.date.localeCompare(b.date))

  // Anything before `dateFrom` is folded into an opening balance rather than
  // dropped, so a filtered ledger still adds up to the real balance.
  let openingBalance = 0
  const inRange: Omit<LedgerEntry, 'balance'>[] = []
  for (const e of all) {
    // The supplier's own day, not UTC's — see localDateKey.
    const day = localDateKey(e.date)
    if (dateFrom && day < dateFrom) {
      openingBalance += e.debit - e.credit
      continue
    }
    if (dateTo && day > dateTo) continue
    inRange.push(e)
  }

  let balance = openingBalance
  const entries = inRange.map((e) => {
    balance += e.debit - e.credit
    return { ...e, balance }
  })
  return { openingBalance, entries }
}
