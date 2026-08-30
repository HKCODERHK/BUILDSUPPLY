import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/lib/database.types'
import { logActivity } from '@/services/activityLog'

interface AuthContextValue {
  session: Session | null
  supplier: Supplier | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
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
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Supabase fires SIGNED_IN on every token refresh and on restoring a
      // session at page load, not just on a real sign-in — logging all of
      // those buried the activity log (3,212 of 3,451 rows were phantom
      // logins). Only record the null -> session transition.
      const isNewSignIn = event === 'SIGNED_IN' && !hadSessionRef.current
      hadSessionRef.current = !!newSession

      setSession(newSession)
      if (newSession) {
        const profile = await loadSupplierProfile(newSession.user.id)
        if (isNewSignIn && profile) {
          void logActivity(profile.role, 'login')
        }
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
    <AuthContext.Provider value={{ session, supplier, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
