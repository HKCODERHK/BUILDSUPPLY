import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Stops half-finished work disappearing.
 *
 * The case this exists for: a supplier has typed eight line items, the phone's
 * back gesture fires, and the bill is gone with no way back. The router
 * blocker catches in-app navigation including the Android back button;
 * `beforeunload` catches a refresh or the tab closing.
 *
 * `when` must be false unless there is genuinely something to lose — a guard
 * that fires on an empty form is worse than no guard, because people learn to
 * dismiss it without reading.
 */
export function UnsavedChangesGuard({ when, message }: { when: boolean; message: string }) {
  const { t } = useLanguage()

  // Read `when` through a ref so the blocker function keeps a stable
  // identity. React Router re-registers the blocker whenever this function
  // changes, and re-registering while a navigation is already blocked drops
  // the block on the floor.
  const whenRef = useRef(when)
  whenRef.current = when

  const shouldBlock = useCallback(
    ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
      whenRef.current && currentLocation.pathname !== nextLocation.pathname,
    [],
  )
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (!when) return
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])

  if (blocker.state !== 'blocked') return null

  return (
    <Modal title={t('unsaved.title')} captureBack={false} onClose={() => blocker.reset()}>
      <p className="mb-4 text-sm text-ink">{message}</p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => blocker.reset()}>
          {t('unsaved.stay')}
        </Button>
        <Button variant="danger" className="flex-1" onClick={() => blocker.proceed()}>
          {t('unsaved.leave')}
        </Button>
      </div>
    </Modal>
  )
}
