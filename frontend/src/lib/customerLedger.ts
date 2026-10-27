import type { InvoiceWithCustomer } from '@/services/invoices'
import { activeAllocations, type PaymentWithInvoice } from '@/services/payments'
import type { LedgerEntry } from './customerLedgerPdf'
import { localDateKey } from './localDate'

// Bills and payments merged into one date-ordered account statement.
// Shared by the Reports page (where it can be filtered) and the Reminders
// page (where the full history is attached to a payment reminder), so both
// produce an identical statement.
//
// Payments are matched to the customer by their own customer_id, not through
// a bill: an advance has no bill yet, and still belongs on the statement.
export function buildCustomerLedger(opts: {
  customerId: string
  invoices: InvoiceWithCustomer[]
  payments: PaymentWithInvoice[]
  site?: string
  dateFrom?: string
  dateTo?: string
}): { openingBalance: number; entries: LedgerEntry[] } {
  const { customerId, invoices, payments, site, dateFrom, dateTo } = opts

  const all: Omit<LedgerEntry, 'balance'>[] = []
  // Entries a later correction took back (052). The shop's own list says so
  // through the reversal pointing at them; the khata link's says it outright.
  const reversedIds = new Set(payments.filter((p) => Number(p.amount) < 0).map((p) => p.corrects_payment_id))
  invoices
    .filter((inv) => inv.customer_id === customerId && inv.status !== 'Cancelled' && (!site || inv.site === site))
    .forEach((inv) =>
      all.push({
        date: inv.created_at,
        type: inv.kind === 'opening' ? 'Opening' : 'Invoice',
        ref: inv.invoice_no,
        mode: null,
        debit: Number(inv.total),
        credit: 0,
      }),
    )
  payments
    .filter((p) => p.customer_id === customerId)
    .forEach((p) => {
      // A correction's reversal (migration 052): it takes a wrong entry back,
      // so it adds to what is owed. The wrong entry itself stays above it,
      // which is what makes the statement add up and shows what happened.
      // Narrowed to one site it has nothing to say: the wrong entry's money
      // left that site's bills when it was corrected.
      if (Number(p.amount) < 0) {
        if (site) return
        all.push({
          date: p.created_at,
          type: 'Correction',
          ref: p.correction_reason ?? (p as { reason?: string | null }).reason ?? '',
          mode: p.mode,
          debit: 0,
          credit: Number(p.amount),
        })
        return
      }
      // Narrowed to one site, only the part of a receipt that went onto that
      // site's bills belongs; an advance can't be pinned to a site.
      const onBills = activeAllocations(p).filter((a) => !site || a.invoices?.site === site)
      const credit = site ? onBills.reduce((sum, a) => sum + Number(a.amount), 0) : Number(p.amount)
      if (credit <= 0) return
      const corrected = reversedIds.has(p.id) || !!(p as { reversed?: boolean }).reversed
      all.push({
        date: p.created_at,
        type: 'Payment',
        // Empty for an advance — the PDF says "Advance received".
        ref: onBills
          .map((a) => (a.invoices ? (a.invoices.kind === 'opening' ? 'opening balance' : a.invoices.invoice_no) : ''))
          .filter(Boolean)
          .join(', '),
        mode: p.mode,
        debit: 0,
        credit,
        ...(corrected ? { corrected: true } : {}),
      })
    })
  all.sort((a, b) => a.date.localeCompare(b.date))

  // Anything before `dateFrom` is folded into a brought-forward balance
  // rather than dropped, so a filtered ledger still adds up to the real one.
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
