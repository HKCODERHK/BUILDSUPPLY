/**
 * Closes the phone's keyboard the moment the supplier starts scrolling, the
 * way a native app does.
 *
 * With the keyboard up, half the screen is gone. A supplier who typed a
 * quantity and then dragged to reach the next row, or down to Save, was
 * scrolling a sliver of page behind a keyboard they had no use for — most
 * fields have no "done" key, and the back gesture closes a dialog or leaves
 * the screen instead. Now the drag itself puts the keyboard away; tapping the
 * next field brings it back.
 *
 * - It follows the finger, not `scroll` events. Opening the keyboard makes
 *   Android scroll the page by itself to keep the field in view, so a scroll
 *   listener would close the keyboard the instant it opened.
 * - A swipe up or down is a scroll wherever it starts — including on the field
 *   just typed into, which sits right above the keyboard, where the thumb
 *   comes back to the screen.
 * - A drag sideways along that field is left alone: it is the cursor moving,
 *   or a digit being selected to fix, which index.css keeps selection on in
 *   fields for.
 * - A tap is not a drag. Nothing happens until the finger has moved further
 *   than a tap's natural wobble.
 * - Touch only. A mouse wheel never raised a keyboard, and losing focus on a
 *   desktop would only be annoying.
 */

/** Further than a tap wobbles, well short of a deliberate scroll. */
const DRAG_PX = 10

/** Input types that never raise a keyboard. */
const NO_KEYBOARD = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

function holdsKeyboard(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NO_KEYBOARD.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

export function dismissKeyboardOnScroll() {
  // Where the finger came down while a field had the keyboard, and whether it
  // came down on that field; null when there is no keyboard to put away.
  let start: { x: number; y: number; onField: boolean } | null = null

  // Capture, so nothing stopping propagation can hide a drag from this; and
  // passive, so the scroll itself never waits on it.
  const options = { capture: true, passive: true }

  document.addEventListener(
    'touchstart',
    (e) => {
      const field = document.activeElement
      start =
        e.touches.length === 1 && holdsKeyboard(field)
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY, onField: field.contains(e.target as Node) }
          : null
    },
    options,
  )

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!start) return
      const dx = Math.abs(e.touches[0].clientX - start.x)
      const dy = Math.abs(e.touches[0].clientY - start.y)
      if (dx < DRAG_PX && dy < DRAG_PX) return
      const { onField } = start
      start = null
      const field = document.activeElement
      // Sideways along the field is the cursor or a selection, not a scroll;
      // so is anything inside a box of text that scrolls on its own.
      if (onField && (dx >= dy || !(field instanceof HTMLInputElement))) return
      if (holdsKeyboard(field)) field.blur()
    },
    options,
  )
}
