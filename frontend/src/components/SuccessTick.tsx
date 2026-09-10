/**
 * The one confirmation the app gives after something that matters is done —
 * money taken, a bill saved: a green tick that draws itself in 0.4s, over a
 * line saying what happened.
 *
 * It never holds anything up. It plays on a screen that was appearing anyway,
 * beside whatever that screen asks next, and nothing waits for it to finish.
 * Under reduced motion it is simply there. Keyframes in index.css.
 */
export function SuccessTick({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="success-tick shrink-0" aria-hidden>
      <circle cx="24" cy="24" r="22" className="fill-accent" />
      <path
        className="success-tick-check"
        d="m14.5 24.5 6.5 6.5 12.5-13.5"
        pathLength={1}
        fill="none"
        stroke="#fff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The tick with what just happened under it, at the top of a dialog. */
export function SuccessHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center text-center" role="status">
      <SuccessTick />
      <div className="mt-2 text-lg font-bold text-ink">{title}</div>
      {detail && <div className="mt-0.5 text-sm text-muted">{detail}</div>}
    </div>
  )
}
