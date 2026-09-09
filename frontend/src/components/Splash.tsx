import { useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import type { SplashPhase } from '@/context/AuthContext'

/**
 * The loading screen, shown on a cold start and after a real sign-in — and at
 * no other time. See the `splash` field on AuthContext for why it is not tied
 * to the general `loading` flag.
 *
 * Deliberately dark in both themes: it is the same always-dark chrome as the
 * sidebar and the mobile header, and it sits under a status bar whose colour
 * is fixed to --color-shell in the manifest, so a light variant would show a
 * seam at the top of the screen.
 */
export function Splash({ phase }: { phase: Exclude<SplashPhase, null> }) {
  const { t } = useLanguage()
  // The artwork is optional: the ring reads perfectly well on its own, and a
  // broken image icon would be worse than none. Drop a file at
  // public/splash-art.png and it appears with no code change.
  const [artFailed, setArtFailed] = useState(false)

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center overflow-hidden bg-shell px-5 pb-5 text-center"
      style={{ paddingTop: 'calc(2.5rem + var(--safe-top))' }}
      role="status"
      aria-live="polite"
    >
      {/* Warms the top of the screen towards the header the supplier is about
          to see, so the splash reads as the app opening rather than a
          separate screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 70% at 50% 8%, #12383B 0%, transparent 60%)' }}
      />

      <div className="relative flex w-full max-w-sm flex-1 flex-col items-center">
        <div className="flex items-center gap-2.5">
          <svg
            width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#35A85D"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"
          >
            <path d="M3 21h18" />
            <path d="M5 21V8l5-4v17" />
            <path d="M10 21V11l6 3v7" />
            <path d="M16 21v-4l3 1.5V21" />
          </svg>
          <span className="text-[27px] font-bold leading-none tracking-tight text-white">BuildSupply</span>
        </div>
        <p className="mt-2.5 text-xs text-sidebar-text">{t('brand.tagline')}</p>

        {/* Landscape, so it sits as a band rather than inside the ring — a
            circular crop would cut the tractor and the truck off at the
            edges. Absent until public/splash-art.jpg exists, and the screen
            composes fine without it, so a missing file is never a broken
            image. */}
        {!artFailed && (
          <img
            src="/splash-art.jpg"
            alt=""
            onError={() => setArtFailed(true)}
            className="mt-7 w-full rounded-2xl object-cover shadow-lg"
            // 3:2 matches the artwork's own 940×630, so object-cover has
            // nothing to crop and the tractor and truck keep their full width.
            style={{ aspectRatio: '3 / 2' }}
          />
        )}

        {/* The ring is the loading indicator. It fills to roughly two-thirds
            and keeps turning, rather than resting at a figure that would look
            stuck on a slow connection. */}
        <div className={`relative h-[130px] w-[130px] shrink-0 ${artFailed ? 'mt-10' : 'mt-7'}`}>
          <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
            <defs>
              <linearGradient id="splashArc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5FE08C" />
                <stop offset="100%" stopColor="#198A45" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="85" fill="none" strokeWidth="9" stroke="rgba(255,255,255,.10)" />
            <circle
              cx="100" cy="100" r="85" fill="none" strokeWidth="9" strokeLinecap="round"
              stroke="url(#splashArc)" className="splash-arc"
            />
          </svg>
        </div>

        <p className="mt-6 text-xs text-sidebar-text">
          {t(phase === 'launch' ? 'splash.launch' : 'splash.signin')}
        </p>
      </div>

      <div
        className="relative flex w-full max-w-sm items-center pt-4"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        {/* `as const` keeps these as literal keys — t() is typed to the
            dictionary, and a widened string would not satisfy it. */}
        {([
          { key: 'splash.cement', d: 'M4 7h16v13H4z M4 7l3-3h10l3 3' },
          { key: 'splash.steel', d: 'M4 8h16 M4 12h16 M4 16h16' },
          { key: 'splash.bricks', d: 'M3 9h18M3 15h18M8 4v5M16 9v6M8 15v5' },
          { key: 'splash.delivery', d: 'M1 6h14v10H1z M15 9h4l3 3v4h-7z' },
          { key: 'splash.trusted', d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4' },
        ] as const).map((c, i) => (
          <div
            key={c.key}
            className={`flex flex-1 flex-col items-center gap-1.5 text-[9px] text-white/45 ${
              i > 0 ? 'border-l border-white/10' : ''
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="opacity-60">
              <path d={c.d} />
            </svg>
            {t(c.key)}
          </div>
        ))}
      </div>
    </div>
  )
}
