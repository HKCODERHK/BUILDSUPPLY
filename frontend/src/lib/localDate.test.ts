import { describe, it, expect } from 'vitest'
import { localDateKey } from './localDate'

// Guard: the date tests below only mean something if the run is in IST (vitest.config.ts sets TZ).
describe('test timezone', () => {
  it('is IST (UTC+5:30)', () => {
    expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).toBe(-330)
  })
})

// Regression: suppliers open early, and a 1:30 am bill must not land on yesterday (UTC vs IST).
describe('localDateKey', () => {
  it('puts 1:30 am IST on the next day', () => {
    expect(localDateKey('2026-10-20T20:00:00Z')).toBe('2026-10-21')
  })

  it('keeps 11:59:59 pm IST on the same day', () => {
    expect(localDateKey('2026-10-20T18:29:59Z')).toBe('2026-10-20')
  })

  it('puts exactly midnight IST on the next day', () => {
    expect(localDateKey('2026-10-20T18:30:00Z')).toBe('2026-10-21')
  })
})
