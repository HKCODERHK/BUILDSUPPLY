import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Reveals the next page of a long list.
 *
 * Renders nothing while everything already fits, so a supplier with twelve
 * bills never sees it — it only appears once a list has genuinely outgrown
 * the screen.
 */
export function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const { t } = useLanguage()
  if (shown >= total) return null

  return (
    <div className="mt-4 flex flex-col items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={onMore}>
        {t('common.showMore')}
      </Button>
      <span className="text-xs text-muted">{t('common.showingOf', { shown, total })}</span>
    </div>
  )
}
