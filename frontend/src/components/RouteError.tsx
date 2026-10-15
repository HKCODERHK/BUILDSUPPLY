import { useEffect, useState } from 'react'
import { useRouteError } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { useLanguage } from '@/context/LanguageContext'
import { hasCustomerSession } from '@/lib/customerAuth'

/**
 * What any screen shows when it fails to load or crashes (2026-10-13), in
 * place of React Router's developer page ("Unexpected Application Error!"),
 * which a supplier saw on their phone.
 *
 * The usual cause is a deploy: a phone that opened BuildSupply before it
 * still asks for the old build's file for a screen — say Forgot password — and
 * that file is gone. Then the app reloads itself once to fetch the new build
 * (guarded like main.tsx's `vite:preloadError` handler, sharing its key, so it
 * can never loop), and only if that is not allowed does it ask for a tap.
 * Anything else gets a calm screen with Reload and Home.
 */

const RELOAD_KEY = 'buildsupply-reloaded-at'

function isStaleBuild(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? '')
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(message)
}

/** Whether a self-reload is allowed: not if one happened in the last 30 seconds. */
function mayReload() {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) || 0) >= 30_000
  } catch {
    return true // storage blocked: reload anyway — the button stays if it comes back
  }
}

function reload() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // nothing to remember it in
  }
  window.location.reload()
}

export function RouteError() {
  const error = useRouteError()
  const { t } = useLanguage()
  const stale = isStaleBuild(error)
  // Decided once, when the screen appears: reload by itself, or ask for a tap.
  const [reloading] = useState(() => stale && mayReload())

  useEffect(() => {
    if (reloading) reload()
  }, [reloading])

  const customerPage = /^\/(order|order-status|khata)\/|^\/me(\/|$)/.test(window.location.pathname)

  return (
    <div className="flex min-h-app items-center justify-center bg-surface p-6 text-ink">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-sm">
        <div className="flex justify-center">
          <BrandMark textClassName="text-lg text-ink" />
        </div>
        <h1 className="mt-5 text-lg font-bold">{stale ? t('err.updateTitle') : t('err.title')}</h1>
        <p className="mt-2 text-sm text-muted">{stale ? (reloading ? t('err.updateBody') : t('err.updateTap')) : t('err.body')}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reload}
            disabled={reloading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-soft disabled:opacity-70"
          >
            <RefreshCw size={16} className={reloading ? 'animate-spin' : undefined} /> {t('err.reload')}
          </button>
          {/* A customer's page must not send them to the shop owners' website
              (#27): their own BuildSupply if this phone has one, otherwise
              Reload alone. Everyone else keeps Home. */}
          {!stale && !customerPage && (
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="h-11 w-full rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface"
            >
              {t('err.home')}
            </button>
          )}
          {!stale && customerPage && hasCustomerSession() && window.location.pathname !== '/me' && (
            <button
              type="button"
              onClick={() => window.location.assign('/me')}
              className="h-11 w-full rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface"
            >
              {t('acct.title')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
