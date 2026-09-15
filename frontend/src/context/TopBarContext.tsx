import { createContext, useContext, useEffect, type ReactNode } from 'react'

/**
 * What the phone's top bar shows for the screen you are on — Telegram-style,
 * where the bar names the screen rather than the app. PageHeader publishes its
 * title here, so every screen with a heading names itself; Settings (which has
 * none) calls useTopBar itself. AppShell shows it, and falls back to the
 * section's name while a page is still loading.
 */
export interface TopBarInfo {
  title: string
  /** An initials circle before the title — the customer's own page. */
  avatar?: { id: string; name: string }
  /** A small line under the title, e.g. what the customer owes. */
  detail?: string
  detailTone?: 'due' | 'good'
  /**
   * Telegram's chat bar: the page runs up under the bar, which floats as
   * three pills — ←, the name, and `actions` (the customer's Call and ⋮).
   */
  floating?: boolean
  actions?: ReactNode
}

export const TopBarContext = createContext<((info: TopBarInfo | null) => void) | null>(null)

/** Name the current screen in the top bar; cleared again when it goes. */
export function useTopBar(info: TopBarInfo | null) {
  const set = useContext(TopBarContext)
  const title = info?.title
  const avatarId = info?.avatar?.id
  const avatarName = info?.avatar?.name
  const detail = info?.detail
  const tone = info?.detailTone
  const floating = info?.floating
  // A new element every render of the screen that sent it, so this effect
  // runs each time that screen renders — which only re-renders AppShell's
  // header, never the screen itself (its element is the same `children`).
  const actions = info?.actions

  useEffect(() => {
    if (!set) return
    set(
      title === undefined
        ? null
        : {
            title,
            avatar: avatarId ? { id: avatarId, name: avatarName ?? '' } : undefined,
            detail,
            detailTone: tone,
            floating,
            actions,
          },
    )
  }, [set, title, avatarId, avatarName, detail, tone, floating, actions])

  useEffect(() => {
    if (!set) return
    return () => set(null)
  }, [set])
}
