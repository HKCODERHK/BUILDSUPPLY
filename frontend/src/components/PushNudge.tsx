import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { pushState, turnOnPush } from '@/lib/push'

const KEY = (id: string) => `buildsupply-push-nudge:${id}`

/**
 * Dashboard: once, on a phone that could take alerts and has not, "Know about
 * new orders at once" with Turn on. "Not now" puts it away for good on this
 * phone; the switch stays on the Notifications screen. Never on a phone that
 * can't (a dev build, an iPhone in Safari) or has blocked them.
 */
export function PushNudge() {
  const { supplier } = useAuth()
  const { t, lang } = useLanguage()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const id = supplier?.id

  useEffect(() => {
    if (!id) return
    try {
      if (localStorage.getItem(KEY(id))) return
    } catch {
      return
    }
    let alive = true
    pushState({}).then((s) => alive && setShow(s === 'off'))
    return () => {
      alive = false
    }
  }, [id])

  if (!show || !id) return null

  function dismiss() {
    try {
      localStorage.setItem(KEY(id!), '1')
    } catch {
      // Private mode: it simply comes back next time.
    }
    setShow(false)
  }

  async function turnOn() {
    setBusy(true)
    try {
      await turnOnPush({}, lang)
    } catch {
      // The Notifications screen says why, if it is opened.
    }
    setBusy(false)
    dismiss()
  }

  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <BellRing size={18} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{t('notif.nudgeTitle')}</div>
          <p className="mt-0.5 text-sm text-muted">{t('notif.nudgeBody')}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={turnOn}>
              {busy ? t('push.wait') : t('push.turnOn')}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t('notif.notNow')}
            </Button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('common.close')} className="-mr-1 -mt-1 rounded-full p-1 text-muted hover:bg-surface">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
