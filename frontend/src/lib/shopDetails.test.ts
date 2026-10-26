import { describe, it, expect } from 'vitest'
import { hoursLine, messageMaterials, shopDetailsMessage } from './shopDetails'

const shop = {
  business_name: 'Shree Balaji Building Materials ',
  address: 'Plot 12, MIDC Road\nNagpur',
  phone: '9876543210',
  order_link: 'shree-balaji',
  ordering_enabled: true,
  hours: {
    mon: { open: '09:00', close: '19:00' },
    tue: { open: '09:00', close: '19:00' },
    sun: { closed: true },
  },
}

const materials = [
  { name: 'UltraTech Cement', rate: 380, per_label: null, unit_label: 'Bag' },
  { name: 'Red brick', rate: 0, per_label: null, unit_label: 'Piece' },
  { name: 'Old gitti', rate: 9000, per_label: 'per tractor', unit_label: 'Load', available: false },
  {
    name: 'River Sand — Truck • 800 CFT', rate: 18000, per_label: null, unit_label: 'Load',
    sold_by: 'vehicle' as const, listing_name: 'River Sand', vehicle: 'Truck', capacity: 800, capacity_unit: 'CFT',
  },
  {
    name: 'River Sand — Tractor • 100 CFT', rate: 5000, per_label: null, unit_label: 'Load',
    sold_by: 'vehicle' as const, listing_name: 'River Sand', vehicle: 'Tractor', capacity: 100, capacity_unit: 'CFT',
  },
]

const today = new Date('2026-10-27T10:00:00+05:30')

describe('shopDetailsMessage', () => {
  it('carries the shop, its order link and every material with its rate', () => {
    expect(shopDetailsMessage(shop, materials, { lang: 'en', origin: 'https://buildsupplyin.vercel.app', today })).toBe(
      [
        '*Shree Balaji Building Materials*',
        'Address: Plot 12, MIDC Road, Nagpur',
        'Phone: 98765 43210',
        'Open: 9 am – 7 pm · Sunday closed',
        '',
        'Order online: https://buildsupplyin.vercel.app/order/shree-balaji',
        '',
        'Today’s rates (27 Oct 2026):',
        '• Red brick — ask for rate',
        '• River Sand — Tractor • 100 CFT — ₹5,000 per load',
        '• River Sand — Truck • 800 CFT — ₹18,000 per load',
        '• UltraTech Cement — ₹380 / Bag',
        '',
        'Rates may change. GST and transport extra where applicable.',
      ].join('\n'),
    )
  })

  it('leaves out what the shop has not set, and the link while ordering is off', () => {
    const msg = shopDetailsMessage(
      { business_name: 'Kalyani', address: null, phone: null, order_link: 'kalyani', ordering_enabled: false },
      [],
      { lang: 'en', origin: 'https://x', today },
    )
    expect(msg).toBe('*Kalyani*')
  })

  it('speaks the app’s language', () => {
    const msg = shopDetailsMessage(shop, materials.slice(0, 1), { lang: 'hi', origin: 'https://x', today })
    expect(msg).toContain('पता: Plot 12, MIDC Road, Nagpur')
    expect(msg).toContain('ऑनलाइन ऑर्डर करें: https://x/order/shree-balaji')
    expect(msg).toContain('रविवार बंद')
    expect(msg).toContain('• UltraTech Cement — ₹380 / Bag')
  })
})

describe('hoursLine', () => {
  it('gives no line when the days differ', () => {
    expect(hoursLine({ mon: { open: '09:00', close: '19:00' }, tue: { open: '10:00', close: '19:00' } }, 'en')).toBeNull()
  })

  it('gives no line when nothing is set or every day is closed', () => {
    expect(hoursLine(null, 'en')).toBeNull()
    expect(hoursLine({ sun: { closed: true } }, 'en')).toBeNull()
  })

  it('keeps half hours', () => {
    expect(hoursLine({ mon: { open: '09:30', close: '19:30' } }, 'en')).toBe('9:30 am – 7:30 pm')
  })
})

describe('messageMaterials', () => {
  it('drops switched-off materials', () => {
    expect(messageMaterials(materials).map((m) => m.name)).not.toContain('Old gitti')
  })
})
