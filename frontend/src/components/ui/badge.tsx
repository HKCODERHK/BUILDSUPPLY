import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-accent-bg text-accent-text',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  neutral: 'bg-surface text-muted',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
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
