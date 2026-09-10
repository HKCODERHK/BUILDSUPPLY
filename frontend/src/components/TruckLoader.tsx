import { useLayoutEffect, useRef } from 'react'
import { Tipper } from '@/components/art'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'

/** Space kept between the truck and whatever is above or below it. */
const GAP = 16

/** A length custom property on :root, in pixels. */
function rootPx(name: string) {
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  const n = parseFloat(value) || 0
  return value.endsWith('rem') ? n * parseFloat(getComputedStyle(root).fontSize) : n
}

/**
 * What the app shows while it waits: the tipper from the splash, driving on
 * the spot over a moving road, with the word under it. Every screen and
 * section that loads uses this, so waiting always looks the same.
 *
 * A whole screen waiting puts the truck in the middle of the phone — unless
 * the screen already shows something there, like the filters on Reports; then
 * it goes in the middle of the empty space below. It stays in the page's flow
 * and measures where it starts, so it can never land on top of anything: for
 * a while it was fixed to the middle of the viewport, and on Reports it sat
 * across the date and customer pickers. `inline` keeps it just under what it
 * belongs to instead — the catalog search, where the keyboard is up.
 *
 * It fades in only after 0.3s (index.css). A load that finishes sooner — most
 * of them — shows nothing, rather than a truck that flashes for a frame.
 */
export function TruckLoader({ label, inline, className }: { label?: string; inline?: boolean; className?: string }) {
  const { t } = useLanguage()
  const boxRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Before paint, so the truck is placed before it is ever seen. Styles are
  // set on the element directly: this is measurement, not state, and a
  // re-render for it would only cost a second pass.
  useLayoutEffect(() => {
    const box = boxRef.current
    const body = bodyRef.current
    if (inline || !box || !body) return
    const place = () => {
      // Where the loader starts on the page, below whatever the screen already
      // shows, and where the usable screen ends, above the tab bar.
      const top = box.getBoundingClientRect().top + window.scrollY
      const bottom = window.innerHeight - rootPx('--tabbar-h') - GAP
      const height = body.offsetHeight
      let centre = window.innerHeight / 2
      if (centre - height / 2 < top + GAP) centre = Math.max(top + GAP + height / 2, (top + bottom) / 2)
      const pad = centre - height / 2 - top
      box.style.paddingTop = `${pad}px`
      box.style.minHeight = `${Math.max(pad + height + GAP, bottom - top)}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [inline])

  return (
    <div
      ref={boxRef}
      role="status"
      className={cn('truck-loader flex flex-col items-center', inline && 'justify-center py-10', className)}
    >
      <div ref={bodyRef} className="flex flex-col items-center gap-2">
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
    </div>
  )
}
