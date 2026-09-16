// Telegram-style scrollbars (index.css): hidden until something scrolls,
// shown while it moves, gone a moment after it stops. One listener for the
// whole app — scroll events don't bubble, but the capture phase sees every
// one — so the page, a dialog's list and the bill's table all behave alike.
// The attribute only changes when a scroll starts or has stopped, not on every
// scroll event, so there's no extra work while a long list flies past.

const HIDE_AFTER_MS = 900

export function showScrollbarsWhileScrolling() {
  const timers = new WeakMap<Element, number>()
  document.addEventListener(
    'scroll',
    (event) => {
      const el = event.target === document ? document.documentElement : event.target
      if (!(el instanceof Element)) return
      if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '')
      window.clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute('data-scrolling'), HIDE_AFTER_MS),
      )
    },
    { capture: true, passive: true },
  )
}
