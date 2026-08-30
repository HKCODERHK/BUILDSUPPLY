import { supabase } from '@/lib/supabase'
import type { Quotation, QuotationItem } from '@/lib/database.types'
import type { NewInvoiceItem } from './invoices'

export interface QuotationWithCustomer extends Quotation {
  customers: { name: string; site: string | null; phone: string | null } | null
}

export async function listQuotations(): Promise<QuotationWithCustomer[]> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, customers(name, site, phone)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as QuotationWithCustomer[]
}

export async function getQuotation(id: string): Promise<Quotation> {
  const { data, error } = await supabase.from('quotations').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function listQuotationItems(quotationId: string): Promise<QuotationItem[]> {
  const { data, error } = await supabase.from('quotation_items').select('*').eq('quotation_id', quotationId)
  if (error) throw error
  return data
}

export async function createQuotation(
  supplierId: string,
  input: {
    customer_id: string
    site?: string | null
    items: NewInvoiceItem[]
    gstApplicable?: boolean
    transportLabourCharge?: number
  },
): Promise<Quotation> {
  const subtotal = input.items.reduce((sum, item) => sum + item.qty * item.rate, 0)
  const gstAmount = input.gstApplicable ? Math.round(subtotal * 0.18) : 0
  const transportLabourCharge = input.transportLabourCharge ?? 0
  const total = subtotal + gstAmount + transportLabourCharge

  const { count } = await supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
  const quoteNo = `QT-${1000 + (count ?? 0) + 1}`

  const { data: quotation, error } = await supabase
    .from('quotations')
    .insert({
      supplier_id: supplierId,
      quote_no: quoteNo,
      customer_id: input.customer_id,
      site: input.site?.trim() || null,
      subtotal,
      gst_amount: gstAmount,
      transport_labour_charge: transportLabourCharge,
      total,
    })
    .select()
    .single()
  if (error) throw error

  const itemsPayload = input.items.map((item) => ({
    supplier_id: supplierId,
    quotation_id: quotation.id,
    material_id: item.material_id,
    description: item.description,
    qty: item.qty,
    rate: item.rate,
    amount: item.qty * item.rate,
  }))

  const { error: itemsError } = await supabase.from('quotation_items').insert(itemsPayload)
  if (itemsError) throw itemsError

  return quotation as Quotation
}

export async function markQuotationConverted(id: string, invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('quotations')
    .update({ status: 'Converted', converted_invoice_id: invoiceId })
    .eq('id', id)
  if (error) throw error
}

// Only bumps Draft -> Sent — re-sharing an already-Sent (or Converted/Expired)
// estimate shouldn't move its status backward or forward again.
export async function markQuotationSent(id: string): Promise<void> {
  const { error } = await supabase.from('quotations').update({ status: 'Sent' }).eq('id', id).eq('status', 'Draft')
  if (error) throw error
}
