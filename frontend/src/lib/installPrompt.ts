import { useSyncExternalStore } from 'react'

// "Install app" (More sheet). Chrome — on Android, and on computers — says
// once, early, that the app can be installed: the `beforeinstallprompt`
// event. It is kept here so a later tap can open Chrome's own install dialog.
// iPhones never send it: Safari installs only through Share → Add to Home
// Screen, so there the tile shows those steps instead. Once the app is
// installed, or already running as the installed app, the tile goes away.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function runningInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS asks for the desktop site and says "Macintosh" — its touch screen gives it away.
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** Called once at start-up, before React renders, so the early event is never missed. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Chrome's own bar would pop up over whatever the supplier is doing —
    // mid-bill, say. The tile in More offers the same dialog when they choose.
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

/** 'prompt': Chrome's dialog is ready. 'ios': show the Add to Home Screen steps. 'none': nothing to offer. */
export type InstallState = 'prompt' | 'ios' | 'none'

function snapshot(): InstallState {
  if (installed || runningInstalled()) return 'none'
  if (deferred) return 'prompt'
  if (isIos()) return 'ios'
  return 'none'
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => 'none')
}

/**
 * Opens Chrome's install dialog. Must run straight from a tap. Chrome lets the
 * event be used once; the tile then hides until Chrome offers it again.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}
