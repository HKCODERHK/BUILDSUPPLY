import { cn } from '@/lib/utils'

/**
 * BuildSupply's mark and name — the one drawing of the logo, used by the
 * website's top bar and footer and by the customer pages' footer badge.
 */
export function BrandMark({ className, size = 24, textClassName = 'text-lg' }: { className?: string; size?: number; textClassName?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#35A85D" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18" />
        <path d="M5 21V8l5-4v17" />
        <path d="M10 21V11l6 3v7" />
        <path d="M16 21v-4l3 1.5V21" />
      </svg>
      <span className={cn('font-bold', textClassName)}>BuildSupply</span>
    </span>
  )
}
