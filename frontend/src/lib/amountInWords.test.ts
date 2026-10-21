import { describe, it, expect } from 'vitest'
import { amountInWords } from './amountInWords'

// The ledger prints the closing balance in words so it can't be misread or disputed.
describe('amountInWords', () => {
  it.each([
    [0, 'Zero Rupees Only'],
    [15, 'Fifteen Rupees Only'],
    [21, 'Twenty One Rupees Only'],
    [100, 'One Hundred Rupees Only'],
    [1050, 'One Thousand Fifty Rupees Only'],
    [99.6, 'One Hundred Rupees Only'],
    [100000, 'One Lakh Rupees Only'],
    [1234567, 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees Only'],
    [10000000, 'One Crore Rupees Only'],
    [105000050, 'Ten Crore Fifty Lakh Fifty Rupees Only'],
    [-500, 'Five Hundred Rupees Only'],
  ])('%s → %s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words)
  })

  // Current behaviour, recorded rather than fixed: "Rupees" stays plural for 1.
  it('1 → One Rupees Only (current behaviour)', () => {
    expect(amountInWords(1)).toBe('One Rupees Only')
  })
})
