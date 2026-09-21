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
      /** The business address and phone, for Get directions and Call (migration 031 — absent before it). */
      address?: string | null
      phone?: string | null
      show_prices: boolean
      /** True when the shop takes UPI, so "pay online" is worth offering (migration 037). */
      upi?: boolean
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
  /** What the customer says they will do about paying (037). Only asked where the shop takes UPI. */
  paymentMethod?: 'cash' | 'online' | null
}

/** Returns the status code for the customer's status link (null only for a bot). */
export async function placeOrder(input: PlaceOrderInput): Promise<{ token: string | null; duplicate: boolean }> {
  const args: Record<string, unknown> = {
    p_link: input.link,
    p_request_id: input.requestId,
    p_name: input.name,
    p_phone: input.phone,
    p_site: input.site || null,
    p_delivery_date: input.deliveryDate || null,
    p_note: input.note || null,
    p_items: input.items,
    p_trap: input.trap || null,
    p_payment_method: input.paymentMethod ?? null,
  }
  let raw: { token: string | null; duplicate?: boolean }
  try {
    raw = await callRpc<{ token: string | null; duplicate?: boolean }>('place_order', args)
  } catch (error) {
    // Migration 037 changed this function's parameters. A build can reach a
    // database that has not had it pasted yet — a preview always does — and a
    // customer must not be told ordering is broken in that window.
    // Delete this once 037 is applied everywhere.
    if (!isMissingFunction(error)) throw error
    delete args.p_payment_method
    raw = await callRpc<{ token: string | null; duplicate?: boolean }>('place_order', args)
  }
  return { token: raw.token, duplicate: !!raw.duplicate }
}

function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  const message = (error as { message?: string } | null)?.message ?? ''
  return code === 'PGRST202' || /could not find the function/i.test(message)
}

/** The estimate made from an approved order, as its customer sees it (migration 030). */
export interface EstimateView {
  quote_no: string
  status: Quotation['status']
  subtotal: number
  gst_amount: number
  transport_labour_charge: number
  total: number
  items: { description: string; qty: number; rate: number; amount: number }[]
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
      /** Present only once approved: the estimate, and the customer's answer (migration 030). */
      estimate?: EstimateView
      response?: OrderRequest['customer_response']
      responded_at?: string | null
      /** Migration 031 — absent until it is applied. When the order was approved or rejected. */
      decided_at?: string | null
      /** The bill made from the estimate, once there is one (031); its figures since 037. */
      bill?: {
        invoice_no: string
        created_at: string
        delivered: boolean
        delivered_at?: string | null
        received_at: string | null
        total?: number
        paid?: number
      }
      /** What the customer chose about paying (037). */
      payment_method?: 'cash' | 'online' | null
      /** Only for a customer who chose to pay online, and only while something is owed (037). */
      upi_id?: string
      due?: number
      /** Only while the supplier takes online orders (031). */
      order_link?: string
    }

export function getOrderStatus(token: string): Promise<OrderStatusView> {
  return callRpc<OrderStatusView>('order_status', { p_token: token })
}

/** The customer's answer to the estimate on their status link — nothing is billed by it. */
export async function respondToEstimate(token: string, response: 'accepted' | 'call_me'): Promise<void> {
  await callRpc<{ ok?: boolean }>('respond_to_estimate', { p_token: token, p_response: response })
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

/**
 * Says yes to an order without pricing it (accept_order, migration 037). The
 * customer sees Approved at once; the estimate is written afterwards, by the
 * same Approve path as before. Nothing is created, billed or moved by this.
 */
export async function acceptOrder(orderId: string): Promise<void> {
  const raw = await callRpc<{ ok?: boolean; already?: boolean }>('accept_order', { p_order_id: orderId })
  if (!raw.already) {
    void logActivity('supplier', 'order_approved', { details: { order_id: orderId } })
  }
}

/** Reject with a reason from the list; `reason` is the words for "Other". The customer sees it. */
export async function rejectOrder(orderId: string, code: NonNullable<OrderRequest['reject_code']>, reason: string): Promise<void> {
  const raw = await callRpc<{ ok?: boolean; already?: boolean }>('reject_order', { p_order_id: orderId, p_reason: reason, p_code: code })
  if (!raw.already) void logActivity('supplier', 'order_rejected', { details: { order_id: orderId } })
}

/**
 * Estimates a customer has accepted that are still waiting to be billed — the
 * Dashboard banner. With just one, its id too, so the banner opens it directly.
 */
export async function acceptedEstimates(): Promise<{ count: number; quotationId: string | null }> {
  const { data, count, error } = await supabase
    .from('order_requests')
    .select('quotation_id, quotations!inner(status)', { count: 'exact' })
    .eq('customer_response', 'accepted')
    .in('quotations.status', ['Draft', 'Sent'])
    .limit(1)
  if (error) throw error
  return { count: count ?? 0, quotationId: (data?.[0]?.quotation_id as string | null | undefined) ?? null }
}

/** The customer's note and wanted date, for bills made from online orders — the driver's list. */
export async function listOrderNotesForQuotations(
  quotationIds: string[],
): Promise<{ quotation_id: string; note: string | null; delivery_date: string | null }[]> {
  const rows: { quotation_id: string; note: string | null; delivery_date: string | null }[] = []
  for (let start = 0; start < quotationIds.length; start += 100) {
    const { data, error } = await supabase
      .from('order_requests')
      .select('quotation_id, note, delivery_date')
      .in('quotation_id', quotationIds.slice(start, start + 100))
    if (error) throw error
    rows.push(...((data ?? []) as { quotation_id: string; note: string | null; delivery_date: string | null }[]))
  }
  return rows
}

/** The online order an estimate was made from, if any — for the customer's answer on the estimate page. */
export async function getOrderForQuotation(quotationId: string): Promise<Pick<OrderRequest, 'id' | 'customer_response' | 'responded_at'> | null> {
  const { data, error } = await supabase
    .from('order_requests')
    .select('id, customer_response, responded_at')
    .eq('quotation_id', quotationId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Blocked numbers (migration 032) ───────────────────────────────────

/** The supplier's blocked numbers, newest first. Throws until 032 is applied — callers treat that as "not available". */
export async function listBlockedPhones(): Promise<{ phone: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from('order_blocked_phones')
    .select('phone, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as { phone: string; created_at: string }[]
}

/**
 * Blocks a number: its orders are refused from now on — the sender is told it
 * worked and nothing is kept — and its orders still waiting are rejected.
 */
export async function blockOrderPhone(phone: string): Promise<{ rejected: number }> {
  const raw = await callRpc<{ rejected?: number }>('block_order_phone', { p_phone: phone, p_block: true })
  return { rejected: raw.rejected ?? 0 }
}

export async function unblockOrderPhone(phone: string): Promise<void> {
  await callRpc<{ ok?: boolean }>('block_order_phone', { p_phone: phone, p_block: false })
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
