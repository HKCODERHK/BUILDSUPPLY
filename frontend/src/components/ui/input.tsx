import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
