import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'buildsupply-theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * A choice the supplier made by tapping the toggle, or null while they haven't.
 *
 * Storage throws outright in some privacy modes, so a failed read must mean
 * "no choice yet" rather than taking the whole app down on boot.
 */
function storedChoice(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Theme | null>(storedChoice)
  const [system, setSystem] = useState<Theme>(systemTheme)

  // Until the supplier picks one, the phone decides. This matters beyond
  // looks: Android paints the bar behind the gesture pill from the *system*
  // theme and no web app can change it, so a light app on a dark phone shows
  // a dark band under its own tab bar. Following the phone makes the two
  // agree, which is why every native app looks seamless there.
  const theme = choice ?? system

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Tapping the toggle is a deliberate choice, so it is remembered and the
  // phone stops overriding it. Nothing is written before that point — the
  // previous version stored a theme on first render, which pinned whatever
  // the phone happened to be showing then and never followed it again.
  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setChoice(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference lost on reload; the app still switches for this session.
    }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
