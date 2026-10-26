/**
 * The app icon's long-press shortcuts (manifest.webmanifest → shortcuts).
 *
 * Chrome on Android shows three — the fourth slot is Chrome's own "site
 * settings" — so these are the three a supplier reaches for all day: a bill,
 * money coming in, and the details for someone who just called.
 *
 * Each lands on /go/<name> (components/GoShortcut.tsx), an address that never
 * has to change: an installed app keeps the shortcuts it was installed with
 * until Chrome next refreshes it, so the screens behind them can move freely.
 */
export const SHORTCUT_TARGETS: Record<string, string> = {
  bill: '/invoices/new',
  payment: '/payments?new=1',
  details: '/dashboard?send=details',
}

/**
 * Whether this page load came from a shortcut — then the six-second opening
 * story is skipped: someone who long-pressed the icon wants the screen.
 * `?send=details` is the first shortcut's old address, still on phones whose
 * app Chrome has not refreshed yet.
 */
export function launchedFromShortcut(loc: { pathname: string; search: string }): boolean {
  return loc.pathname.startsWith('/go/') || new URLSearchParams(loc.search).get('send') === 'details'
}
