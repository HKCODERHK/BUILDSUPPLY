import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionMenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  /** Renders in red — for the one action on a screen that destroys something. */
  destructive?: boolean
  disabled?: boolean
}

/**
 * A "⋯" button holding the actions that matter less than the main one.
 *
 * Used where a screen had grown several equal-weight buttons and only one of
 * them was actually reached for — the rest are still one tap away, they just
 * stop competing for the eye.
 */
export function ActionMenu({ items, label = 'More actions' }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // Pointer rather than click, so the menu closes on the press that starts
    // an interaction elsewhere rather than after it completes.
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 w-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-ink transition-colors hover:bg-surface"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-48 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
                item.destructive ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950' : 'text-ink hover:bg-surface',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
