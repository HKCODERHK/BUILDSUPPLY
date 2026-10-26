import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Lang } from '@/lib/i18n'

/**
 * The bell (migration 051). Notifications are written by the database as
 * things happen — a new order, a payment, a complaint — each with its words
 * already in English, Hindi and Marathi. RLS gives a supplier or the admin
 * their own, and a customer's saved account (041) its connected customers'.
 */

export interface AppNotification {
  id: string
  kind: string
  text: Record<Lang, { t: string; b: string }>
  link: string | null
  created_at: string
  read_at: string | null
}

const COLUMNS = 'id, kind, text, link, created_at, read_at'

/** Null on a database without 051, so the bell can hide itself. */
export async function listNotifications(client: SupabaseClient = supabase, limit = 50): Promise<AppNotification[] | null> {
  const { data, error } = await client
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(limit)
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') return null
    throw new Error(error.message || 'Could not load notifications.')
  }
  return (data ?? []) as AppNotification[]
}

/** Unread count; null on a database without 051 or when it can't be read. */
export async function unreadNotifications(client: SupabaseClient = supabase): Promise<number | null> {
  const { count, error } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) return null
  return count ?? 0
}

/** Marks the given ones read, or every unread one when no ids are given. */
export async function markNotificationsRead(ids?: string[], client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.rpc('mark_notifications_read', { p_ids: ids ?? null })
  if (error) throw new Error(error.message || 'Could not mark as read.')
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
}

/** Fired when the bell's count may have changed, here or from a phone alert. */
export const NOTIFICATIONS_CHANGED = 'buildsupply-notifications-changed'

export function notificationText(n: AppNotification, lang: Lang): { t: string; b: string } {
  return n.text?.[lang] ?? n.text?.en ?? { t: 'BuildSupply', b: '' }
}
