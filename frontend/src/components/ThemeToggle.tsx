import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()
  return (
    <button
      onClick={toggleTheme}
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
