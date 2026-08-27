import { supabase } from '@/lib/supabase'
import type { Delivery, DeliveryStatus } from '@/lib/database.types'

export interface DeliveryWithInvoice extends Delivery {
  invoices: { invoice_no: string; customers: { name: string } | null } | null
}

export async function listDeliveries(): Promise<DeliveryWithInvoice[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, invoices(invoice_no, customers(name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as DeliveryWithInvoice[]
}

export async function createDelivery(
  supplierId: string,
  input: { invoice_id: string | null; driver_name?: string; vehicle_no?: string },
): Promise<Delivery> {
  const { count } = await supabase
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
  const challanNo = `DC-${1000 + (count ?? 0) + 1}`

  const { data, error } = await supabase
    .from('deliveries')
    .insert({ supplier_id: supplierId, challan_no: challanNo, ...input })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDeliveryStatus(id: string, status: DeliveryStatus): Promise<void> {
  const { error } = await supabase.from('deliveries').update({ status }).eq('id', id)
  if (error) throw error
}
