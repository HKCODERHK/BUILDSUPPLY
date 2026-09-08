import { supabase } from '@/lib/supabase'
import type { Payment, PaymentMode } from '@/lib/database.types'
import { logActivity } from './activityLog'

export interface PaymentWithInvoice extends Payment {
  invoices: { invoice_no: string; customers: { name: string } | null } | null
}

export async function listPayments(): Promise<PaymentWithInvoice[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, invoices(invoice_no, customers(name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as PaymentWithInvoice[]
}

export interface PaymentResult {
  /** How much actually went onto the bill. */
  applied: number
  /** Anything beyond what the bill still owed, which was NOT recorded. */
  leftOver: number
}

// A "split" payment is just multiple payment rows against one invoice
// (e.g. part Cash, part UPI) — recorded in a single call.
//
// Capped at what the bill still owes. Without the cap a supplier could record
// ₹67,000 against a ₹64,300 bill, which is exactly what happened to INV-1008:
// the customer's khata then read minus ₹2,700 and the dashboard collected
// more than it had ever billed. There is no advance/credit feature for the
// extra to live in, so it is refused and reported rather than absorbed.
export async function recordPayment(
  supplierId: string,
  invoiceId: string,
  splits: { amount: number; mode: PaymentMode }[],
): Promise<PaymentResult> {
  const offered = splits.filter((s) => s.amount > 0)
  if (offered.length === 0) return { applied: 0, leftOver: 0 }

  // Read the bill first: what it still owes decides how much may be taken.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('paid, total')
    .eq('id', invoiceId)
    .single()
  if (invoiceError) throw invoiceError

  const due = Math.max(0, Number(invoice.total) - Number(invoice.paid))
  const offeredTotal = offered.reduce((sum, s) => sum + s.amount, 0)

  // Trim the splits in order so the modes stay truthful — if ₹5,000 cash and
  // ₹3,000 UPI are offered against ₹6,000 due, that is ₹5,000 cash and
  // ₹1,000 UPI, not a flat scaling of both.
  let budget = due
  const rows: { supplier_id: string; invoice_id: string; amount: number; mode: PaymentMode }[] = []
  for (const s of offered) {
    if (budget <= 0) break
    const amount = Math.min(s.amount, budget)
    rows.push({ supplier_id: supplierId, invoice_id: invoiceId, amount, mode: s.mode })
    budget -= amount
  }

  const totalPaidNow = rows.reduce((sum, r) => sum + r.amount, 0)
  if (totalPaidNow <= 0) return { applied: 0, leftOver: offeredTotal }

  const { error } = await supabase.from('payments').insert(rows)
  if (error) throw error

  const newPaid = Number(invoice.paid) + totalPaidNow
  const status = newPaid >= Number(invoice.total) ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ paid: newPaid, status })
    .eq('id', invoiceId)
  if (updateError) throw updateError

  void logActivity('supplier', 'payment_recorded', { details: { invoice_id: invoiceId, amount: totalPaidNow } })
  void logActivity('supplier', 'invoice_updated', { details: { invoice_id: invoiceId, status } })

  return { applied: totalPaidNow, leftOver: offeredTotal - totalPaidNow }
}

export interface KhataPaymentResult {
  applied: { invoice_no: string; amount: number }[]
  leftOver: number
}

// Money handed over against the khata as a whole rather than one bill —
// which is how customers actually pay. Clears the oldest unpaid bills first
// so the supplier never has to work out which invoice it belongs to.
export async function recordCustomerPayment(
  supplierId: string,
  customerId: string,
  amount: number,
  mode: PaymentMode,
): Promise<KhataPaymentResult> {
  if (amount <= 0) return { applied: [], leftOver: 0 }

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, total, paid')
    .eq('customer_id', customerId)
    .neq('status', 'Paid')
    .neq('status', 'Cancelled')
    .order('created_at', { ascending: true })
  if (error) throw error

  let remaining = amount
  const applied: { invoice_no: string; amount: number }[] = []

  for (const inv of invoices ?? []) {
    if (remaining <= 0) break
    const due = Number(inv.total) - Number(inv.paid)
    if (due <= 0) continue
    const part = Math.min(due, remaining)
    await recordPayment(supplierId, inv.id, [{ amount: part, mode }])
    applied.push({ invoice_no: inv.invoice_no, amount: part })
    remaining -= part
  }

  // Anything beyond what they owed is handed back to the caller to report,
  // rather than silently parked as an unexplained credit.
  return { applied, leftOver: remaining }
}
