import { Tipper } from '@/components/art'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'

/**
 * What the app shows while it waits: the tipper from the splash, driving on
 * the spot over a moving road, with the word under it. Every screen and
 * section that loads uses this, so waiting always looks the same.
 *
 * A whole screen waiting puts the truck in the middle of the phone, not under
 * the title with the screen empty below it. It is fixed to the viewport rather
 * than centred in the page, which is only as tall as its header while it
 * loads; it sits under the header and tab bar (z-30) and never takes a tap. On
 * a desktop it goes back into the page, beside the sidebar. `inline` keeps it
 * under what it belongs to instead — the catalog search, where the keyboard is
 * up and the middle of the screen may be behind it.
 *
 * It fades in only after 0.3s (index.css). A load that finishes sooner — most
 * of them — shows nothing, rather than a truck that flashes for a frame.
 */
export function TruckLoader({ label, inline, className }: { label?: string; inline?: boolean; className?: string }) {
  const { t } = useLanguage()
  return (
    <div
      role="status"
      className={cn(
        'truck-loader flex flex-col items-center justify-center gap-2',
        inline ? 'py-10' : 'pointer-events-none fixed inset-0 z-20 lg:static lg:py-16',
        className,
      )}
    >
      <div className="w-[84px]" aria-hidden>
        <svg viewBox="0 0 130 56" className="truck-loader-bob block h-auto w-full" fill="none">
          <Tipper />
        </svg>
        <div className="mt-1 h-[3px] overflow-hidden rounded-full">
          <div className="truck-loader-road h-full" />
        </div>
      </div>
      <span className="text-xs font-medium text-muted">{label ?? t('common.loading')}</span>
    </div>
  )
}
