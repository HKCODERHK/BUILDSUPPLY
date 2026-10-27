import { describe, expect, it, vi } from 'vitest'

// The ledger reads one helper from the payments service, which imports the
// Supabase client; nothing here talks to a database.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { buildCustomerLedger } from './customerLedger'
import type { InvoiceWithCustomer } from '@/services/invoices'
import type { PaymentWithInvoice } from '@/services/payments'

// A ₹10,000 bill, ₹50,000 typed for ₹5,000, then corrected (migration 052).
const bill = {
  id: 'b1',
  customer_id: 'c',
  status: 'Partial',
  kind: 'bill',
  invoice_no: 'INV-1001',
  total: 10000,
  site: 'Plot 12',
  created_at: '2026-10-27T10:00:00Z',
} as unknown as InvoiceWithCustomer

const onBill = (amount: number) => [{ amount, released_at: null, invoices: { invoice_no: 'INV-1001', kind: 'bill' as const, site: 'Plot 12' } }]

// The shop's own rows: ids, and the correction pointing at what it corrects.
const shopRows = [
  { id: 'p1', customer_id: 'c', amount: 50000, mode: 'Cash', created_at: '2026-10-27T10:05:00Z', payment_allocations: [] },
  { id: 'p2', customer_id: 'c', amount: 5000, mode: 'Cash', created_at: '2026-10-27T10:10:00Z', corrects_payment_id: 'p1', correction_reason: 'Typed 50000', payment_allocations: onBill(5000) },
  { id: 'p3', customer_id: 'c', amount: -50000, mode: 'Cash', created_at: '2026-10-27T10:10:01Z', corrects_payment_id: 'p1', correction_reason: 'Typed 50000', payment_allocations: [] },
  { id: 'p4', customer_id: 'c', amount: 2000, mode: 'UPI', created_at: '2026-10-27T11:00:00Z', payment_allocations: onBill(2000) },
] as unknown as PaymentWithInvoice[]

// The khata link's rows: no ids, flags instead (customer_khata, 052).
const khataRows = [
  { customer_id: 'c', amount: 50000, mode: 'Cash', created_at: '2026-10-27T10:05:00Z', reversed: true, payment_allocations: [] },
  { customer_id: 'c', amount: 5000, mode: 'Cash', created_at: '2026-10-27T10:10:00Z', correction: true, reason: 'Typed 50000', payment_allocations: onBill(5000) },
  { customer_id: 'c', amount: -50000, mode: 'Cash', created_at: '2026-10-27T10:10:01Z', reversal: true, reason: 'Typed 50000', payment_allocations: [] },
  { customer_id: 'c', amount: 2000, mode: 'UPI', created_at: '2026-10-27T11:00:00Z', payment_allocations: onBill(2000) },
] as unknown as PaymentWithInvoice[]

describe('buildCustomerLedger with a corrected payment', () => {
  for (const [label, payments] of [['the shop’s list', shopRows], ['the khata link', khataRows]] as const) {
    it(`adds up and marks only the wrong entry, from ${label}`, () => {
      const { entries } = buildCustomerLedger({ customerId: 'c', invoices: [bill], payments })
      expect(entries.map((e) => [e.type, e.credit || e.debit, !!e.corrected])).toEqual([
        ['Invoice', 10000, false],
        ['Payment', 50000, true],
        ['Payment', 5000, false],
        ['Correction', -50000, false],
        ['Payment', 2000, false],
      ])
      // ₹10,000 billed, ₹7,000 really paid.
      expect(entries[entries.length - 1].balance).toBe(3000)
      expect(entries.find((e) => e.type === 'Correction')?.ref).toBe('Typed 50000')
    })
  }

  it('leaves the correction and the wrong entry out of a one-site statement', () => {
    const { entries } = buildCustomerLedger({ customerId: 'c', invoices: [bill], payments: shopRows, site: 'Plot 12' })
    expect(entries.map((e) => e.type)).toEqual(['Invoice', 'Payment', 'Payment'])
    expect(entries[entries.length - 1].balance).toBe(3000)
  })
})
