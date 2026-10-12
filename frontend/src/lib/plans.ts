import type { BillingCycle, Plan } from '@/lib/database.types'

// BuildSupply's three plans (migration 044, the user's prices 2026-10-12),
// in one place: the website's price cards, the admin's plan picker and the
// supplier's own screens all read this.
//
// The database keeps its old values. Basic is stored as plan 'starter';
// Pro as 'pro'; Pro Yearly as 'pro' with billing_cycle 'yearly'. Only one
// thing depends on the plan: Basic cannot take online orders, enforced by the
// `suppliers_plan_rules` trigger, not just here.

export type PlanChoice = 'basic' | 'pro' | 'yearly'

export const PLAN_CHOICES: {
  id: PlanChoice
  plan: Plan
  cycle: BillingCycle
  price: number
  period: 'month' | 'year'
  orders: boolean
  label: string
}[] = [
  { id: 'basic', plan: 'starter', cycle: 'monthly', price: 499, period: 'month', orders: false, label: 'Basic' },
  { id: 'pro', plan: 'pro', cycle: 'monthly', price: 699, period: 'month', orders: true, label: 'Pro' },
  { id: 'yearly', plan: 'pro', cycle: 'yearly', price: 7999, period: 'year', orders: true, label: 'Pro Yearly' },
]

/** Which of the three a supplier row is on. */
export function planChoiceOf(row: { plan: Plan; billing_cycle?: BillingCycle | null }): PlanChoice {
  if (row.plan !== 'pro') return 'basic'
  return row.billing_cycle === 'yearly' ? 'yearly' : 'pro'
}

export function planChoice(id: PlanChoice) {
  return PLAN_CHOICES.find((p) => p.id === id)!
}

/** "Basic", "Pro" or "Pro Yearly" — admin screens are English. */
export function planLabel(row: { plan: Plan; billing_cycle?: BillingCycle | null }) {
  return planChoice(planChoiceOf(row)).label
}

/** The admin's picker: "Pro Yearly — ₹7,999/year". */
export function planOptionText(id: PlanChoice) {
  const p = planChoice(id)
  return `${p.label} — ₹${p.price.toLocaleString('en-IN')}/${p.period}`
}

/** Whether this shop's plan includes online orders. */
export function planAllowsOrders(plan: Plan | null | undefined) {
  return plan === 'pro'
}
