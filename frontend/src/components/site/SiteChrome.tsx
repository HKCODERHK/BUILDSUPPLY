import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Menu, Phone, X } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { SITE, askForTrial } from '@/lib/site'
import { openWhatsAppShare } from '@/lib/whatsapp'

// The public website's top bar and footer (2026-10-12): the front page at /,
// /privacy and /terms. Links to the front page's sections are plain anchors
// to "/#…", so they scroll on the front page and load it from a legal page.

const SECTIONS: { id: string; key: TranslationKey }[] = [
  { id: 'features', key: 'site.nav.features' },
  { id: 'how', key: 'site.nav.how' },
  { id: 'plans', key: 'site.nav.plans' },
  { id: 'faq', key: 'site.nav.faq' },
  { id: 'contact', key: 'site.nav.contact' },
]

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#35A85D" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18" />
        <path d="M5 21V8l5-4v17" />
        <path d="M10 21V11l6 3v7" />
        <path d="M16 21v-4l3 1.5V21" />
      </svg>
      <span className="text-lg font-bold">BuildSupply</span>
    </span>
  )
}

const onShell = 'border-white/20 text-white hover:bg-white/10 hover:text-white'

export function SiteHeader() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  // The phone menu closes on Escape, and the page behind it doesn't scroll.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="sticky top-0 z-40 bg-shell/95 pt-[var(--safe-top)] text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <a href="/" className="shrink-0" aria-label="BuildSupply">
          <BrandMark />
        </a>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`/#${s.id}`} className="rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white">
              {t(s.key)}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-4">
          <LanguageToggle compact className={onShell} />
          <ThemeToggle className={`max-sm:hidden ${onShell}`} />
          <a
            href="/#signin"
            className="hidden h-9 items-center rounded-lg border border-white/25 px-3 text-sm font-semibold text-white hover:bg-white/10 sm:inline-flex"
          >
            {t('auth.signIn')}
          </a>
          <button
            onClick={() => askForTrial()}
            className="hidden h-9 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-soft md:inline-flex"
          >
            {t('site.nav.trial')}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border lg:hidden ${onShell}`}
            aria-label={open ? t('site.nav.close') : t('site.nav.menu')}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2 sm:px-6 lg:px-10" aria-label="Main">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`/#${s.id}`}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-base text-white/90 hover:bg-white/10"
              >
                {t(s.key)}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 pb-3">
              <a
                href="/#signin"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/25 text-sm font-semibold"
              >
                {t('auth.signIn')}
              </a>
              <button
                onClick={() => {
                  setOpen(false)
                  askForTrial()
                }}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-2 text-sm font-semibold"
              >
                {t('site.nav.trial')}
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 py-3 sm:hidden">
              <span className="text-sm text-white/70">{t('theme.dark')}</span>
              <ThemeToggle className={onShell} />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

export function SiteFooter() {
  const { t } = useLanguage()
  const link = 'text-sm text-white/70 hover:text-white'
  return (
    <footer className="bg-shell pb-[var(--safe-bottom)] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <BrandMark />
          <p className="mt-3 max-w-xs text-sm text-white/70">{t('site.footer.tagline')}</p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => openWhatsAppShare(SITE.phone, 'Hi, I have a question about BuildSupply.')}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${onShell}`}
              aria-label="WhatsApp"
            >
              <WhatsAppIcon size={16} />
            </button>
            <a href={`tel:+91${SITE.phone}`} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${onShell}`} aria-label={t('site.contact.call')}>
              <Phone size={16} />
            </a>
            <a href={`mailto:${SITE.email}`} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${onShell}`} aria-label={t('site.contact.email')}>
              <Mail size={16} />
            </a>
          </div>
        </div>
        <FooterColumn title={t('site.footer.product')}>
          <a href="/#features" className={link}>{t('site.nav.features')}</a>
          <a href="/#plans" className={link}>{t('site.nav.plans')}</a>
          <a href="/#faq" className={link}>{t('site.nav.faq')}</a>
          <a href="/#signin" className={link}>{t('auth.signIn')}</a>
        </FooterColumn>
        <FooterColumn title={t('site.footer.help')}>
          <button onClick={() => askForTrial()} className={`text-left ${link}`}>{t('site.nav.trial')}</button>
          <a href="/#contact" className={link}>{t('site.nav.contact')}</a>
          <Link to="/forgot-password" className={link}>{t('auth.forgot')}</Link>
        </FooterColumn>
        <FooterColumn title={t('site.footer.legal')}>
          <Link to="/privacy" className={link}>{t('site.footer.privacy')}</Link>
          <Link to="/terms" className={link}>{t('site.footer.terms')}</Link>
          <Link to="/terms#refunds" className={link}>{t('site.footer.refunds')}</Link>
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-white/50 sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {SITE.business}</span>
          <span>{t('site.footer.made')}</span>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">{title}</div>
      <div className="flex flex-col items-start gap-2.5">{children}</div>
    </div>
  )
}
