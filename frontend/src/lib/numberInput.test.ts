import { describe, it, expect } from 'vitest'
import { sanitizeDecimal, sanitizeDigits, sanitizePhone } from './numberInput'

// Quantity boxes are text fields, so anything that isn't a digit must be dropped as it's typed.
describe('sanitizeDigits', () => {
  it('keeps only digits', () => {
    expect(sanitizeDigits('12a3')).toBe('123')
    expect(sanitizeDigits(' 4 5 ')).toBe('45')
  })
})

// Suppliers type numbers every which way; the app stores just the 10 digits.
describe('sanitizePhone', () => {
  it.each(['09575011204', '+91 95750 11204', '95750-11204', '919575011204'])(
    '%s → 9575011204',
    (raw) => {
      expect(sanitizePhone(raw)).toBe('9575011204')
    },
  )

  it('keeps a real number that starts with 91', () => {
    expect(sanitizePhone('9175011204')).toBe('9175011204')
  })

  it('cuts to 10 digits', () => {
    expect(sanitizePhone('+91-9575011204123')).toBe('9575011204')
  })
})

// Rate and amount boxes allow one decimal point, and a trailing dot must survive while typing.
describe('sanitizeDecimal', () => {
  it('keeps digits and the first decimal point', () => {
    expect(sanitizeDecimal('12.3.4')).toBe('12.34')
    expect(sanitizeDecimal('abc12.')).toBe('12.')
    expect(sanitizeDecimal('.5')).toBe('.5')
    expect(sanitizeDecimal('1,250.75')).toBe('1250.75')
  })
})
