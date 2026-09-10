import { supabase } from '@/lib/supabase'
import type { Quotation, QuotationItem } from '@/lib/database.types'
import type { NewInvoiceItem } from './invoices'
import { callRpc, fetchAll } from './db'

export interface QuotationWithCustomer extends Quotation {
  customers: { name: string; site: string | null; phone: string | null } | null
}

export async function listQuotations(): Promise<QuotationWithCustomer[]> {
  return fetchAll<QuotationWithCustomer>((from, to) =>
    supabase
      .from('quotations')
      .select('*, customers(name, site, phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
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

/**
 * Saves an estimate in one step (create_quotation, migration 024). The
 * number is handed out by the database under a lock — it used to be worked
 * out from a count on the phone, so two saves at once could share one.
 */
export async function createQuotation(input: {
  requestId: string
  customer_id: string
  site?: string | null
  items: NewInvoiceItem[]
  gstApplicable?: boolean
  transportLabourCharge?: number
}): Promise<Quotation> {
  return callRpc<Quotation>('create_quotation', {
    p_request_id: input.requestId,
    p_customer_id: input.customer_id,
    p_site: input.site ?? null,
    p_items: input.items,
    p_gst: !!input.gstApplicable,
    p_transport: input.transportLabourCharge ?? 0,
  })
}

// Only bumps Draft -> Sent — re-sharing an already-Sent (or Converted/Expired)
// estimate shouldn't move its status backward or forward again. Turning an
// estimate into a bill marks it Converted inside createInvoice.
export async function markQuotationSent(id: string): Promise<void> {
  const { error } = await supabase.from('quotations').update({ status: 'Sent' }).eq('id', id).eq('status', 'Draft')
  if (error) throw error
}
