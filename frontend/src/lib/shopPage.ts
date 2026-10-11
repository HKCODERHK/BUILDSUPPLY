import { normalizeWhatsAppNumber } from '@/lib/whatsapp'

// The shop's own page for customers (migration 042): its colour, its hours,
// its links. Pure helpers, shared by the supplier's Shop page settings and
// the three customer pages.

/**
 * The ten colours a shop can pick. Green is the app's own and needs no
 * override; the other nine are defined in index.css under [data-brand], each
 * checked for readable white button text (5:1 or better) in light and dark.
 */
export const BRAND_COLORS = [
  { key: 'green', swatch: '#198a45' },
  { key: 'teal', swatch: '#0f766e' },
  { key: 'blue', swatch: '#1d4ed8' },
  { key: 'indigo', swatch: '#4338ca' },
  { key: 'violet', swatch: '#6d28d9' },
  { key: 'pink', swatch: '#be185d' },
  { key: 'red', swatch: '#b91c1c' },
  { key: 'orange', swatch: '#c2410c' },
  { key: 'brown', swatch: '#92400e' },
  { key: 'slate', swatch: '#334155' },
] as const
export type BrandColor = (typeof BRAND_COLORS)[number]['key']

/** The value for a page root's data-brand, or undefined for the default green. */
export function brandAttr(color: string | null | undefined): string | undefined {
  return color && color !== 'green' && BRAND_COLORS.some((c) => c.key === color) ? color : undefined
}

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAYS)[number]
export type DayHours = { open: string; close: string } | { closed: true }
export type ShopHours = Partial<Record<DayKey, DayHours>>

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Only well-formed days survive; anything else in the stored JSON is ignored. */
export function readHours(raw: unknown): ShopHours | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: ShopHours = {}
  for (const d of DAYS) {
    const v = (raw as Record<string, unknown>)[d] as Record<string, unknown> | undefined
    if (!v || typeof v !== 'object') continue
    if (v.closed === true) out[d] = { closed: true }
    else if (typeof v.open === 'string' && typeof v.close === 'string' && TIME.test(v.open) && TIME.test(v.close)) {
      out[d] = { open: v.open, close: v.close }
    }
  }
  return Object.keys(out).length ? out : null
}

/** "09:00" → "9 am", "19:30" → "7:30 pm". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 || 12
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`
}

/**
 * Open right now? Read on the shop's own clock (India), whatever timezone the
 * customer's phone is set to. A day the shop has not filled in says nothing.
 */
export function openState(hours: ShopHours | null, now: Date = new Date()): { open: boolean; until: string } | null {
  if (!hours) return null
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
  const wd = parts.find((p) => p.type === 'weekday')?.value.toLowerCase().slice(0, 3) as DayKey | undefined
  const hm = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`
  const today = wd ? hours[wd] : undefined
  if (!today) return null
  if ('closed' in today) return { open: false, until: '' }
  if (hm >= today.open && hm < today.close) return { open: true, until: today.close }
  return { open: false, until: hm < today.open ? today.open : '' }
}

export type SocialKey = 'instagram' | 'facebook' | 'youtube' | 'website'
export const SOCIAL_KEYS: SocialKey[] = ['instagram', 'facebook', 'youtube', 'website']

/** A link is shown to customers only if it is a plain https:// address. */
export function safeLink(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const v = url.trim()
  if (!/^https:\/\/[^\s"'<>]+$/i.test(v) || v.length > 200) return null
  try {
    return new URL(v).protocol === 'https:' ? v : null
  } catch {
    return null
  }
}

/** wa.me for the shop: its WhatsApp number, else its phone. */
export function shopWhatsapp(p: { whatsapp?: string | null; phone?: string | null } | null): string | null {
  const n = normalizeWhatsAppNumber(p?.whatsapp || p?.phone)
  return n ? `https://wa.me/${n}` : null
}
