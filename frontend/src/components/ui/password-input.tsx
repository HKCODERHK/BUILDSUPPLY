import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  // Passed in rather than translated here, so this stays free of the
  // language context the way Input is — admin screens stay English.
  showLabel: string
  hideLabel: string
}

/**
 * A password field with an eye to show what was typed. Suppliers sign in on
 * a phone with a password generated for them and read out by the admin
 * (lib/generatePassword), and one wrong character behind dots is invisible.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showLabel, hideLabel, ...props }, ref) => {
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          // Room for the eye, and Edge's own reveal button hidden so there
          // is one eye rather than two.
          className={cn('pr-10 [&::-ms-reveal]:hidden', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Keeps focus in the field, so tapping the eye on a phone does not
          // close the keyboard or lose the cursor.
          onMouseDown={(e) => e.preventDefault()}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
