import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight, KeyRound, LogOut, MapPin, Phone, Share2, UserRound } from 'lucide-react'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { SoftCard } from '@/components/CustomerHome'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useLanguage } from '@/context/LanguageContext'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

function Row({ icon: I, label, detail, onClick, to, href, end }: {
  icon: Icon
  label: string
  detail?: string | null
  onClick?: () => void
  to?: string
  href?: string
  end?: ReactNode
}) {
  const body = (
    <>
      <I size={19} strokeWidth={1.8} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {detail && <span className="block break-words text-xs text-muted">{detail}</span>}
      </span>
      {end ?? <ChevronRight size={17} className="shrink-0 text-muted" />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface'
  if (to) return <Link to={to} className={cls}>{body}</Link>
  if (href) return <a href={href} className={cls}>{body}</a>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

/**
 * The order page's Profile tab (2026-10-21, after the grocery reference's
 * profile screen), with that screen's rows turned into what a customer of a
 * building-material shop actually has: their details on this phone, their
 * delivery site, their khata, a way back if the khata link is lost, language,
 * day/night, sharing the shop, calling it — and forgetting this shop on this
 * phone in place of "Log out". There is no password and no payment method:
 * customers have neither in BuildSupply.
 */
export function CustomerMeView({
  shopName,
  name,
  phone,
  site,
  onChangeDetails,
  khata,
  shopPhone,
  onShare,
  onForget,
}: {
  shopName: string
  name: string | null
  phone: string | null
  site: string | null
  /** Only details typed on this phone can be changed here. */
  onChangeDetails?: () => void
  khata?: { to?: string; onClick?: () => void } | null
  shopPhone?: string | null
  onShare: () => void
  /** Forget this shop and these details on this phone. */
  onForget?: () => void
}) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-xl font-bold text-ink">{t('cme.title')}</h1>
      <SoftCard className="flex flex-col items-center gap-2 p-5 text-center">
        {name ? (
          <CustomerAvatar id={`${shopName}|${name}`} name={name} size={72} />
        ) : (
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent-bg text-accent-text">
            <UserRound size={32} />
          </span>
        )}
        <div className="break-words text-lg font-bold text-ink">{name ?? t('cme.guest')}</div>
        {phone && <div className="text-sm text-muted">{phone}</div>}
        <div className="text-xs text-muted">{t('cme.customerOf', { shop: shopName })}</div>
      </SoftCard>

      <SoftCard className="divide-y divide-border overflow-hidden">
        <Row
          icon={UserRound}
          label={t('cme.details')}
          detail={[name, phone].filter(Boolean).join(' · ') || t('cme.detailsNone')}
          onClick={onChangeDetails}
          end={onChangeDetails ? undefined : <span />}
        />
        <Row icon={MapPin} label={t('cme.site')} detail={site || t('cme.siteNone')} onClick={onChangeDetails} end={onChangeDetails ? undefined : <span />} />
        {khata && <Row icon={BookOpen} label={t('order.tileKhata')} detail={t('cme.khataHint')} to={khata.to} onClick={khata.onClick} />}
        <Row icon={KeyRound} label={t('cme.lostKhata')} detail={t('cme.lostKhataHint')} to="/khata-help" />
      </SoftCard>

      <SoftCard className="divide-y divide-border overflow-hidden">
        <Row icon={Share2} label={t('khata.tileShare')} onClick={onShare} />
        {shopPhone && <Row icon={Phone} label={t('khata.menuCall')} detail={shopPhone} href={`tel:${shopPhone}`} />}
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
          <span className="text-sm font-medium text-ink">{t('cme.language')}</span>
          <LanguageToggle className="h-10 border-border text-ink" />
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
          <span className="text-sm font-medium text-ink">{t('cme.theme')}</span>
          <ThemeToggle className="h-10 w-10 border-border text-ink" />
        </div>
      </SoftCard>

      {onForget &&
        (confirming ? (
          <SoftCard className="flex flex-col gap-3 p-4">
            <p className="text-sm text-ink">{t('cme.forgetConfirm', { shop: shopName })}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onForget}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white"
              >
                {t('cme.forgetYes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-ink"
              >
                {t('common.cancel')}
              </button>
            </div>
          </SoftCard>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-semibold text-white shadow-sm"
          >
            <LogOut size={17} /> {t('cme.forget')}
          </button>
        ))}
    </div>
  )
}
