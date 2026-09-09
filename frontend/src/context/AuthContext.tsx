import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/lib/database.types'
import { logActivity } from '@/services/activityLog'

/**
 * Shortest time the splash stays up once it has appeared.
 *
 * Six seconds at the user's request, so the artwork is actually seen. Worth
 * knowing what it costs: on a fast connection the work behind it finishes in
 * well under a second, so most of this is waiting the supplier would not
 * otherwise have — on every cold start and every sign-in. If it starts to
 * grate, this constant is the only thing to change.
 *
 * It is a floor, not a fixed duration: on a slow connection the splash stays
 * until the work is done, however much longer that takes.
 */
const MIN_SPLASH_MS = 6000

/** Which line the splash shows, or null when it should not be on screen. */
export type SplashPhase = 'launch' | 'signin' | null

interface AuthContextValue {
  session: Session | null
  supplier: Supplier | null
  loading: boolean
  /**
   * Set on a cold start and on a real sign-in, and at no other time.
   *
   * Deliberately *not* derived from `loading`: onAuthStateChange fires
   * SIGNED_IN on every token refresh, so `loading` goes true roughly hourly
   * and a splash tied to it would drop over a supplier part-way through
   * writing a bill. `hadSessionRef` already separates a genuine sign-in from
   * a refresh — it exists because counting refreshes as logins once buried
   * the activity log — and that is the same distinction this needs.
   */
  splash: SplashPhase
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Re-reads the signed-in account's own row after editing it elsewhere. */
  refreshSupplier: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  // Separate from profileLoading: covers only the initial getSession() call at mount.
  const [initializing, setInitializing] = useState(true)
  // True whenever a supplier-profile fetch is in flight — including right after a
  // fresh sign-in, when `session` is already set but `supplier` isn't yet. Without
  // this, ProtectedRoute and Login disagree about auth state during that window
  // (one requires session+supplier, the other only session) and redirect-loop.
  const [profileLoading, setProfileLoading] = useState(false)
  const [splash, setSplash] = useState<SplashPhase>('launch')
  // When the current splash is allowed to leave, so a fast load still shows a
  // deliberate screen rather than a flicker.
  const splashUntilRef = useRef(Date.now() + MIN_SPLASH_MS)

  function beginSplash(phase: Exclude<SplashPhase, null>) {
    splashUntilRef.current = Date.now() + MIN_SPLASH_MS
    setSplash(phase)
  }
  function endSplash() {
    const remaining = Math.max(0, splashUntilRef.current - Date.now())
    window.setTimeout(() => setSplash(null), remaining)
  }
  // Tracks whether a session already existed, so token refreshes and page
  // reloads aren't mistaken for new sign-ins (see onAuthStateChange below).
  const hadSessionRef = useRef(false)

  async function loadSupplierProfile(userId: string): Promise<Supplier | null> {
    setProfileLoading(true)
    const { data, error } = await supabase.from('suppliers').select('*').eq('id', userId).single()
    setProfileLoading(false)
    if (error) {
      console.error('Failed to load supplier profile:', error.message)
      setSupplier(null)
      return null
    }
    setSupplier(data as Supplier)
    return data as Supplier
  }

  async function refreshSupplier() {
    if (!session) return
    await loadSupplierProfile(session.user.id)
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      // Seed the "did we already have a session" flag before the auth
      // listener can fire, so restoring a saved session isn't counted as a
      // fresh login.
      hadSessionRef.current = !!data.session
      setSession(data.session)
      if (data.session) await loadSupplierProfile(data.session.user.id)
      setInitializing(false)
      endSplash()
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Supabase fires SIGNED_IN on every token refresh and on restoring a
      // session at page load, not just on a real sign-in — logging all of
      // those buried the activity log (3,212 of 3,451 rows were phantom
      // logins). Only record the null -> session transition.
      const isNewSignIn = event === 'SIGNED_IN' && !hadSessionRef.current
      hadSessionRef.current = !!newSession

      // Only a real sign-in raises the splash. A token refresh lands here too
      // and must pass through without covering whatever is on screen.
      if (isNewSignIn) beginSplash('signin')

      setSession(newSession)
      if (newSession) {
        const profile = await loadSupplierProfile(newSession.user.id)
        if (isNewSignIn && profile) {
          void logActivity(profile.role, 'login')
        }
        if (isNewSignIn) endSplash()
      } else {
        setSupplier(null)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const loading = initializing || (!!session && profileLoading)

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, supplier, loading, splash, signIn, signOut, refreshSupplier }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
