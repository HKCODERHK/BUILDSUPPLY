import { useEffect, useState } from 'react'

/** How long a just-changed card stays lit: long enough for the eye to land on
 *  it, gone before the next tap. Matches `.flash-success` in index.css. */
const FLASH_MS = 2400

/** The DOM id a card carries so it can be brought into view when it lights. */
export function flashId(id: string) {
  return `flash-${id}`
}

/**
 * Lights the one card on a list that just changed — a customer just added, a
 * material just topped up — so the supplier sees where it went instead of
 * hunting for it. Materials sort by category and name, so a topped-up one can
 * be well off screen: it is scrolled into view, but only as far as needed, so a
 * card already showing doesn't make the page jump. Clears itself.
 */
export function useFlash<T extends { id: string }>() {
  const [flash, setFlash] = useState<T | null>(null)

  useEffect(() => {
    if (!flash) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(flashId(flash.id))?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  return [flash, setFlash] as const
}
