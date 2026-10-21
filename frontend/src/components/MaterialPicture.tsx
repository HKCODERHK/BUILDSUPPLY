import { Package } from 'lucide-react'
import { TINTS, tintFor } from '@/lib/customerHome'
import { cn } from '@/lib/utils'

/**
 * A material's picture on the customer pages: only a photo the shop itself
 * added (2026-10-12, the user's call — drawn pictures looked generated, and
 * catalog photos are not the shop's own). Without one, the small tinted icon
 * these tiles have always had.
 *
 * shop_profile's `photos` may still carry a catalog photo on a database
 * before 043, so only pictures from the shops' own folder (the logos bucket)
 * are shown.
 */
export function MaterialPicture({
  name,
  category,
  photo,
  thumb = false,
}: {
  name: string
  category?: string | null
  photo?: string | null
  /** A small square beside a title (the vehicle card), not the top of a tile. */
  thumb?: boolean
}) {
  const own = !!photo && photo.includes('/storage/v1/object/public/logos/')
  if (thumb) {
    return own ? (
      <img src={photo!} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-xl bg-surface object-cover" />
    ) : (
      <span className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-xl', TINTS[tintFor(category ?? name)])}>
        <Package size={26} strokeWidth={1.7} />
      </span>
    )
  }
  // The top of a tile: the photo edge to edge, or a calm panel with the icon.
  return own ? (
    <img src={photo!} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full bg-surface object-cover" />
  ) : (
    <span className="flex h-24 w-full items-center justify-center bg-surface">
      <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', TINTS[tintFor(category ?? name)])}>
        <Package size={26} strokeWidth={1.7} />
      </span>
    </span>
  )
}
