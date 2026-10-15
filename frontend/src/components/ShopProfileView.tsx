import { useState, type ReactNode } from 'react'
import { Clock, Globe, MapPin, MessageCircle, Navigation, Phone, Store, Tag, Truck } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { showDate, showTime } from '@/lib/displayDate'
import { DAYS, openState, readHours, safeLink, shopWhatsapp, SOCIAL_KEYS, type SocialKey } from '@/lib/shopPage'
import { cn } from '@/lib/utils'
import type { ShopProfile } from '@/services/shopPage'
import { SectionHeading, SoftCard } from './CustomerHome'
import { ImagePreview } from './ui/modal'

/**
 * The shop's own page as its customers see it (migration 042): a cover with
 * the logo, whether it is open, and its offers, delivery, about, hours,
 * contact and social links. Used by the order page and the khata link's
 * "Shop" screen. Everything shown is what the shop chose to publish.
 */

/** "Open · closes 7 pm" / "Closed · opens 9 am" / "Closed today", or nothing. */
export function OpenChip({ hours, className }: { hours: unknown; className?: string }) {
  const { t, lang } = useLanguage()
  const state = openState(readHours(hours))
  if (!state) return null
  const text = state.open
    ? t('shop.openUntil', { time: showTime(state.until, lang) })
    : state.until
      ? t('shop.opensAt', { time: showTime(state.until, lang) })
      : t('shop.closedToday')
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        state.open
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', state.open ? 'bg-emerald-500' : 'bg-slate-400')} />
      {text}
    </span>
  )
}

