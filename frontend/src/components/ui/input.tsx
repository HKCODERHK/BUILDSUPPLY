import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, onFocus, ...props }, ref) => (
    <input
      ref={ref}
      onFocus={(e) => {
        // Numeric fields often start at 0 — select it on focus so typing a
        // digit replaces it instead of concatenating into "05". Keyed off
        // inputMode rather than type="number": native number inputs don't
        // reliably support select() across browsers (Firefox in particular
        // just ignores it), which is why these fields use type="text"
        // inputMode="numeric|decimal" instead.
        if (props.inputMode === 'numeric' || props.inputMode === 'decimal') e.target.select()
        onFocus?.(e)
      }}
      className={cn(
        'h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-ink placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
