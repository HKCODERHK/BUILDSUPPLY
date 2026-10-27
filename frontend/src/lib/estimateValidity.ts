// How long an estimate holds, and whether it has run out (migration 052,
// audit F-03). The database answers the same question for customers with
// `_estimate_expired`; this is the same rule for the shop's own screens, so
// the two can't say different things.
//
//   expired = still Draft or Sent, its last day is before today, and the
//             customer did not accept it in time.
//
// An estimate saved before 052 has no last day and never expires — nothing
// already sent to a customer changes because this exists. For those, and for
// any estimate, `ageDays` is what a shop is shown before billing an old one.

import type { Quotation } from './database.types'

/** New estimates hold for this many days unless the shop changes it. */
export const ESTIMATE_VALID_DAYS = 15

/** A day `offsetDays` from today on this phone, as YYYY-MM-DD. */
export function localIsoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function estimateExpired(
  q: Pick<Quotation, 'status'> & { valid_until?: string | null },
  response?: string | null,
): boolean {
  return (
    (q.status === 'Draft' || q.status === 'Sent') && !!q.valid_until && q.valid_until < localIsoDate(0) && response !== 'accepted'
  )
}

/** Whole days since the estimate was made. */
export function estimateAgeDays(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
}

/** Old enough that rates may well have moved: worth a word before billing it. */
export const ESTIMATE_OLD_DAYS = ESTIMATE_VALID_DAYS
