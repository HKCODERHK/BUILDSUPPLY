import { supabase } from '@/lib/supabase'
import { logActivity } from './activityLog'

/** The current password given wasn't the account's. Nothing was changed. */
export class WrongPasswordError extends Error {}

/**
 * Changes the signed-in person's own password, once they've proved they know
 * the current one. Supabase's updateUser doesn't ask for it — so a phone left
 * unlocked would let anyone lock the owner out — and signing in again with it
 * is the check. That sign-in keeps the same session and the same account on
 * screen (AuthContext treats it as a refresh, not a new login).
 */
export async function changeOwnPassword(email: string, current: string, next: string): Promise<void> {
  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current })
  if (checkError) throw new WrongPasswordError(checkError.message)
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) throw error
  void logActivity('supplier', 'password_changed')
}
