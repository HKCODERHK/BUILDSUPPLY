import { supabase } from '@/lib/supabase'
import type { DashboardTotals, Invoice, InvoiceItem, PaymentMode } from '@/lib/database.types'
import { logActivity } from './activityLog'
import { callRpc, fetchAll } from './db'
import { toPaymentResult, type PaymentResult, type RawPaymentResult } from './payments'

export interface InvoiceWithCustomer extends Invoice {
  customers: { name: string; address: string | null; site: string | null; phone: string | null } | null
}

/**
 * A real bill, as opposed to a customer's opening balance — which lives in
 * the same table (kind = 'opening', migration 024) so it counts in the khata,
 * the ageing and the statement, but is never sales and never a bill to open,
 * edit, deliver or share.
 */
export function isBill(inv: { kind?: string | null }) {
  return inv.kind !== 'opening'
}

const INVOICE_SELECT = '*, customers(name, address, site, phone)'

/**
 * Every invoice row, newest first, read in full (see fetchAll). Opening
 * balances are included unless `billsOnly` — balances, ageing and statements
 * need them; lists of bills do not.
 */
export async function listInvoices(opts: { billsOnly?: boolean } = {}): Promise<InvoiceWithCustomer[]> {
  return fetchAll<InvoiceWithCustomer>((from, to) => {
    let query = supabase.from('invoices').select(INVOICE_SELECT, { count: 'exact' })
    if (opts.billsOnly) query = query.eq('kind', 'bill')
    return query.order('created_at', { ascending: false }).order('id').range(from, to)
  })
}

