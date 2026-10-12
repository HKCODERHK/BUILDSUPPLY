import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Bag, Tipper } from '@/components/art'
import { INK } from '@/lib/artPalette'
import { cn } from '@/lib/utils'

/**
 * The phone-style sign-in look (2026-10-12, from the user's recording of a
 * delivery app's login): a rounded banner with the brand and a drawing on
 * top, then a short welcome and the form. Shared by the shop owner's sign-in
 * (/login) and the customer's first-time screen on a shop's QR or order link,
 * so the two read as one app. The drawing is the app's own tipper, loaded —
 * no stock or generated art.
 */
export function AuthShell({
  brand,
  tagline,
  title,
  subtitle,
  children,
  footer,
  brandFooter,
}: {
  /** The name and mark at the top of the banner. */
  brand: ReactNode
  tagline?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** The BuildSupply badge at the very bottom — customer screens only; the
   *  shop owner's /login, which shares this frame, passes nothing. */
  brandFooter?: ReactNode
}) {
  const onShell = 'border-white/20 text-white hover:bg-white/10 hover:text-white'
  return (
    <div className="min-h-app bg-surface">
      <div className="mx-auto flex min-h-app max-w-md flex-col">
        <header
          className="relative overflow-hidden rounded-b-[2rem] px-5 pb-6 pt-[calc(1rem_+_var(--safe-top))] text-white"
          style={{ background: 'linear-gradient(160deg, #1D5A50 0%, #11373B 55%, #0A2427 100%)' }}
        >
          <div className="relative z-10 flex items-center justify-between gap-2">
            <div className="min-w-0">{brand}</div>
            <div className="flex shrink-0 items-center gap-2">
              <LanguageToggle compact className={onShell} />
              <ThemeToggle className={onShell} />
            </div>
          </div>
          <div className="relative z-10 mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1 pb-2 text-sm text-white/75">{tagline}</div>
            <svg viewBox="0 0 130 70" className="h-auto w-[46%] max-w-[190px] shrink-0" fill="none" aria-hidden>
              <g transform="translate(0 14)">
                <Tipper />
              </g>
              <Bag x={14} y={8} w={24} h={14} fill={INK.body} />
              <Bag x={38} y={8} w={24} h={14} fill={INK.body} />
              <Bag x={26} y={-3} w={24} h={13} fill={INK.cab} />
            </svg>
          </div>
          {/* A soft glow behind the truck, like a lamp over the yard. */}
          <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-[#5FE08C]/15 blur-2xl" />
        </header>

        <main className="flex flex-1 flex-col px-5 pb-[calc(1.5rem_+_var(--safe-bottom))] pt-6">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
          {footer && <div className="mt-auto pt-6">{footer}</div>}
          {brandFooter}
        </main>
      </div>
    </div>
  )
}

/** An input with its icon inside on the left, and a warning under it. */
export function IconField({
  icon: Icon,
  error,
  children,
}: {
  icon: LucideIcon
  /** Shown under the field, and turns its border red. */
  error?: string | null
  children: ReactNode
}) {
  return (
    <div>
      <div className={cn('relative', error && '[&_input]:border-red-400 [&_input]:focus:border-red-400 [&_input]:focus:ring-red-400/20')}>
        <Icon size={17} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted" />
        {children}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

/** The class an input inside IconField takes: tall, rounded, room for the icon. */
export const iconInputClass = 'h-12 rounded-xl pl-10 text-base sm:text-sm'

/** The big gradient button, with a spinner while it works. */
export function GradientButton({
  busy,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#147a3a] to-[#35a85d] text-base font-semibold text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-70',
        className,
      )}
    >
      {busy ? <LoaderCircle size={20} className="animate-spin" /> : children}
    </button>
  )
}
