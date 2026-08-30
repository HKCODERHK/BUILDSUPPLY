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

export async function nextInvoiceNumber(supplierId: string): Promise<string> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_no')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error

  const last = data?.[0]?.invoice_no
  const lastSeq = last ? Number(last.replace(/[^0-9]/g, '')) : 1000
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1001
  return `INV-${nextSeq}`
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
