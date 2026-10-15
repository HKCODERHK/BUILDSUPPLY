import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

// Dialogs that own a history entry, oldest first. Back closes only the top
// one, and a dialog taking its own entry off again (history.back() below)
// must close nothing else. Every dialog used to listen for back itself, so
// cancelling the PIN prompt shut Receive payment underneath it too — and a
// correct PIN shut it before the payment's receipt could show.
interface OpenDialog {
  close: () => void
  popped: boolean
}
const openDialogs: OpenDialog[] = []
let ownUnwinds = 0

// Every open dialog, for Escape — which, like back, closes only the top one.
const mountedDialogs: object[] = []

window.addEventListener('popstate', () => {
  if (ownUnwinds > 0) {
    ownUnwinds -= 1
    return
  }
  const top = openDialogs.pop()
  if (!top) return
  top.popped = true
  top.close()
})

/**
 * What every dialog does besides drawing itself: back closes it (one history
 * entry, unwound again if it closes another way), and Escape closes it — in
 * both cases only the top one. Shared by Modal and ImagePreview.
 */
function useDialogBehaviour(onClose: () => void, captureBack: boolean) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Android's back gesture should close the dialog, not walk out of the
  // screen behind it. Opening pushes a throwaway history entry; back pops
  // that entry and we close instead of navigating. Installed as a PWA there
  // is no visible browser UI, so back is the only affordance a supplier has
  // and it has to do the obvious thing.
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

    // Back pops our entry and the listener above closes us — if we are on top.
    const me: OpenDialog = { close: () => onCloseRef.current(), popped: false }
    openDialogs.push(me)
    // The screen this dialog opened over — see the unwind below.
    const openedOn = window.location.pathname

    return () => {
      const at = openDialogs.indexOf(me)
      if (at >= 0) openDialogs.splice(at, 1)
      // Back consumed our entry — nothing left to unwind.
      if (me.popped) return
      // Closed by a button instead: drop the entry we added, so back doesn't
      // later need two presses to leave the screen.
      unwindRef.current = window.setTimeout(() => {
        unwindRef.current = undefined
        // Unless the app has moved to another screen meanwhile — a saved bill
        // opening, say. Our entry is underneath that move then, and going back
        // would undo it: that is what dropped suppliers on a blank New Invoice
        // after they answered "Delivered?". The pathname, not the whole URL,
        // so a screen tidying its own ?new=1 away doesn't count as moving.
        if (window.location.pathname !== openedOn) return
        // This back is ours: the dialog underneath must not take it as the
        // supplier pressing back.
        ownUnwinds += 1
        window.history.back()
      }, 0)
    }
  }, [captureBack])

  useEffect(() => {
    const me = {}
    mountedDialogs.push(me)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && mountedDialogs[mountedDialogs.length - 1] === me) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const at = mountedDialogs.indexOf(me)
      if (at >= 0) mountedDialogs.splice(at, 1)
    }
  }, [])

}

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
  useDialogBehaviour(onClose, captureBack)
  // Read in the person's own language, not always "Close" (#35).
  const closeLabel = useLanguage().t('common.close')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="vh-cap-90 w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="-m-3 flex h-11 w-11 items-center justify-center text-muted hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * A picture shown large — the shop's logo or cover, tapped on a customer
 * page. Fits the screen, keeps its shape, and closes on the ✕, a tap outside
 * the picture, Escape or the back gesture (the same handling as Modal).
 */
export function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useDialogBehaviour(onClose, true)
  const closeLabel = useLanguage().t('common.close')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pt-[calc(1rem_+_var(--safe-top))] pb-[calc(1rem_+_var(--safe-bottom))]"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-3 top-[calc(0.75rem_+_var(--safe-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X size={22} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="vh-cap-85 max-w-full rounded-2xl object-contain shadow-2xl"
      />
    </div>
  )
}
