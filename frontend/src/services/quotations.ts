import { supabase } from '@/lib/supabase'
import type { Quotation } from '@/lib/database.types'

export interface QuotationWithCustomer extends Quotation {
  customers: { name: string } | null
}

export async function listQuotations(): Promise<QuotationWithCustomer[]> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as QuotationWithCustomer[]
}

export async function createQuotation(
  supplierId: string,
  input: { customer_id: string; total: number },
): Promise<Quotation> {
  const { count } = await supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
  const quoteNo = `QT-${1000 + (count ?? 0) + 1}`

  const { data, error } = await supabase
    .from('quotations')
    .insert({ supplier_id: supplierId, quote_no: quoteNo, customer_id: input.customer_id, total: input.total })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markQuotationConverted(id: string, invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('quotations')
    .update({ status: 'Converted', converted_invoice_id: invoiceId })
    .eq('id', id)
  if (error) throw error
}
