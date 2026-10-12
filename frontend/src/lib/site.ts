import { ADMIN_WHATSAPP_NUMBER } from '@/lib/adminContact'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { PLAN_CHOICES, type PlanChoice } from '@/lib/plans'

// The public website's facts, in one place: change a price or the trial here
// and the front page, the FAQ and the Terms all follow.
//
// The plans themselves live in lib/plans.ts, shared with the admin panel and
// the supplier's screens, so the website and the app can't drift apart.

export const TRIAL_DAYS = 10

export type PlanId = PlanChoice
export const PLANS = PLAN_CHOICES

const pro = PLANS.find((p) => p.id === 'pro')!.price
const yearly = PLANS.find((p) => p.id === 'yearly')!.price
/** What the yearly plan saves against twelve months of Pro. */
export const YEARLY_SAVING = pro * 12 - yearly
export const YEARLY_PER_MONTH = Math.round(yearly / 12)

export const SITE = {
  business: 'BuildSupply',
  place: 'Betul, Madhya Pradesh',
  email: 'himanshukhalatkar6@gmail.com',
  phone: ADMIN_WHATSAPP_NUMBER,
  courts: 'Betul, Madhya Pradesh',
  dataKeptDays: 30,
}

export function rupees(n: number) {
  return `₹${n.toLocaleString('en-IN')}`
}

/** WhatsApp to BuildSupply asking for a trial — the supplier presses send. */
export function askForTrial(plan?: PlanId) {
  const which = plan ? ` (${plan === 'basic' ? 'Basic' : plan === 'pro' ? 'Pro' : 'Yearly'} plan)` : ''
  openWhatsAppShare(
    ADMIN_WHATSAPP_NUMBER,
    `Hi, I'd like to start the ${TRIAL_DAYS}-day free trial of BuildSupply${which}. My shop's name is: `,
  )
}
