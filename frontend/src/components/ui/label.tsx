import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/LanguageContext'

export function Label({
  className,
  required,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  /**
   * Marks the field as one the form will not submit without. Shown as a word
   * rather than a bare asterisk, which means nothing to someone who has not
   * been taught the convention.
   */
  required?: boolean
  children?: ReactNode
}) {
  const { t } = useLanguage()

  return (
    <label className={cn('mb-1.5 block text-xs font-medium text-muted', className)} {...props}>
      {children}
      {required && <span className="ml-1 font-normal text-muted-2">({t('common.required')})</span>}
    </label>
  )
}