/** The cover, with the logo resting on its lower edge, the name, address and open state. */
export function ShopHero({ shop, action }: { shop: ShopProfile; action?: ReactNode }) {
  const { t } = useLanguage()
  // Tapping the logo or the cover shows it large (2026-10-12).
  const [preview, setPreview] = useState<string | null>(null)
  return (
    <SoftCard className="overflow-hidden">
      <div className="relative">
        {shop.cover_url ? (
          <button type="button" className="block w-full" aria-label={t('shop.viewCover')} onClick={() => setPreview(shop.cover_url)}>
            <img src={shop.cover_url} alt="" className="aspect-[16/7] w-full object-cover" />
          </button>
        ) : (
          <div className="aspect-[16/6] w-full bg-gradient-to-br from-accent to-accent-soft opacity-90" />
        )}
        {shop.logo_url ? (
          <button
            type="button"
            aria-label={t('shop.viewLogo')}
            onClick={() => setPreview(shop.logo_url)}
            className="absolute -bottom-7 left-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-card shadow"
          >
            <img src={shop.logo_url} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <span className="absolute -bottom-7 left-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-card shadow">
            <Store size={28} strokeWidth={1.7} className="text-accent" />
          </span>
        )}
      </div>
      {preview && <ImagePreview src={preview} alt={shop.business_name} onClose={() => setPreview(null)} />}
      <div className="flex items-start gap-3 px-4 pb-4 pt-9">
        {/* The owner's photo beside the shop's name (migration 043). */}
        {shop.owner_photo_url && (
          <button
            type="button"
            aria-label={t('shop.ownerPhoto')}
            onClick={() => setPreview(shop.owner_photo_url ?? null)}
            className="mt-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-card bg-surface shadow"
          >
            <img src={shop.owner_photo_url} alt="" className="h-full w-full object-cover" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="break-words text-lg font-bold leading-tight text-ink">{shop.business_name}</div>
          {shop.address && (
            <div className="mt-0.5 flex items-start gap-1 text-xs text-muted">
              <MapPin size={13} className="mt-px shrink-0" />
              <span className="line-clamp-2 min-w-0 break-words">{shop.address}</span>
            </div>
          )}
          <OpenChip hours={shop.hours} className="mt-2" />
        </div>
        {action}
      </div>
    </SoftCard>
  )
}

/** Live offers, as tinted cards. */
export function ShopOffers({ shop }: { shop: ShopProfile }) {
  const { t, lang } = useLanguage()
  if (!shop.offers.length) return null
  return (
    <>
      <SectionHeading title={t('shop.offers')} />
      <div className="flex flex-col gap-2">
        {shop.offers.map((o, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-bg p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Tag size={16} />
            </span>
            <div className="min-w-0">
              <div className="break-words text-sm font-bold text-accent-text">{o.title}</div>
              {o.details && <div className="break-words text-xs text-ink">{o.details}</div>}
              {o.valid_until && (
                <div className="text-xs text-muted">
                  {t('shop.untilDate', {
                    date: showDate(`${o.valid_until}T00:00:00`, lang, false),
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** The shop's delivery note. */
export function ShopDelivery({ shop }: { shop: ShopProfile }) {
  const { t } = useLanguage()
  if (!shop.delivery_info) return null
  return (
    <SoftCard className="flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-bg text-accent-text">
        <Truck size={17} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{t('shop.deliveryTitle')}</div>
        <p className="whitespace-pre-line break-words text-sm text-muted">{shop.delivery_info}</p>
      </div>
    </SoftCard>
  )
}

function SocialIcon({ k }: { k: SocialKey }) {
  // Drawn here: the icon set this app uses carries no brand logos.
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (k === 'instagram')
    return (
      <svg {...common} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
      </svg>
    )
  if (k === 'facebook')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />
      </svg>
    )
  if (k === 'youtube')
    return (
      <svg {...common} aria-hidden="true">
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" />
      </svg>
    )
  return <Globe size={18} strokeWidth={1.9} />
}

/** About, hours, contact and social links — the khata link's "Shop" screen, and the foot of the order page. */
export function ShopAbout({ shop, showContact = true }: { shop: ShopProfile; showContact?: boolean }) {
  const { t, lang } = useLanguage()
  const hours = readHours(shop.hours)
  const wa = shopWhatsapp(shop)
  const links = SOCIAL_KEYS.map((k) => ({ k, url: safeLink(shop.social?.[k]) })).filter((l) => l.url)
  const todayKey = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date()).toLowerCase().slice(0, 3)
  const contact = [
    shop.phone ? { key: 'call', icon: Phone, label: t('khata.call'), href: `tel:${shop.phone}` } : null,
    wa ? { key: 'wa', icon: MessageCircle, label: t('shop.tileWhatsapp'), href: wa } : null,
    shop.address
      ? {
          key: 'map',
          icon: Navigation,
          label: t('order.tileDirections'),
          href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.business_name}, ${shop.address}`)}`,
        }
      : null,
  ].filter(Boolean) as { key: string; icon: typeof Phone; label: string; href: string }[]

  return (
    <>
      {shop.about && (
        <>
          <SectionHeading title={t('shop.aboutTitle')} />
          <SoftCard className="p-4">
            <p className="whitespace-pre-line break-words text-sm text-ink">{shop.about}</p>
          </SoftCard>
        </>
      )}
      {hours && (
        <>
          <SectionHeading title={t('shop.hoursTitle')} />
          <SoftCard className="p-4">
            <div className="flex flex-col gap-1.5 text-sm">
              {DAYS.map((d) => {
                const h = hours[d]
                return (
                  <div key={d} className={cn('flex items-center justify-between gap-3', d === todayKey ? 'font-semibold text-ink' : 'text-muted')}>
                    <span className="flex items-center gap-2">
                      {d === todayKey && <Clock size={13} className="text-accent" />}
                      {t(`day.${d}`)}
                    </span>
                    <span>{!h ? '—' : 'closed' in h ? t('shop.closed') : `${showTime(h.open, lang, false)} – ${showTime(h.close, lang, false)}`}</span>
                  </div>
                )
              })}
            </div>
          </SoftCard>
        </>
      )}
      {showContact && contact.length > 0 && (
        <>
          <SectionHeading title={t('shop.contactTitle')} />
          <SoftCard className="p-2">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${contact.length}, minmax(0, 1fr))` }}>
              {contact.map((c) => (
                <a
                  key={c.key}
                  href={c.href}
                  target={c.key === 'call' ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 hover:bg-surface"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-bg text-accent-text">
                    <c.icon size={19} strokeWidth={1.9} />
                  </span>
                  <span className="w-full truncate text-center text-xs font-medium text-ink">{c.label}</span>
                </a>
              ))}
            </div>
          </SoftCard>
        </>
      )}
      {links.length > 0 && (
        <>
          <SectionHeading title={t('shop.followTitle')} />
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.k}
                href={l.url!}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-ink shadow-sm"
              >
                <span className="text-accent">
                  <SocialIcon k={l.k} />
                </span>
                {t(`social.${l.k}`)}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  )
}
