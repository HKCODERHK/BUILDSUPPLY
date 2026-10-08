import { customerClient, ensureCustomerSession, hasCustomerSession } from '@/lib/customerAuth'
import type { KhataDocument, KhataView } from './khata'

// The customer's account (migration 038): which shops it is connected to,
// and each shop's khata read by who is signed in rather than by a link.
// Every read here goes through the same database functions the khata link
// uses, so the two always show the same figures.

export interface MyShop {
  connection: string
  business_name: string
  logo_url: string | null
  customer_name: string
  customer_phone: string | null
  customer_site: string | null
  /** Only while the shop takes online orders. */
  order_link: string | null
  pending: number
  advance: number
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await customerClient().rpc(fn, args)
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data as T
}

let available: Promise<boolean> | null = null
/**
 * Whether this database has customer accounts (migration 038). Asked signed
 * out: the function exists and refuses (permission), or does not exist at all
 * (PGRST202). A build reaching a database without 038 hides "Save" instead of
 * offering something that cannot work.
 */
export function accountsAvailable(): Promise<boolean> {
  if (!available) {
    available = (async () => {
      const { error } = await customerClient().rpc('my_shops')
      return !error || error.code !== 'PGRST202'
    })().catch(() => false)
  }
  return available
}

/** "Save this shop": makes the login if this phone has none, then connects. */
export async function connectKhata(token: string): Promise<{ ok: boolean; connection?: string }> {
  await ensureCustomerSession()
  return call('connect_khata', { p_token: token })
}

/** Is this khata already on the phone's account? False when there is no account. */
export async function khataConnected(token: string): Promise<{ connected: boolean; connection?: string }> {
  if (!hasCustomerSession()) return { connected: false }
  return call('khata_connected', { p_token: token })
}

/** Every shop on the account. Empty when this phone has no account. */
export async function myShops(): Promise<MyShop[]> {
  if (!hasCustomerSession()) return []
  return call<MyShop[]>('my_shops')
}

export function myKhata(connection: string): Promise<KhataView> {
  return call<KhataView>('my_khata', { p_connection: connection })
}

export function myKhataDocument(connection: string, kind: 'bill' | 'estimate', no: string): Promise<KhataDocument> {
  return call<KhataDocument>('my_khata_document', { p_connection: connection, p_kind: kind, p_no: no })
}

export async function myConfirmReceived(connection: string, invoiceNo: string): Promise<void> {
  await call('my_confirm_received', { p_connection: connection, p_invoice_no: invoiceNo })
}

export async function disconnectShop(connection: string): Promise<void> {
  await call('disconnect_shop', { p_connection: connection })
}

/** The shop the customer last had open on this phone. */
const CURRENT_KEY = 'buildsupply-me-shop'
export function readCurrentShop(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}
export function rememberCurrentShop(connection: string) {
  try {
    localStorage.setItem(CURRENT_KEY, connection)
  } catch {
    // Not remembered: the first shop opens next time.
  }
}
