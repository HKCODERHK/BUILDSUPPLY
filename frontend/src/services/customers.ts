import { supabase } from '@/lib/supabase'
import type { Customer, CustomerBalance, CustomerSite } from '@/lib/database.types'
import { logActivity } from './activityLog'

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function listCustomerBalances(): Promise<CustomerBalance[]> {
  const { data, error } = await supabase.from('customer_balances').select('*')
  if (error) throw error
  return data
}

export async function listCustomerSites(customerId: string): Promise<CustomerSite[]> {
  const { data, error } = await supabase.from('customer_sites').select('*').eq('customer_id', customerId)
  if (error) throw error
  return data
}

export async function createCustomer(
  supplierId: string,
  input: { name: string; phone?: string; site?: string },
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ supplier_id: supplierId, ...input })
    .select()
    .single()
  if (error) throw error
  void logActivity('supplier', 'customer_created', { details: { name: data.name } })
  return data
}

export async function updateCustomer(id: string, input: Partial<Customer>): Promise<Customer> {
  const { data, error } = await supabase.from('customers').update(input).eq('id', id).select().single()
  if (error) throw error
  void logActivity('supplier', 'customer_updated', { details: { name: data.name } })
  return data
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) throw error
}
