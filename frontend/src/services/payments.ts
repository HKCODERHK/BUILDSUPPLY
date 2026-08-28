import { supabase } from '@/lib/supabase'
import type { Payment, PaymentMode } from '@/lib/database.types'
import { logActivity } from './activityLog'

export interface PaymentWithInvoice extends Payment {
  invoices: { invoice_no: string; customers: { name: string } | null } | null
}

export async function listPayments(): Promise<PaymentWithInvoice[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, invoices(invoice_no, customers(name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as PaymentWithInvoice[]
}

// A "split" payment is just multiple payment rows against one invoice
// (e.g. part Cash, part UPI) — recorded in a single call.
export async function recordPayment(
  supplierId: string,
  invoiceId: string,
  splits: { amount: number; mode: PaymentMode }[],
): Promise<void> {
  const rows = splits
    .filter((s) => s.amount > 0)
    .map((s) => ({ supplier_id: supplierId, invoice_id: invoiceId, amount: s.amount, mode: s.mode }))
  if (rows.length === 0) return

  const { error } = await supabase.from('payments').insert(rows)
  if (error) throw error

  const totalPaidNow = rows.reduce((sum, r) => sum + r.amount, 0)

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('paid, total')
    .eq('id', invoiceId)
    .single()
  if (invoiceError) throw invoiceError

  const newPaid = Number(invoice.paid) + totalPaidNow
  const status = newPaid >= Number(invoice.total) ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ paid: newPaid, status })
    .eq('id', invoiceId)
  if (updateError) throw updateError

  void logActivity('supplier', 'payment_recorded', { details: { invoice_id: invoiceId, amount: totalPaidNow } })
  void logActivity('supplier', 'invoice_updated', { details: { invoice_id: invoiceId, status } })
}
