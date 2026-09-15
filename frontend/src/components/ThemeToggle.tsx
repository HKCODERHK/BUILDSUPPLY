import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()
  return (
    <button
      // From the button's centre — where Telegram's day/night circle starts.
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      }}
      aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface hover:text-ink',
        className,
      )}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
