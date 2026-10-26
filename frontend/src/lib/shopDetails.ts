import type { Material, Supplier } from './database.types'
import { translate, type Lang, type TranslationKey } from './i18n'
import { dateLocale, showDate, showTime } from './displayDate'
import { DAYS, readHours, type DayKey } from './shopPage'
import { byLoad, isVehicleOption } from './sellingType'

/**
 * "Send shop details" (2026-10-27): one WhatsApp message to a customer who
 * just called — the shop's name, address, phone and hours, its order link,
 * and every material it sells with today's rate.
 *
 * The supplier wanted it to pop up by itself when a call ends. No web app can
 * know a call happened or who called (checked twice: 2026-09-21 and
 * 2026-10-27), so the supplier opens it — a long-press on the app icon
 * (the manifest's shortcut) or the Dashboard card — and types or picks the
 * number. The message follows the app's language, like every WhatsApp
 * message in this app; material names are sent as the shop wrote them.
 */

type Shop = Pick<Supplier, 'business_name' | 'address' | 'phone' | 'order_link' | 'ordering_enabled'> & {
  hours?: Supplier['hours']
}

type Sellable = Pick<Material, 'name' | 'rate' | 'per_label' | 'unit_label'> &
  Partial<Pick<Material, 'available' | 'sold_by' | 'listing_name' | 'vehicle' | 'capacity' | 'capacity_unit'>>

/** ₹1,23,456 — or ₹8.5 for a brick. */
function rupees(n: number): string {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/** "98765 43210", easier to read aloud; anything else as it was typed. */
function phoneText(phone: string): string {
  const p = phone.trim()
  return /^\d{10}$/.test(p) ? `${p.slice(0, 5)} ${p.slice(5)}` : p
}

/** "Monday" / "सोमवार", in the reader's language. */
function dayName(d: DayKey, lang: Lang): string {
  // 1 January 2024 was a Monday, the first of DAYS.
  return new Date(Date.UTC(2024, 0, 1 + DAYS.indexOf(d))).toLocaleDateString(dateLocale(lang), {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

/**
 * The shop's hours in one line — "9 am – 7 pm · Sunday closed" — when every
 * day it opens has the same times. Hours that differ by day would need a
 * table, which a WhatsApp message is no place for, so then there is no line.
 */
export function hoursLine(raw: unknown, lang: Lang): string | null {
  const hours = readHours(raw)
  if (!hours) return null
  const open = DAYS.flatMap((d) => {
    const h = hours[d]
    return h && !('closed' in h) ? [h] : []
  })
  if (open.length === 0) return null
  const [first] = open
  if (open.some((h) => h.open !== first.open || h.close !== first.close)) return null
  const time = `${showTime(first.open, lang, false)} – ${showTime(first.close, lang)}`
  const closed = DAYS.filter((d) => {
    const h = hours[d]
    return h && 'closed' in h
  })
  if (closed.length === 0) return time
  return `${time} · ${translate(lang, 'shopMsg.closedOn', { days: closed.map((d) => dayName(d, lang)).join(', ') })}`
}

/** The shop's order link, while it takes orders. */
export function shopOrderLink(shop: Pick<Shop, 'order_link' | 'ordering_enabled'>, origin: string): string | null {
  return shop.ordering_enabled && shop.order_link ? `${origin}/order/${shop.order_link}` : null
}

/** Every material a customer can be offered: not switched off, one listing's loads together, smallest first. */
export function messageMaterials<T extends Sellable>(materials: T[]): T[] {
  return materials
    .filter((m) => m.available !== false)
    .sort(
      (a, b) =>
        (a.listing_name || a.name).trim().localeCompare((b.listing_name || b.name).trim()) ||
        byLoad(a, b) ||
        a.name.localeCompare(b.name),
    )
}

function rateText(m: Sellable, lang: Lang): string {
  if (!(Number(m.rate) > 0)) return translate(lang, 'shopMsg.askRate')
  const unit = isVehicleOption(m)
    ? translate(lang, 'sec.perLoad')
    : m.per_label?.trim() || (m.unit_label?.trim() ? `/ ${m.unit_label.trim()}` : '')
  return unit ? `${rupees(Number(m.rate))} ${unit}` : rupees(Number(m.rate))
}

export function shopDetailsMessage(
  shop: Shop,
  materials: Sellable[],
  { lang, origin, today = new Date() }: { lang: Lang; origin: string; today?: Date },
): string {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
  // WhatsApp shows *…* in bold.
  const lines = [`*${shop.business_name.trim()}*`]

  const address = shop.address?.replace(/\s*\n+\s*/g, ', ').trim()
  if (address) lines.push(t('shopMsg.address', { address }))
  if (shop.phone?.trim()) lines.push(t('shopMsg.phone', { phone: phoneText(shop.phone) }))
  const hours = hoursLine(shop.hours, lang)
  if (hours) lines.push(t('shopMsg.hours', { hours }))

  const link = shopOrderLink(shop, origin)
  if (link) lines.push('', t('shopMsg.orderOnline', { link }))

  const list = messageMaterials(materials)
  if (list.length > 0) {
    lines.push('', t('shopMsg.ratesHeader', { date: showDate(today.toISOString(), lang) }))
    for (const m of list) lines.push(`• ${m.name.trim()} — ${rateText(m, lang)}`)
    if (list.some((m) => Number(m.rate) > 0)) lines.push('', t('rates.msgFooter'))
  }
  return lines.join('\n')
}
