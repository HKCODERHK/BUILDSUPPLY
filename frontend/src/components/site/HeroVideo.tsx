import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * The website's moving picture (2026-10-12), asked for from the video beside
 * claude.ai's sign-in, "with a real feel, and the man must be Indian": two
 * real clips, played one after the other on a loop with a cross-fade — a man
 * at a desk being handed yet more files, then a man smiling on a phone call.
 *
 * Both are free stock footage from Pexels (RDNE Stock project, videos 7581377
 * and 7581309), downloaded with the user's approval into public/video/. The
 * Pexels licence forbids implying that an identifiable person endorses a
 * product, so — the user's choice — nothing here names BuildSupply over
 * either man: no caption, no "with BuildSupply". The headline beside the
 * video makes the claim; the footage only sets the mood. Keep it that way.
 *
 * Phones get the 640px files (~1.3 MB for both), computers the 960px ones.
 * Reduced motion or the browser's data saver shows the first clip's still
 * and downloads no video at all. The service worker leaves /video/ alone.
 */

const CLIPS = ['stress', 'happy'] as const

function wantsStill() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  return !!(reduce || saveData)
}

export function HeroVideo() {
  const [still] = useState(wantsStill)
  const [small] = useState(() => !!window.matchMedia?.('(max-width: 767px)').matches)
  const [active, setActive] = useState(0)
  const first = useRef<HTMLVideoElement>(null)
  const second = useRef<HTMLVideoElement>(null)
  const refs = [first, second]

  useEffect(() => {
    if (still) return
    // Muted, inline video may autoplay; if a phone refuses, its still stays.
    first.current?.play().catch(() => undefined)
  }, [still])

  // Which clip is showing, read by the event handlers without waiting for a
  // render, so the end of a clip hands over exactly once.
  const showing = useRef(0)

  function playNext(ended: number) {
    if (ended !== showing.current) return
    const next = (ended + 1) % CLIPS.length
    showing.current = next
    const v = refs[next].current
    if (!v) return
    v.currentTime = 0
    v.play().catch(() => undefined)
    setActive(next)
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black shadow-xl lg:aspect-[4/5]" aria-hidden>
      {CLIPS.map((name, i) => (
        <video
          key={name}
          ref={refs[i]}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            active === i ? 'opacity-100' : 'opacity-0',
          )}
          poster={`/video/poster-${name}.jpg`}
          src={still ? undefined : `/video/${name}-${small ? 640 : 960}.mp4`}
          muted
          playsInline
          preload={still ? 'none' : 'auto'}
          onEnded={() => playNext(i)}
          // A clip can stall a few frames short of its end and never say it
          // ended; hand over in its last quarter-second either way.
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (v.duration && v.duration - v.currentTime < 0.25) playNext(i)
          }}
        />
      ))}
    </div>
  )
}
