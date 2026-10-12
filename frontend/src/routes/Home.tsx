import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ChartColumn,
  ChevronDown,
  DatabaseBackup,
  FileText,
  Gift,
  Languages,
  Link2,
  Lock,
  Mail,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { SignInForm } from '@/components/SignInForm'
import { ShopkeeperStory } from '@/components/site/ShopkeeperStory'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome'
import { PLANS, SITE, TRIAL_DAYS, YEARLY_PER_MONTH, YEARLY_SAVING, askForTrial, rupees, type PlanId } from '@/lib/site'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'

/**
 * BuildSupply's public front page (2026-10-12), asked for from a recording of
 * claude.ai's sign-in page: a top bar, a headline with the sign-in box and a
 * picture beside it, then features, plans, FAQ and a full footer. The picture
 * is a drawn supplier going from stressed to smiling (ShopkeeperStory) — no
 * stock or generated photographs. A signed-in supplier or admin goes straight to their dashboard.
 */
export default function Home() {
  const { session, loading } = useAuth()
  usePageTitle('BuildSupply — billing and khata for building-material suppliers')
  if (!loading && session) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-app bg-surface text-ink">
      <SiteHeader />
      <main>
        <Hero />
        <TrustStrip />
        <Features />
        <HowItWorks />
        <Safety />
        <Plans />
        <Faq />
        <Contact />
      </main>
      <SiteFooter />
    </div>
  )
}

// ── Hero ────────────────────────────────────────────────────────────────

