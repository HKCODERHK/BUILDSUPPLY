import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { dismissKeyboardOnScroll } from './lib/dismissKeyboardOnScroll'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Scrolling puts the phone's keyboard away, on every screen.
dismissKeyboardOnScroll()

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
