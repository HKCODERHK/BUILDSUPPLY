// Shared by the customer pages' app-style home (components/CustomerHome.tsx).

/** The time-of-day greeting, by the phone's own clock. */
export function greetingKey(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'khata.greetMorning' : h < 17 ? 'khata.greetAfternoon' : 'khata.greetEvening'
}

/**
 * One tint per kind of thing, the same in every place it appears: bills
 * amber, payments green, estimates sky, orders violet. Light and dark both.
 */
export const TINTS = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
} as const
export type Tint = keyof typeof TINTS
