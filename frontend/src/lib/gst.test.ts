import { describe, it, expect } from 'vitest'
import { formatRate, gstSlabs, lineGst, rateForMaterial, taxLines } from './gst'

const mats = [{ id: 'a', gst_rate: 5 }, { id: 'b', gst_rate: null }, { id: 'c' }]

// The bill preview must round tax exactly as the database does when it saves the bill.
describe('lineGst', () => {
  it('rounds each line to whole rupees', () => {
    expect(lineGst(1000, 18)).toBe(180)
    expect(lineGst(999, 5)).toBe(50)
    expect(lineGst(0, 18)).toBe(0)
    expect(lineGst(333, 12.5)).toBe(42)
  })
})

// A material with no GST rate set must still be charged the old 18%, never 0.
describe('rateForMaterial', () => {
  it('falls back to 18 for anything it does not know', () => {
    expect(rateForMaterial(null, mats)).toBe(18)
    expect(rateForMaterial('zzz', mats)).toBe(18)
    expect(rateForMaterial('a', mats)).toBe(5)
    expect(rateForMaterial('b', mats)).toBe(18)
    expect(rateForMaterial('c', mats)).toBe(18)
  })
})

// Each line is taxed at its own material's rate, and the GST switch off means no tax at all.
describe('taxLines', () => {
  const items = [
    { material_id: 'a', qty: 10, rate: 350 },
    { material_id: null, qty: 2, rate: 100 },
  ]

  it('taxes each line at its own rate', () => {
    expect(taxLines(items, mats, true)).toEqual([
      { amount: 3500, rate: 5, gst: 175 },
      { amount: 200, rate: 18, gst: 36 },
    ])
  })

  it('charges nothing while GST is switched off', () => {
    expect(taxLines(items, mats, false)).toEqual([
      { amount: 3500, rate: 0, gst: 0 },
      { amount: 200, rate: 0, gst: 0 },
    ])
  })
})

// A tax invoice with several rates must show one total per rate; old lines without a rate are left out.
describe('gstSlabs', () => {
  it('groups by rate, skips missing and 0% rates, sorts by rate', () => {
    expect(
      gstSlabs([
        { amount: 20000, gst_rate: 5, gst_amount: 1000 },
        { amount: 5000, gst_rate: 18, gst_amount: 900 },
        { amount: 1000, gst_rate: 5, gst_amount: 50 },
        { amount: 700, gst_rate: null },
        { amount: 300, gst_rate: 0, gst_amount: 0 },
      ]),
    ).toEqual([
      { rate: 5, taxable: 21000, amount: 1050 },
      { rate: 18, taxable: 5000, amount: 900 },
    ])
  })
})

// Bills print 18% or 12.5%, never 18.00%.
describe('formatRate', () => {
  it('drops trailing zeros', () => {
    expect(formatRate(18)).toBe('18%')
    expect(formatRate(12.5)).toBe('12.5%')
    expect(formatRate(5.0)).toBe('5%')
    expect(formatRate(0.25)).toBe('0.25%')
  })
})
