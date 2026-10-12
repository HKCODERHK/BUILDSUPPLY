import { useEffect } from 'react'

/** The browser tab's title while a page is open, put back when it closes. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const before = document.title
    document.title = title
    return () => {
      document.title = before
    }
  }, [title])
}
