// UPI, only where the supplier chooses (migration 029): "Pay by UPI" on a
// khata link, and Show UPI QR on the customer page. A upi://pay link opens the
// customer's own UPI app with the payee and amount filled in, and the money
// goes straight to the supplier's account. Nothing here records a payment —
// the supplier checks the bank and uses Receive payment, as always.

/** name@bank — letters, digits, dot, dash or underscore, then the bank's handle. Same rule as the database. */
const UPI_ID = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$/

/** UPI IDs never contain spaces; a pasted one often does. */
export function sanitizeUpiId(raw: string): string {
  return raw.replace(/\s+/g, '')
}

export function isValidUpiId(id: string): boolean {
  return UPI_ID.test(id)
}

/** Many banks cap a single UPI payment at ₹1,00,000. */
export const UPI_TYPICAL_LIMIT = 100000

/**
 * upi://pay?… — what every UPI app understands, and what the QR holds.
 * Built by hand rather than with URLSearchParams: Android reads a "+" in a
 * query as a literal plus, so a space must travel as %20 or the payee shows
 * as "Shree+Balaji". The ID is already limited to safe characters.
 */
export function upiPayUrl(opts: { upiId: string; payee: string; amount: number; note?: string }): string {
  const parts = [
    `pa=${opts.upiId}`,
    `pn=${encodeURIComponent(opts.payee.slice(0, 50))}`,
    `am=${opts.amount.toFixed(2)}`,
    'cu=INR',
  ]
  if (opts.note) parts.push(`tn=${encodeURIComponent(opts.note.slice(0, 50))}`)
  return `upi://pay?${parts.join('&')}`
}
