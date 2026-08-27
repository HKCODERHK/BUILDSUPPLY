import { supabase } from '@/lib/supabase'
import type { DashboardTotals, Invoice, InvoiceItem } from '@/lib/database.types'
import { adjustStock } from './materials'
import { logActivity } from './activityLog'

export interface InvoiceWithCustomer extends Invoice {
  customers: { name: string } | null
}

export async function listInvoices(): Promise<InvoiceWithCustomer[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customers(name)')
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
  input: { customer_id: string; items: NewInvoiceItem[]; gstApplicable?: boolean },
): Promise<Invoice> {
  const subtotal = input.items.reduce((sum, item) => sum + item.qty * item.rate, 0)
  const gstAmount = input.gstApplicable ? Math.round(subtotal * 0.18) : 0
  const total = subtotal + gstAmount
  const invoiceNo = await nextInvoiceNumber(supplierId)

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      supplier_id: supplierId,
      invoice_no: invoiceNo,
      customer_id: input.customer_id,
      subtotal,
      gst_amount: gstAmount,
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

  // Best-effort stock deduction; an invoice failing to fully adjust stock
  // shouldn't roll back the invoice itself in a serverless/no-transaction setup.
  await Promise.all(
    input.items
      .filter((item) => item.material_id)
      .map((item) => adjustStock(item.material_id as string, -item.qty)),
  )

  void logActivity('supplier', 'invoice_created', { details: { invoice_no: invoice.invoice_no, total } })

  return invoice as Invoice
}

export async function dashboardTotals(): Promise<DashboardTotals | null> {
  const { data, error } = await supabase.from('dashboard_totals').select('*').maybeSingle()
  if (error) throw error
  return data
}
