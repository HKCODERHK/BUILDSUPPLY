import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { translate } from '@/lib/i18n'
import { useUnreadNotifications } from '@/lib/useUnreadNotifications'
import { cn } from '@/lib/utils'

/**
 * The bell in the top bar, with how many are unread. Opens Notifications.
 * Hidden on a database without 051. `english` for the admin, whose screens
 * stay in English.
 */
export function NotificationBell({ className, english = false }: { className?: string; english?: boolean }) {
  const { lang } = useLanguage()
  const count = useUnreadNotifications()
  if (count === null) return null
  const l = english ? 'en' : lang
  const label = count > 0
    ? `${translate(l, 'notif.title')}, ${translate(l, 'notif.unread', { count })}`
    : translate(l, 'notif.title')
  return (
    <Link
      to="/notifications"
      aria-label={label}
      title={label}
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-surface',
        className,
      )}
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