function Hero() {
  const { t } = useLanguage()
  return (
    <section className="bg-shell text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pb-20 lg:pt-16">
        <div>
          <p className="text-sm font-semibold text-accent-soft">{t('site.hero.eyebrow')}</p>
          <h1 className="mt-3 text-[2rem] font-bold leading-tight sm:text-5xl">{t('site.hero.title')}</h1>
          <p className="mt-4 max-w-xl text-base text-white/75 sm:text-lg">{t('site.hero.sub')}</p>

          <div id="signin" className="mt-8 max-w-sm scroll-mt-24 rounded-2xl border border-white/10 bg-card p-6 text-ink shadow-xl">
            <h2 className="mb-4 text-base font-semibold">{t('site.hero.signInTitle')}</h2>
            <SignInForm idPrefix="home-" />
            <div className="my-5 flex items-center gap-3 text-xs text-muted-2">
              <span className="h-px flex-1 bg-border" />
              {t('site.hero.new')}
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              onClick={() => askForTrial()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold text-accent-text hover:bg-accent-bg"
            >
              <WhatsAppIcon size={16} /> {t('site.hero.trialBtn', { days: TRIAL_DAYS })}
            </button>
            <p className="mt-2 text-center text-xs text-muted">{t('site.hero.trialNote')}</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-lg lg:max-w-none">
          <ShopkeeperStory />
        </div>
      </div>
    </section>
  )
}

function TrustStrip() {
  const { t } = useLanguage()
  const items: { icon: ReactNode; text: string }[] = [
    { icon: <Gift size={18} />, text: t('site.trust.trial', { days: TRIAL_DAYS }) },
    { icon: <Languages size={18} />, text: t('site.trust.lang') },
    { icon: <Smartphone size={18} />, text: t('site.trust.app') },
    { icon: <WhatsAppIcon size={18} />, text: t('site.trust.whatsapp') },
  ]
  return (
    <div className="border-b border-border bg-card">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-3 px-4 py-5 sm:px-6 md:grid-cols-4">
        {items.map((i) => (
          <li key={i.text} className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="shrink-0 text-accent">{i.icon}</span>
            {i.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Sections ────────────────────────────────────────────────────────────

function Section({ id, title, sub, children, className }: { id: string; title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-20 py-16 sm:py-20', className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">{title}</h2>
        {sub && <p className="mx-auto mt-3 max-w-2xl text-center text-muted">{sub}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

const FEATURES: { key: string; icon: ReactNode; pro?: boolean }[] = [
  { key: 'bills', icon: <ReceiptText size={20} /> },
  { key: 'whatsapp', icon: <WhatsAppIcon size={20} /> },
  { key: 'khata', icon: <BookOpen size={20} /> },
  { key: 'payments', icon: <Wallet size={20} /> },
  { key: 'stock', icon: <Truck size={20} /> },
  { key: 'orders', icon: <ShoppingCart size={20} />, pro: true },
  { key: 'customer', icon: <Link2 size={20} /> },
  { key: 'estimates', icon: <FileText size={20} /> },
  { key: 'reports', icon: <ChartColumn size={20} /> },
]

function Features() {
  const { t } = useLanguage()
  return (
    <Section id="features" title={t('site.feat.title')} sub={t('site.feat.sub')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.key} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-bg text-accent-text">{f.icon}</span>
              <h3 className="font-semibold">{t(`site.feat.${f.key}.t` as TranslationKey)}</h3>
              {f.pro && (
                <span className="ml-auto rounded-full bg-accent-bg px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                  {t('site.feat.proBadge')}
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">{t(`site.feat.${f.key}.d` as TranslationKey)}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function HowItWorks() {
  const { t } = useLanguage()
  return (
    <Section id="how" title={t('site.how.title')} className="bg-card">
      <ol className="grid gap-6 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{n}</span>
            <div>
              <h3 className="font-semibold">{t(`site.how.${n}.t` as TranslationKey)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(`site.how.${n}.d` as TranslationKey)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 text-center">
        <button
          onClick={() => askForTrial()}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-soft"
        >
          <WhatsAppIcon size={18} /> {t('site.hero.trialBtn', { days: TRIAL_DAYS })}
        </button>
      </div>
    </Section>
  )
}

function Safety() {
  const { t } = useLanguage()
  const items: { icon: ReactNode; key: TranslationKey }[] = [
    { icon: <ShieldCheck size={20} />, key: 'site.safe.1' },
    { icon: <DatabaseBackup size={20} />, key: 'site.safe.2' },
    { icon: <Lock size={20} />, key: 'site.safe.3' },
    { icon: <ReceiptText size={20} />, key: 'site.safe.4' },
  ]
  return (
    <Section id="safety" title={t('site.safe.title')}>
      <ul className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.key} className="flex gap-3 rounded-2xl border border-border bg-card p-5">
            <span className="shrink-0 text-accent">{i.icon}</span>
            <span className="text-sm">{t(i.key)}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ── Plans ───────────────────────────────────────────────────────────────

const BASIC_FEATURES: TranslationKey[] = [
  'site.plans.f.bills',
  'site.plans.f.whatsapp',
  'site.plans.f.khata',
  'site.plans.f.payments',
  'site.plans.f.stock',
  'site.plans.f.customerLink',
  'site.plans.f.shopPage',
  'site.plans.f.reports',
  'site.plans.f.languages',
]

const PLAN_TEXT: Record<PlanId, { name: TranslationKey; for: TranslationKey; lead?: TranslationKey; list: TranslationKey[] }> = {
  basic: { name: 'site.plans.basic', for: 'site.plans.basicFor', list: BASIC_FEATURES },
  pro: { name: 'site.plans.pro', for: 'site.plans.proFor', lead: 'site.plans.everythingBasic', list: ['site.plans.f.orders', 'site.plans.f.orderStatus'] },
  yearly: { name: 'site.plans.yearly', for: 'site.plans.yearlyFor', lead: 'site.plans.everythingPro', list: ['site.plans.f.onePayment', 'site.plans.f.fixedPrice'] },
}

function Plans() {
  const { t } = useLanguage()
  return (
    <Section id="plans" title={t('site.plans.title')} sub={t('site.plans.sub', { days: TRIAL_DAYS })} className="bg-card">
      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const text = PLAN_TEXT[p.id]
          const popular = p.id === 'pro'
          return (
            <div
              key={p.id}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-surface p-6',
                popular ? 'border-accent ring-1 ring-accent' : 'border-border',
              )}
            >
              {popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                  {t('site.plans.popular')}
                </span>
              )}
              <h3 className="text-lg font-bold">{t(text.name)}</h3>
              <p className="mt-1 text-sm text-muted">{t(text.for)}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{rupees(p.price)}</span>
                <span className="text-sm text-muted">{t(p.period === 'month' ? 'site.plans.month' : 'site.plans.year')}</span>
              </div>
              {p.id === 'yearly' ? (
                <p className="mt-1 text-sm font-medium text-accent-text">
                  {t('site.plans.perMonth', { amount: YEARLY_PER_MONTH.toLocaleString('en-IN') })} ·{' '}
                  {t('site.plans.save', { amount: YEARLY_SAVING.toLocaleString('en-IN') })}
                </p>
              ) : (
                <p className="mt-1 text-sm text-transparent select-none" aria-hidden>
                  ·
                </p>
              )}
              <button
                onClick={() => askForTrial(p.id)}
                className={cn(
                  'mt-5 inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold',
                  popular ? 'bg-accent text-white hover:bg-accent-soft' : 'border border-border bg-card text-ink hover:bg-surface',
                )}
              >
                {t('site.plans.cta')}
              </button>
              <div className="mt-6 border-t border-border pt-5">
                {text.lead && <p className="mb-3 text-sm font-semibold">{t(text.lead)}</p>}
                <ul className="flex flex-col gap-2.5">
                  {text.list.map((k) => (
                    <li key={k} className="flex gap-2.5 text-sm">
                      <Check size={17} className="mt-0.5 shrink-0 text-accent" />
                      {t(k)}
                    </li>
                  ))}
                  {!p.orders && (
                    <li className="flex gap-2.5 text-sm text-muted">
                      <X size={17} className="mt-0.5 shrink-0 text-muted-2" />
                      {t('site.plans.noOrders')}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-muted">{t('site.plans.note')}</p>
    </Section>
  )
}

// ── FAQ and contact ─────────────────────────────────────────────────────

function Faq() {
  const { t } = useLanguage()
  return (
    <Section id="faq" title={t('site.faq.title')}>
      <div className="mx-auto max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <details key={n} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {t(`site.faq.${n}.q` as TranslationKey)}
              <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-5 pb-5 text-sm text-muted">{t(`site.faq.${n}.a` as TranslationKey, { days: TRIAL_DAYS })}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

function Contact() {
  const { t } = useLanguage()
  const card = 'flex items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-left hover:border-accent'
  return (
    <Section id="contact" title={t('site.contact.title')} sub={t('site.contact.sub')} className="bg-card">
      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
        <button onClick={() => openWhatsAppShare(SITE.phone, 'Hi, I have a question about BuildSupply.')} className={card}>
          <span className="text-accent"><WhatsAppIcon size={22} /></span>
          <span>
            <span className="block font-semibold">WhatsApp</span>
            <span className="block text-sm text-muted">{SITE.phone}</span>
          </span>
        </button>
        <a href={`tel:+91${SITE.phone}`} className={card}>
          <Phone size={22} className="text-accent" />
          <span>
            <span className="block font-semibold">{t('site.contact.call')}</span>
            <span className="block text-sm text-muted">+91 {SITE.phone}</span>
          </span>
        </a>
        <a href={`mailto:${SITE.email}`} className={card}>
          <Mail size={22} className="shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block font-semibold">{t('site.contact.email')}</span>
            <span className="block break-all text-sm text-muted">{SITE.email}</span>
          </span>
        </a>
      </div>
      <p className="mt-6 text-center text-sm text-muted">{SITE.business} · {SITE.place}</p>
    </Section>
  )
}
