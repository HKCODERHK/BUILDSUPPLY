import { supabase } from '@/lib/supabase'
import type { InvoiceKind, Payment, PaymentMode } from '@/lib/database.types'
import { logActivity } from './activityLog'
import { callRpc, fetchAll } from './db'

export interface PaymentWithInvoice extends Payment {
  // Null for an advance — money received with no bill to go on yet.
  invoices: { invoice_no: string; kind: InvoiceKind } | null
  customers: { name: string } | null
}

const PAYMENT_SELECT = '*, invoices(invoice_no, kind), customers(name)'

export async function listPayments(): Promise<PaymentWithInvoice[]> {
  return fetchAll<PaymentWithInvoice>((from, to) =>
    supabase
      .from('payments')
      .select(PAYMENT_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

/** One customer's payments, advances included — for a statement. */
export async function listPaymentsForCustomer(customerId: string): Promise<PaymentWithInvoice[]> {
  return fetchAll<PaymentWithInvoice>((from, to) =>
    supabase
      .from('payments')
      .select(PAYMENT_SELECT, { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

/** Payments received since a moment — the dashboard's "collected today". */
export async function listPaymentsSince(iso: string): Promise<Payment[]> {
  return fetchAll<Payment>((from, to) =>
    supabase
      .from('payments')
      .select('*', { count: 'exact' })
      .gte('created_at', iso)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

export interface AppliedPart {
  invoice_id: string
  invoice_no: string
  amount: number
}

export interface PaymentResult {
  /** The bills the money went onto, in the order it was applied. */
  applied: AppliedPart[]
  /** What this payment kept as advance, beyond everything the customer owed. */
  advance: number
  /** Money not recorded at all — only possible on a bill with no customer. */
  leftOver: number
  /** What the customer still owes, read straight after the payment. */
  pending: number
  /** The customer's whole advance, read straight after the payment. */
  advanceBalance: number
  /** True when this was a repeat of a save already made (a double tap). */
  duplicate: boolean
}

export interface RawPaymentResult {
  applied?: { invoice_id: string; invoice_no: string; amount: number }[]
  advance?: number
  left_over?: number
  pending?: number
  advance_balance?: number
  duplicate?: boolean
}

export function toPaymentResult(raw: RawPaymentResult): PaymentResult {
  return {
    applied: (raw.applied ?? []).map((a) => ({ invoice_id: a.invoice_id, invoice_no: a.invoice_no, amount: Number(a.amount) })),
    advance: Number(raw.advance ?? 0),
    leftOver: Number(raw.left_over ?? 0),
    pending: Number(raw.pending ?? 0),
    advanceBalance: Number(raw.advance_balance ?? 0),
    duplicate: !!raw.duplicate,
  }
}

/**
 * Money against one bill, possibly split across modes (record_payment,
 * migration 024). The bill is filled first, then the customer's older bills,
 * and anything beyond all of it is kept as advance. Splits are taken in
 * order, so the modes stay truthful: ₹5,000 cash and ₹3,000 UPI against
 * ₹6,000 owed is ₹5,000 cash and ₹1,000 UPI on the bill, ₹2,000 UPI onward.
 *
 * The same `requestId` sent twice records it once — which is what a double
 * tap on Save used to get wrong (INV-1024).
 */
export async function recordPayment(
  requestId: string,
  invoiceId: string,
  splits: { amount: number; mode: PaymentMode }[],
): Promise<PaymentResult> {
  const offered = splits.filter((s) => s.amount > 0)
  const result = toPaymentResult(
    await callRpc<RawPaymentResult>('record_payment', {
      p_request_id: requestId,
      p_invoice_id: invoiceId,
      p_splits: offered,
    }),
  )
  if (!result.duplicate) {
    const amount = offered.reduce((sum, s) => sum + s.amount, 0)
    void logActivity('supplier', 'payment_recorded', { details: { invoice_id: invoiceId, amount } })
  }
  return result
}

/**
 * Money handed over against the khata as a whole rather than one bill —
 * which is how customers actually pay (record_customer_payment). Clears the
 * oldest unpaid bills first, opening balance before any bill, and keeps the
 * rest as advance for their next bill.
 */
export async function recordCustomerPayment(
  requestId: string,
  customerId: string,
  amount: number,
  mode: PaymentMode,
): Promise<PaymentResult> {
  const result = toPaymentResult(
    await callRpc<RawPaymentResult>('record_customer_payment', {
      p_request_id: requestId,
      p_customer_id: customerId,
      p_amount: amount,
      p_mode: mode,
    }),
  )
  if (!result.duplicate) {
    void logActivity('supplier', 'payment_recorded', { details: { customer_id: customerId, amount } })
  }
  return result
}
