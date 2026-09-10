import { supabase } from '@/lib/supabase'

// Supabase answers any one request with at most 1,000 rows — the hosted
// default, which this project never raised — and it does so without an
// error, so a list that has grown past that simply comes back short: a
// statement missing its oldest bills, a report quietly undercounting. Every
// "all of X" read goes through fetchAll instead.

const PAGE_SIZE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>

/**
 * Reads every row a query matches, page by page.
 *
 * `page(from, to)` must build the same query each time, with
 * `{ count: 'exact' }` in its select and an order ending in a unique column
 * (`id`), so no row is skipped or read twice between pages. It advances by
 * what actually came back, so a server capping pages below 1,000 still gets
 * read in full.
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  for (;;) {
    const { data, error, count } = await page(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) throw error
    if (total === null) total = count
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length === 0 || (total !== null && rows.length >= total)) return rows
  }
}

/**
 * Calls one of the database functions from migration 024. Their errors are
 * written for the supplier ("This bill was cancelled…"), so the message is
 * passed on as a plain Error the screens already know how to show.
 */
export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data as T
}

/** A fresh id for one save — see client_requests in migration 024. */
export function newRequestId(): string {
  return crypto.randomUUID()
}
