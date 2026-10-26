import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Lang } from '@/lib/i18n'

/**
 * Phone alerts (Web Push, migration 051). Free: the browser's own push
 * service carries them, the send-push Edge Function signs and encrypts them.
 *
 * A phone signs up for one of three things:
 *   - `{}`                its own login (a supplier, the admin, an applicant,
 *                         or a customer's saved account — pass that client)
 *   - `{ khata: code }`   a customer's khata link, no account needed
 *   - `{ order: token }`  one order's status link
 *
 * Alerts need the service worker, which registers only in a production build
 * (main.tsx), so on `npm run dev` this reports `unsupported`. An iPhone gets
 * them only from the app added to its home screen (iOS 16.4+).
 */

// The public half of the VAPID pair. The private half is the send-push
// function's VAPID_PRIVATE_KEY secret; change both together.
export const VAPID_PUBLIC_KEY =
  'BANns0i5YKFyG43pqtb7wVHbkHzmzLC5CIqPpW0Bv9pPVgK1E4nUuNr09bTEzR70ZBlQ65jCMGOxxBxdhBFeNoI'

export interface PushTarget {
  khata?: string
  order?: string
}

export type PushState =
  /** The database has no 051 yet: show nothing. */
  | 'unavailable'
  /** This browser has no push at all, or this is a dev build. */
  | 'unsupported'
  /** An iPhone in Safari: works once the app is added to the home screen. */
  | 'needs-install'
  /** The person said no; only the phone's own settings can undo that. */
  | 'blocked'
  | 'off'
  | 'on'

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return null
  try {
    // Wait for the worker main.tsx registers on load, but not forever.
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ])
  } catch {
    return null
  }
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function args(sub: PushSubscription, target: PushTarget) {
  return { p_endpoint: sub.endpoint, p_khata: target.khata ?? null, p_order: target.order ?? null }
}

/** Whether the browser could take alerts here, before asking anything. */
export function pushPossible(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
}

const available = new WeakMap<SupabaseClient, Promise<boolean>>()
/** Whether this database has 051 — asked once per client, with an address no phone has. */
function pushAvailable(client: SupabaseClient): Promise<boolean> {
  let known = available.get(client)
  if (!known) {
    known = Promise.resolve(client.rpc('push_subscribed', { p_endpoint: 'https://probe.invalid/' })).then(
      ({ error }) => !error || error.code !== 'PGRST202',
      () => false,
    )
    available.set(client, known)
  }
  return known
}

export async function pushState(target: PushTarget, client: SupabaseClient = supabase): Promise<PushState> {
  if (!(await pushAvailable(client))) return 'unavailable'
  if (!pushPossible()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await registration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  if (!sub || Notification.permission !== 'granted') return 'off'
  const { data } = await client.rpc('push_subscribed', args(sub, target))
  return data === true ? 'on' : 'off'
}

/**
 * Asks for permission (this must run from a tap) and signs this phone up.
 * Returns the state it ends in.
 */
export async function turnOnPush(target: PushTarget, lang: Lang, client: SupabaseClient = supabase): Promise<PushState> {
  if (!pushPossible()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'off'
  const reg = await registration()
  if (!reg) return 'unsupported'
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
  }
  await save(sub, target, lang, client)
  return 'on'
}

async function save(sub: PushSubscription, target: PushTarget, lang: Lang, client: SupabaseClient) {
  const json = sub.toJSON()
  const { data, error } = await client.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_lang: lang,
    p_khata: target.khata ?? null,
    p_order: target.order ?? null,
  })
  if (error) throw new Error(error.message || 'Could not turn alerts on. Please try again.')
  if ((data as { ok?: boolean } | null)?.ok === false) throw new Error('Could not turn alerts on. Please try again.')
}

/**
 * Stops this phone's alerts for this target. The browser's subscription is
 * kept: the same phone may still be signed up for another shop's khata.
 */
export async function turnOffPush(target: PushTarget, client: SupabaseClient = supabase): Promise<PushState> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const { error } = await client.rpc('remove_push_subscription', args(sub, target))
    if (error) throw new Error(error.message || 'Could not turn alerts off. Please try again.')
  }
  return 'off'
}

/**
 * Quietly brings an existing sign-up up to date — the app's language, or new
 * keys after the browser renewed them. Never asks for permission.
 */
export async function refreshPush(target: PushTarget, lang: Lang, client: SupabaseClient = supabase): Promise<void> {
  try {
    if (!pushPossible() || Notification.permission !== 'granted') return
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const { data } = await client.rpc('push_subscribed', args(sub, target))
    if (data === true) await save(sub, target, lang, client)
  } catch {
    // Alerts are a convenience; never a reason to show an error.
  }
}
