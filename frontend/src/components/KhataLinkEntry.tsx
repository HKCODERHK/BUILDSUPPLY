import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Link2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'
import { khataCodeFrom } from '@/lib/customerLinks'

/**
 * A customer's way back in on a phone that has no saved shop (2026-10-19, the
 * user's choice over a phone-number login): paste the khata link the shop sent
 * on WhatsApp. The link is still the only proof of who they are — nothing new
 * is unlocked, and it opens exactly the page the link itself would.
 */
export function KhataLinkEntry() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const code = khataCodeFrom(text)
    if (!code) return setBad(true)
    navigate(`/khata/${code}`)
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
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value)
          setBad(false)
        }}
      />
      {bad && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {t('kle.invalid')}
        </p>
      )}
      <Button type="submit" size="tap" className="w-full">
        <BookOpen size={16} /> {t('kle.open')}
      </Button>
      <p className="text-xs text-muted">{t('kle.hint')}</p>
    </form>
  )
}
