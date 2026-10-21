import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { QrCode } from '@/components/QrCode'
import { useLanguage } from '@/context/LanguageContext'
import { orderQrPngFile } from '@/lib/qr'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { cn } from '@/lib/utils'

// The scroll effects from the user's PhonePe recording (2026-10-21): the top
// block stays where it is under the header while the rest of the page slides
// up over it on a rounded sheet — the block "closes" rather than scrolling
// away — and the shop's QR at the foot of the home screen grows into view.
// Only transform and opacity move, so it stays smooth on a budget phone, and
// under reduced motion nothing scales; the sheet still covers.

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** How far a sticky header covers the top of the page, kept current. */
function useStickyTop(under: string | undefined) {
  const [top, setTop] = useState(0)
  useEffect(() => {
    if (!under) return
    const el = document.querySelector<HTMLElement>(under)
    if (!el) return
    const measure = () => setTop(getComputedStyle(el).position === 'sticky' ? el.getBoundingClientRect().height : 0)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [under])
  return top
}

/**
 * The block that closes: pinned just under the header (`under`, a selector
 * for it), and fading and shrinking a little as the sheet after it covers it.
 */
export function CollapsingHero({
  under,
  children,
  className,
  inGap = false,
}: {
  under?: string
  children: ReactNode
  className?: string
  /** In a column spaced by `gap-4`: the marker takes its gap back. */
  inGap?: boolean
}) {
  const marker = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const top = useStickyTop(under)

  useEffect(() => {
    const quiet = reducedMotion()
    let frame = 0
    const update = () => {
      frame = 0
      const m = marker.current
      const b = box.current
      if (!m || !b) return
      // How far the page has moved since the block reached the header: 0 at
      // rest, 1 once a whole block's height of sheet has gone over it.
      const travelled = top - m.getBoundingClientRect().top
      const p = Math.min(1, Math.max(0, travelled / Math.max(1, b.offsetHeight)))
      b.style.opacity = String(1 - p * 0.85)
      b.style.transform = quiet ? '' : `scale(${1 - p * 0.07})`
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [top])

  return (
    <>
      <div ref={marker} aria-hidden="true" className={cn('h-0', inGap && '-mb-4')} />
      <div ref={box} style={{ top }} className={cn('sticky z-0 origin-top will-change-transform', className)}>
        {children}
      </div>
    </>
  )
}

/** The rounded sheet that slides up over the block above it. */
export function CoverSheet({ children, className, plain = false }: { children: ReactNode; className?: string; plain?: boolean }) {
  return (
    <div
      className={cn(
        'relative z-10 rounded-t-[28px] bg-surface pt-4 shadow-[0_-12px_28px_rgba(10,36,39,0.10)]',
        !plain && 'flex flex-col gap-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Grows from a little smaller to full size as it scrolls into view. */
function useGrowIn<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (reducedMotion()) return
    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (r.height * 0.9)))
      el.style.transform = `scale(${0.86 + 0.14 * p})`
      el.style.opacity = String(0.35 + 0.65 * p)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

/**
 * The shop's own QR at the foot of a home screen — the recording's "MY QR",
 * here always the shop's order link: scanned, it opens that shop's order
 * page. Black on white so it scans in dark mode too. Share sends the same
 * printable picture the supplier's Share QR image makes.
 */
export function ShopQrCard({
  url,
  business,
  logoUrl,
  title,
  caption,
}: {
  url: string
  business: string
  logoUrl: string | null
  title: string
  caption: string
}) {
  const { t } = useLanguage()
  const ref = useGrowIn<HTMLDivElement>()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function share() {
    if (busy) return
    setBusy(true)
    try {
      const file = await orderQrPngFile({ url, business, logoUrl, initialsKey: business })
      await shareDocumentOnWhatsApp({ file, message: t('order.shareText', { business, url }), title: business })
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // No clipboard here: the link is printed under the code anyway.
    }
  }

  return (
    <section className="flex flex-col items-center gap-3 py-2">
      <h2 className="text-3xl font-black uppercase tracking-wide text-muted-2/70">{title}</h2>
      <div ref={ref} className="w-full max-w-xs origin-bottom rounded-3xl bg-white p-5 text-[#0a2427] shadow-[0_10px_30px_rgba(10,36,39,0.16)] will-change-transform">
        <div className="mb-3 flex items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover ring-1 ring-black/5" />
          ) : null}
          <span className="line-clamp-2 min-w-0 break-words text-sm font-bold leading-tight">{business}</span>
        </div>
        <div className="flex justify-center">
          <QrCode text={url} size={208} label={caption} />
        </div>
        <p className="mt-2 text-center text-xs font-medium text-[#45605f]">{caption}</p>
        <p className="mt-0.5 break-all text-center text-[11px] text-[#6b7f7e]">{url.replace(/^https?:\/\//, '')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d5dedd] text-sm font-semibold text-[#0a2427]"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t('order.copied') : t('qr.copy')}
          </button>
          <button
            type="button"
            onClick={share}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-semibold text-white disabled:opacity-70"
          >
            <Share2 size={16} /> {busy ? t('common.preparing') : t('qr.share')}
          </button>
        </div>
      </div>
    </section>
  )
}