/** One customer's invoice rows, opening balance included — for a statement. */
export async function listInvoicesForCustomer(customerId: string): Promise<InvoiceWithCustomer[]> {
  return fetchAll<InvoiceWithCustomer>((from, to) =>
    supabase
      .from('invoices')
      .select(INVOICE_SELECT, { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

/** The latest live bills, for the dashboard. */
export async function listRecentBills(limit: number): Promise<InvoiceWithCustomer[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('kind', 'bill')
    .neq('status', 'Cancelled')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as InvoiceWithCustomer[]
}

/** Bills raised since a moment — the dashboard's "today". */
export async function listBillsSince(iso: string): Promise<Invoice[]> {
  return fetchAll<Invoice>((from, to) =>
    supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('kind', 'bill')
      .gte('created_at', iso)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

/** Whether any bill was ever made, cancelled ones included. */
export async function hasAnyBill(): Promise<boolean> {
  const { count, error } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('kind', 'bill')
  if (error) throw error
  return (count ?? 0) > 0
}

/** Every site ever billed to — type-ahead suggestions on a new bill. */
export async function listKnownSites(): Promise<string[]> {
  const rows = await fetchAll<{ site: string | null }>((from, to) =>
    supabase.from('invoices').select('site', { count: 'exact' }).not('site', 'is', null).order('id').range(from, to),
  )
  return Array.from(new Set(rows.map((r) => r.site).filter((s): s is string => !!s)))
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const { data, error } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId)
  if (error) throw error
  return data
}

export interface InvoiceItemWithInvoice extends InvoiceItem {
  invoices: { created_at: string; customer_id: string | null; site: string | null } | null
}

// Used by the Material Wise Sales report — every line item across every
// invoice, with just enough of the parent invoice to filter/group by date,
// customer and site without a second round trip per invoice. The first list
// to pass 1,000 rows, since every bill has several lines.
export async function listAllInvoiceItems(): Promise<InvoiceItemWithInvoice[]> {
  return fetchAll<InvoiceItemWithInvoice>((from, to) =>
    supabase
      .from('invoice_items')
      .select('*, invoices(created_at, customer_id, site)', { count: 'exact' })
      .order('id')
      .range(from, to),
  )
}

// The most recent live bill for a customer, used by "Repeat last bill" —
// contractors order the same few things week after week, so the fastest bill
// to raise is the last one with the quantities nudged.
export async function lastBillForCustomer(
  customerId: string,
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .eq('kind', 'bill')
    .neq('status', 'Cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const invoice = data?.[0] as Invoice | undefined
  if (!invoice) return null
  return { invoice, items: await listInvoiceItems(invoice.id) }
}

export interface LastRate {
  rate: number
  at: string
}

/**
 * What this customer was last charged for each material.
 *
 * Every contractor is on a different rate and the supplier keeps those rates
 * in their head — this puts the last one they actually agreed to right next
 * to the rate box while billing.
 *
 * Keyed by material id, falling back to the lowercased description so custom
 * one-off lines ("mixed sand tractor") remember their rate too. Sorted
 * newest-first in JS rather than SQL because PostgREST can't order a
 * top-level query by an embedded table's column.
 */
export async function lastRatesForCustomer(customerId: string): Promise<Map<string, LastRate>> {
  // PostgREST's typings read the embedded `invoices` as a list; for this
  // many-to-one join it is a single row, hence the cast.
  const rows = (await fetchAll((from, to) =>
    supabase
      .from('invoice_items')
      .select('material_id, description, rate, invoices!inner(created_at, customer_id, status)', { count: 'exact' })
      .eq('invoices.customer_id', customerId)
      .neq('invoices.status', 'Cancelled')
      .order('id')
      .range(from, to),
  )) as unknown as {
    material_id: string | null
    description: string | null
    rate: number
    invoices: { created_at: string } | null
  }[]

  const byNewest = rows
    .filter((r) => r.invoices && Number(r.rate) > 0)
    .sort((a, b) => (b.invoices as { created_at: string }).created_at.localeCompare((a.invoices as { created_at: string }).created_at))

  const result = new Map<string, LastRate>()
  for (const row of byNewest) {
    const key = row.material_id ?? `desc:${(row.description ?? '').trim().toLowerCase()}`
    if (key === 'desc:') continue
    if (result.has(key)) continue // first hit wins — the list is newest-first
    result.set(key, { rate: Number(row.rate), at: (row.invoices as { created_at: string }).created_at })
  }
  return result
}

/** Every supplier's numbering starts here (the database hands them out). */
const FIRST_INVOICE_SEQ = 1001

/** A supplier's very first bill — nothing was ever numbered before it,
 *  cancelled bills included. Costs no query, which is the point: the
 *  save that just returned already knows. */
export function isFirstInvoice(invoice: { invoice_no: string }) {
  return invoice.invoice_no === `INV-${FIRST_INVOICE_SEQ}`
}

export interface NewInvoiceItem {
  material_id: string | null
  description: string
  qty: number
  rate: number
}

export interface CreatedInvoice {
  invoice: Invoice
  /** What the money taken at the counter went onto, if any was taken. */
  payment: PaymentResult | null
  /** What the customer owes after this bill, advance already used. */
  pending: number
  /** Advance the customer still holds after this bill. */
  advanceBalance: number
}

/**
 * Raises a bill in one step (create_invoice, migration 024): the number, the
 * lines, any advance the customer already holds, the money taken now and —
 * for an estimate being turned into a bill — marking the estimate converted.
 * All of it happens or none of it does, and the same `requestId` sent twice
 * returns the first bill instead of making a second.
 */
export async function createInvoice(input: {
  requestId: string
  customer_id: string
  site?: string | null
  items: NewInvoiceItem[]
  gstApplicable?: boolean
  transportLabourCharge?: number
  /** Money taken at the counter, one entry per mode, in the order given. */
  payments?: { amount: number; mode: PaymentMode }[]
  quotationId?: string | null
}): Promise<CreatedInvoice> {
  const taken = (input.payments ?? []).filter((p) => p.amount > 0)
  const takenTotal = taken.reduce((sum, p) => sum + p.amount, 0)
  const raw = await callRpc<{
    invoice: Invoice
    payment: RawPaymentResult | null
    pending: number
    advance_balance: number
    duplicate?: boolean
  }>('create_invoice', {
    p_request_id: input.requestId,
    p_customer_id: input.customer_id,
    p_site: input.site ?? null,
    p_items: input.items,
    p_gst: !!input.gstApplicable,
    p_transport: input.transportLabourCharge ?? 0,
    p_payments: taken.length > 0 ? taken : null,
    p_quotation_id: input.quotationId ?? null,
  })

  if (!raw.duplicate) {
    void logActivity('supplier', 'invoice_created', {
      details: { invoice_no: raw.invoice.invoice_no, total: Number(raw.invoice.total) },
    })
    if (takenTotal > 0) {
      void logActivity('supplier', 'payment_recorded', { details: { invoice_id: raw.invoice.id, amount: takenTotal } })
    }
  }

  return {
    invoice: raw.invoice,
    payment: raw.payment ? toPaymentResult({ ...raw.payment, pending: raw.pending, advance_balance: raw.advance_balance }) : null,
    pending: Number(raw.pending),
    advanceBalance: Number(raw.advance_balance),
  }
}

/**
 * Corrects a bill that was entered wrong — a mistyped quantity, a rate the
 * customer disputes, a missing line — in one step (update_invoice).
 *
 * If the bill was already delivered, stock moves by one net amount per
 * material: editing 10 bags to 12 takes 2 more, once. A total below what was
 * already paid is refused rather than quietly deleting payments; cancel the
 * bill instead.
 */
export async function updateInvoice(
  invoiceId: string,
  input: {
    site?: string | null
    items: NewInvoiceItem[]
    gstApplicable?: boolean
    transportLabourCharge?: number
  },
): Promise<Invoice> {
  const updated = await callRpc<Invoice>('update_invoice', {
    p_invoice_id: invoiceId,
    p_site: input.site ?? null,
    p_items: input.items,
    p_gst: !!input.gstApplicable,
    p_transport: input.transportLabourCharge ?? 0,
  })
  void logActivity('supplier', 'invoice_edited', {
    details: { invoice_no: updated.invoice_no, new_total: Number(updated.total) },
  })
  return updated
}

// Takes the stock for this bill and flags it delivered. Safe to call twice —
// a double tap, or marking delivered again — the second call changes nothing.
export async function markInvoiceDelivered(invoiceId: string): Promise<void> {
  const changed = await callRpc<boolean>('mark_invoice_delivered', { p_invoice_id: invoiceId })
  if (changed) void logActivity('supplier', 'invoice_delivered', { details: { invoice_id: invoiceId } })
}

export interface CancelResult {
  /** Money moved to the customer's advance rather than removed. */
  kept: number
  pending: number
  advanceBalance: number
}

// Voids a bill entered by mistake. The row is kept (so the invoice number
// isn't reused and the history still shows what happened) but it drops out
// of every total and any stock it consumed goes back. Money taken on it is
// never removed: it becomes the customer's advance, and their other unpaid
// bills use it first.
export async function cancelInvoice(invoiceId: string): Promise<CancelResult> {
  const raw = await callRpc<{ already?: boolean; kept?: number; pending?: number; advance_balance?: number }>(
    'cancel_invoice',
    { p_invoice_id: invoiceId },
  )
  if (!raw.already) {
    void logActivity('supplier', 'invoice_cancelled', { details: { invoice_id: invoiceId, kept_as_advance: Number(raw.kept ?? 0) } })
  }
  return { kept: Number(raw.kept ?? 0), pending: Number(raw.pending ?? 0), advanceBalance: Number(raw.advance_balance ?? 0) }
}

export async function dashboardTotals(): Promise<DashboardTotals | null> {
  const { data, error } = await supabase.from('dashboard_totals').select('*').maybeSingle()
  if (error) throw error
  return data
}
