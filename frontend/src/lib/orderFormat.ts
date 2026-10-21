import type { OrderRequest, RejectCode } from '@/lib/database.types'
import { loadsKey, totalMaterialText } from '@/lib/sellingType'

/** "11 Sept, 9:30 pm" — when an online order arrived. */
export function formatOrderDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** "100 Bag Cement, 500 KG TMT +2 more" — quantity first, since names carry dashes of their own. */
export function orderItemsSummary(order: OrderRequest, more: (count: number) => string) {
  const shown = order.items.slice(0, 2).map((i) => `${Number(i.qty).toLocaleString('en-IN')} ${i.unit} ${i.name}`.replace(/\s+/g, ' ').trim())
  const rest = order.items.length - shown.length
  return shown.join(', ') + (rest > 0 ? ` ${more(rest)}` : '')
}

/** The reasons a supplier can pick when rejecting, in the order the list shows them (migration 027). */
export const REJECT_CODES: RejectCode[] = ['no_stock', 'too_many_orders', 'area_not_served', 'date_not_possible', 'other']

/**
 * What a rejection says: a listed reason in the reader's own language, or the
 * words the supplier wrote for "Other" (and for orders rejected before 027).
 */
export function rejectReasonText(
  o: { reject_code?: RejectCode | null; reject_reason?: string | null },
  t: (key: `rejectCode.${RejectCode}`) => string,
): string | null {
  if (o.reject_code && o.reject_code !== 'other') return t(`rejectCode.${o.reject_code}`)
  return o.reject_reason?.trim() || null
}

/**
 * How much of a material an order line asks for, never a bare number
 * (migration 050): "2 loads = 1,600 CFT" for a vehicle load as ordered,
 * "2 loads" for a line kept before 050 counted in loads, else "20 Bag".
 */
export function orderItemQtyText(
  item: { qty: number; unit: string; capacity?: number; capacity_unit?: string },
  t: (key: 'sell.oneLoad' | 'sell.loads', vars: { count: number }) => string,
): string {
  const qty = Number(item.qty)
  if (item.capacity && item.capacity_unit) {
    return `${t(loadsKey(qty), { count: qty })} = ${totalMaterialText(qty, item.capacity, item.capacity_unit)}`
  }
  if (/^loads?$/i.test(item.unit.trim())) return t(loadsKey(qty), { count: qty })
  return `${qty.toLocaleString('en-IN')} ${item.unit}`.trim()
}
