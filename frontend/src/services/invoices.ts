import { supabase } from '@/lib/supabase'
import type { DashboardTotals, Invoice, InvoiceItem } from '@/lib/database.types'
import { adjustStock } from './materials'
import { logActivity } from './activityLog'

export interface InvoiceWithCustomer extends Invoice {
  customers: { name: string; address: string | null; site: string | null; phone: string | null } | null
}

export async function listInvoices(): Promise<InvoiceWithCustomer[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customers(name, address, site, phone)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as InvoiceWithCustomer[]
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
// customer and site without a second round trip per invoice.
export async function listAllInvoiceItems(): Promise<InvoiceItemWithInvoice[]> {
  const { data, error } = await supabase.from('invoice_items').select('*, invoices(created_at, customer_id, site)')
  if (error) throw error
  return data as InvoiceItemWithInvoice[]
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
  const { data, error } = await supabase
    .from('invoice_items')
    .select('material_id, description, rate, invoices!inner(created_at, customer_id, status)')
    .eq('invoices.customer_id', customerId)
    .neq('invoices.status', 'Cancelled')
  if (error) throw error

  const rows = (data ?? []) as unknown as {
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

/** Every supplier's numbering starts here. */
const FIRST_INVOICE_SEQ = 1001

export async function nextInvoiceNumber(supplierId: string): Promise<string> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_no')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error

  const last = data?.[0]?.invoice_no
  const lastSeq = last ? Number(last.replace(/[^0-9]/g, '')) : FIRST_INVOICE_SEQ - 1
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : FIRST_INVOICE_SEQ
  return `INV-${nextSeq}`
}

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

export async function createInvoice(
  supplierId: string,
  input: {
    customer_id: string
    site?: string | null
    items: NewInvoiceItem[]
    gstApplicable?: boolean
    transportLabourCharge?: number
  },
): Promise<Invoice> {
  const subtotal = input.items.reduce((sum, item) => sum + item.qty * item.rate, 0)
  const gstAmount = input.gstApplicable ? Math.round(subtotal * 0.18) : 0
  const transportLabourCharge = input.transportLabourCharge ?? 0
  const total = subtotal + gstAmount + transportLabourCharge
  const invoiceNo = await nextInvoiceNumber(supplierId)

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      supplier_id: supplierId,
      invoice_no: invoiceNo,
      customer_id: input.customer_id,
      site: input.site?.trim() || null,
      subtotal,
      gst_amount: gstAmount,
      transport_labour_charge: transportLabourCharge,
      total,
      paid: 0,
      status: 'Unpaid',
    })
    .select()
    .single()
  if (error) throw error

  const itemsPayload = input.items.map((item) => ({
    supplier_id: supplierId,
    invoice_id: invoice.id,
    material_id: item.material_id,
    description: item.description,
    qty: item.qty,
    rate: item.rate,
    amount: item.qty * item.rate,
  }))

  const { error: itemsError } = await supabase.from('invoice_items').insert(itemsPayload)
  if (itemsError) throw itemsError

  // Stock is deducted separately, once delivery is confirmed — see
  // markInvoiceDelivered — not at billing time, since suppliers often bill
  // before the goods actually leave the godown.
  void logActivity('supplier', 'invoice_created', { details: { invoice_no: invoice.invoice_no, total } })

  return invoice as Invoice
}

