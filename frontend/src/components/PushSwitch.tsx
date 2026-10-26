import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'
import { translate, type TranslationKey } from '@/lib/i18n'
import { pushState, refreshPush, turnOffPush, turnOnPush, type PushState, type PushTarget } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/**
 * "Alerts on this phone": one row saying what this phone will be told, and a
 * button to turn it on or off. Says plainly why when it can't — an iPhone in
 * Safari, alerts blocked, a browser without them. Shows nothing at all on a
 * dev build or a database without 051.
 */
export function PushSwitch({
  target = {},
  client = supabase,
  offText,
  english = false,
  tap = false,
  className,
  onChange,
}: {
  target?: PushTarget
  client?: SupabaseClient
  /** What turning it on gets you, in this place. */
  offText: TranslationKey
  /** The admin's screens stay in English. */
  english?: boolean
  /** 44px buttons, as on the customer pages. */
  tap?: boolean
  className?: string
  onChange?: (state: PushState) => void
}) {
  const { lang } = useLanguage()
  const l = english ? 'en' : lang
  const tt = (key: TranslationKey) => translate(l, key)
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const key = `${target.khata ?? ''}|${target.order ?? ''}`

  useEffect(() => {
    let alive = true
    pushState(target, client).then((s) => {
      if (!alive) return
      setState(s)
      // Already on: keep its language in step with the app's.
      if (s === 'on') void refreshPush(target, l, client)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the target
  }, [key, client, l])

  if (state === null || state === 'unavailable' || state === 'unsupported') {
    // A dev build has no service worker; say nothing rather than "unsupported".
    if (state === 'unsupported' && import.meta.env.PROD) {
      return <Row className={className} text={tt('push.unsupported')} muted />
    }
    return null
  }

  async function change(on: boolean) {
    setBusy(true)
    setError('')
    try {
      const next = on ? await turnOnPush(target, l, client) : await turnOffPush(target, client)
      setState(next)
      onChange?.(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Row
      className={className}
      text={
        state === 'on'
          ? tt('push.on')
          : state === 'blocked'
            ? tt('push.blocked')
            : state === 'needs-install'
              ? tt('push.needsInstall')
              : tt(offText)
      }
      title={tt('push.title')}
      error={error}
      action={
        state === 'on' ? (
          <Button variant="outline" size={tap ? 'tap' : 'sm'} disabled={busy} onClick={() => change(false)}>
            {busy ? tt('push.wait') : tt('push.turnOff')}
          </Button>
        ) : state === 'off' ? (
          <Button size={tap ? 'tap' : 'sm'} disabled={busy} onClick={() => change(true)}>
            {busy ? tt('push.wait') : tt('push.turnOn')}
          </Button>
        ) : null
      }
    />
  )
}

function Row({
  title,
  text,
  action,
  error,
  muted,
  className,
}: {
  title?: string
  text: string
  action?: React.ReactNode
  error?: string
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      <div className="flex items-start gap-3">
        <BellRing size={20} className={cn('mt-0.5 shrink-0', muted ? 'text-muted' : 'text-accent')} />
        <div className="min-w-0 flex-1">
          {title && <div className="text-sm font-semibold text-ink">{title}</div>}
          <p className="mt-0.5 text-sm text-muted">{text}</p>
          {action && <div className="mt-3">{action}</div>}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
