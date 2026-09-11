/**
 * The rules for a password someone picks themselves — supplier Settings, the
 * admin's own card, and the reset-password page. (Passwords the admin hands
 * out come from lib/generatePassword and are random already.)
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Whether a password is on Have I Been Pwned's list of passwords exposed in
 * data breaches — the same kind of list behind Chrome's "found in a data
 * breach" warning, which a supplier otherwise sees at every sign-in. Free and
 * keyless. Private by design: only the first 5 characters of the password's
 * SHA-1 hash leave the phone, never the password, and Add-Padding hides how
 * many matches came back.
 *
 * null when the check couldn't run (no signal, the service down): the caller
 * lets the password through rather than stop someone at the one moment they
 * are trying to make their account safer.
 */
export async function isPasswordLeaked(password: string): Promise<boolean | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return null
    const rest = hash.slice(5)
    for (const line of (await response.text()).split('\n')) {
      const [suffix, count] = line.trim().split(':')
      // Padding rows carry a count of 0 and are not real matches.
      if (suffix === rest) return Number(count) > 0
    }
    return false
  } catch {
    return null
  }
}
