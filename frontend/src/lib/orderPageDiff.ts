import type { OrderPageMaterial } from '@/services/orders'

/**
 * One thing the shop changed, since this order page was opened, about a
 * material in the customer's cart (audit F-02 / F-06). Prices here are null
 * when the page shows none ("price on request", or prices hidden).
 */
export interface CartChange {
  id: string
  name: string
  kind: 'removed' | 'unavailable' | 'price' | 'delivery'
  from?: number | null
  to?: number | null
}

function money(n: number | null | undefined): number | null {
  return n == null ? null : Number(n)
}

/**
 * What changed for the materials in the cart between the list the page
 * showed and the shop's list now. A material gone from the list, or switched
 * off, is a change of its own and nothing else is said about it.
 */
export function cartChanges(before: OrderPageMaterial[], after: OrderPageMaterial[], chosenIds: string[]): CartChange[] {
  const changes: CartChange[] = []
  for (const id of chosenIds) {
    const old = before.find((m) => m.id === id)
    if (!old) continue
    const now = after.find((m) => m.id === id)
    if (!now) {
      changes.push({ id, name: old.name, kind: 'removed' })
      continue
    }
    if (now.available === false) {
      changes.push({ id, name: now.name, kind: 'unavailable' })
      continue
    }
    if (money(old.price) !== money(now.price)) {
      changes.push({ id, name: now.name, kind: 'price', from: money(old.price), to: money(now.price) })
    }
    if (money(old.delivery_charge) !== money(now.delivery_charge)) {
      changes.push({ id, name: now.name, kind: 'delivery', from: money(old.delivery_charge), to: money(now.delivery_charge) })
    }
  }
  return changes
}

/** The ids a change takes out of the cart: gone from the list, or switched off. */
export function droppedIds(changes: CartChange[]): Set<string> {
  return new Set(changes.filter((c) => c.kind === 'removed' || c.kind === 'unavailable').map((c) => c.id))
}
