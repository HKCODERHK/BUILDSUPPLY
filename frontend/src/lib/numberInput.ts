// Helpers for numeric fields rendered as type="text" inputMode="numeric|decimal"
// instead of native type="number" — browsers (Firefox especially, and many
// mobile keyboards) don't reliably support select()/selection ranges on
// type="number" inputs, which is what let a leading "0" turn "5" into "05".
// Text inputs support selection everywhere, so we sanitize by hand instead.

// Strips everything except digits — for whole-number fields (Qty, days).
export function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

// Phone and WhatsApp numbers: only the 10-digit number. Spaces, dashes and
// "+" are dropped, and so are India's leading "0" and a "+91" country code —
// silently, as they are typed or pasted, never as an error. A bare "91" is
// kept unless it fronts a full 12-digit paste: some real mobile numbers start
// with 91. Numbers are stored as these 10 digits; lib/whatsapp.ts adds the 91
// back for wa.me.
export function sanitizePhone(raw: string): string {
  const text = raw.trim()
  let digits = text.replace(/\D/g, '')
  if (/^\+\s*9\s*1/.test(text)) digits = digits.slice(2)
  digits = digits.replace(/^0+/, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  return digits.slice(0, 10)
}

// Strips everything except digits and a single decimal point — for money/
// decimal fields (Rate, amounts). Keeps the result as a string so a
// trailing "12." doesn't collapse back to "12" mid-type.
export function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
}
