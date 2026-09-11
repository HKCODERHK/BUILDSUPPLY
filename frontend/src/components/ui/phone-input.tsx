import { forwardRef, useRef, type InputHTMLAttributes } from 'react'
import { sanitizePhone } from '@/lib/numberInput'
import { Input } from './input'

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string
  /** Always just the 10-digit number — no +91, no leading 0, no spaces. */
  onValueChange: (digits: string) => void
}

/**
 * Every phone and WhatsApp number field. People type numbers the way their
 * phone shows them — "+91 98765 43210", "098765 43210" — so the extras are
 * dropped as they go in (lib/numberInput sanitizePhone), with no error.
 *
 * A "+91" typed one key at a time is the one case the rule alone can't
 * catch: after "+" is dropped, the "9" and "1" that follow look like the
 * start of a real number. So a "+" typed into an empty box holds back the
 * "9" and "1" after it; anything else puts them back.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(({ value, onValueChange, ...props }, ref) => {
  const held = useRef('')
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      {...props}
      value={value}
      onChange={(e) => {
        const typed = held.current + e.target.value
        const code = typed.trim()
        if (code.startsWith('+') && '+91'.startsWith(code)) {
          held.current = code === '+91' ? '' : code
          if (value !== '') onValueChange('')
          return
        }
        held.current = ''
        onValueChange(sanitizePhone(typed))
      }}
    />
  )
})
PhoneInput.displayName = 'PhoneInput'
