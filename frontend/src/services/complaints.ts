import { supabase } from '@/lib/supabase'
import { callRpc } from './db'
import { callCustomer } from './customerAccount'

/**
 * Customer complaints about a bill (migration 046). The customer files one
 * from inside the bill on their khata link or saved account; the shop reads
 * and answers its own; the admin reads them all. Every write is one of 046's
 * functions — what the customer wrote can never be changed.
 */

export const COMPLAINT_CATEGORIES = ['quality', 'quantity', 'wrong_item', 'damaged', 'delivery', 'billing', 'behaviour', 'other'] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

/** What the customer sees of their own complaints. */
export interface CustomerComplaint {
  invoice_no: string
  category: ComplaintCategory
  description: string
  status: ComplaintStatus
  supplier_response: string | null
  created_at: string
  responded_at: string | null
  resolved_at: string | null
}

export interface ShopComplaint extends CustomerComplaint {
  id: string
  invoice_id: string
  supplier_id: string
  via: 'khata' | 'account'
  customers: { id: string; name: string; phone: string | null } | null
}

const isMissingFunction = (e: unknown) => /PGRST202|Could not find the function|does not exist/i.test(e instanceof Error ? e.message : String(e))

/**
 * The customer's complaints; null when the database has no 046 yet, so the
 * page shows no complaint option at all.
 */
export async function listCustomerComplaints(source: { token?: string; connection?: string }): Promise<CustomerComplaint[] | null> {
  try {
    if (source.connection) return (await callCustomer<CustomerComplaint[]>('my_khata_complaints', { p_connection: source.connection })) ?? []
    return (await callRpc<CustomerComplaint[]>('khata_complaints', { p_token: source.token })) ?? []
  } catch (e) {
    if (isMissingFunction(e)) return null
    throw e
  }
}

export async function fileComplaint(
  source: { token?: string; connection?: string },
  invoiceNo: string,
  category: ComplaintCategory,
  description: string,
): Promise<{ already: boolean }> {
  const args = { p_invoice_no: invoiceNo, p_category: category, p_description: description }
  const r = source.connection
    ? await callCustomer<{ ok?: boolean; already?: boolean; found?: boolean }>('my_file_complaint', { p_connection: source.connection, ...args })
    : await callRpc<{ ok?: boolean; already?: boolean; found?: boolean }>('file_complaint', { p_token: source.token, ...args })
  if (r?.found === false) throw new Error('not found')
  return { already: !!r?.already }
}

const SHOP_SELECT =
  'id, invoice_id, supplier_id, invoice_no, category, description, via, status, supplier_response, created_at, responded_at, resolved_at, customers(id, name, phone)'

/** The signed-in shop's complaints (RLS keeps them to its own). */
export async function listShopComplaints(): Promise<ShopComplaint[]> {
  const { data, error } = await supabase.from('customer_complaints').select(SHOP_SELECT).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ShopComplaint[]
}

/** How many are still open or in progress; 0 before 046. */
export async function countOpenComplaints(): Promise<number> {
  const { count, error } = await supabase
    .from('customer_complaints')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress'])
  if (error) return 0
  return count ?? 0
}

export async function respondComplaint(id: string, status: Exclude<ComplaintStatus, 'open'>, response: string) {
  return callRpc<ComplaintStatus>('respond_complaint', { p_id: id, p_status: status, p_response: response })
}

/** For the admin: one shop's complaints, in full (the stated exception in 046). */
export async function listComplaintsForSupplier(supplierId: string): Promise<ShopComplaint[]> {
  const { data, error } = await supabase
    .from('customer_complaints')
    .select(SHOP_SELECT)
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
  if (error) {
    if (/customer_complaints/.test(error.message)) return []
    throw error
  }
  return (data ?? []) as unknown as ShopComplaint[]
}
