import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({
  title,
  onClose,
  children,
  captureBack = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /**
   * Push a history entry so the back gesture closes this dialog. Turn it off
   * for a dialog that is itself about navigation — the unsaved-work prompt
   * appears *because* a navigation was blocked, and pushing more history
   * underneath it just cancels the prompt.
   */
  captureBack?: boolean
}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Android's back gesture should close the dialog, not walk out of the
  // screen behind it. Opening pushes a throwaway history entry; back pops
  // that entry and we close instead of navigating. Installed as a PWA there
  // is no visible browser UI, so back is the only affordance a supplier has
  // and it has to do the obvious thing.
  // Tracked here rather than read back off history.state: the data router
  // owns that object and overwrites anything we put in it.
  const pushedRef = useRef(false)
  // Set while an unwind is queued but not yet run. React's StrictMode mounts,
  // tears down and remounts in development, and history.back() is async — so
  // without this the teardown's back() landed AFTER the remount's pushState,
  // popped it, and slammed the dialog shut the instant it opened. Deferring
  // the unwind by a tick lets the remount cancel it.
  const unwindRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!captureBack) return

    if (unwindRef.current !== undefined) {
      // A remount, not a real open: keep the entry already on the stack.
      clearTimeout(unwindRef.current)
      unwindRef.current = undefined
    } else {
      window.history.pushState(null, '')
    }
    pushedRef.current = true

    function onPop() {
      // Back consumed our entry — nothing left to unwind.
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      // Closed by a button instead: drop the entry we added, so back doesn't
      // later need two presses to leave the screen.
      if (!pushedRef.current) return
      unwindRef.current = window.setTimeout(() => {
        unwindRef.current = undefined
        window.history.back()
      }, 0)
    }
  }, [captureBack])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-m-2 p-2 text-muted hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
