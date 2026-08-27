import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral'

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-accent-bg text-accent-text',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-surface text-muted',
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  )
}
