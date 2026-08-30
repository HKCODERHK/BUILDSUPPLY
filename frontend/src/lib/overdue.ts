// How long money has been owed. Collection is the hardest part of this
// business, and "pending ₹40,000" reads very differently from "pending
// ₹40,000 since 62 days" — the age is what makes a supplier pick up the
// phone. Derived entirely from dates already on the invoices, so there is no
// due-date field for anyone to fill in or get wrong.

const DAY_MS = 24 * 60 * 60 * 1000

// A bill is treated as settled below one rupee, so rounding on a split
// payment can't leave a customer looking permanently overdue by 40 paise.
const SETTLED_BELOW = 1

export interface AgeableInvoice {
  created_at: string
  total: number
  paid: number
  status: string
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS))
}

/** Age in days of the oldest bill still carrying a balance. Null if nothing is owed. */
export function oldestPendingDays(invoices: AgeableInvoice[]): number | null {
  let oldest: string | null = null
  for (const inv of invoices) {
    if (inv.status === 'Cancelled') continue
    if (Number(inv.total) - Number(inv.paid) < SETTLED_BELOW) continue
    if (!oldest || inv.created_at < oldest) oldest = inv.created_at
  }
  return oldest ? daysSince(oldest) : null
}

/**
 * Red past two months, amber past one. Anything newer is normal trade credit
 * in this industry and shouldn't be dressed up as a problem.
 */
export function overdueTone(days: number): 'muted' | 'warning' | 'danger' {
  if (days >= 60) return 'danger'
  if (days >= 30) return 'warning'
  return 'muted'
}

export function overdueTextClass(days: number): string {
  const tone = overdueTone(days)
  if (tone === 'danger') return 'text-red-600 dark:text-red-400'
  if (tone === 'warning') return 'text-amber-600 dark:text-amber-400'
  return 'text-muted'
}
