import { cva } from 'class-variance-authority'

// The button's look, in its own file so a link can wear it without a button
// inside it (#35).
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white hover:bg-accent-soft',
        outline: 'border border-border bg-card text-ink hover:bg-surface',
        ghost: 'text-ink hover:bg-surface',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-base',
        // 44px, a thumb's width: the customer pages' buttons (#30).
        tap: 'h-11 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)
