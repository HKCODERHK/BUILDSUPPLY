// One place that decides what a supplier's subscription is doing, so the
// dashboard, the supplier list and the profile can never disagree about who
// needs chasing.
//
// The admin panel exists to answer three questions at a glance — who needs
// attention, who needs renewing, who do I contact — so the states are
// deliberately the four a human actually acts on, not an accounting model.

export type SubscriptionState = 'active' | 'expiring' | 'expired' | 'none'

/** A subscription counts as "expiring" once it is this close to running out. */
export const EXPIRING_WITHIN_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days until the subscription runs out. Negative once it has. */
export function daysUntilExpiry(expiry: string | null | undefined): number | null {
  if (!expiry) return null
  const end = new Date(`${expiry.slice(0, 10)}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / DAY_MS)
}

/**
 * `none` is its own state on purpose. A supplier with no expiry date set is
 * invisible to both "expired" and "expiring soon" — they quietly keep working
 * forever and never appear on any list. That's the failure worth surfacing,
 * not hiding.
 */
export function subscriptionState(expiry: string | null | undefined): SubscriptionState {
  const days = daysUntilExpiry(expiry)
  if (days === null) return 'none'
  if (days < 0) return 'expired'
  if (days <= EXPIRING_WITHIN_DAYS) return 'expiring'
  return 'active'
}

export const SUBSCRIPTION_LABEL: Record<SubscriptionState, string> = {
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  none: 'No expiry set',
}

export const SUBSCRIPTION_TONE: Record<SubscriptionState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  expiring: 'warning',
  expired: 'danger',
  none: 'neutral',
}

/** "expires in 5 days" / "expired 12 days ago" / "no expiry set" */
export function describeExpiry(expiry: string | null | undefined): string {
  const days = daysUntilExpiry(expiry)
  if (days === null) return 'No expiry set'
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
  if (days === 0) return 'Expires today'
  return `Expires in ${days} day${days === 1 ? '' : 's'}`
}

/**
 * Where a renewal should run to. Extends from the current expiry so renewing
 * early doesn't cost the supplier the days they've already paid for, but from
 * today if the subscription already lapsed — nobody wants to buy back the
 * weeks they were switched off.
 */
export function renewedExpiry(currentExpiry: string | null | undefined, months: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const current = currentExpiry ? new Date(`${currentExpiry.slice(0, 10)}T00:00:00`) : null
  const base = current && current > today ? current : today
  const next = new Date(base)
  next.setMonth(next.getMonth() + months)
  return next.toLocaleDateString('en-CA') // YYYY-MM-DD, local
}

/** Today as YYYY-MM-DD, for defaulting a new supplier's start date. */
export function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Today plus N days — the platform's default subscription length. */
export function todayPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}
