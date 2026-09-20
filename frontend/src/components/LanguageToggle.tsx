import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Sits next to the theme toggle. A list that drops down, rather than a button
// that cycled through the three languages: it used to show "EN" and change
// only after a tap, so a customer opening a supplier's order link had to guess
// what the two letters meant and tap until the page turned. Now the button
// says the word itself — Language / भाषा — and the three languages are
// written each in its own script, the way Settings already offers them.
//
// Under 360px the word steps aside and the globe stands alone: at that width
// the shop's name in the top bar needs every pixel, and a globe reads the same
// in all three languages.
//
// `compact` keeps the two-letter code the supplier's own phone bar has always
// shown — the word and the globe are wider, and the brand's tagline beside
// them wraps to a second line at 360px, making the bar taller. The list is
// the same; only the button is narrower.
export function LanguageToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // Pointer rather than click, as in ActionMenu: the list closes on the
    // press that starts something else, not after it finishes.
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('set.language')}: ${current.label}`}
        title={current.label}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-semibold text-muted hover:bg-surface hover:text-ink',
          className,
        )}
      >
        {compact ? (
          current.short
        ) : (
          <>
            <Globe size={15} className="shrink-0" />
            <span className="max-[359px]:hidden">{t('set.language')}</span>
            <ChevronDown size={13} className="shrink-0 max-[359px]:hidden" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-40 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={l.code === lang}
              onClick={() => {
                setLang(l.code)
                setOpen(false)
              }}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface',
                l.code === lang ? 'text-accent-text' : 'text-ink',
              )}
            >
              {l.label}
              {l.code === lang && <Check size={15} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
