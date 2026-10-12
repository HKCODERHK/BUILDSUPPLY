import { useEffect, useRef, useState } from 'react'

/**
 * The website's moving picture (2026-10-12): real footage of the trade a
 * BuildSupply customer is in — a warehouse stacked with material bags, cement
 * bags lifted onto a truck by forklift, heavy bags loaded onto a red truck,
 * steel stirrups bent on a machine, steel bars cut in a shower of sparks —
 * cut into one 25-second montage with cross-fades, looping. The user picked
 * the forklift and steel shots and asked for more like them.
 *
 * The clips are free Pexels footage (9856370, 3365496, 32268491, 16106454, 9084346),
 * downloaded with the user's approval and cut together here, so the site
 * ships two small files instead of 26 MB of originals. No caption ties any
 * person in them to BuildSupply: the Pexels licence forbids implying an
 * identifiable person endorses a product. The headline beside it makes the
 * claim; the footage shows the trade.
 *
 * Phones get the 640px file when it exists, computers the 960px one; reduced
 * motion or the browser's data saver shows the still and downloads no video.
 * The service worker leaves /video/ alone.
 */

function wantsStill() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  return !!(reduce || saveData)
}

const MONTAGE = { small: '/video/montage-640.mp4', large: '/video/montage-960.mp4', poster: '/video/montage-poster.jpg' }

export function HeroVideo() {
  const [still] = useState(wantsStill)
  const [small] = useState(() => !!window.matchMedia?.('(max-width: 767px)').matches)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (still || !v) return
    // Muted, inline video may autoplay; if a phone refuses, the still stays.
    // Browsers pause a muted video when its tab goes to the background, and
    // do not always start it again — so play it whenever it is back in view.
    const play = () => {
      if (!document.hidden && v.paused) v.play().catch(() => undefined)
    }
    play()
    const seen = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : v.pause()))
    seen.observe(v)
    document.addEventListener('visibilitychange', play)
    return () => {
      seen.disconnect()
      document.removeEventListener('visibilitychange', play)
    }
  }, [still])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl lg:aspect-[4/3]" aria-hidden>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        poster={MONTAGE.poster}
        src={still ? undefined : small ? MONTAGE.small : MONTAGE.large}
        muted
        autoPlay={!still}
        loop
        playsInline
        preload={still ? 'none' : 'auto'}
      />
    </div>
  )
}
