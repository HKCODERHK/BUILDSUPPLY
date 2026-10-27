import { describe, expect, it } from 'vitest'
import { cartChanges, droppedIds } from './orderPageDiff'
import type { OrderPageMaterial } from '@/services/orders'

const cement: OrderPageMaterial = { id: 'c', name: 'Cement', category: null, unit: 'Bag', price: 380, delivery_charge: null, available: true }
const sand: OrderPageMaterial = { id: 's', name: 'Sand', category: null, unit: 'Brass', price: 1000, delivery_charge: 200, available: true }
const brick: OrderPageMaterial = { id: 'b', name: 'Brick', category: null, unit: 'Piece', price: null, available: true }

describe('cartChanges', () => {
  it('says nothing when the cart is as the shop lists it now', () => {
    expect(cartChanges([cement, sand], [{ ...cement }, { ...sand }], ['c', 's'])).toEqual([])
  })

  it('names a price that moved, with both figures', () => {
    expect(cartChanges([cement], [{ ...cement, price: 400 }], ['c'])).toEqual([
      { id: 'c', name: 'Cement', kind: 'price', from: 380, to: 400 },
    ])
  })

  it('treats 400 and "400.00" as the same price', () => {
    expect(cartChanges([{ ...cement, price: 400 }], [{ ...cement, price: '400.00' as unknown as number }], ['c'])).toEqual([])
  })

  it('reports a price that appeared or went to "on request"', () => {
    expect(cartChanges([brick], [{ ...brick, price: 9 }], ['b'])).toEqual([{ id: 'b', name: 'Brick', kind: 'price', from: null, to: 9 }])
    expect(cartChanges([cement], [{ ...cement, price: null }], ['c'])).toEqual([
      { id: 'c', name: 'Cement', kind: 'price', from: 380, to: null },
    ])
  })

  it('reports a delivery charge that changed', () => {
    expect(cartChanges([sand], [{ ...sand, delivery_charge: 250 }], ['s'])).toEqual([
      { id: 's', name: 'Sand', kind: 'delivery', from: 200, to: 250 },
    ])
  })

  it('reports a material the shop removed or switched off, and nothing else about it', () => {
    const changes = cartChanges([cement, sand], [{ ...sand, available: false, price: 1 }], ['c', 's'])
    expect(changes).toEqual([
      { id: 'c', name: 'Cement', kind: 'removed' },
      { id: 's', name: 'Sand', kind: 'unavailable' },
    ])
    expect([...droppedIds(changes)].sort()).toEqual(['c', 's'])
  })

  it('looks only at what is in the cart', () => {
    expect(cartChanges([cement, sand], [{ ...cement, price: 1 }], ['s'])).toEqual([{ id: 's', name: 'Sand', kind: 'removed' }])
  })
})
