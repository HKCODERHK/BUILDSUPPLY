// Helpers for numeric fields rendered as type="text" inputMode="numeric|decimal"
// instead of native type="number" — browsers (Firefox especially, and many
// mobile keyboards) don't reliably support select()/selection ranges on
// type="number" inputs, which is what let a leading "0" turn "5" into "05".
// Text inputs support selection everywhere, so we sanitize by hand instead.

// Strips everything except digits — for whole-number fields (Qty, days).
export function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, '')
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
