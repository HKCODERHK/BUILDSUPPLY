import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Sits next to the theme toggle. A cycling button rather than a dropdown:
// there are only three languages, and one tap is easier than open-scroll-pick
// on a phone held in one hand at a counter.
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage()
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]
  const next = LANGUAGES[(LANGUAGES.findIndex((l) => l.code === lang) + 1) % LANGUAGES.length]

  return (
    <button
      onClick={() => setLang(next.code)}
      aria-label={`Language: ${current.label}. Switch to ${next.label}`}
      title={`Switch to ${next.label}`}
      className={cn(
        'flex h-9 min-w-9 items-center justify-center rounded-full border border-border px-2.5 text-xs font-semibold text-muted hover:bg-surface hover:text-ink',
        className,
      )}
    >
      {current.short}
    </button>
  )
}
