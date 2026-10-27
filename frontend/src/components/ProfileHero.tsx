import { useState, type ReactNode, type Ref } from 'react'
import { LoaderCircle, Pencil } from 'lucide-react'
import { patternCssUrl } from '@/lib/qrPattern'
import { cn } from '@/lib/utils'

/**
 * The top of the Profile tab, and of its Business profile and Owner profile
 * pages, after Snapchat's profile (the user's reference, 2026-10-27): a
 * picture across the full width — the shop's cover photo, or the app's own
 * doodles on its dark green — with the round photo and a pencil at its
 * bottom-left and the name beside it, white on a dark fade so it reads over
 * any picture, in day and night alike. Room at the top corners for a button
 * each (Order QR, change cover).
 */
export function ProfileHero({
  cover,
  photo,
  fallback,
  title,
  subtitle,
  onPhoto,
  photoLabel,
  busy = false,
  topLeft,
  topRight,
  titleRef,
  onPhotoError,
}: {
  /** The shop's cover photo; null shows the doodles. */
  cover?: string | null
  /** The round photo; null (or a photo that fails to load) shows `fallback`. */
  photo?: string | null
  fallback: ReactNode
  title: string
  subtitle?: string | null
  /** Tapping the round photo (and its pencil). */
  onPhoto?: () => void
  photoLabel?: string
  /** A new photo is uploading. */
  busy?: boolean
  topLeft?: ReactNode
  topRight?: ReactNode
  /** The name, for a page whose top bar takes the name over once it scrolls away. */
  titleRef?: Ref<HTMLHeadingElement>
  /** The round photo would not load — so the page can stop using it elsewhere. */
  onPhotoError?: () => void
}) {
  // Which address failed, not just that one did: a new photo gets its own try.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const showPhoto = !!photo && failedPhoto !== photo
  const circle = (
    <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white">
      {showPhoto ? (
        <img
          src={photo}
          alt=""
          onError={() => {
            setFailedPhoto(photo)
            onPhotoError?.()
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  )

  return (
    // Edge to edge on a phone, as the doodled band it replaces was.
    <div className="relative -mx-4 -mt-2 overflow-hidden sm:-mx-6 lg:mx-0 lg:mt-0 lg:rounded-3xl">
      <div className="relative h-56">
        {cover && failedCover !== cover ? (
          <img src={cover} alt="" onError={() => setFailedCover(cover)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: '#0A2427', backgroundImage: patternCssUrl('rgba(255, 255, 255, 0.08)') }} />
        )}
        {/* The fade the name sits on. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />

        {topLeft && <div className="absolute left-3 top-3">{topLeft}</div>}
        {topRight && <div className="absolute right-3 top-3">{topRight}</div>}

        <div className="absolute inset-x-4 bottom-4 flex items-end gap-3.5">
          <div className="relative h-20 w-20 shrink-0 rounded-full ring-[3px] ring-white/90">
            {onPhoto ? (
              <button type="button" onClick={onPhoto} disabled={busy} aria-label={photoLabel} className="block h-full w-full rounded-full">
                {circle}
              </button>
            ) : (
              circle
            )}
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white">
                <LoaderCircle size={22} className="animate-spin" />
              </span>
            )}
            {onPhoto && !busy && (
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-900 shadow-md ring-2 ring-black/5"
              >
                <Pencil size={15} strokeWidth={2} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1 text-white">
            <h2 ref={titleRef} className="line-clamp-2 break-words text-xl font-bold leading-tight drop-shadow-sm">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-white/85">{subtitle}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A round button for a hero's top corners: white glyph on a dark glass circle. */
export function HeroIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
    >
      {children}
    </button>
  )
}

/** A pill for a hero's top corners, like Snapchat's Share: white, with an icon and a word. */
export function HeroPill({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Always white, so the text is fixed dark rather than the theme's ink.
        'inline-flex h-10 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-white',
        className,
      )}
    >
      {children}
    </button>
  )
}
