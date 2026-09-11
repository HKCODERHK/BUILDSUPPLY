import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

// 'right' / 'left': which edges line up with the button. A number: neither
// fits (a very narrow screen), so the menu is slid to that many px from the
// button's left edge to keep it whole.
type Placement = { x: 'right' | 'left' | number; y: 'down' | 'up' }

// Kept clear of the screen's edges, in px.
const GAP = 8

/**
 * Where a menu may draw: inside the window, below the phone header and above
 * the phone tab bar (AppShell marks both; on a desktop they're hidden and
 * measure nothing, so the whole window counts).
 */
function usableArea() {
  const header = document.querySelector('[data-app-header]')?.getBoundingClientRect()
  const tabbar = document.querySelector('[data-app-tabbar]')?.getBoundingClientRect()
  return {
    top: (header?.height ? header.bottom : 0) + GAP,
    bottom: (tabbar?.height ? tabbar.top : window.innerHeight) - GAP,
    left: GAP,
    right: document.documentElement.clientWidth - GAP,
  }
}

/**
 * A "⋯" button holding the actions that matter less than the main one.
 *
 * Used where a screen had grown several equal-weight buttons and only one of
 * them was actually reached for — the rest are still one tap away, they just
 * stop competing for the eye.
 *
 * The menu lines up with the button's right edge, as a ⋯ at the end of a row
 * expects — unless that would run off the left of the screen (Materials, where
 * ⋯ sits near the left), when it lines up with the left edge instead. It
 * opens downward unless it would run under the tab bar and there is more room
 * above. Measured before it is painted, so it never flashes in the wrong place.
 */
export function ActionMenu({ items, label = 'More actions' }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<Placement>({ x: 'right', y: 'down' })
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !menuRef.current) return
    const area = usableArea()
    const button = wrapRef.current.getBoundingClientRect()
    const { width, height } = menuRef.current.getBoundingClientRect()
    const x: Placement['x'] =
      button.right - width >= area.left
        ? 'right'
        : button.left + width <= area.right
          ? 'left'
          : Math.max(area.left, Math.min(button.left, area.right - width)) - button.left
    const below = area.bottom - button.bottom
    const above = button.top - area.top
    const y = height > below && above > below ? 'up' : 'down'
    setPlace((prev) => (prev.x === x && prev.y === y ? prev : { x, y }))
  }, [open])

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
          ref={menuRef}
          role="menu"
          style={typeof place.x === 'number' ? { left: place.x } : undefined}
          className={cn(
            'absolute z-40 min-w-48 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg',
            place.x === 'right' ? 'right-0' : place.x === 'left' ? 'left-0' : '',
            place.y === 'down' ? 'top-full mt-1' : 'bottom-full mb-1',
          )}
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
