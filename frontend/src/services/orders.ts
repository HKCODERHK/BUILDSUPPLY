import { supabase } from '@/lib/supabase'
import type { OrderRequest, Quotation, Supplier } from '@/lib/database.types'
import { logActivity } from './activityLog'
import { callRpc, fetchAll } from './db'
import type { NewInvoiceItem } from './invoices'

// Customer online orders (migration 026). The public page reaches only the
// three functions order_page / place_order / order_status — see the migration
// for what each may return. Everything else here is the supplier's side.

// ── The public page (no sign-in) ──────────────────────────────────────

export interface OrderPageMaterial {
  id: string
  name: string
  category: string | null
  unit: string
  /** Only when the supplier shows prices, and only for a priced material. */
  price: number | null
}

export type OrderPage =
  | { found: false }
  | { found: true; open: false }
  | {
      found: true
      open: true
      business_name: string
      logo_url: string | null
      show_prices: boolean
      materials: OrderPageMaterial[]
    }

export function getOrderPage(link: string): Promise<OrderPage> {
  return callRpc<OrderPage>('order_page', { p_link: link })
}

export interface PlaceOrderInput {
  link: string
  requestId: string
  name: string
  phone: string
  site: string
  deliveryDate: string | null
  note: string
  items: { material_id: string; qty: number }[]
  /** The hidden field only bots fill in. */
  trap: string
}

/** Returns the status code for the customer's status link (null only for a bot). */
export async function placeOrder(input: PlaceOrderInput): Promise<{ token: string | null; duplicate: boolean }> {
  const raw = await callRpc<{ token: string | null; duplicate?: boolean }>('place_order', {
    p_link: input.link,
    p_request_id: input.requestId,
    p_name: input.name,
    p_phone: input.phone,
    p_site: input.site || null,
    p_delivery_date: input.deliveryDate || null,
    p_note: input.note || null,
    p_items: input.items,
    p_trap: input.trap || null,
  })
  return { token: raw.token, duplicate: !!raw.duplicate }
}

export type OrderStatusView =
  | { found: false }
  | {
      found: true
      status: OrderRequest['status']
      business_name: string
      created_at: string
      delivery_date: string | null
      items: { name: string; unit: string; qty: number }[]
      /** Present only once the order is rejected (migration 027). */
      reject_code?: OrderRequest['reject_code']
      reject_reason?: string | null
    }

export function getOrderStatus(token: string): Promise<OrderStatusView> {
  return callRpc<OrderStatusView>('order_status', { p_token: token })
}

/** Where a supplier's order page lives. */
export function orderPageUrl(link: string): string {
  return `${window.location.origin}/order/${link}`
}

export function orderStatusUrl(token: string): string {
  return `${window.location.origin}/order-status/${token}`
}

/**
 * A first suggestion for a supplier's link, from their business name:
 * "Shree Balaji Building Materials" → "shree-balaji-building-materials",
 * trimmed to the 40 characters the database allows.
 */
export function suggestOrderLink(businessName: string): string {
  const slug = businessName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug.length >= 3 ? slug : `shop-${slug || 'orders'}`
}

/** What the link box accepts while typing: lowercase letters, digits and hyphens. */
export function sanitizeOrderLink(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

export function isValidOrderLink(link: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(link)
}

// ── The supplier's side ───────────────────────────────────────────────

export async function listOrders(): Promise<OrderRequest[]> {
  return fetchAll<OrderRequest>((from, to) =>
    supabase
      .from('order_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

export async function countPendingOrders(): Promise<number> {
  const { count, error } = await supabase
    .from('order_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function getOrder(id: string): Promise<OrderRequest> {
  const { data, error } = await supabase.from('order_requests').select('*').eq('id', id).single()
  if (error) throw error
  return data as OrderRequest
}

export interface ApproveOrderInput {
  requestId: string
  orderId: string
  /** An existing customer the supplier picked… */
  customerId: string | null
  /** …or, only because the supplier chose it, a new one. */
  newCustomer: { name: string; phone: string; site: string } | null
  site: string | null
  items: NewInvoiceItem[]
  gstApplicable: boolean
  transportLabourCharge: number
}

/**
 * Turns an order into an estimate (approve_order), in one step: the estimate
 * is made through the same create_quotation as New Estimate, and the order is
 * marked approved and linked to it. Returns the estimate's id.
 */
export async function approveOrder(input: ApproveOrderInput): Promise<{ quotationId: string; customerId: string | null }> {
  const raw = await callRpc<{ quotation?: Quotation; customer_id?: string; already?: boolean; quotation_id?: string }>(
    'approve_order',
    {
      p_request_id: input.requestId,
      p_order_id: input.orderId,
      p_customer_id: input.customerId,
      p_new_customer: input.newCustomer,
      p_site: input.site,
      p_items: input.items,
      p_gst: input.gstApplicable,
      p_transport: input.transportLabourCharge,
    },
  )
  const quotationId = raw.quotation?.id ?? raw.quotation_id ?? ''
  if (!raw.already) {
    void logActivity('supplier', 'order_approved', { details: { order_id: input.orderId, quotation_id: quotationId } })
  }
  return { quotationId, customerId: raw.customer_id ?? input.customerId }
}

/** Reject with a reason from the list; `reason` is the words for "Other". The customer sees it. */
export async function rejectOrder(orderId: string, code: NonNullable<OrderRequest['reject_code']>, reason: string): Promise<void> {
  const raw = await callRpc<{ ok?: boolean; already?: boolean }>('reject_order', { p_order_id: orderId, p_reason: reason, p_code: code })
  if (!raw.already) void logActivity('supplier', 'order_rejected', { details: { order_id: orderId } })
}

/**
 * Settings → Online orders. A taken link or one in the wrong shape comes back
 * as a plain sentence rather than a Postgres code.
 */
export async function saveOrderSettings(
  supplierId: string,
  input: Pick<Supplier, 'ordering_enabled' | 'order_show_prices' | 'order_link'>,
): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(input).eq('id', supplierId).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('link-taken')
    if (error.code === '23514') throw new Error('link-invalid')
    throw error
  }
  return data as Supplier
}
