import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The customer's own login (migration 038) — a second Supabase client, kept
 * entirely apart from the supplier/admin one in `lib/supabase.ts`.
 *
 * Its session lives under its own storage key, so a customer signing in or
 * out never touches a supplier's session on the same phone, and AuthContext
 * (which listens only to the supplier client) never sees a customer at all —
 * it would otherwise take them for a supplier with no profile.
 *
 * Today the login is anonymous: no password, no code. What proves who the
 * customer is, is the personal khata link the shop sent to their WhatsApp
 * (connect_khata). An SMS code can later be added to this same login
 * (`updateUser({ phone })` + verifyOtp), keeping the account and its shops.
 *
 * Made only when a customer page needs it, so the supplier app never creates
 * a second client.
 */
const STORAGE_KEY = 'buildsupply-customer-auth'

let client: SupabaseClient | null = null

export function customerClient(): SupabaseClient {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
      auth: { storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }
  return client
}

/**
 * Whether this phone already has a customer login. Never creates one: just
 * opening a khata link or the order page must not make an account.
 */
export function hasCustomerSession(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

/** The customer's login, made now if this phone has none (only on "Save"). */
export async function ensureCustomerSession(): Promise<void> {
  const auth = customerClient().auth
  const { data } = await auth.getSession()
  if (data.session) return
  const { error } = await auth.signInAnonymously()
  if (error) throw new Error(error.message)
}

/** Signs the customer out on this phone only. Their shops stay on the account. */
export async function signOutCustomer(): Promise<void> {
  await customerClient().auth.signOut({ scope: 'local' })
}
