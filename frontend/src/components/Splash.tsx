import { useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import { useAuth, type SplashPhase } from '@/context/AuthContext'

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
  const { supplier } = useAuth()
  // The artwork is optional: the ring reads perfectly well on its own, and a
  // broken image icon would be worse than none. Drop a file at
  // public/splash-art.jpg and it appears with no code change.
  const [artFailed, setArtFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  // The supplier's own logo from Settings, sitting inside the ring so the wait
  // belongs to their business rather than to ours.
  //
  // It arrives part-way through on purpose: the profile is one of the things
  // the splash is covering, so on a cold start the ring turns empty for a
  // moment and the logo fades in behind it. Fading rather than appearing keeps
  // that from reading as a glitch. Plenty of suppliers will never upload one,
  // and an empty ring is the right answer for them — not a placeholder telling
  // them something is missing.
  const logo = !logoFailed ? supplier?.logo_url : null

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
          {logo && (
            <img
              src={logo}
              alt=""
              onError={() => setLogoFailed(true)}
              className="splash-logo absolute rounded-full object-cover"
              // Inset clears the 9px stroke with room to breathe, so the logo
              // sits inside the ring rather than tucked under it.
              style={{ inset: '16px', width: 'calc(100% - 32px)', height: 'calc(100% - 32px)' }}
            />
          )}
        </div>

        {/* A tipper crossing the screen while the app loads — the same flat,
            side-on shape as the vehicles on the KALYANI signboard, in the
            app's own green. It also does a job: something moving says the app
            is working, which matters over six seconds. */}
        {/* Container height tracks the truck: 152px wide against a 130×56
            viewBox renders 65px tall, so anything shorter would clip the
            tipper. Road sits where the wheels actually meet it rather than
            cutting through them. */}
        {/* 104px, not 76px: the tipper renders 65px tall and the name's line
            is about 19px, so at 76px the two shared the same band and the
            truck drove straight through the lettering. This gives the name a
            clear line of its own with roughly 15px between them. */}
        <div className="relative mt-6 h-[104px] w-full overflow-hidden" aria-hidden>
          {/* The supplier's own name, sitting behind the tipper so the truck
              drives across it. Faint on purpose — it is theirs to recognise,
              not a headline, and at full strength it would compete with the
              wordmark directly above. Arrives with the profile, like the logo
              in the ring, so it is simply absent on the launch screen. */}
          {/* Rendered unconditionally, even before the name exists. Its reveal
              has to stay in step with the truck, and a CSS animation's clock
              starts when the element mounts — so mounting this later, once the
              profile arrives, put the two permanently out of phase: the truck
              would loop back to the left while the name carried on appearing.
              Empty until the name loads costs nothing and keeps them locked. */}
          {/* No truncate: this is the supplier's own business name and it has
              to appear in full, never as "…MATERIA…". Tracking is 0.04em
              rather than 0.1em because at 15px the wider spacing put "Shree
              Balaji Building Materials" at 323px in a 319px row — four pixels
              over, and clipped. This leaves 24px spare. */}
          <span className="splash-name absolute inset-x-0 top-0 px-2 text-center text-[15px] font-extrabold uppercase leading-tight tracking-[0.04em] text-white/55">
            {supplier?.business_name ?? ''}
          </span>
          <div className="absolute inset-x-0 bottom-[6px] h-px bg-white/12" />
          <div className="splash-road absolute inset-x-0 bottom-[3px] h-[3px]" />
          <svg className="splash-truck absolute bottom-[5px] w-[152px]" viewBox="0 0 130 56" fill="none">
            {/* Everything carries a dark edge and a lighter top face — that is
                what gives the signboard vehicles their cut-from-metal look,
                and it is also what keeps the shape legible against the
                photograph's busy sky when the two are close together. */}
            {/* tipper bed, raised at the rear */}
            <path d="M4 34 L14 8 L64 8 L64 34 Z" fill="#2E8F52" stroke="#0C2B22" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M14 8 L64 8 L64 15 L11 15 Z" fill="#57C983" />
            {/* chassis */}
            <rect x="6" y="34" width="76" height="9" rx="2.5" fill="#17542F" stroke="#0C2B22" strokeWidth="2.2" />
            {/* cab */}
            <path d="M82 43 L82 16 L99 16 L110 30 L110 43 Z" fill="#43C275" stroke="#0C2B22" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M94 20 L100 20 L106 29 L94 29 Z" fill="#0A2427" opacity=".55" />
            <rect x="105" y="34" width="5" height="5" rx="1.4" fill="#FFD27A" />
            {/* wheels */}
            <circle cx="26" cy="45" r="10" fill="#0E2528" stroke="#061B1C" strokeWidth="2" />
            <circle cx="48" cy="45" r="10" fill="#0E2528" stroke="#061B1C" strokeWidth="2" />
            <circle cx="95" cy="45" r="10" fill="#0E2528" stroke="#061B1C" strokeWidth="2" />
            <circle cx="26" cy="45" r="4" fill="#5FE08C" />
            <circle cx="48" cy="45" r="4" fill="#5FE08C" />
            <circle cx="95" cy="45" r="4" fill="#5FE08C" />
          </svg>
        </div>

        <p className="mt-3 text-xs text-sidebar-text">
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
