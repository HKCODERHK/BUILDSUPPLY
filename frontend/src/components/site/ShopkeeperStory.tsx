import type { ReactNode } from 'react'
import { IndianRupee, ShoppingCart } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { Bag, Brick } from '@/components/art'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { INK, edge } from '@/lib/artPalette'

/**
 * The website's moving picture (2026-10-12), asked for from the video beside
 * claude.ai's sign-in: a building-material supplier behind his counter,
 * buried in registers, loose bills and a buzzing phone — then the mess goes
 * into his phone and he smiles while bills, payments and orders sort
 * themselves out. Drawn in the app's own kit (flat, outlined, teal and green;
 * the khata registers are the traditional red bahi-khata) — no photographs or
 * generated people.
 *
 * One 12s loop in index.css (`hs-*`): before 0–45%, the switch 45–55%, after
 * 55–95%. Everything animates opacity and transform only. Under reduced
 * motion it is one still picture: the happy shop.
 *
 * A 300×200 grid like the splash story; the words are HTML on top, so they
 * are translated and never SVG text.
 */

const SKIN = '#C98B5B'
const HAIR = '#1F1B18'

/** An arm: a sleeve drawn as an outlined thick stroke, like every other shape. */
function Arm({ d }: { d: string }) {
  return (
    <>
      <path d={d} stroke={INK.line} strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d={d} stroke={INK.paper} strokeWidth="6.6" strokeLinecap="round" fill="none" />
    </>
  )
}

function Hand({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="5.5" fill={SKIN} {...edge} strokeWidth="2" />
}

function Sparkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    // Placed by the group, twinkled by the path: a CSS animation on the path
    // would replace a transform attribute on that same element.
    <g transform={`translate(${x} ${y})`}>
      <path
        className="hs-twinkle"
        style={{ animationDelay: `${delay}s` }}
        d="M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4 Z"
        fill={INK.lamp}
      />
    </g>
  )
}

function Chip({ icon, text, delay, top }: { icon: ReactNode; text: string; delay: number; top: string }) {
  return (
    <div
      className="hs-chip absolute left-[3%] flex max-w-[34%] items-center gap-[1.6cqw] rounded-full border-2 border-[#0C2B22] bg-[#2E8F52] py-[1cqw] pl-[1.2cqw] pr-[2.2cqw] text-white shadow-lg"
      style={{ top, animationDelay: `${delay}s` }}
    >
      <span className="flex h-[5cqw] w-[5cqw] shrink-0 items-center justify-center rounded-full bg-white text-[#2E8F52]">{icon}</span>
      <span className="text-[2.7cqw] font-semibold leading-tight">{text}</span>
    </div>
  )
}

