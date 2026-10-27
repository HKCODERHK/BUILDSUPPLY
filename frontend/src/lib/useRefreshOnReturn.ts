import { useEffect, useRef } from 'react'

/**
 * Reads a screen's figures again when the person comes back to it (audit
 * F-06): the phone switched back to this app after `minAwayMs` or more, the
 * browser restored the page from its back/forward cache, or the network came
 * back. Every screen used to read once, when it opened — so an order page
 * left open since the morning showed the morning's prices, and a khata link
 * the balance from before the last payment.
 *
 * Deliberately not polling, and not a live connection: prices here are only
 * an indication and the bill is made later by the shop, so a fresh read at
 * the moments someone actually looks is enough, costs nothing while the
 * phone is in a pocket, and works on the slowest network.
 *
 * `refresh` must keep the screen as it is while it reads — no loader, no
 * reset of what has been typed — and change only the figures.
 */
export function useRefreshOnReturn(refresh: () => void, enabled = true, minAwayMs = 30_000) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  })

  useEffect(() => {
    if (!enabled) return
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      if (away >= minAwayMs) latest.current()
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) latest.current()
    }
    const onOnline = () => latest.current()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled, minAwayMs])
}