/**
 * Corrects a bill that was entered wrong — a mistyped quantity, a rate the
 * customer disputes, a missing line.
 *
 * Before this existed the only remedy was Cancel and retype the whole thing,
 * which burnt an invoice number and lost the payment already recorded
 * against it.
 *
 * Stock is the delicate part: if the bill was already delivered, the old
 * quantities have to go back on the shelf before the new ones come off,
 * otherwise editing 10 bags to 12 would deduct 22.
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
  const existing = await getInvoice(invoiceId)
  if (existing.status === 'Cancelled') {
    throw new Error('This bill was cancelled and can no longer be edited.')
  }

  const subtotal = input.items.reduce((sum, item) => sum + item.qty * item.rate, 0)
  const gstAmount = input.gstApplicable ? Math.round(subtotal * 0.18) : 0
  const transportLabourCharge = input.transportLabourCharge ?? 0
  const total = subtotal + gstAmount + transportLabourCharge

  // Refuse rather than quietly delete payments or leave the customer in
  // credit — the supplier should cancel the bill and start again instead.
  if (total < Number(existing.paid)) {
    throw new Error(
      `This customer has already paid Rs. ${Number(existing.paid).toLocaleString('en-IN')} against this bill, so the new total can't be lower than that. Cancel the bill instead if it is wrong.`,
    )
  }

  const oldItems = await listInvoiceItems(invoiceId)

  // Net change per material, rather than restoring every old quantity and
  // then deducting every new one. Editing 10 bags to 12 moves stock by 2,
  // and it moves once — there is no moment where the shelf looks like it
  // has 10 bags back on it, so a failure part-way through can't leave stock
  // inflated. Only meaningful once the goods have actually left the godown.
  const stockDeltas = new Map<string, number>()
  if (existing.delivered) {
    for (const item of oldItems) {
      if (!item.material_id) continue
      stockDeltas.set(item.material_id, (stockDeltas.get(item.material_id) ?? 0) + Number(item.qty))
    }
    for (const item of input.items) {
      if (!item.material_id) continue
      stockDeltas.set(item.material_id, (stockDeltas.get(item.material_id) ?? 0) - item.qty)
    }
  }

  const { error: deleteError } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
  if (deleteError) throw deleteError

  const itemsPayload = input.items.map((item) => ({
    supplier_id: existing.supplier_id,
    invoice_id: invoiceId,
    material_id: item.material_id,
    description: item.description,
    qty: item.qty,
    rate: item.rate,
    amount: item.qty * item.rate,
  }))
  const { error: insertError } = await supabase.from('invoice_items').insert(itemsPayload)
  if (insertError) throw insertError

  await Promise.all(
    [...stockDeltas.entries()]
      .filter(([, delta]) => delta !== 0)
      .map(([materialId, delta]) => adjustStock(materialId, delta)),
  )

  const paid = Number(existing.paid)
  const status = paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'

  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      site: input.site?.trim() || null,
      subtotal,
      gst_amount: gstAmount,
      transport_labour_charge: transportLabourCharge,
      total,
      status,
    })
    .eq('id', invoiceId)
    .select()
    .single()
  if (error) throw error

  void logActivity('supplier', 'invoice_edited', {
    details: { invoice_no: existing.invoice_no, old_total: Number(existing.total), new_total: total },
  })

  return updated as Invoice
}

// Deducts stock for this invoice's line items and flags it delivered. The
// `.eq('delivered', false)` guard makes this safe to call twice (a double
// click, or marking delivered again) — the second call updates zero rows and
// skips the stock deduction instead of deducting twice.
export async function markInvoiceDelivered(invoiceId: string): Promise<void> {
  const { data: updated, error: updateError } = await supabase
    .from('invoices')
    .update({ delivered: true })
    .eq('id', invoiceId)
    .eq('delivered', false)
    .select('invoice_no')
  if (updateError) throw updateError
  if (!updated || updated.length === 0) return

  const items = await listInvoiceItems(invoiceId)
  await Promise.all(
    items.filter((item) => item.material_id).map((item) => adjustStock(item.material_id as string, -item.qty)),
  )

  void logActivity('supplier', 'invoice_delivered', { details: { invoice_no: updated[0].invoice_no } })
}

// Voids a bill entered by mistake. The row is kept (so the invoice number
// isn't reused and the history still shows what happened) but it drops out
// of every total, any stock it consumed goes back, and money recorded
// against it is removed — a cancelled bill can't leave a payment behind.
export async function cancelInvoice(invoiceId: string): Promise<void> {
  const { data: updated, error } = await supabase
    .from('invoices')
    .update({ status: 'Cancelled', paid: 0 })
    .eq('id', invoiceId)
    .neq('status', 'Cancelled')
    .select('invoice_no, delivered')
  if (error) throw error
  // Already cancelled — nothing to undo, and importantly no second stock
  // restore if this is somehow called twice.
  if (!updated || updated.length === 0) return

  if (updated[0].delivered) {
    const items = await listInvoiceItems(invoiceId)
    await Promise.all(
      items.filter((item) => item.material_id).map((item) => adjustStock(item.material_id as string, item.qty)),
    )
  }

  const { error: paymentsError } = await supabase.from('payments').delete().eq('invoice_id', invoiceId)
  if (paymentsError) throw paymentsError

  void logActivity('supplier', 'invoice_cancelled', { details: { invoice_no: updated[0].invoice_no } })
}

export async function dashboardTotals(): Promise<DashboardTotals | null> {
  const { data, error } = await supabase.from('dashboard_totals').select('*').maybeSingle()
  if (error) throw error
  return data
}
