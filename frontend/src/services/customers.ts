import { supabase } from '@/lib/supabase'
import type { Customer, CustomerBalance, Invoice } from '@/lib/database.types'
import { logActivity } from './activityLog'
import { callRpc, fetchAll } from './db'

export async function listCustomers(): Promise<Customer[]> {
  return fetchAll<Customer>((from, to) =>
    supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

/** The newest few customers, for the dashboard. */
export async function listRecentCustomers(limit: number): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function listCustomerBalances(): Promise<CustomerBalance[]> {
  return fetchAll<CustomerBalance>((from, to) =>
    supabase.from('customer_balances').select('*', { count: 'exact' }).order('customer_id').range(from, to),
  )
}

/** What one customer owes and holds in advance (customer_balances view). */
export async function getCustomerBalance(customerId: string): Promise<CustomerBalance | null> {
  const { data, error } = await supabase.from('customer_balances').select('*').eq('customer_id', customerId).maybeSingle()
  if (error) throw error
  return data
}

/** The customer's opening balance row, if they have one (migration 024). */
export async function getOpeningBalance(customerId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .eq('kind', 'opening')
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * What a customer already owed before BuildSupply — their old udhaar. It
 * counts in their khata, their ageing and their statement, and is paid
 * before any bill, but it is not sales. 0 removes it. `asOf` (YYYY-MM-DD) is
 * the day it dates from, which is what the overdue age counts from.
 */
export async function setOpeningBalance(customerId: string, amount: number, asOf?: string): Promise<void> {
  await callRpc('set_opening_balance', { p_customer_id: customerId, p_amount: amount, p_as_of: asOf || null })
  void logActivity('supplier', 'opening_balance_set', { details: { customer_id: customerId, amount } })
}

// Postgres raises 23505 (unique_violation) when a phone number already
// belongs to another customer of this supplier (see migration 005). Look up
// who it belongs to so the error can name them instead of showing raw SQL.
async function duplicatePhoneError(supplierId: string, phone: string | undefined): Promise<Error> {
  if (!phone) return new Error('A customer with this phone number already exists.')
  const { data } = await supabase
    .from('customers')
    .select('name')
    .eq('supplier_id', supplierId)
    .eq('phone', phone)
    .maybeSingle()
  return new Error(
    data ? `A customer named "${data.name}" already has this phone number.` : 'A customer with this phone number already exists.',
  )
}

export async function createCustomer(
  supplierId: string,
  input: { name: string; phone?: string; site?: string; address?: string; credit_limit?: number | null },
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ supplier_id: supplierId, ...input })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw await duplicatePhoneError(supplierId, input.phone)
    if (error.code === '23514') throw new Error('Phone number must be exactly 10 digits.')
    throw error
  }
  void logActivity('supplier', 'customer_created', { details: { name: data.name } })
  return data
}

export async function updateCustomer(id: string, input: Partial<Customer>): Promise<Customer> {
  const { data, error } = await supabase.from('customers').update(input).eq('id', id).select().single()
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase.from('customers').select('supplier_id').eq('id', id).single()
      throw await duplicatePhoneError(existing?.supplier_id ?? '', input.phone ?? undefined)
    }
    if (error.code === '23514') throw new Error('Phone number must be exactly 10 digits.')
    throw error
  }
  void logActivity('supplier', 'customer_updated', { details: { name: data.name } })
  return data
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) throw error
}
