import type { InvoiceKind, InvoiceStatus, OrderStatus, PaymentMode, QuotationStatus } from '@/lib/database.types'
import { callRpc } from './db'

// The customer's khata link (migration 028). The supplier makes or stops a
// customer's link; the public page reads that one customer's statement
// through customer_khata(code) — see the migration for what it returns.

export interface KhataInvoice {
  invoice_no: string
  kind: InvoiceKind
  status: InvoiceStatus
  site: string | null
  total: number
  paid: number
  created_at: string
  /** Marked delivered by the supplier; received_at set by the customer's own tap (migration 030). */
  delivered?: boolean
  received_at?: string | null
  /**
   * An online order produced this bill (migration 033). False means the shop
   * took the order by phone or at the counter. Absent before 033, which is
   * why "by phone" is only claimed when it is exactly false.
   */
  from_order?: boolean
}

export interface KhataPayment {
  amount: number
  mode: PaymentMode
  created_at: string
  /** Only the bills the payment is still on. */
  payment_allocations: { amount: number; released_at: null; invoices: { invoice_no: string; kind: InvoiceKind; site: string | null } }[]
}

/** One of the customer's estimates, newest 20 (migration 031). */
export interface KhataEstimate {
  quote_no: string
  status: QuotationStatus
  site: string | null
  total: number
  created_at: string
}

/** One of the customer's online orders, newest 10 (migration 031). `code` opens its status link. */
export interface KhataOrder {
  code: string
  status: OrderStatus
  created_at: string
  delivery_date: string | null
  item_count: number
  /** The bill this order became, once one exists (migration 033). */
  bill?: string | null
}

export type KhataView =
  | { found: false }
  | {
      found: true
      supplier: { business_name: string; address: string | null; phone: string | null; gst_number: string | null; logo_url: string | null }
      customer: { name: string; phone: string | null; address: string | null; site: string | null }
      /** The customer page's own figures (customer_balances). */
      pending: number
      advance: number
      invoices: KhataInvoice[]
      payments: KhataPayment[]
      /** Only when the supplier has switched "Pay by UPI" on (migration 029). */
      upi_id?: string
      /** Migration 031 — absent until it is applied, so the page works either way. */
      estimates?: KhataEstimate[]
      orders?: KhataOrder[]
      /** Only while the supplier takes online orders. */
      order_link?: string
    }

export interface KhataDocumentLine {
  description: string
  qty: number
  rate: number
  amount: number
}

interface KhataDocumentTotals {
  created_at: string
  site: string | null
  subtotal: number
  gst_amount: number
  transport_labour_charge: number
  total: number
  items: KhataDocumentLine[]
}

/** One of the customer's own bills or estimates, with its lines — for its PDF (khata_document, migration 031). */
export type KhataDocument =
  | { found: false }
  | (KhataDocumentTotals & { found: true; kind: 'bill'; invoice_no: string; paid: number; status: InvoiceStatus })
  | (KhataDocumentTotals & { found: true; kind: 'estimate'; quote_no: string; status: QuotationStatus })

/** The public page (no sign-in). */
export function getKhata(token: string): Promise<KhataView> {
  return callRpc<KhataView>('customer_khata', { p_token: token })
}

/** One bill ('bill', its number) or estimate ('estimate', its number) of the link's own customer. */
export function getKhataDocument(token: string, kind: 'bill' | 'estimate', no: string): Promise<KhataDocument> {
  return callRpc<KhataDocument>('khata_document', { p_token: token, p_kind: kind, p_no: no })
}

/** The customer's link code — made the first time it is asked for. */
export function getKhataLink(customerId: string): Promise<string> {
  return callRpc<string>('khata_link', { p_customer_id: customerId })
}

/** Switches the link off at once; asking for it again makes a new one. */
export async function stopKhataLink(customerId: string): Promise<void> {
  await callRpc<null>('khata_link', { p_customer_id: customerId, p_stop: true })
}

/** The customer's "Material received" on one of their delivered bills. Never moves stock. */
export async function confirmReceived(token: string, invoiceNo: string): Promise<void> {
  await callRpc<{ ok?: boolean }>('confirm_received', { p_token: token, p_invoice_no: invoiceNo })
}

export function khataUrl(token: string): string {
  return `${window.location.origin}/khata/${token}`
}
