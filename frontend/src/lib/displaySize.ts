/**
 * How big the app draws itself: Small, Medium or Large.
 *
 * It is one number — the root font size — and everything follows from it,
 * because Tailwind sizes text, padding, gaps and rounding in `rem`. Phase 19
 * measured all 22 screens at 115% and 130% of the root size with nothing
 * breaking or scrolling sideways, so the layouts already stand up to this;
 * Large is 112.5%, comfortably inside what was tested.
 *
 * It matters more here than on an ordinary website because this app turns
 * pinch-zoom off (index.html), so a supplier who finds the text small has
 * nowhere else to go. Android's own display-size setting still works and
 * stacks with this.
 */
export type DisplaySize = 'small' | 'medium' | 'large'

/** Root font size in px for each. 16 is the browser's own default. */
export const DISPLAY_SIZE_PX: Record<DisplaySize, number> = {
  small: 15,
  medium: 16,
  large: 18,
}

const STORAGE_KEY = 'buildsupply-display-size'

export function isDisplaySize(value: unknown): value is DisplaySize {
  return value === 'small' || value === 'medium' || value === 'large'
}

/** What the supplier chose, or Medium. Never throws: private mode can refuse storage. */
export function readDisplaySize(): DisplaySize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isDisplaySize(stored)) return stored
  } catch {
    // Storage blocked — the default is as good an answer as any.
  }
  return 'medium'
}

/**
 * Applies it to the document. Medium removes the override rather than writing
 * `16px`, so the browser's own default (and anything the phone's accessibility
 * settings do to it) still decides.
 */
export function applyDisplaySize(size: DisplaySize) {
  const root = document.documentElement
  if (size === 'medium') root.style.removeProperty('font-size')
  else root.style.fontSize = `${DISPLAY_SIZE_PX[size]}px`
}

export function saveDisplaySize(size: DisplaySize) {
  applyDisplaySize(size)
  try {
    if (size === 'medium') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, size)
  } catch {
    // It still applies for this visit; only remembering it is lost.
  }
}
