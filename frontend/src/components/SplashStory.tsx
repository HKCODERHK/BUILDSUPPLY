import { Fragment, type ReactNode } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { Bag, BillSheet, Brick, Crane, RupeeCoin, Storey, TickBadge, Tipper } from '@/components/art'
import { INK } from '@/lib/artPalette'

/**
 * What BuildSupply is for, told in the six seconds the splash is on screen
 * anyway: a building going up, the materials for it, the delivery, the bill
 * and the payment. It replaced a generated photograph of a tractor and a
 * truck, which said nothing about the app and was not in its drawing style.
 *
 * Every moving part is its own HTML box animating transform and opacity
 * only. This plays while React is booting and the first queries run — exactly
 * when the main thread is busy — and anything laid out or painted per frame
 * (`left`, colours, or the children of an SVG) stalls and then jumps. The
 * splash truck did precisely that until it moved to transform. Transforms on
 * HTML boxes are composited and keep time regardless.
 *
 * Laid out on a 300×200 grid; `at()` turns grid units into percentages so the
 * scene scales with the band. Distances travelled use cqw against the band,
 * which declares container-type in index.css, as the splash truck's row does.
 * The timings live beside each part below and the keyframes in index.css.
 *
 * It finishes at about 5.1s and holds. The splash may leave the moment six
 * seconds are up, and the payoff — the bill ticked, the money back with the
 * supplier — has to be on screen before it does; timed to land at 6.0s, it
 * was gone as it arrived.
 */

const W = 300
const H = 200
/** Where the wheels meet the road. */
const GROUND = 150

function at(x: number, y: number, w: number) {
  return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%` }
}

/** One animated part: an HTML box holding its own small drawing. */
function Part({
  x,
  y,
  w,
  viewBox,
  motion,
  delay,
  children,
}: {
  x: number
  y: number
  w: number
  viewBox: string
  motion: string
  delay: number
  children: ReactNode
}) {
  return (
    <div className={`${motion} absolute`} style={{ ...at(x, y, w), animationDelay: `${delay}s` }}>
      <svg viewBox={viewBox} className="block h-auto w-full" fill="none">
        {children}
      </svg>
    </div>
  )
}

// The caption under the scene, each word lighting as its part begins.
const STEPS: { key: TranslationKey; at: number }[] = [
  { key: 'story.site', at: 0 },
  { key: 'story.materials', at: 0.9 },
  { key: 'story.delivery', at: 1.7 },
  { key: 'story.bill', at: 3.3 },
  { key: 'story.payment', at: 4 },
]

const TRUCK_W = 84
const TRUCK_H = (TRUCK_W * 56) / 130

export function SplashStory() {
  const { t } = useLanguage()
  return (
    <div
      className="splash-story relative mt-7 w-full overflow-hidden rounded-2xl shadow-lg"
      style={{ aspectRatio: '3 / 2', background: 'linear-gradient(180deg, #17474D 0%, #11373B 55%, #0D2C30 100%)' }}
      aria-hidden
    >
      {/* Still: a faint town for depth, the road, and the ground the caption sits on. */}
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} fill="none">
        <g fill="#1D5257" opacity=".55">
          <rect x="96" y="96" width="18" height="54" rx="2" />
          <rect x="118" y="82" width="14" height="68" rx="2" />
          <rect x="136" y="104" width="20" height="46" rx="2" />
          <rect x="170" y="90" width="16" height="60" rx="2" />
          <circle cx="80" cy="138" r="14" />
          <circle cx="200" cy="140" r="12" />
        </g>
        <rect x="0" y={GROUND} width={W} height="9" fill="#0B2326" />
        <path d={`M0 ${GROUND + 4.5}h${W}`} stroke="#3C6E67" strokeWidth="1.6" strokeDasharray="10 10" opacity=".55" />
        <rect x="0" y={GROUND + 9} width={W} height={H - GROUND - 9} fill="#08201F" />
      </svg>

      {/* 1 · Site, 0–0.9s: the crane, then the building a storey at a time. */}
      <Part x={238} y={40} w={60} viewBox="0 0 60 112" motion="story-pop" delay={0}>
        <Crane />
      </Part>
      <Part x={216} y={124} w={70} viewBox="0 0 70 26" motion="story-rise" delay={0.25}>
        <Storey />
      </Part>
      <Part x={216} y={98} w={70} viewBox="0 0 70 26" motion="story-rise" delay={0.45}>
        <Storey />
      </Part>
      <Part x={216} y={72} w={70} viewBox="0 0 70 26" motion="story-rise" delay={0.65}>
        <Storey />
      </Part>

      {/* 2 · Materials, 0.9–1.7s: the supplier's stock — bricks under cement bags. */}
      <Part x={4} y={110} w={52} viewBox="0 0 52 40" motion="story-pop" delay={0.9}>
        <Brick x={2} y={32} />
        <Brick x={16} y={32} />
        <Brick x={30} y={32} />
        <Bag x={1} y={17} w={25} h={15} fill={INK.body} />
        <Bag x={26} y={17} w={25} h={15} fill={INK.body} />
        <Bag x={13.5} y={2} w={25} h={15} fill={INK.cab} />
      </Part>

      {/* 3 · Delivery, 1.7–3.2s: the same tipper as everywhere else, from the
          yard to the foot of the building. Its load drops onto the bed first,
          at 1.2s, while it is still parked by the stock. */}
      <div className="story-drive absolute" style={{ ...at(58, GROUND - TRUCK_H, TRUCK_W), animationDelay: '1.7s' }}>
        <svg viewBox="0 0 130 56" className="block h-auto w-full" fill="none">
          <Tipper />
        </svg>
        {/* Sits on the bed: -25% puts its foot on the bed's top edge. */}
        <div className="story-drop absolute" style={{ left: '10%', top: '-25%', width: '40%', animationDelay: '1.2s' }}>
          <svg viewBox="0 0 52 22" className="block h-auto w-full" fill="none">
            <Bag x={1} y={9} w={25} h={12} fill={INK.body} />
            <Bag x={26} y={9} w={25} h={12} fill={INK.body} />
            <Bag x={13.5} y={0} w={25} h={10} fill={INK.cab} />
          </svg>
        </div>
      </div>

      {/* 4 · Bill, 3.3s: raised over the delivery. */}
      <Part x={146} y={34} w={48} viewBox="0 0 48 62" motion="story-pop" delay={3.3}>
        <BillSheet />
      </Part>

      {/* 5 · Payment, 4s: the bill is ticked, and the money goes back to the
          supplier's yard — where the story started. */}
      <Part x={180} y={78} w={28} viewBox="0 0 28 28" motion="story-pop" delay={4}>
        <TickBadge />
      </Part>
      <Part x={157} y={60} w={26} viewBox="0 0 26 26" motion="story-coin" delay={4}>
        <RupeeCoin />
      </Part>

      <div className="absolute inset-x-0 bottom-[4%] flex items-center justify-center gap-1.5 px-2 text-[10px] font-semibold text-white">
        {STEPS.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <span className="text-white/35">→</span>}
            <span className="story-step" style={{ animationDelay: `${s.at}s` }}>
              {t(s.key)}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
