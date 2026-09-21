/**
 * Whether a bill counts as received, and on whose word.
 *
 * The customer taps "Material received?" on their khata link, and only they
 * can — 030's `invoice_received_guard` refuses the supplier writing
 * `received_at`, which is what lets a bill say "Customer confirmed received"
 * and mean it in an argument.
 *
 * Most customers never tap anything, so the supplier was left waiting for a
 * reply that was not coming (asked about 2026-09-21). A delivery a day old
 * with no reply now counts as received — but as its own thing, `assumed`,
 * said in its own words. `received_at` is still only ever the customer's.
 */
export type ReceivedState =
  /** The customer tapped it themselves. */
  | 'confirmed'
  /** Delivered over a day ago and never disputed. */
  | 'assumed'
  /** Delivered, and the day is not up. */
  | 'waiting'
  /** Not delivered yet. */
  | 'none'

const DAY_MS = 24 * 60 * 60 * 1000

export function receivedState(
  bill: {
    delivered?: boolean | null
    delivered_at?: string | null
    received_at?: string | null
    created_at?: string | null
  },
  now: number = Date.now(),
): ReceivedState {
  if (bill.received_at) return 'confirmed'
  if (!bill.delivered) return 'none'
  // No `delivered_at`: either the bill was delivered before 034 added the
  // column, or this page is running against a database that has not had 034
  // pasted yet. The bill's own date is the honest floor in both cases — a
  // delivery cannot predate its bill — and it keeps the day's grace for a
  // bill made today, which a plain "assume received" would have thrown away.
  const from = bill.delivered_at ?? bill.created_at
  if (!from) return 'assumed'
  return now - new Date(from).getTime() >= DAY_MS ? 'assumed' : 'waiting'
}

/** True once the goods count as received, whoever said so. */
export function isReceived(bill: Parameters<typeof receivedState>[0], now?: number) {
  const state = receivedState(bill, now)
  return state === 'confirmed' || state === 'assumed'
}
