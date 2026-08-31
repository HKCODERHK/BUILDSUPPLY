// A readable one-time password for a new supplier account.
//
// The admin has to read this out or paste it into WhatsApp, and the supplier
// has to type it on a phone — so the alphabet deliberately drops the
// characters that get misread out loud or mistyped: O/0, I/l/1, and anything
// that needs a shifted symbol key. Length makes up for the smaller alphabet.
//
// Uses crypto.getRandomValues, not Math.random, and rejects values from the
// tail end of the random range so the modulo doesn't quietly bias the first
// few characters.

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I, no O
const LOWER = 'abcdefghijkmnpqrstuvwxyz' // no l, no o
const DIGITS = '23456789' // no 0, no 1
const ALPHABET = UPPER + LOWER + DIGITS

function randomIndex(limit: number): number {
  const max = Math.floor(256 / limit) * limit
  const buf = new Uint8Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= max)
  return value % limit
}

function pick(source: string): string {
  return source[randomIndex(source.length)]
}

/**
 * Generates a password of `length` characters, guaranteed to contain at least
 * one uppercase, one lowercase and one digit so it satisfies the usual rules
 * without the admin having to check.
 */
export function generatePassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS)]
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALPHABET))
  const chars = [...required, ...rest]

  // Fisher-Yates, so the guaranteed characters aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
