import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { dismissKeyboardOnScroll } from './lib/dismissKeyboardOnScroll'
import { listenForInstall } from './lib/installPrompt'
import { showScrollbarsWhileScrolling } from './lib/scrollbars'
import { applyDisplaySize, readDisplaySize } from './lib/displaySize'

// A customer's pages carry their own manifest, so "Add to Home screen" there
// opens their account (/me) rather than the supplier's sign-in. Swapped before
// anything renders, which is before Chrome reads it.
if (/^\/(me$|khata\/|order\/|order-status\/)/.test(window.location.pathname)) {
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/manifest-customer.webmanifest')
}

// Before the first render: Chrome's "can be installed" arrives early, once.
listenForInstall()

// And the app's own size, so nothing resizes under the supplier a moment in.
applyDisplaySize(readDisplaySize())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Screens are fetched when needed (App.tsx). If a new version was deployed
// while the app stayed open, an old screen's file is gone: reload once to pick
// up the new version. An unfinished bill survives it (lib/drafts); the guard
// stops a broken connection from reloading over and over.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('buildsupply-reloaded-at') || 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('buildsupply-reloaded-at', String(Date.now()))
  } catch {
    // Storage blocked: reload anyway.
  }
  window.location.reload()
})

// Scrolling puts the phone's keyboard away, on every screen.
dismissKeyboardOnScroll()

// Scrollbars stay out of sight until something scrolls, as in Telegram.
showScrollbarsWhileScrolling()

// Registers the service worker that makes BuildSupply installable and lets it
// open on a weak shop connection (see public/sw.js). Only in a real build —
// a worker caching the dev server's modules would fight Vite's HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not being installable is not a reason to break the app.
    })
  })
}
