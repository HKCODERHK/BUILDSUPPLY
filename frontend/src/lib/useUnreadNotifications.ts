import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { NOTIFICATIONS_CHANGED, unreadNotifications } from '@/services/notifications'

/**
 * The bell's count: read on mount, every minute while the app is on screen,
 * on coming back to it, when a phone alert arrives (public/sw.js) and when
 * something is marked read. Null on a database without 051 — no bell then.
 */
export function useUnreadNotifications(client: SupabaseClient = supabase, enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const read = () => {
      if (document.visibilityState === 'hidden') return
      unreadNotifications(client).then((n) => {
        if (alive) setCount(n)
      })
    }
    read()
    const timer = window.setInterval(read, 60_000)
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'buildsupply-notification') read()
    }
    document.addEventListener('visibilitychange', read)
    window.addEventListener(NOTIFICATIONS_CHANGED, read)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', read)
      window.removeEventListener(NOTIFICATIONS_CHANGED, read)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [client, enabled])

  return count
}
