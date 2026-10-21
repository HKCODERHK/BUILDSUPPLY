import { describe, it, expect } from 'vitest'
import { normalizeWhatsAppNumber } from './whatsapp'

// Regression: wa.me links once had no country code, so every WhatsApp button said "invalid number".
describe('normalizeWhatsAppNumber', () => {
  it.each(['09575011204', '+91 95750 11204', '95750-11204', '9575011204', '00919575011204'])(
    '%s → 919575011204',
    (raw) => {
      expect(normalizeWhatsAppNumber(raw)).toBe('919575011204')
    },
  )

  it('returns nothing for a number too short to use', () => {
    expect(normalizeWhatsAppNumber('12345')).toBe('')
    expect(normalizeWhatsAppNumber(null)).toBe('')
  })

  it('passes an overseas number through instead of making it Indian', () => {
    expect(normalizeWhatsAppNumber('447911123456')).toBe('447911123456')
  })
})
