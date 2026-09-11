import type { OrderRequest } from '@/lib/database.types'

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
