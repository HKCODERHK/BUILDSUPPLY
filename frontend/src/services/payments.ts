import { supabase } from '@/lib/supabase'
import type { InvoiceKind, Payment, PaymentMode } from '@/lib/database.types'
import { logActivity } from './activityLog'
import { callRpc, fetchAll } from './db'

export interface PaymentAllocationRef {
  amount: number
  // Set once the bill it was on was cancelled or changed; it no longer counts.
  released_at: string | null
  invoices: { invoice_no: string; kind: InvoiceKind; site: string | null } | null
}

export interface PaymentWithInvoice extends Payment {
  customers: { name: string } | null
  // Which bills this receipt paid (migration 024). None still active means it
  // is advance, waiting for the customer's next bill.
  payment_allocations: PaymentAllocationRef[]
}

const PAYMENT_SELECT = '*, customers(name), payment_allocations(amount, released_at, invoices(invoice_no, kind, site))'

/** The bills a receipt is still on — released allocations no longer count. */
export function activeAllocations(p: { payment_allocations?: PaymentAllocationRef[] | null }): PaymentAllocationRef[] {
  return (p.payment_allocations ?? []).filter((a) => !a.released_at)
}

/**
 * Where an entry stands after corrections (migration 052): an ordinary
 * receipt, the reversal that took a wrong one back, a receipt that was
 * reversed, or the right amount that replaced a wrong one. `all` is the list
 * the entry came from — a receipt is reversed when a reversal in it points
 * back at it.
 */
export type CorrectionState = 'normal' | 'reversal' | 'reversed' | 'correction'

export function correctionState(p: Payment, all: Payment[]): CorrectionState {
  if (Number(p.amount) < 0) return 'reversal'
  if (all.some((r) => r.corrects_payment_id === p.id && Number(r.amount) < 0)) return 'reversed'
  if (p.corrects_payment_id) return 'correction'
  return 'normal'
}

/** Whether this database can correct payments (052): its rows carry the column. */
export function correctionsAvailable(p: Payment): boolean {
  return 'corrects_payment_id' in p
}

export interface CorrectionResult {
  /** The wrong amount taken back. */
  reversed: number
  /** The right amount recorded in its place, or null when it was a mistake outright. */
  correctedTo: number | null
  applied: AppliedPart[]
  pending: number
  advanceBalance: number
  duplicate: boolean
}

/**
 * Corrects a payment entered by mistake (correct_payment, migration 052).
 * Nothing is edited or deleted: the database adds a reversal entry for the
 * whole wrong amount and, when `newAmount` is given, a receipt for the right
 * one, which goes onto the bills the wrong one paid. The same `requestId`
 * twice records it once.
 */
export async function correctPayment(
  requestId: string,
  paymentId: string,
  reason: string,
  newAmount: number | null,
  newMode: PaymentMode | null,
): Promise<CorrectionResult> {
  const raw = await callRpc<RawPaymentResult & { reversed?: number; corrected_to?: number | null }>('correct_payment', {
    p_request_id: requestId,
    p_payment_id: paymentId,
    p_reason: reason,
    p_new_amount: newAmount,
    p_new_mode: newMode,
  })
  const result: CorrectionResult = {
    reversed: Number(raw.reversed ?? 0),
    correctedTo: raw.corrected_to == null ? null : Number(raw.corrected_to),
    applied: (raw.applied ?? []).map((a) => ({ invoice_id: a.invoice_id, invoice_no: a.invoice_no, amount: Number(a.amount) })),
    pending: Number(raw.pending ?? 0),
    advanceBalance: Number(raw.advance_balance ?? 0),
    duplicate: !!raw.duplicate,
  }
  if (!result.duplicate) {
    void logActivity('supplier', 'payment_corrected', {
      details: { payment_id: paymentId, reversed: result.reversed, corrected_to: result.correctedTo },
    })
  }
  return result
}

/**
 * Whether a failed save might still have been saved: the request may have
 * reached the database and only the answer was lost (a dropped connection, a
 * timeout). A refusal the database explained in words was definitely not saved.
 */
export function mayHaveBeenSaved(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|timed? ?out|abort/i.test(message)
}

/** A customer's newest receipt — what "Entered the wrong amount?" corrects. */
export async function latestPaymentFor(customerId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('customer_id', customerId)
    .gt('amount', 0)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data as Payment | null) ?? null
}

/**
 * The same amount from the same customer recorded in the last 15 minutes and
 * still standing — what a second phone, or a supplier re-entering after a
 * lost answer, would duplicate. Null when there is none, and also when the
 * check itself can't run: it only ever asks "are you sure?", it never blocks.
 */
export async function recentSamePayment(customerId: string, amount: number): Promise<Payment | null> {
  try {
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    if (error || !data) return null
    const rows = data as Payment[]
    return rows.find((p) => Number(p.amount) === amount && correctionState(p, rows) !== 'reversed' && Number(p.amount) > 0) ?? null
  } catch {
    return null
  }
}

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

/**
 * An advance handed over for the customer's NEXT bill (record_advance, the
 * customer page's "Receive advance"). Kept apart from anything they already
 * owe: it is only used on bills raised after it, starting with the next one.
 */
export async function recordAdvance(
  requestId: string,
  customerId: string,
  amount: number,
  mode: PaymentMode,
): Promise<PaymentResult> {
  const result = toPaymentResult(
    await callRpc<RawPaymentResult>('record_advance', {
      p_request_id: requestId,
      p_customer_id: customerId,
      p_amount: amount,
      p_mode: mode,
    }),
  )
  if (!result.duplicate) {
    void logActivity('supplier', 'advance_recorded', { details: { customer_id: customerId, amount } })
  }
  return result
}
