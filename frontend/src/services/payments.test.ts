import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { correctionState, mayHaveBeenSaved } from './payments'
import type { Payment } from '@/lib/database.types'

describe('mayHaveBeenSaved', () => {
  it('is true only when the answer itself was lost', () => {
    expect(mayHaveBeenSaved(new TypeError('Failed to fetch'))).toBe(true)
    expect(mayHaveBeenSaved(new Error('TypeError: Load failed'))).toBe(true)
    expect(mayHaveBeenSaved(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(mayHaveBeenSaved(new Error('The request timed out'))).toBe(true)
    expect(mayHaveBeenSaved(new Error('This account is paused. Please contact BuildSupply.'))).toBe(false)
    expect(mayHaveBeenSaved(new Error('Enter the amount received.'))).toBe(false)
  })
})

describe('correctionState', () => {
  const row = (id: string, amount: number, corrects: string | null = null) =>
    ({ id, amount, corrects_payment_id: corrects, mode: 'Cash', created_at: '', supplier_id: 's', invoice_id: null, customer_id: 'c', is_advance: false }) as Payment
  const all = [row('a', 50000), row('b', 5000, 'a'), row('c', -50000, 'a'), row('d', 2000)]

  it('tells a reversal, the entry it reversed, the right amount and an ordinary receipt apart', () => {
    expect(all.map((p) => correctionState(p, all))).toEqual(['reversed', 'correction', 'reversal', 'normal'])
  })
})
