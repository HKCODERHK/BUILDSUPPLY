import { supabase } from '@/lib/supabase'

// The PIN never leaves the browser as anything but a candidate to check —
// it is hashed and compared inside Postgres (migration 022), so the hash is
// not reachable from here and a wrong guess costs a round trip. That is what
// makes the lockout meaningful.

export interface PinStatus {
  has_pin: boolean
  locked_until: string | null
}

export interface PinResult {
  ok: boolean
  error?: string
  /** Present when the PIN is locked out; ISO timestamp of when it frees up. */
  locked_until?: string | null
  attempts_left?: number
  /** True when the account has no PIN set, so there was nothing to check. */
  no_pin?: boolean
}

export async function getPinStatus(): Promise<PinStatus> {
  const { data, error } = await supabase.rpc('pin_status')
  if (error) throw error
  return data as PinStatus
}

/** Sets a first PIN, or changes an existing one (which requires the current PIN). */
export async function setPin(pin: string, currentPin?: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('set_pin', {
    p_pin: pin,
    p_current_pin: currentPin ?? null,
  })
  if (error) throw error
  return data as PinResult
}

export async function verifyPin(pin: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('verify_pin', { p_pin: pin })
  if (error) throw error
  return data as PinResult
}

export async function clearPin(currentPin: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('clear_pin', { p_current_pin: currentPin })
  if (error) throw error
  return data as PinResult
}
