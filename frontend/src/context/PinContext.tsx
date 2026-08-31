import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { getPinStatus, verifyPin } from '@/services/pin'
import { sanitizeDigits } from '@/lib/numberInput'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Puts a confirmation PIN in front of an action that cannot be undone.
 *
 * Usage is deliberately one line at the call site:
 *
 *   if (!(await confirmWithPin('cancel this bill'))) return
 *
 * It resolves true when the PIN is right, when the account has no PIN set
 * (the feature is opt-in), or when there is nothing to protect. It resolves
 * false if the person backs out or is locked out — so the caller only has to
 * handle "go ahead" and "don't".
 */
interface PinContextValue {
  /** True once the signed-in account has a PIN configured. */
  hasPin: boolean
  /** Re-reads PIN status — call after setting or removing one. */
  refreshPinStatus: () => Promise<void>
  /** Asks for the PIN. `reason` is shown so the person knows what they are approving. */
  confirmWithPin: (reason: string) => Promise<boolean>
}

const PinContext = createContext<PinContextValue | undefined>(undefined)

interface Pending {
  reason: string
  resolve: (ok: boolean) => void
}

export function PinProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [hasPin, setHasPin] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  // Read once per session rather than before every guarded action, so the
  // common case (no PIN set) costs nothing.
  const hasPinRef = useRef(false)

  const refreshPinStatus = useCallback(async () => {
    if (!session) {
      hasPinRef.current = false
      setHasPin(false)
      return
    }
    try {
      const status = await getPinStatus()
      hasPinRef.current = status.has_pin
      setHasPin(status.has_pin)
    } catch {
      // If status can't be read, treat it as no PIN. Failing open here is
      // right: this is a confirmation step, and locking someone out of their
      // own bills because a status call failed would be worse than the risk.
      hasPinRef.current = false
      setHasPin(false)
    }
  }, [session])

  useEffect(() => {
    void refreshPinStatus()
  }, [refreshPinStatus])

  const confirmWithPin = useCallback(
    (reason: string) => {
      if (!hasPinRef.current) return Promise.resolve(true)
      setEntry('')
      setError(null)
      return new Promise<boolean>((resolve) => setPending({ reason, resolve }))
    },
    [],
  )

  function finish(ok: boolean) {
    pending?.resolve(ok)
    setPending(null)
    setEntry('')
    setError(null)
  }

  async function submit() {
    if (entry.length !== 4 || checking) return
    setChecking(true)
    setError(null)
    try {
      const result = await verifyPin(entry)
      if (result.ok) {
        finish(true)
        return
      }
      if (result.locked_until) {
        setError(t('pin.lockedOut', { time: new Date(result.locked_until).toLocaleTimeString('en-IN') }))
        setEntry('')
        return
      }
      setError(t('pin.wrong', { left: result.attempts_left ?? 0 }))
      setEntry('')
    } catch {
      setError(t('pin.failed'))
    } finally {
      setChecking(false)
    }
  }

  const value = useMemo(() => ({ hasPin, refreshPinStatus, confirmWithPin }), [hasPin, refreshPinStatus, confirmWithPin])

  return (
    <PinContext.Provider value={value}>
      {children}
      {pending && (
        <Modal title={t('pin.confirmTitle')} onClose={() => finish(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">{t('pin.confirmBody', { action: pending.reason })}</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={entry}
              onChange={(e) => setEntry(sanitizeDigits(e.target.value).slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              className="h-14 w-full rounded-lg border border-border bg-card text-center text-2xl tracking-[0.6em] outline-none focus:border-accent"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => finish(false)}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1" disabled={entry.length !== 4 || checking} onClick={() => void submit()}>
                {checking ? t('pin.checking') : t('pin.confirm')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PinContext.Provider>
  )
}

export function usePin(): PinContextValue {
  const ctx = useContext(PinContext)
  if (!ctx) throw new Error('usePin must be used within a PinProvider')
  return ctx
}
