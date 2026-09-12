import type { InvoiceKind, InvoiceStatus, PaymentMode } from '@/lib/database.types'
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
}

export interface KhataPayment {
  amount: number
  mode: PaymentMode
  created_at: string
  /** Only the bills the payment is still on. */
  payment_allocations: { amount: number; released_at: null; invoices: { invoice_no: string; kind: InvoiceKind; site: string | null } }[]
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
    }

/** The public page (no sign-in). */
export function getKhata(token: string): Promise<KhataView> {
  return callRpc<KhataView>('customer_khata', { p_token: token })
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
