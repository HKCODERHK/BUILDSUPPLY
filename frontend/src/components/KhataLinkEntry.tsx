import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Link2, LoaderCircle, Phone } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { khataCodeFrom } from '@/lib/customerLinks'
import { sanitizePhone } from '@/lib/numberInput'
import { getKhata } from '@/services/khata'
import { requestKhataLink } from '@/services/khataRequests'

/**
 * A customer's way back in on a phone that has no saved shop (2026-10-19):
 * the khata link their shop sent on WhatsApp **and** their phone number, and
 * it opens only when the number is the one that khata's customer has on file
 * with the shop (the user's rule: check both). The link is still what opens
 * the account; the number makes sure the person typing it is that customer.
 */
export function KhataLinkEntry() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [phone, setPhone] = useState('')
  const [problem, setProblem] = useState<TranslationKey | null>(null)
  const [busy, setBusy] = useState(false)
  // Lost the link (048): the shop is asked to resend it. The answer is the
  // same whether or not the number belongs to anyone.
  const [asked, setAsked] = useState(false)
  const [asking, setAsking] = useState(false)

  async function askShop() {
    if (asking) return
    if (phone.length !== 10) return setProblem('kle.phoneShort')
    setAsking(true)
    setProblem(null)
    try {
      await requestKhataLink(phone)
      setAsked(true)
    } catch {
      setProblem('error.generic')
    } finally {
      setAsking(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const code = khataCodeFrom(text)
    if (!code) return setProblem('kle.invalid')
    if (phone.length !== 10) return setProblem('kle.phoneShort')
    setBusy(true)
    setProblem(null)
    try {
      const view = await getKhata(code)
      // A paused shop's link is still good: open it, and the page says paused.
      if (!view.found && !view.paused) return setProblem('kle.notFound')
      if (view.found && sanitizePhone(view.customer.phone ?? '') !== phone) return setProblem('kle.phoneMismatch')
      navigate(`/khata/${code}`)
    } catch {
      setProblem('error.generic')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label htmlFor="khata-link" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Link2 size={16} className="shrink-0 text-accent" /> {t('kle.label')}
      </label>
      <Input
        id="khata-link"
        className="h-11"
        inputMode="url"
        autoComplete="off"
        placeholder={t('kle.placeholder')}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setProblem(null)
        }}
      />
      <label htmlFor="khata-phone" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Phone size={16} className="shrink-0 text-accent" /> {t('kle.phoneLabel')}
      </label>
      <PhoneInput
        id="khata-phone"
        className="h-11"
        autoComplete="tel-national"
        placeholder={t('kle.phonePlaceholder')}
        value={phone}
        onValueChange={(v) => {
          setPhone(v)
          setProblem(null)
        }}
      />
      {problem && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {t(problem)}
        </p>
      )}
      <Button type="submit" size="tap" className="w-full" disabled={busy}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <BookOpen size={16} />} {t('kle.open')}
      </Button>
      {asked ? (
        <p role="status" className="rounded-xl bg-accent-bg p-3 text-xs text-accent-text">
          {t('kle.requested')}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void askShop()}
          disabled={asking}
          className="flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {asking && <LoaderCircle size={14} className="animate-spin" />} {t('kle.lost')}
        </button>
      )}
    </form>
  )
}