export function ShopkeeperStory() {
  const { t } = useLanguage()
  return (
    <div
      className="hs relative w-full overflow-hidden rounded-2xl shadow-lg"
      style={{ aspectRatio: '3 / 2', background: 'linear-gradient(180deg, #17474D 0%, #11373B 55%, #0D2C30 100%)' }}
      aria-hidden
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 200" fill="none">
        {/* ── The shop behind him: a wall clock and the stock shelf ─────── */}
        <circle cx="256" cy="22" r="12" fill={INK.paper} {...edge} />
        <g className="hs-act1">
          <g className="hs-spin" style={{ transformOrigin: '256px 22px' }}>
            <path d="M256 22 L256 13" stroke={INK.line} strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="hs-spin-slow" style={{ transformOrigin: '256px 22px' }}>
            <path d="M256 22 L262 22" stroke={INK.line} strokeWidth="2.4" strokeLinecap="round" />
          </g>
        </g>
        <g className="hs-act2">
          <path d="M256 22 L256 13 M256 22 L262 25" stroke={INK.line} strokeWidth="2.2" strokeLinecap="round" />
        </g>

        <rect x="224" y="58" width="64" height="4" rx="1" fill={INK.dark} {...edge} strokeWidth="1.6" />
        <rect x="224" y="96" width="64" height="4" rx="1" fill={INK.dark} {...edge} strokeWidth="1.6" />
        <Bag x={227} y={41} w={28} h={16} fill={INK.body} />
        <Bag x={257} y={41} w={28} h={16} fill={INK.body} />
        <Brick x={228} y={88} />
        <Brick x={242} y={88} />
        <Brick x={256} y={88} />
        <Brick x={270} y={88} />

        {/* ── The supplier ───────────────────────────────────────────── */}
        <path d="M93 140 Q93 108 125 106 Q157 108 157 140 Z" fill={INK.paper} {...edge} />
        <path d="M118 107 L125 118 L132 107" stroke={INK.line} strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="119" y="95" width="12" height="13" fill={SKIN} />
        <circle cx="125" cy="82" r="17" fill={SKIN} {...edge} />
        <path d="M108 80 Q108 62 125 62 Q142 62 142 80 Q135 70 125 70 Q115 70 108 80 Z" fill={HAIR} />
        <path d="M118 90 Q125 86 132 90 Q125 93 118 90 Z" fill={HAIR} />
        <circle cx="119" cy="80" r="1.8" fill={INK.line} />
        <circle cx="131" cy="80" r="1.8" fill={INK.line} />

        {/* Before: brows up in the middle, a frown, a drop of sweat. */}
        <g className="hs-act1">
          <path d="M114 75 L122 72 M128 72 L136 75" stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
          <path d="M120 97 Q125 93 130 97" stroke={INK.line} strokeWidth="2" strokeLinecap="round" />
          <path className="hs-sweat" d="M146 64 Q150 70 146 73 Q142 70 146 64 Z" fill="#A7DCEB" stroke={INK.line} strokeWidth="1.2" />
        </g>
        {/* After: easy brows and a smile. */}
        <g className="hs-act2">
          <path d="M114 74 Q118 71 122 73 M128 73 Q132 71 136 74" stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
          <path d="M119 94 Q125 100 131 94" stroke={INK.line} strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* ── The counter ────────────────────────────────────────────── */}
        <rect x="22" y="138" width="256" height="70" fill={INK.dark} {...edge} />
        <rect x="16" y="130" width="268" height="10" rx="2" fill={INK.lit} {...edge} />

        {/* Before: a hand on his forehead, the other on the counter. */}
        <g className="hs-act1">
          <Arm d="M99 116 L114 76" />
          <Hand x={115} y={73} />
          <Arm d="M151 118 L167 131" />
          <Hand x={169} y={132} />
        </g>

        {/* Before: the mess — it flies into his phone at the switch. */}
        <g className="hs-mess">
          {/* the khata registers */}
          <rect x="30" y="102" width="50" height="10" rx="2" fill={INK.brick} {...edge} strokeWidth="2" />
          <rect x="36" y="112" width="48" height="10" rx="2" fill={INK.dark} {...edge} strokeWidth="2" />
          <rect x="32" y="122" width="52" height="9" rx="2" fill={INK.brick} {...edge} strokeWidth="2" />
          <rect x="36" y="125" width="44" height="2" fill={INK.paper} opacity=".7" />
          <rect x="34" y="105" width="42" height="2" fill={INK.paper} opacity=".7" />
          {/* loose bills */}
          <rect x="140" y="122" width="18" height="11" rx="1" fill={INK.paper} {...edge} strokeWidth="1.4" transform="rotate(-12 149 127)" />
          <rect x="88" y="121" width="16" height="10" rx="1" fill={INK.paper} {...edge} strokeWidth="1.4" transform="rotate(9 96 126)" />
          {/* more bills, falling in all the time */}
          {[
            { x: 52, d: 0 },
            { x: 98, d: 0.7 },
            { x: 176, d: 1.3 },
            { x: 150, d: 1.9 },
          ].map((b) => (
            <rect
              key={b.x}
              className="hs-fall"
              style={{ animationDelay: `${b.d}s` }}
              x={b.x}
              y="116"
              width="15"
              height="10"
              rx="1"
              fill={INK.paper}
              {...edge}
              strokeWidth="1.4"
            />
          ))}
          {/* the phone, buzzing, with a "!" */}
          <g className="hs-buzz">
            <rect x="188" y="118" width="22" height="12" rx="3" fill={INK.dark} {...edge} strokeWidth="2" />
            <rect x="191" y="120.5" width="16" height="7" rx="1.5" fill={INK.lamp} />
          </g>
          <path d="M214 116 q4 4 0 8 M218 113 q7 7 0 14" stroke={INK.lamp} strokeWidth="2" strokeLinecap="round" />
          <g className="hs-pulse" style={{ transformOrigin: '219px 103px' }}>
            <circle cx="219" cy="103" r="7" fill={INK.lamp} {...edge} strokeWidth="2" />
            <rect x="218" y="98.5" width="2" height="5.5" rx="1" fill={INK.line} />
            <circle cx="219" cy="106.5" r="1.1" fill={INK.line} />
          </g>
          {/* "who owes what?" */}
          <g className="hs-pulse" style={{ transformOrigin: '168px 44px' }}>
            <circle cx="150" cy="62" r="2.5" fill={INK.paper} {...edge} strokeWidth="1.4" />
            <circle cx="156" cy="56" r="3.5" fill={INK.paper} {...edge} strokeWidth="1.4" />
            <circle cx="168" cy="44" r="14" fill={INK.paper} {...edge} />
            <path d="M163 40 Q163 34 168 34 Q173 34 173 39 Q173 43 168 45 L168 48" stroke={INK.line} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <circle cx="168" cy="52.5" r="1.5" fill={INK.line} />
          </g>
        </g>

        {/* After: one hand easy on the counter, the other holding the phone
            with everything done on it. */}
        <g className="hs-act2">
          <Arm d="M99 118 L84 131" />
          <Hand x={82} y={132} />
          <Arm d="M151 118 L170 106" />
          <rect x="163" y="76" width="20" height="32" rx="4" fill={INK.dark} {...edge} />
          <rect x="166" y="80" width="14" height="24" rx="2" fill={INK.glow} />
          <path d="M169 92 l3 3 l6 -7" stroke={INK.line} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <Hand x={172} y={105} />
          <Sparkle x={100} y={58} delay={0} />
          <Sparkle x={150} y={60} delay={0.4} />
          <Sparkle x={194} y={74} delay={0.8} />
        </g>
      </svg>

      {/* What happens on his phone, one card at a time. */}
      <div className="hs-act2 absolute inset-0">
        <Chip top="9%" delay={6.9} icon={<WhatsAppIcon size={11} />} text={t('site.anim.chipBill')} />
        <Chip top="24%" delay={7.7} icon={<IndianRupee size={11} strokeWidth={2.6} />} text={t('site.anim.chipPaid')} />
        <Chip top="39%" delay={8.5} icon={<ShoppingCart size={11} strokeWidth={2.4} />} text={t('site.anim.chipOrder')} />
      </div>

      {/* The caption, on the counter's front. */}
      <div className="absolute inset-x-0 bottom-[5%] grid place-items-center px-[3cqw] text-center text-white">
        <p className="hs-act1 col-start-1 row-start-1">
          <span className="mr-[1.5cqw] rounded-full bg-white/15 px-[1.8cqw] py-[0.4cqw] text-[2.6cqw] font-semibold uppercase tracking-wide">
            {t('site.anim.beforeTag')}
          </span>
          <span className="text-[3.1cqw] font-medium">{t('site.anim.before')}</span>
        </p>
        <p className="hs-act2 col-start-1 row-start-1">
          <span className="mr-[1.5cqw] rounded-full bg-[#5FE08C] px-[1.8cqw] py-[0.4cqw] text-[2.6cqw] font-semibold uppercase tracking-wide text-[#0C2B22]">
            {t('site.anim.afterTag')}
          </span>
          <span className="text-[3.1cqw] font-medium">{t('site.anim.after')}</span>
        </p>
      </div>
    </div>
  )
}
