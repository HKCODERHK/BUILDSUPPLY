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
}: {
  name: string
  category?: string | null
  photo?: string | null
}) {
  if (photo && photo.includes('/storage/v1/object/public/logos/')) {
    return <img src={photo} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-xl bg-surface object-cover" />
  }
  return (
    <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TINTS[tintFor(category ?? name)])}>
      <Package size={19} strokeWidth={1.9} />
    </span>
  )
}
