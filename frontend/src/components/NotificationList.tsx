import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { translate, type Lang, type TranslationKey } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  listNotifications,
  markNotificationsRead,
  notificationText,
  NOTIFICATIONS_CHANGED,
  type AppNotification,
} from '@/services/notifications'

function timeAgo(iso: string, lang: Lang): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en-IN' : lang, { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
  ]
  let value = seconds
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === 'second' ? rtf.format(0, 'second') : rtf.format(value, unit)
    value = Math.round(value / size)
  }
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { day: 'numeric', month: 'short' })
}

/**
 * The notifications themselves, newest first. Tapping one marks it read and
 * opens what it is about; a customer's (`linkOverride`) open their account.
 */
export function NotificationList({
  client = supabase,
  english = false,
  emptyText = 'notif.empty',
  linkOverride,
  limit = 50,
}: {
  client?: SupabaseClient
  english?: boolean
  emptyText?: TranslationKey
  /** Where every row goes, when the rows' own links don't apply here. */
  linkOverride?: string
  limit?: number
}) {
  const { lang } = useLanguage()
  const l: Lang = english ? 'en' : lang
  const navigate = useNavigate()
  const [rows, setRows] = useState<AppNotification[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    listNotifications(client, limit).then(
      (r) => {
        setFailed(false)
        setRows(r ?? [])
      },
      () => setFailed(true),
    )
  }, [client, limit])

  useEffect(() => {
    load()
    window.addEventListener(NOTIFICATIONS_CHANGED, load)
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'buildsupply-notification') load()
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, load)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [load])

  async function open(n: AppNotification) {
    if (!n.read_at) {
      setRows((rs) => rs?.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)) ?? null)
      markNotificationsRead([n.id], client).catch(() => {})
    }
    const to = linkOverride ?? n.link
    if (to) navigate(to)
  }

  async function markAll() {
    setRows((rs) => rs?.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })) ?? null)
    await markNotificationsRead(undefined, client).catch(() => {})
  }

  if (failed) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p role="alert" className="text-red-600 dark:text-red-400">{translate(l, 'notif.loadFailed')}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>
          {translate(l, 'notif.tryAgain')}
        </Button>
      </div>
    )
  }
  if (!rows) return <TruckLoader label={english ? 'Loading…' : undefined} />
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">{translate(l, emptyText)}</div>
  }

  const unread = rows.some((r) => !r.read_at)
  return (
    <div>
      {unread && (
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={markAll} className="px-1 py-1 text-sm font-semibold text-accent hover:underline">
            {translate(l, 'notif.markAll')}
          </button>
        </div>
      )}
      <ul className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((n) => {
          const text = notificationText(n, l)
          return (
            <li key={n.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => open(n)}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface',
                  !n.read_at && 'bg-accent/5',
                )}
              >
                <span
                  aria-hidden
                  className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-accent')}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm text-ink', !n.read_at && 'font-semibold')}>{text.t}</span>
                  {text.b && <span className="mt-0.5 block text-sm text-muted">{text.b}</span>}
                  <span className="mt-1 block text-xs text-muted">{timeAgo(n.created_at, l)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
