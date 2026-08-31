import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translate, type Lang, type TranslationKey } from '@/lib/i18n'
import { localizeMaterialText } from '@/lib/materialName'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  // Material names, categories and units come from the database, not the
  // dictionary — `mt` translates the trade words inside them. Display only:
  // never write the result back to anything that gets saved.
  mt: (text: string | null | undefined) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

const STORAGE_KEY = 'buildsupply-lang'

function getInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'hi' || stored === 'mr') return stored
  // A phone set to Hindi or Marathi almost certainly belongs to someone who
  // would rather read the app in it, so start there instead of English.
  const browser = navigator.language.toLowerCase()
  if (browser.startsWith('mr')) return 'mr'
  if (browser.startsWith('hi')) return 'hi'
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )

  const mt = useCallback((text: string | null | undefined) => localizeMaterialText(text, lang), [lang])

  const value = useMemo(() => ({ lang, setLang, t, mt }), [lang, setLang, t, mt])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
