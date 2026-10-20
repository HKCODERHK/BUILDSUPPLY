import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Check, LoaderCircle, Phone, Send, ShieldCheck, Store } from 'lucide-react'
import { CustomerHeader, SoftCard } from '@/components/CustomerHome'
import { BuildSupplyFooter } from '@/components/BuildSupplyFooter'
import { Button } from '@/components/ui/button'
import { PhoneInput } from '@/components/ui/phone-input'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { knownShops } from '@/lib/customerLinks'
import { requestKhataLink, requestKhataLinkFrom } from '@/services/khataRequests'

/**
 * /khata-help — "Lost your khata link?" (2026-10-20, the user's request, and
 * their choice of what it may show). The customer types the number their shop
 * has for them, and picks one of the shops **this phone** has used before —
 * remembered on the phone, never looked up — or asks every shop that has the
 * number. Nothing here reveals which shops a number belongs to: every request
 * is answered the same way, so a stranger (or a rival shop) learns nothing.
 * The shop then sends the link on WhatsApp, to the number it has on file.
 */
export default function KhataHelp() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [phone, setPhone] = useState(() => {
    const given = (location.state as { phone?: string } | null)?.phone
    return typeof given === 'string' ? given : ''
  })
  const [problem, setProblem] = useState<TranslationKey | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Which requests went through this visit: an order link, or '*' for every shop.
  const [asked, setAsked] = useState<Set<string>>(() => new Set())
  const [shops] = useState(() => knownShops())

  async function ask(link: string | null) {
    if (busy) return
    if (phone.length !== 10) return setProblem('kle.phoneShort')
    const key = link ?? '*'
    setBusy(key)
    setProblem(null)
    try {
      if (link) await requestKhataLinkFrom(phone, link)
      else await requestKhataLink(phone)
      setAsked((prev) => new Set(prev).add(key))
    } catch {
      setProblem('error.generic')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <CustomerHeader
        title={t('help.title')}
        onBack={location.key !== 'default' ? () => navigate(-1) : undefined}
        backLabel={t('common.back')}
      />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        <SoftCard className="flex flex-col gap-3 p-4">
          <p className="text-sm text-ink">{t('help.intro')}</p>
          <label htmlFor="help-phone" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Phone size={16} className="shrink-0 text-accent" /> {t('kle.phoneLabel')}
          </label>
          <PhoneInput
            id="help-phone"
            className="h-11"
            autoComplete="tel-national"
            placeholder={t('kle.phonePlaceholder')}
            value={phone}
            onValueChange={(v) => {
              setPhone(v)
              setProblem(null)
              setAsked(new Set())
            }}
          />
          {problem && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {t(problem)}
            </p>
          )}
        </SoftCard>

        {shops.length > 0 && (
          <SoftCard className="flex flex-col divide-y divide-border p-2">
            <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('help.yourShops')}</div>
            {shops.map((s) => (
              <div key={s.link} className="flex items-center gap-3 px-2 py-2.5">
                <Store size={18} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-ink">{s.name ?? `/${s.link}`}</div>
                  {s.khata && <div className="text-xs text-muted">{t('help.linkOnPhone')}</div>}
                </div>
                {s.khata ? (
                  // The link is still on this phone: no need to ask the shop.
                  <Link
                    to={`/khata/${s.khata}`}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-accent"
                  >
                    <BookOpen size={14} /> {t('kle.open')}
                  </Link>
                ) : asked.has(s.link) || asked.has('*') ? (
                  <span role="status" className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                    <Check size={14} /> {t('help.asked')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void ask(s.link)}
                    disabled={busy !== null}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-accent disabled:opacity-60"
                  >
                    {busy === s.link ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} {t('help.askShop')}
                  </button>
                )}
              </div>
            ))}
          </SoftCard>
        )}

        <SoftCard className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">{shops.length > 0 ? t('help.otherShops') : t('help.noShops')}</p>
          {asked.has('*') ? (
            <p role="status" className="rounded-xl bg-accent-bg p-3 text-xs text-accent-text">
              {t('kle.requested')}
            </p>
          ) : (
            <Button size="tap" variant="outline" className="w-full" disabled={busy !== null} onClick={() => void ask(null)}>
              {busy === '*' ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} {t('help.askAll')}
            </Button>
          )}
        </SoftCard>

        <p className="flex items-start gap-2 px-1 text-xs text-muted">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" /> {t('help.private')}
        </p>
        <BuildSupplyFooter />
      </main>
    </div>
  )
}
