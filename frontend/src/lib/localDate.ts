/**
 * The calendar day a timestamp falls on, in the phone's own timezone, as
 * YYYY-MM-DD.
 *
 * Every `created_at` in this app is a UTC timestamp, but a supplier picking
 * dates in a `<input type="date">` is thinking in IST. Slicing the first ten
 * characters off the raw ISO string compares the UTC day against an IST day,
 * and India is UTC+5:30 — so anything recorded between midnight and 5:30am
 * gets filed under the previous day. Suppliers open early, and 3 of 20
 * invoices and 5 of 25 payments in the live database were already on the
 * wrong side of that line.
 *
 * 'en-CA' is the shortest way to get YYYY-MM-DD out of toLocaleDateString,
 * which is what makes these keys sort and compare as plain strings. The
 * Dashboard's "today" card has always done it this way; this is that same
 * rule, shared so the ledger and the reports can't drift from it again.
 */
export function localDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA')
}
