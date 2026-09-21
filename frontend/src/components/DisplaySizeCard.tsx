import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'
import { readDisplaySize, saveDisplaySize, type DisplaySize } from '@/lib/displaySize'

const SIZES: DisplaySize[] = ['small', 'medium', 'large']
const LABEL: Record<DisplaySize, 'set.sizeSmall' | 'set.sizeMedium' | 'set.sizeLarge'> = {
  small: 'set.sizeSmall',
  medium: 'set.sizeMedium',
  large: 'set.sizeLarge',
}

/**
 * Settings → App size. It applies the moment it is tapped, on the screen the
 * supplier is looking at, so they judge it rather than imagine it — and the
 * preview line under the buttons is real app text at the chosen size.
 */
export function DisplaySizeCard() {
  const { t } = useLanguage()
  const [size, setSize] = useState<DisplaySize>(() => readDisplaySize())

  function pick(next: DisplaySize) {
    setSize(next)
    saveDisplaySize(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('set.sizeTitle')}</CardTitle>
      </CardHeader>
      <p className="mb-3 text-xs text-muted">{t('set.sizeIntro')}</p>

      <div className="grid grid-cols-3 gap-2">
        {SIZES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => pick(option)}
            aria-pressed={size === option}
            className={cn(
              'rounded-xl border px-2 py-3 font-medium transition-colors',
              option === 'small' ? 'text-xs' : option === 'medium' ? 'text-sm' : 'text-base',
              size === option ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted',
            )}
          >
            {t(LABEL[option])}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">{t('set.sizeKept')}</p>
    </Card>
  )
}
